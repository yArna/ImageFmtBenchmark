import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSsimulacra2Key, hashFile, readScoreCache, Ssimulacra2Worker } from '../ssimulacra2';

/** 任一输入或工具变化都必须使旧评分失效，相同内容则允许跨路径复用。 */
test('评分缓存绑定参考图、产物及工具内容', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ssimulacra2-test-'));
  try {
    writeFileSync(join(dir, 'a'), 'same'); writeFileSync(join(dir, 'b'), 'same');
    expect(await hashFile(join(dir, 'a'))).toBe(await hashFile(join(dir, 'b')));
    const key = getSsimulacra2Key('ref', 'output', 'engine');
    expect(getSsimulacra2Key('other', 'output', 'engine')).not.toBe(key);
    expect(getSsimulacra2Key('ref', 'other', 'engine')).not.toBe(key);
    expect(getSsimulacra2Key('ref', 'output', 'other')).not.toBe(key);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/** 低质量可能是负分，0 分也是有效分数；损坏行与不合法分数不能复用。 */
test('评分检查点兼容中断末行并保留负分与零分', () => {
  const a = 'a'.repeat(64), b = 'b'.repeat(64), c = 'c'.repeat(64);
  const cache = readScoreCache(`${JSON.stringify({ key: a, score: -80.2 })}\n${JSON.stringify({ key: b, score: 0 })}\n${JSON.stringify({ key: c, score: 101 })}\n{"key":`);
  expect([...cache]).toEqual([[a, -80.2], [b, 0]]);
});

/** 使用官方 CLI 作数值基准，特别覆盖原图带透明度而产物没有 Alpha 的 JPEG 场景。 */
test.skipIf(!existsSync('encoder/bin/ssimulacra2_worker'))('常驻计算器与官方工具在透明、非透明及重复产物上保持一致', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ssimulacra2-oracle-'));
  const worker = new Ssimulacra2Worker('encoder/bin/ssimulacra2_worker');
  try {
    const distorted = join(dir, 'dist.ppm');
    const rgb = Buffer.from(Array.from({ length: 32 * 32 * 3 }, (_, i) => (i * 13 + 19) % 256));
    writeFileSync(distorted, Buffer.concat([Buffer.from('P6\n32 32\n255\n'), rgb]));
    for (const transparent of [false, true]) {
      const reference = join(dir, 'ref.pam');
      const rgba = Buffer.alloc(32 * 32 * 4);
      for (let pixel = 0; pixel < 32 * 32; pixel++) {
        for (let channel = 0; channel < 3; channel++) rgba[pixel * 4 + channel] = rgb[pixel * 3 + channel];
        rgba[pixel * 4 + 3] = transparent ? pixel % 256 : 255;
      }
      writeFileSync(reference, Buffer.concat([Buffer.from('P7\nWIDTH 32\nHEIGHT 32\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n'), rgba]));
      await worker.reference(reference);
      const official = Number(execFileSync('encoder/bin/ssimulacra2', [reference, distorted], { encoding: 'utf8' }).trim());
      expect(await worker.evaluate(distorted)).toBeCloseTo(official, 6);
      expect(await worker.evaluate(distorted)).toBeCloseTo(official, 6);
      expect(await worker.evaluate(reference)).toBe(100);
    }
  } finally { worker.close(); rmSync(dir, { recursive: true, force: true }); }
});
