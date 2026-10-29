/** 编码参数与统计口径在基准脚本和界面之间保持一致。 */
export interface IEncodingRecord {
  encoder: string;
  quality: number | null;
  lossless: boolean;
  actualQuality?: number | null;
  pixelVerification?: IPixelVerification;
  encodingLossless?: boolean;
}

/** 原始 RGB/Alpha 样本验证；色彩配置是否一致单独记录。 */
export interface IPixelVerification {
  key: string;
  rgbEqual: boolean;
  alphaEqual: boolean;
  dimensionsEqual: boolean;
  colorEncodingEqual: boolean;
  rgbDifferentPixels?: number;
  alphaDifferentPixels?: number;
}

/** 只有逐样本验证通过，才归类为对原图像素无损。 */
export function isPixelLossless(result?: IPixelVerification): boolean {
  return Boolean(result?.dimensionsEqual && result.rgbEqual && result.alphaEqual);
}

/** 精确定位编码产物所需的参数。 */
export interface ISelectableRecord extends IEncodingRecord {
  effortTag: string;
}

/** 每个图像参数组独立判定；全集中任一图片不一致，该参数组就不能称为无损。 */
export function groupEncodingModes<T extends ISelectableRecord>(records: readonly T[]) {
  const groups = new Map<string, T[]>();
  for (const record of records) {
    const key = JSON.stringify([record.encoder, record.effortTag, record.quality]);
    const group = groups.get(key) ?? [];
    group.push(record); groups.set(key, group);
  }
  return Array.from(groups.values(), (group) => ({
    encoder: group[0].encoder, effortTag: group[0].effortTag, quality: group[0].quality,
    lossless: group.every((record) => record.lossless), records: group,
  }));
}

/** 体积汇总使用原始字节数，避免平均压缩率与体积坐标不一致。 */
export interface IVolumeRecord {
  inputBytes: number;
  outputBytes: number;
}

/**
 * 记录编码器的模式开关，独立于对原图 RGB/Alpha 的验证结论。
 * 只有 cjxl 的 Q100 等价于 `-d 0`；AVIF 的 Q100 仍经过 RGB→YUV 转换，不算无损模式。
 */
export function isEncodingLosslessMode(encoder: string, quality: number | null): boolean {
  return quality === null || quality === 100 && encoder === 'cjxl';
}

/** 编码模式由参数重新推导，旧数据中错误的声明不再沿用；实际无损性只取像素验证结果。 */
export function normalizeEncodingRecord<T extends IEncodingRecord>(record: T) {
  return {
    ...record,
    encodingLossless: isEncodingLosslessMode(record.encoder, record.quality),
    lossless: isPixelLossless(record.pixelVerification),
    actualQuality: record.actualQuality ?? getActualQuality(record.encoder, record.quality),
  };
}

/** cjpegli 的最低实际质量为 1；请求档位 0 仍保留作数据索引。 */
export function getActualQuality(encoder: string, quality: number | null): number | null {
  return quality === null ? null : encoder === 'cjpegli' ? Math.max(1, quality) : quality;
}

/** 同时展示实际质量与特殊编码模式，避免把参数值误认为统一画质。 */
export function formatEncodingQuality(encoder: string, quality: number | null, actualQuality?: number | null, lossless?: boolean): string {
  if (quality === null || quality === -1) return lossless === false ? '无损模式（像素不一致）' : lossless === true ? '无损' : '无损模式';
  const actual = actualQuality ?? getActualQuality(encoder, quality);
  return `Q=${actual}${lossless === true ? '（无损）' : ''}`;
}

/** 只返回参数完全匹配的记录；缺失时不替换编码器、力度或质量。 */
export function findExactEncodingRecord<T extends ISelectableRecord>(
  records: readonly T[], encoder: string, effortTag: string, quality: number | null,
): T | null {
  return records.find((record) =>
    record.encoder === encoder && record.effortTag === effortTag &&
    record.quality === quality
  ) ?? null;
}

/** 汇总压缩率按总输出 / 总输入计算，与平均字节数共享同一体积坐标。 */
export function summarizeVolume(records: readonly IVolumeRecord[]) {
  const inputBytes = records.reduce((sum, record) => sum + record.inputBytes, 0);
  const outputBytes = records.reduce((sum, record) => sum + record.outputBytes, 0);
  const ratioPct = inputBytes > 0 ? outputBytes / inputBytes * 100 : 0;
  return {
    ratioPct,
    avgBytes: records.length > 0 ? outputBytes / records.length : 0,
    savingPct: 100 - ratioPct,
  };
}

/** 数据更新后使用新的图片地址，避免浏览器复用同名旧产物。 */
export function buildImagePreviewUrl(kind: 'source-image' | 'result-file', file: string, version = ''): string {
  const encodedPath = file.split('/').map((part) => encodeURIComponent(part)).join('/');
  return `/${kind}/${encodedPath}${version ? `?v=${encodeURIComponent(version)}` : ''}`;
}
