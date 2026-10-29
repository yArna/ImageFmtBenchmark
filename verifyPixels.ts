import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { parseArgs, promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { intro, log, outro } from '@clack/prompts';
import chalk from 'chalk';
import { hashFile } from './lib/ssimulacra2';
import { getPixelVerificationKey, readPixelVerificationCache, PixelVerificationWorker } from './lib/pixelVerification';
import { isEncodingLosslessMode, isPixelLossless } from './lib/benchmarkData';
import type { BenchmarkRecord, ImageDataFile, ImageInfo } from './benchmark';

const ROOT = import.meta.dirname;
const BIN = path.join(ROOT, 'encoder/bin');
const RESULT = path.join(ROOT, 'result');
const exec = promisify(execFile);

/** 从现有产物验证原图像素，不重新编码；JSONL 是逐项持久检查点。 */
async function main() {
  const { values } = parseArgs({ options: { concurrency: { type: 'string' }, image: { type: 'string' }, encoder: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) {
    console.log('bun run verify:pixels [--concurrency 8] [--image 文件名片段] [--encoder 编码器片段]\n按原图与产物内容、工具版本自动复用像素验证；中断后再次运行即可续算。');
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
  const binary = path.join(BIN, 'pixel_verify_worker');
  const engineHash = digest(JSON.stringify(await Promise.all([binary, path.join(BIN, 'avifdec'), path.join(BIN, 'dwebp')].map(hashFile))));
  const metadata = { version: 1, engineHash, method: 'exact integer RGB + Alpha, normalized by declared bit depth; ignores RGB under fully transparent source pixels; no ICC transform or tolerance', colorEncoding: 'recorded separately' };
  const cachePath = path.join(RESULT, 'pixel-verification-cache.jsonl');
  const cache = readPixelVerificationCache(fs.existsSync(cachePath) ? fs.readFileSync(cachePath, 'utf8') : '');
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
  const lockPath = path.join(RESULT, '.pixel-verification.lock');
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
    if (active) throw new Error(`另一个像素验证任务正在运行 (PID ${pid})`);
    fs.unlinkSync(lockPath);
  }
  fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
  // 先写换行，使上次中断留下的半行不与新结果拼接。
  fs.appendFileSync(cachePath, '\n');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'imagefmt-pixels-'));
  const stop = () => { stopping = true; };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  intro(chalk.cyan('原图 RGB/Alpha 全分辨率精确验证'));
  log.info(`${total} 条记录，最多 ${concurrency} 个常驻进程；逐样本核对 RGB 与 Alpha；AVIF 保留 16 位精度，WebP 使用 RGBA PAM。`);

  const publish = () => {
    if (!dirty.size) return;
    const files = [summaryPath, webPath, ...Array.from(dirty, (name) => path.join(RESULT, 'data', `${summary.images.find((image) => image.name === name)!.stem}.json`))];
    for (const file of files) if (digest(fs.readFileSync(file, 'utf8')) !== snapshots.get(file)) throw new Error(`数据已被其他任务修改，停止写回：${file}；已完成像素验证仍保留在缓存`);
    const generatedAt = new Date().toISOString();
    summary.generatedAt = generatedAt; web.generatedAt = generatedAt;
    summary.metrics = { ...summary.metrics as object, pixelVerification: metadata };
    web.metrics = { ...web.metrics, pixelVerification: metadata };
    const records = new Map(summary.records.map((record) => [record.outputFile, record]));
    for (const row of web.records) {
      const record = records.get(row[16])!;
      row[3] = record.lossless ? 1 : 0;
      row[20] = record.pixelVerification ?? null;
      row[21] = record.encodingLossless ?? null;
    }
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
    let worker: PixelVerificationWorker | null = null;
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
            const key = getPixelVerificationKey(sourceHash, outputHash, engineHash);
            let verification = cache.get(key);
            if (!verification && record.pixelVerification?.key === key) verification = record.pixelVerification;
            if (!verification) {
              if (!worker) { worker = new PixelVerificationWorker(binary); loaded = false; }
              if (!loaded) { await worker.reference(source); loaded = true; }
              let input = output;
              if (record.format === 'avif') {
                await exec(path.join(BIN, 'avifdec'), ['-j', '1', '-d', '16', '--png-compress', '0', output, decoded], { timeout: 120000 }); input = decoded;
              } else if (record.format === 'webp') {
                await exec(path.join(BIN, 'dwebp'), [output, '-pam', '-o', pam, '-quiet'], { timeout: 120000 }); input = pam;
              }
              verification = await worker.evaluate(input, key);
              fs.appendFileSync(cachePath, `${JSON.stringify(verification)}\n`);
              cache.set(key, verification); calculated++;
            } else reused++;
            const saved = imageData.get(record.image)!.records[record.id];
            const encodingLossless = isEncodingLosslessMode(record.encoder, record.quality);
            const lossless = isPixelLossless(verification);
            if (record.pixelVerification?.key !== key || record.lossless !== lossless || record.encodingLossless !== encodingLossless) {
              Object.assign(record, { pixelVerification: verification, encodingLossless, lossless });
              Object.assign(saved, { pixelVerification: verification, encodingLossless, lossless });
              dirty.add(record.image);
            }
          } catch (error) {
            const saved = imageData.get(record.image)!.records[record.id];
            record.encodingLossless = isEncodingLosslessMode(record.encoder, record.quality);
            saved.encodingLossless = record.encodingLossless;
            delete record.pixelVerification; delete saved.pixelVerification;
            record.lossless = false; saved.lossless = false; dirty.add(record.image);
            failed++; log.error(`${record.id}: ${(error as Error).message}`);
            worker?.close(); worker = null; loaded = false;
          } finally {
            fs.rmSync(decoded, { force: true }); fs.rmSync(pam, { force: true }); done++;
          }
          if (Date.now() - lastPublish >= 15000) {
            publish();
            lastPublish = Date.now();
            const rate = done / ((Date.now() - start) / 1000);
            log.info(`${done}/${total}，新验证 ${calculated}，复用 ${reused}，失败 ${failed}，${rate.toFixed(1)} 条/秒，预计剩余 ${Math.ceil((total - done) / rate / 60)} 分钟`);
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
    outro(chalk.green(`${stopping ? '已保存进度' : '验证完成'}：${done}/${total}，新验证 ${calculated}，复用 ${reused}，失败 ${failed}，耗时 ${Math.round((Date.now() - start) / 1000)} 秒`));
    if (failed || stopping) process.exitCode = 1;
  } finally {
    process.off('SIGINT', stop); process.off('SIGTERM', stop);
    fs.rmSync(temp, { recursive: true, force: true }); fs.rmSync(lockPath, { force: true });
  }
}

main().catch((error) => { log.error((error as Error).message); process.exitCode = 1; });
