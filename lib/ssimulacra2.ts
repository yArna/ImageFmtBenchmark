import { createHash } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

/** 评分缓存同时绑定原图、产物、工具和计算口径。 */
export function getSsimulacra2Key(referenceHash: string, outputHash: string, engineHash: string): string {
  return createHash('sha256').update(JSON.stringify(['ssimulacra2-v1', referenceHash, outputHash, engineHash])).digest('hex');
}

/** 流式散列避免并发读取大图片时额外保留整份文件。 */
export async function hashFile(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

/** 恢复逐行检查点；忽略被中断的末行，但不接受缺失、无穷或超过上限的分数。 */
export function readScoreCache(text: string): Map<string, number> {
  const cache = new Map<string, number>();
  for (const line of text.split('\n')) {
    try {
      const item = JSON.parse(line);
      if (typeof item.key === 'string' && /^[a-f0-9]{64}$/.test(item.key) && typeof item.score === 'number' && Number.isFinite(item.score) && item.score <= 100) {
        cache.set(item.key, item.score);
      }
    } catch { /* 中断时最后一行可能尚未写完。 */ }
  }
  return cache;
}

/** 常驻原生进程一次只接收一个请求，参考图及尺度特征可跨产物复用。 */
export class Ssimulacra2Worker {
  private process: ChildProcessWithoutNullStreams;
  private pending: { resolve: (value: number | null) => void; reject: (error: Error) => void } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stderr = '';
  private failure: Error | null = null;

  constructor(binary: string) {
    this.process = spawn(binary, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.process.stderr.on('data', (chunk) => { this.stderr = (this.stderr + chunk).slice(-4000); });
    this.process.stdin.on('error', (error) => this.fail(error));
    this.process.on('error', (error) => this.fail(error));
    this.process.on('exit', (code, signal) => this.fail(new Error(`评分进程退出 (${code ?? signal}): ${this.stderr}`)));
    createInterface({ input: this.process.stdout }).on('line', (line) => {
      if (!this.pending) return;
      const pending = this.pending;
      this.pending = null;
      if (this.timer) clearTimeout(this.timer);
      try {
        const result = JSON.parse(line);
        if (!result.ok) throw new Error(`评分失败: ${this.stderr}`);
        if ('ssimulacra2' in result && (typeof result.ssimulacra2 !== 'number' || !Number.isFinite(result.ssimulacra2) || result.ssimulacra2 > 100)) throw new Error('评分结果无效');
        pending.resolve(result.ssimulacra2 ?? null);
      } catch (error) { pending.reject(error as Error); }
    });
  }

  /** 切换原图时丢弃上一张的特征。 */
  async reference(file: string): Promise<void> { await this.request('REF', file); }

  /** 分数允许为负数，不能裁剪成 0。 */
  async evaluate(file: string): Promise<number> {
    const score = await this.request('EVAL', file);
    if (score === null) throw new Error('评分进程没有返回 SSIMULACRA2');
    return score;
  }

  /** 结束时释放参考图缓存和子进程。 */
  close() { this.process.kill(); }

  private fail(error: Error) {
    this.failure = error;
    if (this.timer) clearTimeout(this.timer);
    this.pending?.reject(error);
    this.pending = null;
  }

  private request(command: string, file: string): Promise<number | null> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.pending) return Promise.reject(new Error('评分进程仍有请求未完成'));
    if (/[\r\n\t]/.test(file)) return Promise.reject(new Error('图片路径包含行协议不支持的字符'));
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.timer = setTimeout(() => { this.fail(new Error('评分请求超过 120 秒')); this.close(); }, 120000);
      this.process.stdin.write(`${command}\t${file}\n`);
    });
  }
}
