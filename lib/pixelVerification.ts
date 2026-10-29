import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import type { IPixelVerification } from './benchmarkData';

/** 验证缓存绑定两份图片内容、工具版本和整数样本比较规则。 */
export function getPixelVerificationKey(reference: string, output: string, engine: string): string {
  return createHash('sha256').update(JSON.stringify(['rgb-integer-exact-v2-ignore-transparent-rgb', reference, output, engine])).digest('hex');
}

/** 逐项检查点允许断点恢复；损坏的末行不会被当成有效验证。 */
export function readPixelVerificationCache(text: string): Map<string, IPixelVerification> {
  const result = new Map<string, IPixelVerification>();
  for (const line of text.split('\n')) {
    try {
      const item = JSON.parse(line);
      if (/^[a-f0-9]{64}$/.test(item.key) && ['rgbEqual', 'alphaEqual', 'dimensionsEqual', 'colorEncodingEqual'].every((key) => typeof item[key] === 'boolean')) result.set(item.key, item);
    } catch { /* 中断留下的半行由下次验证重新计算。 */ }
  }
  return result;
}

/** 常驻解码原图，一次处理一个产物，避免重复加载参考图。 */
export class PixelVerificationWorker {
  private child: ChildProcessWithoutNullStreams;
  private pending: { resolve: (value: any) => void; reject: (error: Error) => void } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failure: Error | null = null;
  private stderr = '';

  constructor(binary: string) {
    this.child = spawn(binary, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stderr.on('data', (chunk) => { this.stderr = (this.stderr + chunk).slice(-3000); });
    this.child.on('error', (error) => this.fail(error));
    this.child.stdin.on('error', (error) => this.fail(error));
    this.child.on('exit', () => this.fail(new Error(`像素验证进程退出：${this.stderr}`)));
    createInterface({ input: this.child.stdout }).on('line', (line) => {
      const pending = this.pending; if (!pending) return;
      this.pending = null; if (this.timer) clearTimeout(this.timer);
      try {
        const result = JSON.parse(line);
        if (!result.ok) throw new Error(`图片解码或像素验证失败：${this.stderr}`);
        pending.resolve(result);
      } catch (error) { pending.reject(error as Error); }
    });
  }

  /** 切换原图，释放上一张原图的解码结果。 */
  async reference(file: string): Promise<void> { await this.request('REF', file); }

  /** 返回真实样本比较结果，SSIM 分数不参与判断。 */
  async evaluate(file: string, key: string): Promise<IPixelVerification> {
    const { ok, ...result } = await this.request('EVAL', file);
    if (!['rgbEqual', 'alphaEqual', 'dimensionsEqual', 'colorEncodingEqual'].every((name) => typeof result[name] === 'boolean')) throw new Error('像素验证返回值无效');
    return { ...result, key } as IPixelVerification;
  }

  /** 释放常驻进程和原图缓冲。 */
  close() { this.child.kill(); }

  private fail(error: Error) {
    this.failure = error; if (this.timer) clearTimeout(this.timer);
    this.pending?.reject(error); this.pending = null;
  }

  private request(command: string, file: string): Promise<any> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.pending || /[\t\r\n]/.test(file)) return Promise.reject(new Error('无效的验证请求'));
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.timer = setTimeout(() => { this.fail(new Error('像素验证超时')); this.close(); }, 120000);
      this.child.stdin.write(`${command}\t${file}\n`);
    });
  }
}
