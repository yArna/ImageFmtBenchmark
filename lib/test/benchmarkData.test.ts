import {
  findExactEncodingRecord,
  formatEncodingQuality,
  normalizeEncodingRecord,
  summarizeVolume,
} from '../benchmarkData';

/** 用不同大小的图片和相邻参数验证统计与匹配，防止静默替换产物。 */
test('汇总体积使用总字节比例，柱高与平均体积共享坐标', () => {
  const records = [{ inputBytes: 100, outputBytes: 90 }, { inputBytes: 900, outputBytes: 90 }];
  const summary = summarizeVolume(records);
  expect(summary.ratioPct).toBe(18);
  expect(summary.avgBytes).toBe(90);
  expect(summary.savingPct).toBe(82);
  expect(summary.ratioPct / 100 * 500).toBe(summary.avgBytes);
});

test('单图与空数据不产生无效体积', () => {
  expect(summarizeVolume([{ inputBytes: 200, outputBytes: 300 }])).toEqual({ ratioPct: 150, avgBytes: 300, savingPct: -50 });
  expect(summarizeVolume([]).ratioPct).toBe(0);
  expect(summarizeVolume([]).avgBytes).toBe(0);
});

test('未验证的旧 JXL Q100 只保留编码模式声明，不推断像素无损', () => {
  const oldRecord = { encoder: 'cjxl', quality: 100, lossless: false };
  expect(normalizeEncodingRecord(oldRecord)).toEqual({ ...oldRecord, lossless: false, encodingLossless: true, actualQuality: 100 });
  expect(oldRecord.lossless).toBe(false);
  expect(formatEncodingQuality('cjxl', 100)).toBe('Q=100');
});

test('WebP 和 AVIF 的 Q100 不通过参数值擅自升级为无损', () => {
  for (const encoder of ['cwebp', 'cwebp-sharp-yuv', 'avifenc-aom', 'avifenc-svt', 'cjpegli']) {
    expect(normalizeEncodingRecord({ encoder, quality: 100, lossless: false }).lossless).toBe(false);
  }
});

test('cjpegli 的请求 Q0 保留索引，显示实际 Q1，并兼容已有实际参数', () => {
  expect(normalizeEncodingRecord({ encoder: 'cjpegli', quality: 0, lossless: false })).toEqual({ encoder: 'cjpegli', quality: 0, actualQuality: 1, lossless: false, encodingLossless: false });
  expect(formatEncodingQuality('cjpegli', 0)).toBe('Q=1');
  expect(formatEncodingQuality('cjpegli', 20, 21)).toBe('Q=21');
  expect(normalizeEncodingRecord({ encoder: 'cjpegli', quality: 20, actualQuality: 21, lossless: false }).actualQuality).toBe(21);
  expect(formatEncodingQuality('cjxl', null)).toBe('无损模式');
});

test('无损查询不会返回有损 Q100，也不会借用普通 WebP 的产物', () => {
  const records = [
    { encoder: 'cwebp-sharp-yuv', effortTag: 'm0', quality: 100, lossless: false },
    { encoder: 'cwebp', effortTag: 'm0', quality: null, lossless: true },
  ];
  expect(findExactEncodingRecord(records, 'cwebp-sharp-yuv', 'm0', null)).toBeNull();
  expect(findExactEncodingRecord(records, 'cwebp', 'm0', null)).toBe(records[1]);
});

test('缺少所选力度或质量时返回空缺，不回退到第一条记录', () => {
  const records = [{ encoder: 'cjxl', effortTag: 'e1', quality: 80, lossless: false }];
  expect(findExactEncodingRecord(records, 'cjxl', 'e7', 80)).toBeNull();
  expect(findExactEncodingRecord(records, 'cjxl', 'e1', null)).toBeNull();
  expect(findExactEncodingRecord(records, 'cjxl', 'e1', 80)).toBe(records[0]);
});
