/**
 * Dither-Kit Ordered-Dither Canvas Rendering Engine for Vue 3
 * Inspired by https://www.tripwire.sh/dither-kit
 *
 * Includes:
 * - Format-grouped color families (PNG=Teal/Emerald, JPEG=Orange/Amber/Red, JXL=Blue, WebP=Lime, AVIF=Purple/Pink)
 * - Format-Encoder naming convention ("格式-编码器") + authentic binary version & executable size metadata
 * - 4x4 Ordered Bayer Matrix pixel shader + bloom + sparkles + mirrored pixel avatar
 */

export type DitherVariant = 'gradient' | 'dotted' | 'hatched' | 'solid';
export type DitherBloom = 'off' | 'low' | 'high' | 'aura';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface DitherPaletteEntry {
  name: string;
  hex: string;
  brightHex: string;
  rgb: RGB;
  brightRgb: RGB;
}

export interface EncoderMetadata {
  id: string;
  displayName: string; // 格式-编码器
  formatLabel: 'PNG' | 'JPEG' | 'JPEG XL' | 'WebP' | 'AVIF';
  version: string;
  binaryBytes: number;
  binaryLabel: string;
  lossless: boolean;
  supportsLossless?: boolean;
  color: DitherPaletteEntry;
}

const BAYER_4X4: readonly number[] = [
   0 / 16,  8 / 16,  2 / 16, 10 / 16,
  12 / 16,  4 / 16, 14 / 16,  6 / 16,
   3 / 16, 11 / 16,  1 / 16,  9 / 16,
  15 / 16,  7 / 16, 13 / 16,  5 / 16,
];

export const DITHER_PALETTE: Record<string, DitherPaletteEntry> = {
  // PNG Family (Emerald / Teal / Mint / Cyan-Green)
  pngEmerald: {
    name: 'pngEmerald',
    hex: '#10b981',
    brightHex: '#6ee7b7',
    rgb: { r: 16, g: 185, b: 129 },
    brightRgb: { r: 110, g: 231, b: 183 },
  },
  pngTeal: {
    name: 'pngTeal',
    hex: '#14b8a6',
    brightHex: '#5eead4',
    rgb: { r: 20, g: 184, b: 166 },
    brightRgb: { r: 94, g: 234, b: 212 },
  },
  pngMint: {
    name: 'pngMint',
    hex: '#34d399',
    brightHex: '#a7f3d0',
    rgb: { r: 52, g: 211, b: 153 },
    brightRgb: { r: 167, g: 243, b: 208 },
  },
  pngCyan: {
    name: 'pngCyan',
    hex: '#06b6d4',
    brightHex: '#67e8f9',
    rgb: { r: 6, g: 182, b: 212 },
    brightRgb: { r: 103, g: 232, b: 249 },
  },

  // JPEG Family (Red-Coral / Orange / Golden Amber)
  jpegRed: {
    name: 'jpegRed',
    hex: '#ef4444',
    brightHex: '#fca5a5',
    rgb: { r: 239, g: 68, b: 68 },
    brightRgb: { r: 252, g: 165, b: 165 },
  },
  jpegOrange: {
    name: 'jpegOrange',
    hex: '#f97316',
    brightHex: '#fdba74',
    rgb: { r: 249, g: 115, b: 22 },
    brightRgb: { r: 253, g: 186, b: 116 },
  },
  jpegAmber: {
    name: 'jpegAmber',
    hex: '#eab308',
    brightHex: '#fde047',
    rgb: { r: 234, g: 179, b: 8 },
    brightRgb: { r: 253, g: 224, b: 71 },
  },

  // JPEG XL Family (Electric Blue)
  jxlBlue: {
    name: 'jxlBlue',
    hex: '#3b82f6',
    brightHex: '#93c5fd',
    rgb: { r: 59, g: 130, b: 246 },
    brightRgb: { r: 147, g: 197, b: 253 },
  },

  // WebP Family (Chartreuse Neon Lime & Olive-Lime)
  webpLime: {
    name: 'webpLime',
    hex: '#84cc16',
    brightHex: '#bef264',
    rgb: { r: 132, g: 204, b: 22 },
    brightRgb: { r: 190, g: 242, b: 100 },
  },
  webpSharp: {
    name: 'webpSharp',
    hex: '#a3e635',
    brightHex: '#d9f99d',
    rgb: { r: 163, g: 230, b: 53 },
    brightRgb: { r: 217, g: 249, b: 157 },
  },

  // AVIF Family (Purple / Pink Magenta)
  avifPurple: {
    name: 'avifPurple',
    hex: '#a855f7',
    brightHex: '#d8b4fe',
    rgb: { r: 168, g: 85, b: 247 },
    brightRgb: { r: 216, g: 180, b: 254 },
  },
  avifPink: {
    name: 'avifPink',
    hex: '#ec4899',
    brightHex: '#f9a8d4',
    rgb: { r: 236, g: 72, b: 153 },
    brightRgb: { r: 249, g: 168, b: 212 },
  },

  // Generic aliases for UI helpers
  green: {
    name: 'green',
    hex: '#22c55e',
    brightHex: '#86efac',
    rgb: { r: 34, g: 197, b: 94 },
    brightRgb: { r: 134, g: 239, b: 172 },
  },
  blue: {
    name: 'blue',
    hex: '#3b82f6',
    brightHex: '#93c5fd',
    rgb: { r: 59, g: 130, b: 246 },
    brightRgb: { r: 147, g: 197, b: 253 },
  },
  purple: {
    name: 'purple',
    hex: '#a855f7',
    brightHex: '#d8b4fe',
    rgb: { r: 168, g: 85, b: 247 },
    brightRgb: { r: 216, g: 180, b: 254 },
  },
  pink: {
    name: 'pink',
    hex: '#ec4899',
    brightHex: '#f9a8d4',
    rgb: { r: 236, g: 72, b: 153 },
    brightRgb: { r: 249, g: 168, b: 212 },
  },
  orange: {
    name: 'orange',
    hex: '#f97316',
    brightHex: '#fdba74',
    rgb: { r: 249, g: 115, b: 22 },
    brightRgb: { r: 253, g: 186, b: 116 },
  },
  red: {
    name: 'red',
    hex: '#ef4444',
    brightHex: '#fca5a5',
    rgb: { r: 239, g: 68, b: 68 },
    brightRgb: { r: 252, g: 165, b: 165 },
  },
  cyan: {
    name: 'cyan',
    hex: '#06b6d4',
    brightHex: '#67e8f9',
    rgb: { r: 6, g: 182, b: 212 },
    brightRgb: { r: 103, g: 232, b: 249 },
  },
  amber: {
    name: 'amber',
    hex: '#eab308',
    brightHex: '#fde047',
    rgb: { r: 234, g: 179, b: 8 },
    brightRgb: { r: 253, g: 224, b: 71 },
  },
  lime: {
    name: 'lime',
    hex: '#84cc16',
    brightHex: '#bef264',
    rgb: { r: 132, g: 204, b: 22 },
    brightRgb: { r: 190, g: 242, b: 100 },
  },
  violet: {
    name: 'violet',
    hex: '#6366f1',
    brightHex: '#a5b4fc',
    rgb: { r: 99, g: 102, b: 241 },
    brightRgb: { r: 165, g: 180, b: 252 },
  },
  teal: {
    name: 'teal',
    hex: '#14b8a6',
    brightHex: '#5eead4',
    rgb: { r: 20, g: 184, b: 166 },
    brightRgb: { r: 94, g: 234, b: 212 },
  },
  grey: {
    name: 'grey',
    hex: '#71717a',
    brightHex: '#d4d4d8',
    rgb: { r: 113, g: 113, b: 122 },
    brightRgb: { r: 212, g: 212, b: 216 },
  },
};

export const ENCODER_META_MAP: Record<string, EncoderMetadata> = {
  'png-libpng': {
    id: 'png-libpng',
    displayName: 'PNG-libpng',
    formatLabel: 'PNG',
    version: 'v1.8.0 + zlib 1.3.2',
    binaryBytes: 296872,
    binaryLabel: '289.9 KB',
    lossless: true,
    supportsLossless: true,
    color: DITHER_PALETTE.pngEmerald,
  },
  'png-libpng-zlibng': {
    id: 'png-libpng-zlibng',
    displayName: 'PNG-libpng-zlibng',
    formatLabel: 'PNG',
    version: 'v1.8.0 + zlib-ng 2.2',
    binaryBytes: 331680,
    binaryLabel: '323.9 KB',
    lossless: true,
    supportsLossless: true,
    color: DITHER_PALETTE.pngTeal,
  },
  'png-libspng': {
    id: 'png-libspng',
    displayName: 'PNG-libspng',
    formatLabel: 'PNG',
    version: 'v0.7.4 + zlib 1.3.2',
    binaryBytes: 143384,
    binaryLabel: '140.0 KB',
    lossless: true,
    supportsLossless: true,
    color: DITHER_PALETTE.pngMint,
  },
  'oxipng': {
    id: 'oxipng',
    displayName: 'PNG-oxipng',
    formatLabel: 'PNG',
    version: 'v10.2.1 (libdeflate)',
    binaryBytes: 783184,
    binaryLabel: '764.8 KB',
    lossless: true,
    supportsLossless: true,
    color: DITHER_PALETTE.pngCyan,
  },
  'cjpeg-turbo': {
    id: 'cjpeg-turbo',
    displayName: 'JPEG-cjpeg-turbo',
    formatLabel: 'JPEG',
    version: 'v3.2.1',
    binaryBytes: 599248,
    binaryLabel: '585.2 KB',
    lossless: false,
    color: DITHER_PALETTE.jpegRed,
  },
  'cjpeg-mozjpeg': {
    id: 'cjpeg-mozjpeg',
    displayName: 'JPEG-cjpeg-mozjpeg',
    formatLabel: 'JPEG',
    version: 'v5.0.0',
    binaryBytes: 916608,
    binaryLabel: '895.1 KB',
    lossless: false,
    color: DITHER_PALETTE.jpegOrange,
  },
  'cjpegli': {
    id: 'cjpegli',
    displayName: 'JPEG-cjpegli',
    formatLabel: 'JPEG',
    version: 'v0.13.0 (Butteraugli)',
    binaryBytes: 524376,
    binaryLabel: '512.1 KB',
    lossless: false,
    color: DITHER_PALETTE.jpegAmber,
  },
  'cjxl': {
    id: 'cjxl',
    displayName: 'JXL-cjxl',
    formatLabel: 'JPEG XL',
    version: 'v0.13.0',
    binaryBytes: 2809368,
    binaryLabel: '2.68 MB',
    lossless: false,
    supportsLossless: true,
    color: DITHER_PALETTE.jxlBlue,
  },
  'cwebp': {
    id: 'cwebp',
    displayName: 'WebP-cwebp',
    formatLabel: 'WebP',
    version: 'v1.6.0',
    binaryBytes: 1122840,
    binaryLabel: '1.07 MB',
    lossless: false,
    supportsLossless: true,
    color: DITHER_PALETTE.webpLime,
  },
  'cwebp-sharp-yuv': {
    id: 'cwebp-sharp-yuv',
    displayName: 'WebP-cwebp-sharp-yuv',
    formatLabel: 'WebP',
    version: 'v1.6.0 (-sharp_yuv)',
    binaryBytes: 1122840,
    binaryLabel: '1.07 MB',
    lossless: false,
    supportsLossless: false,
    color: DITHER_PALETTE.webpSharp,
  },
  'avifenc-aom': {
    id: 'avifenc-aom',
    displayName: 'AVIF-aom',
    formatLabel: 'AVIF',
    version: 'v1.4.2 / libaom 3.14.1',
    binaryBytes: 379288,
    binaryLabel: '370.4 KB',
    lossless: false,
    supportsLossless: true,
    color: DITHER_PALETTE.avifPurple,
  },
  'avifenc-svt': {
    id: 'avifenc-svt',
    displayName: 'AVIF-svt',
    formatLabel: 'AVIF',
    version: 'v1.4.2 / SVT-AV1 4.1.0',
    binaryBytes: 4246272,
    binaryLabel: '4.05 MB',
    lossless: false,
    color: DITHER_PALETTE.avifPink,
  },
};

export const ORIGINAL_ENCODER_ID = '__ORIGINAL__';

const ORIGINAL_META: EncoderMetadata = {
  id: ORIGINAL_ENCODER_ID,
  displayName: '原图',
  formatLabel: 'PNG',
  version: '',
  binaryBytes: 0,
  binaryLabel: '',
  lossless: true,
  color: DITHER_PALETTE.grey,
};

export function getEncoderMeta(encoder: string): EncoderMetadata {
  if (encoder === ORIGINAL_ENCODER_ID) return ORIGINAL_META;
  return (
    ENCODER_META_MAP[encoder] ?? {
      id: encoder,
      displayName: encoder,
      formatLabel: 'PNG',
      version: 'v1.0',
      binaryBytes: 0,
      binaryLabel: '--',
      lossless: false,
      color: DITHER_PALETTE.blue,
    }
  );
}

export function getEncoderDisplayName(encoder: string): string {
  if (encoder === ORIGINAL_ENCODER_ID) return '原图';
  return ENCODER_META_MAP[encoder]?.displayName ?? encoder;
}


/**
 * 格式化简洁、无重复的压缩力度档位显示文案
 * 避免出现 "e7 (-e 7)"、"m4 (-m 4)"、"s6 (-c aom -s 6 --depth 10 -a tune=iq)" 等重复或冗长信息
 */
export function formatCleanEffort(encoder: string, tag: string): string {
  switch (encoder) {
    case 'png-libpng':
    case 'png-libpng-zlibng':
    case 'png-libspng':
      return `-l ${tag.replace(/^l/, '')}`;
    case 'oxipng':
      return `-o ${tag.replace(/^o/, '')}`;
    case 'cjpeg-turbo':
      if (tag === 'e0_baseline') return 'baseline';
      if (tag === 'e1_optimize') return '-optimize';
      if (tag === 'e2_progressive') return '-progressive';
      return tag;
    case 'cjpeg-mozjpeg':
      if (tag === 'e0_fast') return '-notrellis -fastcrush';
      if (tag === 'e1_fastcrush') return '-fastcrush';
      if (tag === 'e2_default') return 'default';
      return tag;
    case 'cjpegli':
      return `-p ${tag.replace(/^p/, '')}`;
    case 'cjxl':
      return `-e ${tag.replace(/^e/, '')}`;
    case 'cwebp':
    case 'cwebp-sharp-yuv':
      return `-m ${tag.replace(/^m/, '')}`;
    case 'avifenc-aom':
    case 'avifenc-svt':
      return `-s ${tag.replace(/^s/, '')}`;
    default:
      return tag;
  }
}

export function getEncoderColor(encoder: string): DitherPaletteEntry {
  if (encoder === ORIGINAL_ENCODER_ID) return DITHER_PALETTE.grey;
  return ENCODER_META_MAP[encoder]?.color ?? DITHER_PALETTE.blue;
}

export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function shouldLightDitherCell(
  gx: number,
  gy: number,
  density: number,
  variant: DitherVariant
): boolean {
  const clamped = Math.max(0, Math.min(1, density));
  if (clamped <= 0.01) return false;

  const bx = ((gx % 4) + 4) % 4;
  const by = ((gy % 4) + 4) % 4;
  const bayerThreshold = BAYER_4X4[by * 4 + bx];

  switch (variant) {
    case 'solid':
      return bayerThreshold < Math.min(0.92, 0.55 + clamped * 0.4);
    case 'dotted':
      if (bx % 2 !== 0 || by % 2 !== 0) return false;
      return bayerThreshold < clamped * 1.15;
    case 'hatched': {
      const diag1 = (gx + gy) % 4 === 0;
      const diag2 = (((gx - gy) % 4) + 4) % 4 === 0 && clamped > 0.45;
      return (diag1 || diag2) && bayerThreshold < clamped * 1.25;
    }
    case 'gradient':
    default:
      return bayerThreshold < clamped;
  }
}

export function isSparkleCell(
  gx: number,
  gy: number,
  seed: number,
  timeMs: number
): number {
  const h = (((gx * 374761393) ^ (gy * 668265263) ^ seed) >>> 0);
  if ((h & 255) !== 0) return 0;
  const phase = (h >>> 8) & 1023;
  const speed = 0.003 + ((h >>> 18) & 7) * 0.0005;
  const wave = Math.sin(timeMs * speed + phase);
  return wave > 0.65 ? (wave - 0.65) / 0.35 : 0;
}

export function getBloomFilterCss(bloom: DitherBloom): string {
  switch (bloom) {
    case 'low':
      return 'blur(6px) brightness(1.15) saturate(1.3)';
    case 'high':
      return 'blur(12px) brightness(1.35) saturate(1.6)';
    case 'aura':
      return 'blur(18px) brightness(1.55) saturate(1.85)';
    case 'off':
    default:
      return 'none';
  }
}

export function getBloomOpacity(bloom: DitherBloom): number {
  switch (bloom) {
    case 'low':
      return 0.32;
    case 'high':
      return 0.52;
    case 'aura':
      return 0.68;
    case 'off':
    default:
      return 0;
  }
}

export function drawDitherColumn(
  ctx: CanvasRenderingContext2D,
  gx: number,
  yTopPx: number,
  yBottomPx: number,
  pixelSize: number,
  color: DitherPaletteEntry,
  variant: DitherVariant,
  sparkles: boolean,
  seed: number,
  timeMs: number,
  alphaMultiplier = 1
) {
  const gyStart = Math.floor(yTopPx / pixelSize);
  const gyEnd = Math.ceil(yBottomPx / pixelSize);
  const span = Math.max(1, gyEnd - gyStart);

  const { r, g, b } = color.rgb;
  const br = color.brightRgb;

  for (let gy = gyStart; gy < gyEnd; gy++) {
    const t = 1 - (gy - gyStart) / span;
    const density = variant === 'solid' ? 0.85 : 0.08 + Math.pow(t, 1.15) * 0.86;

    if (!shouldLightDitherCell(gx, gy, density, variant)) continue;

    let sp = 0;
    if (sparkles) {
      sp = isSparkleCell(gx, gy, seed, timeMs);
    }

    if (sp > 0.05) {
      const cr = Math.round(r + (255 - r) * sp);
      const cg = Math.round(g + (255 - g) * sp);
      const cb = Math.round(b + (255 - b) * sp);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${Math.min(1, (0.9 + sp * 0.1) * alphaMultiplier)})`;
    } else if (gy <= gyStart + 1) {
      ctx.fillStyle = `rgba(${br.r},${br.g},${br.b},${0.95 * alphaMultiplier})`;
    } else {
      const cellAlpha = (0.55 + t * 0.42) * alphaMultiplier;
      ctx.fillStyle = `rgba(${r},${g},${b},${cellAlpha.toFixed(3)})`;
    }

    ctx.fillRect(gx * pixelSize, gy * pixelSize, pixelSize, pixelSize);
  }
}

export function drawDitherRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  pixelSize: number,
  color: DitherPaletteEntry,
  variant: DitherVariant,
  direction: 'up' | 'down' | 'left' | 'right',
  sparkles: boolean,
  seed: number,
  timeMs: number,
  alphaMultiplier = 1,
  densityBoost = 0
) {
  if (w <= 0 || h <= 0) return;
  const gxStart = Math.floor(x / pixelSize);
  const gxEnd = Math.ceil((x + w) / pixelSize);
  const gyStart = Math.floor(y / pixelSize);
  const gyEnd = Math.ceil((y + h) / pixelSize);
  const xSpan = Math.max(1, gxEnd - gxStart);
  const ySpan = Math.max(1, gyEnd - gyStart);

  const { r, g, b } = color.rgb;
  const br = color.brightRgb;

  for (let gy = gyStart; gy < gyEnd; gy++) {
    for (let gx = gxStart; gx < gxEnd; gx++) {
      let t = 0.5;
      if (direction === 'up') t = 1 - (gy - gyStart) / ySpan;
      else if (direction === 'down') t = (gy - gyStart) / ySpan;
      else if (direction === 'right') t = (gx - gxStart) / xSpan;
      else if (direction === 'left') t = 1 - (gx - gxStart) / xSpan;

      const density = Math.min(
        0.96,
        (variant === 'solid' ? 0.84 : 0.12 + Math.pow(t, 1.05) * 0.82) + densityBoost
      );

      if (!shouldLightDitherCell(gx, gy, density, variant)) continue;

      const sp = sparkles ? isSparkleCell(gx, gy, seed, timeMs) : 0;
      if (sp > 0.05) {
        const cr = Math.round(r + (255 - r) * sp);
        const cg = Math.round(g + (255 - g) * sp);
        const cb = Math.round(b + (255 - b) * sp);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${Math.min(1, alphaMultiplier)})`;
      } else if (
        (direction === 'up' && gy === gyStart) ||
        (direction === 'right' && gx === gxEnd - 1)
      ) {
        ctx.fillStyle = `rgba(${br.r},${br.g},${br.b},${0.95 * alphaMultiplier})`;
      } else {
        const a = (0.58 + t * 0.38) * alphaMultiplier;
        ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
      }

      const px = Math.max(x, gx * pixelSize);
      const py = Math.max(y, gy * pixelSize);
      const pw = Math.min(x + w - px, pixelSize);
      const ph = Math.min(y + h - py, pixelSize);
      if (pw > 0 && ph > 0) {
        ctx.fillRect(px, py, pw, ph);
      }
    }
  }
}

export function drawMirroredAvatar(
  canvas: HTMLCanvasElement,
  name: string,
  colorOverride?: DitherPaletteEntry
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const seed = hashString(name);
  const paletteValues = Object.values(DITHER_PALETTE);
  const color = colorOverride ?? paletteValues[seed % (paletteValues.length - 1)];
  const mirrorVertical = (seed & 1) === 0;

  ctx.fillStyle = '#111115';
  ctx.fillRect(0, 0, w, h);

  const grid = 8;
  const cellW = w / grid;
  const cellH = h / grid;

  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const srcX = mirrorVertical ? (gx < 4 ? gx : 7 - gx) : gx;
      const srcY = mirrorVertical ? gy : (gy < 4 ? gy : 7 - gy);
      const bitPos = (srcY * 4 + (srcX % 4)) % 31;
      const on = ((seed >>> bitPos) & 1) === 1;
      const accent = (((seed ^ 0x5a5a5a5a) >>> bitPos) & 1) === 1;

      if (on) {
        ctx.fillStyle = accent ? color.brightHex : color.hex;
        ctx.fillRect(
          Math.floor(gx * cellW),
          Math.floor(gy * cellH),
          Math.ceil(cellW),
          Math.ceil(cellH)
        );
      } else if ((gx + gy) % 2 === 0) {
        ctx.fillStyle = `rgba(${color.rgb.r},${color.rgb.g},${color.rgb.b},0.14)`;
        ctx.fillRect(
          Math.floor(gx * cellW),
          Math.floor(gy * cellH),
          Math.ceil(cellW),
          Math.ceil(cellH)
        );
      }
    }
  }
}
