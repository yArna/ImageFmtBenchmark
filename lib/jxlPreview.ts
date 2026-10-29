import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** 按源文件内容缓存解码结果，同名产物重跑后不会命中旧 PNG。 */
export function ensureJxlPreview(source: string, cacheDir: string, decode: (input: string, output: string) => void): string {
  const digest = createHash('sha256').update(resolve(source)).update(readFileSync(source)).digest('hex');
  mkdirSync(cacheDir, { recursive: true });
  const cached = join(cacheDir, `${digest}.png`);
  if (existsSync(cached) && statSync(cached).size > 0) return cached;

  // 解码成功后再发布缓存，失败时不留下可被后续请求误用的半成品。
  const pending = join(cacheDir, `${digest}.${randomUUID()}.pending.png`);
  try {
    decode(source, pending);
    if (statSync(pending).size === 0) throw new Error('JXL 解码结果为空');
    renameSync(pending, cached);
    return cached;
  } finally {
    rmSync(pending, { force: true });
  }
}
