import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PixelVerificationWorker, getPixelVerificationKey, readPixelVerificationCache } from '../pixelVerification';
import { groupEncodingModes, isEncodingLosslessMode, isPixelLossless, normalizeEncodingRecord } from '../benchmarkData';

const key = 'a'.repeat(64);
const verification = { key, rgbEqual: true, alphaEqual: true, dimensionsEqual: true, colorEncodingEqual: true };

test('无损判断只取 RGB、Alpha 和尺寸验证，不取质量参数或评分', () => {
  for (const encoder of ['avifenc-svt', 'cjxl', 'cwebp']) {
    expect(normalizeEncodingRecord({ encoder, quality: 100, lossless: true }).lossless).toBe(false);
    expect(normalizeEncodingRecord({ encoder, quality: 80, lossless: false, pixelVerification: verification }).lossless).toBe(true);
  }
  expect(isPixelLossless({ ...verification, colorEncodingEqual: false })).toBe(true);
  for (const field of ['rgbEqual', 'alphaEqual', 'dimensionsEqual']) expect(isPixelLossless({ ...verification, [field]: false })).toBe(false);
});

test('缓存绑定原图、产物与引擎，拒绝损坏和缺字段条目', () => {
  const original = getPixelVerificationKey('reference', 'output', 'engine');
  expect(new Set([original, getPixelVerificationKey('other', 'output', 'engine'), getPixelVerificationKey('reference', 'other', 'engine'), getPixelVerificationKey('reference', 'output', 'other')]).size).toBe(4);
  const cache = readPixelVerificationCache(`${JSON.stringify(verification)}\n${JSON.stringify({ key: 'b'.repeat(64), rgbEqual: true })}\n{"key":`);
  expect([...cache.values()]).toEqual([verification]);
});

test('全集按完整参数组分类，不丢弃未通过验证的图片', () => {
  const records = [true, false].map((lossless) => ({ encoder: 'cjxl', effortTag: 'e7', quality: 100, lossless }));
  expect(groupEncodingModes(records)[0]).toMatchObject({ lossless: false, records });
});

test('原生验证精确核对跨位深、透明 RGB、Alpha 和尺寸', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'imagefmt-pixel-test-'));
  const worker = new PixelVerificationWorker(resolve('encoder/bin/pixel_verify_worker'));
  const ppm = (name: string, bits: number, pixels: number[], width = 1) => {
    const body = Buffer.alloc(pixels.length * (bits === 16 ? 2 : 1));
    pixels.forEach((value, index) => bits === 16 ? body.writeUInt16BE(value, index * 2) : body.writeUInt8(value, index));
    const file = join(directory, name);
    writeFileSync(file, Buffer.concat([Buffer.from(`P6\n${width} 1\n${2 ** bits - 1}\n`), body]));
    return file;
  };
  const pam = (name: string, pixels: number[]) => {
    const file = join(directory, name);
    writeFileSync(file, Buffer.concat([Buffer.from('P7\nWIDTH 1\nHEIGHT 1\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n'), Buffer.from(pixels)]));
    return file;
  };
  try {
    await worker.reference(ppm('source.ppm', 8, [12, 100, 230]));
    expect(isPixelLossless(await worker.evaluate(ppm('same16.ppm', 16, [12, 100, 230].map((value) => value * 257)), key))).toBe(true);
    expect(await worker.evaluate(ppm('different16.ppm', 16, [12 * 257 + 1, 100 * 257, 230 * 257]), key)).toMatchObject({ rgbEqual: false, rgbDifferentPixels: 1 });
    expect(isPixelLossless(await worker.evaluate(pam('opaque.pam', [12, 100, 230, 255]), key))).toBe(true);
    expect(await worker.evaluate(ppm('larger.ppm', 8, [12, 100, 230, 12, 100, 230], 2), key)).toMatchObject({ dimensionsEqual: false });
    await worker.reference(pam('transparent.pam', [12, 100, 230, 0]));
    expect(await worker.evaluate(pam('hidden-rgb.pam', [0, 100, 230, 0]), key)).toMatchObject({ rgbEqual: true, alphaEqual: true, rgbDifferentPixels: 0 });
    expect(await worker.evaluate(pam('changed-alpha.pam', [12, 100, 230, 1]), key)).toMatchObject({ rgbEqual: true, alphaEqual: false, alphaDifferentPixels: 1 });
  } finally { worker.close(); rmSync(directory, { recursive: true, force: true }); }
});


test('只有真正的无损参数才声明无损模式，旧数据中的错误声明被纠正', () => {
  for (const encoder of ['avifenc-aom', 'avifenc-svt', 'cwebp']) {
    expect(isEncodingLosslessMode(encoder, 100)).toBe(false);
    const record = normalizeEncodingRecord({ encoder, quality: 100, lossless: false, encodingLossless: true, pixelVerification: { ...verification, rgbEqual: false } });
    expect([record.encodingLossless, record.lossless]).toEqual([false, false]);
  }
  expect(isEncodingLosslessMode('avifenc-aom', null)).toBe(true);
  expect(isEncodingLosslessMode('cjxl', 100)).toBe(true);
});
