// libavif 编码器封装（libaom / SVT-AV1 两种内核，编译时用 IFB_AVIF_CODEC 区分）
//
// opts:
//   q        = 0..100
//   speed    = 0..10   -> avifEncoder.speed
//   lossless = 0/1
//   yuv      = 444 / 420 / 422 / 400
//   depth    = 8 / 10 / 12
//   alphaq   = 0..100  -> qualityAlpha
//   tune     = 编码器私有调优（aom: iq/ssim/psnr；svt: 0..4）

#include "ifb_api.h"
#include <avif/avif.h>

#ifndef IFB_AVIF_CODEC_AOM
#define IFB_AVIF_CODEC_AOM 1
#endif

static avifPixelFormat ifb_avif_yuv(const char *opts) {
  const char *v = ifb_param_value(opts, "yuv");
  if (!v) return AVIF_PIXEL_FORMAT_YUV444;
  if (v[0] == '4' && v[1] == '2' && v[2] == '0') return AVIF_PIXEL_FORMAT_YUV420;
  if (v[0] == '4' && v[1] == '2' && v[2] == '2') return AVIF_PIXEL_FORMAT_YUV422;
  if (v[0] == '4' && v[1] == '0' && v[2] == '0') return AVIF_PIXEL_FORMAT_YUV400;
  return AVIF_PIXEL_FORMAT_YUV444;
}

IFB_EXTERN IFB_EXPORT int ifb_encode(const uint8_t *in, int len, int w, int h, const char *opts) {
  ifb_clear_error();
  if (!in || w <= 0 || h <= 0) {
    ifb_set_error("invalid input");
    return -1;
  }
  if ((size_t)len < (size_t)w * (size_t)h * 4) {
    ifb_set_error("input buffer smaller than w*h*4");
    return -1;
  }

  int quality = ifb_param_int(opts, "q", 70);
  int speed = ifb_param_int(opts, "speed", 6);
  int lossless = ifb_param_flag(opts, "lossless", 0);
  int depth = ifb_param_int(opts, "depth", 8);
  int alphaq = ifb_param_int(opts, "alphaq", -1);
  int has_alpha = ifb_has_alpha(in, w, h);

  if (quality < 0) quality = 0;
  if (quality > 100) quality = 100;
  if (depth != 8 && depth != 10 && depth != 12) depth = 8;

  avifPixelFormat fmt = ifb_avif_yuv(opts);
  if (lossless) {
    fmt = AVIF_PIXEL_FORMAT_YUV444;
    quality = 100;
  }

  avifImage *image = avifImageCreate((uint32_t)w, (uint32_t)h, (uint32_t)depth, fmt);
  if (!image) {
    ifb_set_error("avif: image create failed");
    return -1;
  }
  if (lossless) image->matrixCoefficients = AVIF_MATRIX_COEFFICIENTS_IDENTITY;

  avifRGBImage rgb;
  avifRGBImageSetDefaults(&rgb, image);
  rgb.depth = 8;
  rgb.format = AVIF_RGB_FORMAT_RGBA;
  rgb.pixels = (uint8_t *)in;
  rgb.rowBytes = (uint32_t)w * 4;
  rgb.ignoreAlpha = has_alpha ? 0 : 1;

  avifResult res = avifImageRGBToYUV(image, &rgb);
  if (res != AVIF_RESULT_OK) {
    avifImageDestroy(image);
    ifb_set_errorf("avif: RGBToYUV failed: %s", avifResultToString(res));
    return -1;
  }

  avifEncoder *enc = avifEncoderCreate();
  if (!enc) {
    avifImageDestroy(image);
    ifb_set_error("avif: encoder create failed");
    return -1;
  }
  enc->codecChoice = IFB_AVIF_CODEC_AOM ? AVIF_CODEC_CHOICE_AOM : AVIF_CODEC_CHOICE_SVT;
  enc->speed = speed;
  enc->quality = quality;
  enc->qualityAlpha = (alphaq >= 0) ? alphaq : quality;
  enc->maxThreads = 1;
  /* min/maxQuantizer 保持 libavif 默认的 0~63：它们是量化器范围而不是质量值，
     误设为 AVIF_QUALITY_DEFAULT(-1) 会被 codec_aom 截断成 0~0，量化器锁死在 0，导致 q 完全失效 */

  /* 无损时 tune 没有意义（libavif 自身也会在无损时放弃 tune=iq），跳过以免与无损路径冲突 */
  const char *tune = lossless ? NULL : ifb_param_value(opts, "tune");
  if (tune) {
    char buf[16];
    size_t n = strlen(tune);
    if (n >= sizeof(buf)) n = sizeof(buf) - 1;
    memcpy(buf, tune, n);
    buf[n] = '\0';
    avifEncoderSetCodecSpecificOption(enc, "tune", buf);
  }
  /* 无损不需要额外的 codec 选项：quality=100 + 4:4:4 + identity 矩阵时 libavif 会自动走无损路径，
     libaom 不认识 "lossless" 这个选项，传了反而会让 AddImage 报 Invalid codec-specific option */

  res = avifEncoderAddImage(enc, image, 1, AVIF_ADD_IMAGE_FLAG_SINGLE);
  if (res != AVIF_RESULT_OK) {
    avifEncoderDestroy(enc);
    avifImageDestroy(image);
    ifb_set_errorf("avif: AddImage failed: %s", avifResultToString(res));
    return -1;
  }

  avifRWData output = AVIF_DATA_EMPTY;
  res = avifEncoderFinish(enc, &output);
  if (res != AVIF_RESULT_OK) {
    avifEncoderDestroy(enc);
    avifImageDestroy(image);
    ifb_set_errorf("avif: Finish failed: %s", avifResultToString(res));
    return -1;
  }

  int rc = ifb_out_assign(output.data, output.size);

  avifRWDataFree(&output);
  avifEncoderDestroy(enc);
  avifImageDestroy(image);
  return rc;
}

IFB_EXTERN IFB_EXPORT const char *ifb_version(void) {
  static char ver[160];
#if IFB_AVIF_CODEC_AOM
  snprintf(ver, sizeof(ver), "avifenc -c aom (libavif %s + aom)", avifVersion());
#else
  snprintf(ver, sizeof(ver), "avifenc -c svt (libavif %s + SVT-AV1)", avifVersion());
#endif
  return ver;
}
