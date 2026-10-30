#!/usr/bin/env python3
"""将页面引用的原图和结果分批发布；使用独立 Git 索引，不改变主仓库暂存区。"""
import argparse
import hashlib
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / 'web'
BRANCH = 'benchmark-assets'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--state-dir', type=Path, help='保留此临时目录以便中断后继续上传')
    parser.add_argument('--batch-mib', type=int, default=64, help='单批原始文件体积，默认 64 MiB')
    parser.add_argument('--ssh', action='store_true', help='使用现有 SSH 身份验证上传，适用于 HTTPS 代理超时')
    parser.add_argument('--build', action='store_true', help='全部上传成功后自动构建 docs')
    args = parser.parse_args()
    if not 20 <= args.batch_mib <= 512:
        parser.error('--batch-mib 需要位于 20 到 512 之间')
    dataset_path = WEB / 'public/benchmark-data.json'
    dataset_bytes = dataset_path.read_bytes()
    digest = hashlib.sha256(dataset_bytes).hexdigest()
    data = json.loads(dataset_bytes)
    names = sorted({f"images/{image['name']}" for image in data['images']} |
                   {f'result/{row[16]}' for row in data['records']})
    stats = {}
    for name in names:
        file = (ROOT / name).resolve()
        if ROOT not in file.parents or not file.is_file():
            raise RuntimeError(f'缺少文件或路径越界：{name}')
        stat = file.stat()
        if stat.st_size >= 100 * 1024 * 1024:
            raise RuntimeError(f'文件达到 GitHub 单文件限制：{name}')
        stats[name] = (stat.st_size, stat.st_mtime_ns)
    remote = subprocess.check_output(['git', '-C', str(ROOT), 'config', '--get', 'remote.origin.url'], text=True).strip()
    match = re.fullmatch(r'(?:https://github.com/|git@github.com:)([^/]+/[^/]+?)(?:\.git)?', remote)
    if not match:
        raise RuntimeError('origin 必须指向 GitHub 仓库')
    repository = match[1]
    print(f'{repository} → {BRANCH}: {len(names)} files, {sum(s[0] for s in stats.values()) / 1e9:.2f} GB', flush=True)
    if args.dry_run:
        return

    state = (args.state_dir or Path(tempfile.mkdtemp(prefix='imagefmt-assets-'))).resolve()
    state.mkdir(parents=True, exist_ok=True)
    lock = (state / 'upload.lock').open('w')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise RuntimeError('此状态目录已有上传进程，请勿同时启动')
    print(f'上传状态目录（续传时传 --state-dir）：{state}', flush=True)
    env = os.environ.copy()
    # 后台运行只使用已有身份，不停在密码或未知主机确认提示上。
    env.setdefault('GIT_TERMINAL_PROMPT', '0')
    env.setdefault('GIT_SSH_COMMAND', 'ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=20 -o ServerAliveInterval=30 -o ServerAliveCountMax=3')
    for key in ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']:
        env.pop(key, None)
    git_dir = state / '.git'

    def git(*cmd, capture=False, check=True, input=None):
        return subprocess.run(['git', '--git-dir', str(git_dir), '--work-tree', str(ROOT), *cmd],
                              cwd=ROOT, env=env, check=check, input=input,
                              stdout=subprocess.PIPE if capture else None,
                              stderr=subprocess.PIPE if capture else None)

    fresh = not git_dir.exists()
    if fresh:
        subprocess.run(['git', 'init', '-b', BRANCH, str(state)], check=True, env=env)
        git('remote', 'add', 'origin', remote)
        for key in ['user.name', 'user.email']:
            value = subprocess.check_output(['git', '-C', str(ROOT), 'config', key], env=env).decode().strip()
            git('config', key, value)
        git('config', 'pack.window', '0')
        git('config', 'pack.threads', '2')
        # 仅操作独立仓库的 HEAD 和索引，不执行 checkout。
        refs = git('ls-remote', '--heads', 'origin', BRANCH, capture=True).stdout
        if refs.strip():
            git('fetch', '--depth=1', 'origin', BRANCH)
            git('update-ref', f'refs/heads/{BRANCH}', 'FETCH_HEAD')
            git('read-tree', 'HEAD')
    elif git('config', '--get', 'remote.origin.url', capture=True).stdout.decode().strip() != remote:
        raise RuntimeError('续传目录的远程仓库不一致')

    last_push = 0.0

    def progress(status, **fields):
        pending = state / 'progress.pending.json'
        pending.write_text(json.dumps({'status': status, 'repository': repository,
                                       'branch': BRANCH, **fields}, indent=2) + '\n')
        pending.replace(state / 'progress.json')

    def push():
        nonlocal last_push
        # 为代理网络使用有长度的 HTTP/1.1 请求，避免大包的 chunked 上传超时。
        transport = ['-c', f'remote.origin.pushurl=git@github.com:{repository}.git'] if args.ssh else [
            '-c', 'http.version=HTTP/1.1', '-c', 'http.postBuffer=1073741824',
        ]
        for attempt in range(1, 4):
            delay = 11 - (time.monotonic() - last_push)
            if delay > 0:
                time.sleep(delay)
            last_push = time.monotonic()
            result = git(*transport, 'push', '--progress', 'origin', f'HEAD:refs/heads/{BRANCH}', check=False)
            if result.returncode == 0:
                return
            progress('retrying' if attempt < 3 else 'failed', attempt=attempt)
            if attempt == 3:
                raise RuntimeError('本批推送连续失败；已成功批次保留，使用相同状态目录重跑即可')

    # 之前若在 commit 后断网，先发布待上传提交。
    if not fresh and git('rev-parse', '--verify', 'HEAD', capture=True, check=False).returncode == 0:
        push()
    batches, batch, size = [], [], 0
    for name in names:
        if batch and size + stats[name][0] > args.batch_mib * 1024 * 1024:
            batches.append(batch)
            batch, size = [], 0
        batch.append(name)
        size += stats[name][0]
    if batch:
        batches.append(batch)
    for i, batch in enumerate(batches, 1):
        print(f'批次 {i}/{len(batches)} ({len(batch)} files)', flush=True)
        git('add', '-f', '--pathspec-from-file=-', '--pathspec-file-nul',
            input=b'\0'.join(name.encode() for name in batch) + b'\0')
        if git('diff', '--cached', '--quiet', check=False).returncode:
            git('commit', '-q', '-m', f'Publish benchmark images {i}/{len(batches)}')
            push()
        progress('uploading', batch=i, totalBatches=len(batches),
                 completedFiles=sum(len(b) for b in batches[:i]), totalFiles=len(names),
                 ref=git('rev-parse', 'HEAD', capture=True).stdout.decode().strip())

    if hashlib.sha256(dataset_path.read_bytes()).hexdigest() != digest:
        raise RuntimeError('上传期间数据集发生变化，请重新运行')
    for name, before in stats.items():
        stat = (ROOT / name).stat()
        if (stat.st_size, stat.st_mtime_ns) != before:
            raise RuntimeError(f'上传期间图片发生变化：{name}，请重新运行')
    git('add', '-f', '--', 'web/public/benchmark-data.json')
    if git('diff', '--cached', '--quiet', check=False).returncode:
        git('commit', '-q', '-m', f'Publish benchmark dataset {digest[:12]}')
        push()
    ref = git('rev-parse', 'HEAD', capture=True).stdout.decode().strip()
    snapshot = {'repository': repository, 'ref': ref, 'datasetSha256': digest}
    pending = WEB / 'github-assets.pending.json'
    pending.write_text(json.dumps(snapshot, indent=2) + '\n')
    pending.replace(WEB / 'github-assets.json')
    print(f'已发布快照：{ref}', flush=True)
    progress('uploaded', ref=ref, completedFiles=len(names), totalFiles=len(names))
    if args.build:
        subprocess.run(['bun', 'run', 'build'], cwd=WEB, check=True)
        progress('built', ref=ref, completedFiles=len(names), totalFiles=len(names))


if __name__ == '__main__':
    main()
