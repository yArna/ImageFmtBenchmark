import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { parseArgs, promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { intro, log, outro } from '@clack/prompts';
import chalk from 'chalk';
import { getSsimulacra2Key, hashFile, readScoreCache, Ssimulacra2Worker } from './lib/ssimulacra2';
import type { BenchmarkRecord, ImageDataFile, ImageInfo } from './benchmark';

const ROOT = import.meta.dirname;
const BIN = path.join(ROOT, 'encoder/bin');
const RESULT = path.join(ROOT, 'result');
const exec = promisify(execFile);

/** 从现有产物补算评分，不重新编码；JSONL 是逐项持久检查点。 */
async function main() {
  const { values } = parseArgs({ options: { concurrency: { type: 'string' }, image: { type: 'string' }, encoder: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) {
    console.log('bun run score [--concurrency 8] [--image 文件名片段] [--encoder 编码器片段]\n按原图与产物内容、工具版本自动复用评分；中断后再次运行即可续算。');
    return;
  }
  const requested = Number(values.concurrency ?? Math.min(8, Math.max(1, Math.floor(os.availableParallelism() * 0.75))));
  if (!Number.isInteger(requested) || requested < 1 || requested > 16) throw new Error('并发数须为 1..16 的整数');
  const summaryPath = path.join(RESULT, 'results.json');
  const webPath = path.join(ROOT, 'web/public/benchmark-data.json');
  const snapshots = new Map<string, string>();
  const digest = (data: string) => createHash('sha256').update(data).digest('hex');
  const read = (file: string) => {
    const text = fs.readFileSync(file, 'utf8'); snapshots.set(file, digest(text)); return JSON.parse(text);
  };
  const summary = read(summaryPath) as { generatedAt: string; images: ImageInfo[]; records: BenchmarkRecord[]; metrics?: unknown };
  const web = read(webPath);
  if (summary.generatedAt !== web.generatedAt || summary.records.length !== web.records.length) throw new Error('汇总与网页数据不同步，请先更新基准数据');
  const imageData = new Map<string, ImageDataFile>();
  for (const image of summary.images) imageData.set(image.name, read(path.join(RESULT, 'data', `${image.stem}.json`)));
  for (const record of summary.records) {
    const saved = imageData.get(record.image)?.records[record.id];
    if (!saved || saved.outputFile !== record.outputFile || saved.timestamp !== record.timestamp) throw new Error(`分图与汇总记录不一致：${record.id}`);
  }
  const binary = path.join(BIN, 'ssimulacra2_worker');
  const engineHash = digest(JSON.stringify(await Promise.all([binary, path.join(BIN, 'avifdec'), path.join(BIN, 'dwebp')].map(hashFile))));
  const metadata = { engine: 'libjxl SSIMULACRA2', version: 1, engineHash, resolution: 'original', color: 'embedded ICC → linear sRGB', alpha: 'reference alpha: min(background 0.1, 0.9); otherwise 0.5' };
  const cachePath = path.join(RESULT, 'ssimulacra2-cache.jsonl');
  const cache = readScoreCache(fs.existsSync(cachePath) ? fs.readFileSync(cachePath, 'utf8') : '');
  const dirty = new Set<string>();
  let stopping = false, done = 0, calculated = 0, reused = 0, failed = 0, cursor = 0, lastPublish = Date.now();
  const start = Date.now();
  const jobs = summary.images.map((image) => ({ image, records: summary.records.filter((record) => record.image === image.name && (!values.encoder || record.encoder.includes(values.encoder))) }))
    .filter(({ image, records }) => records.length && (!values.image || image.name.includes(values.image)))
    .sort((a, b) => b.image.width * b.image.height - a.image.width * a.image.height);
  const total = jobs.reduce((sum, job) => sum + job.records.length, 0);
  if (total === 0) throw new Error('没有匹配的产物');
  // 全分辨率实测约 160 字节/像素，按 256 字节保守预算，并为系统保留 60% 内存。
  const largest = Math.max(...jobs.map(({ image }) => image.width * image.height));
  const concurrency = Math.min(requested, jobs.length, Math.max(1, Math.floor(os.totalmem() * 0.4 / (largest * 256))));
  const lockPath = path.join(RESULT, '.ssimulacra2.lock');
  if (fs.existsSync(lockPath)) {
    const pid = Number(fs.readFileSync(lockPath, 'utf8'));
    let active = false;
    if (Number.isInteger(pid) && pid > 0) {
      try { process.kill(pid, 0); active = true; } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EPERM') active = true;
        else if (code !== 'ESRCH') throw error;
      }
    }
    if (active) throw new Error(`另一个评分任务正在运行 (PID ${pid})`);
    fs.unlinkSync(lockPath);
  }
  fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
  // 先写换行，使上次中断留下的半行不与新结果拼接。
  fs.appendFileSync(cachePath, '\n');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'imagefmt-score-'));
  const stop = () => { stopping = true; };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  intro(chalk.cyan('SSIMULACRA2 全分辨率补算'));
  log.info(`${total} 条记录，最多 ${concurrency} 个常驻进程；保留 ICC 与透明度，AVIF 解码为 16 位 PNG，WebP 解码为 RGBA PAM。`);

  const publish = () => {
    if (!dirty.size) return;
    const files = [summaryPath, webPath, ...Array.from(dirty, (name) => path.join(RESULT, 'data', `${summary.images.find((image) => image.name === name)!.stem}.json`))];
    for (const file of files) if (digest(fs.readFileSync(file, 'utf8')) !== snapshots.get(file)) throw new Error(`数据已被其他任务修改，停止写回：${file}；已完成评分仍保留在缓存`);
    const generatedAt = new Date().toISOString();
    summary.generatedAt = generatedAt; web.generatedAt = generatedAt;
    summary.metrics = { ...summary.metrics as object, ssimulacra2: metadata };
    web.metrics = { ...web.metrics, ssimulacra2: metadata };
    const scores = new Map(summary.records.map((record) => [record.outputFile, record.ssimulacra2]));
    for (const row of web.records) row[19] = scores.get(row[16]) ?? null;
    const writes: [string, unknown][] = Array.from(dirty, (name) => {
      const data = imageData.get(name)!; data.updatedAt = generatedAt;
      return [path.join(RESULT, 'data', `${data.image.stem}.json`), data];
    });
    writes.push([summaryPath, summary], [webPath, web]);
    for (const [file, data] of writes) {
      const text = JSON.stringify(data, null, file === webPath ? undefined : 2);
      fs.writeFileSync(`${file}.score.tmp`, text); fs.renameSync(`${file}.score.tmp`, file); snapshots.set(file, digest(text));
    }
    dirty.clear(); lastPublish = Date.now();
  };

  const work = async (index: number) => {
    let worker: Ssimulacra2Worker | null = null;
    const decoded = path.join(temp, `${index}.png`), pam = path.join(temp, `${index}.pam`);
    try {
      while (!stopping) {
        const job = jobs[cursor++]; if (!job) break;
        const source = path.join(ROOT, 'images', job.image.name);
        const sourceHash = await hashFile(source);
        let loaded = false;
        worker?.close(); worker = null;
        for (const record of job.records) {
          if (stopping) break;
          try {
            const output = path.join(RESULT, record.outputFile);
            const outputHash = await hashFile(output);
            const key = getSsimulacra2Key(sourceHash, outputHash, engineHash);
            let score = cache.get(key);
            // 检查点被清理后，数据中经过相同内容指纹验证的已有评分仍可复用。
            if (score === undefined && record.ssimulacra2Key === key && typeof record.ssimulacra2 === 'number' && Number.isFinite(record.ssimulacra2) && record.ssimulacra2 <= 100) {
              score = record.ssimulacra2;
              cache.set(key, score); fs.appendFileSync(cachePath, `${JSON.stringify({ key, score })}\n`);
            }
            if (score === undefined) {
              if (!worker) { worker = new Ssimulacra2Worker(binary); loaded = false; }
              if (!loaded) { await worker.reference(source); loaded = true; }
              let input = output;
              if (record.format === 'avif') {
                await exec(path.join(BIN, 'avifdec'), ['-j', '1', '-d', '16', '--png-compress', '0', output, decoded], { timeout: 120000 }); input = decoded;
              } else if (record.format === 'webp') {
                await exec(path.join(BIN, 'dwebp'), [output, '-pam', '-o', pam, '-quiet'], { timeout: 120000 }); input = pam;
              }
              score = await worker.evaluate(input);
              fs.appendFileSync(cachePath, `${JSON.stringify({ key, score })}\n`);
              cache.set(key, score); calculated++;
            } else reused++;
            if (record.ssimulacra2 !== score || record.ssimulacra2Key !== key) {
              const saved = imageData.get(record.image)!.records[record.id];
              if (!saved || saved.outputFile !== record.outputFile) throw new Error(`分图记录不一致：${record.id}`);
              record.ssimulacra2 = score; record.ssimulacra2Key = key;
              saved.ssimulacra2 = score; saved.ssimulacra2Key = key; dirty.add(record.image);
            }
          } catch (error) {
            // 当前产物无法验证或计算时，不继续展示上一版产物的评分。
            if (record.ssimulacra2 !== undefined || record.ssimulacra2Key !== undefined) {
              const saved = imageData.get(record.image)!.records[record.id];
              delete record.ssimulacra2; delete record.ssimulacra2Key;
              delete saved.ssimulacra2; delete saved.ssimulacra2Key; dirty.add(record.image);
            }
            failed++; log.error(`${record.id}: ${(error as Error).message}`);
            worker?.close(); worker = null; loaded = false;
          } finally {
            fs.rmSync(decoded, { force: true }); fs.rmSync(pam, { force: true }); done++;
          }
          if (Date.now() - lastPublish >= 15000) {
            publish();
            lastPublish = Date.now();
            const rate = done / ((Date.now() - start) / 1000);
            log.info(`${done}/${total}，新计算 ${calculated}，复用 ${reused}，失败 ${failed}，${rate.toFixed(1)} 条/秒，预计剩余 ${Math.ceil((total - done) / rate / 60)} 分钟`);
          }
        }
        publish();
      }
    } finally { worker?.close(); }
  };

  try {
    const tasks = await Promise.allSettled(Array.from({ length: concurrency }, (_, index) => work(index)));
    publish();
    for (const task of tasks) if (task.status === 'rejected') throw task.reason;
    outro(chalk.green(`${stopping ? '已保存进度' : '补算完成'}：${done}/${total}，新计算 ${calculated}，复用 ${reused}，失败 ${failed}，耗时 ${Math.round((Date.now() - start) / 1000)} 秒`));
    if (failed || stopping) process.exitCode = 1;
  } finally {
    process.off('SIGINT', stop); process.off('SIGTERM', stop);
    fs.rmSync(temp, { recursive: true, force: true }); fs.rmSync(lockPath, { force: true });
  }
}

main().catch((error) => { log.error((error as Error).message); process.exitCode = 1; });
