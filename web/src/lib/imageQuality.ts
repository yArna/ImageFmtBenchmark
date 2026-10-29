/**
 * 在线编码结果的客观质量指标（浏览器端计算）。
 *
 * 编码产物解码回 RGBA 后与源图逐像素比较，给出 PSNR 与 SSIM。
 * 两者都在预乘 Alpha 后的颜色上计算：全透明像素里隐藏的 RGB 不影响画面，
 * 因此 oxipng `-a` 这类改写隐藏像素的无损优化不会被误判为有损。
 */

/** 8×8 窗口、步长 4 的 SSIM，兼顾准确度与大图的计算耗时 */
const SSIM_WINDOW = 8;
const SSIM_STRIDE = 4;
const SSIM_C1 = (0.01 * 255) ** 2;
const SSIM_C2 = (0.03 * 255) ** 2;

/** 一张编码结果相对源图的质量指标 */
export interface IQualityMetrics {
  /** RGBA 峰值信噪比（dB），完全一致时为 Infinity */
  psnr: number;
  /** 亮度通道结构相似度，范围 0~1，1 为完全一致 */
  ssim: number;
}

/** 比较源图与解码结果，两者必须是同尺寸的 RGBA8 像素 */
export function computeQualityMetrics(
  reference: ArrayLike<number>,
  test: ArrayLike<number>,
  width: number,
  height: number
): IQualityMetrics {
  const count = width * height;
  if (reference.length < count * 4 || test.length < count * 4) {
    throw new Error('像素数据与图片尺寸不一致');
  }

  const refY = new Float32Array(count);
  const testY = new Float32Array(count);
  let sumSq = 0;

  for (let i = 0; i < count; i++) {
    const o = i * 4;
    const ra = reference[o + 3] / 255;
    const ta = test[o + 3] / 255;
    const rr = reference[o] * ra;
    const rg = reference[o + 1] * ra;
    const rb = reference[o + 2] * ra;
    const tr = test[o] * ta;
    const tg = test[o + 1] * ta;
    const tb = test[o + 2] * ta;

    const dr = rr - tr;
    const dg = rg - tg;
    const db = rb - tb;
    const da = reference[o + 3] - test[o + 3];
    sumSq += dr * dr + dg * dg + db * db + da * da;

    refY[i] = 0.299 * rr + 0.587 * rg + 0.114 * rb;
    testY[i] = 0.299 * tr + 0.587 * tg + 0.114 * tb;
  }

  const mse = sumSq / (count * 4);
  // 预乘带来的浮点误差远小于 1 个色阶，低于该阈值视为无损
  const psnr = mse < 1e-6 ? Infinity : 10 * Math.log10((255 * 255) / mse);

  return { psnr, ssim: computeSsim(refY, testY, width, height) };
}

/** 滑动窗口均值 SSIM；图片比窗口还小时退化为整图一个窗口 */
function computeSsim(a: Float32Array, b: Float32Array, width: number, height: number): number {
  const win = Math.min(SSIM_WINDOW, width, height);
  const stride = win < SSIM_WINDOW ? win : SSIM_STRIDE;
  const n = win * win;
  let total = 0;
  let windows = 0;

  for (let y = 0; y + win <= height; y += stride) {
    for (let x = 0; x + win <= width; x += stride) {
      let sa = 0;
      let sb = 0;
      let saa = 0;
      let sbb = 0;
      let sab = 0;
      for (let dy = 0; dy < win; dy++) {
        let idx = (y + dy) * width + x;
        for (let dx = 0; dx < win; dx++, idx++) {
          const va = a[idx];
          const vb = b[idx];
          sa += va;
          sb += vb;
          saa += va * va;
          sbb += vb * vb;
          sab += va * vb;
        }
      }
      const ma = sa / n;
      const mb = sb / n;
      const varA = saa / n - ma * ma;
      const varB = sbb / n - mb * mb;
      const cov = sab / n - ma * mb;
      total += ((2 * ma * mb + SSIM_C1) * (2 * cov + SSIM_C2)) / ((ma * ma + mb * mb + SSIM_C1) * (varA + varB + SSIM_C2));
      windows++;
    }
  }

  return windows ? total / windows : 1;
}
