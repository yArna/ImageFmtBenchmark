// libwebp 编码器封装
//
// opts:
//   q           = 0..100
//   effort      = 0..6   -> method（压缩方法）
//   lossless    = 0/1
//   z           = 0..9   -> 无损预设（WebPConfigLosslessPreset，覆盖 method/quality）
//   nearll      = 0..100 -> near_lossless
//   exact       = 0/1    -> 严格保留透明像素 RGB
//   sharpyuv    = 0/1    -> use_sharp_yuv
//   alphaq      = 0..100 -> alpha_quality

#include "ifb_api.h"
#include <webp/encode.h>

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

  WebPConfig config;
  if (!WebPConfigInit(&config)) {
    ifb_set_error("webp: WebPConfigInit failed");
    return -1;
  }

  int quality = ifb_param_int(opts, "q", 80);
  int method = ifb_param_int(opts, "effort", 4);
  int lossless = ifb_param_flag(opts, "lossless", 0);
  int nearll = ifb_param_int(opts, "nearll", 100);
  int exact = ifb_param_flag(opts, "exact", 0);
  int sharpyuv = ifb_param_flag(opts, "sharpyuv", 1);
  int alphaq = ifb_param_int(opts, "alphaq", 100);
  int z = ifb_param_int(opts, "z", -1);

  if (quality < 0) quality = 0;
  if (quality > 100) quality = 100;
  if (method < 0) method = 0;
  if (method > 6) method = 6;

  config.quality = (float)quality;
  config.method = method;
  config.lossless = lossless ? 1 : 0;
  config.exact = exact ? 1 : 0;
  config.use_sharp_yuv = sharpyuv ? 1 : 0;
  config.alpha_quality = alphaq;
  if (nearll < 0) nearll = 0;
  if (nearll > 100) nearll = 100;
  config.near_lossless = nearll;
  /* 与 cwebp -near_lossless 一致：近无损是无损编码的预处理，指定后自动开启无损，否则该参数被忽略 */
  if (nearll < 100) config.lossless = 1;
  /* wasm 单线程：thread_level 保持 0 */
  config.thread_level = 0;

  if (lossless && z >= 0) {
    if (!WebPConfigLosslessPreset(&config, z)) {
      ifb_set_error("webp: invalid lossless preset");
      return -1;
    }
  }

  if (!WebPValidateConfig(&config)) {
    ifb_set_error("webp: invalid config");
    return -1;
  }

  WebPPicture pic;
  if (!WebPPictureInit(&pic)) {
    ifb_set_error("webp: WebPPictureInit failed");
    return -1;
  }
  pic.width = w;
  pic.height = h;
  pic.use_argb = 1;

  WebPMemoryWriter writer;
  WebPMemoryWriterInit(&writer);
  pic.writer = WebPMemoryWrite;
  pic.custom_ptr = &writer;

  if (!WebPPictureImportRGBA(&pic, in, w * 4)) {
    WebPPictureFree(&pic);
    WebPMemoryWriterClear(&writer);
    ifb_set_error("webp: WebPPictureImportRGBA failed");
    return -1;
  }

  int ok = WebPEncode(&config, &pic);
  WebPPictureFree(&pic);

  if (!ok) {
    char msg[64];
    snprintf(msg, sizeof(msg), "webp: encode failed (%d)", pic.error_code);
    WebPMemoryWriterClear(&writer);
    ifb_set_error(msg);
    return -1;
  }

  int rc = ifb_out_assign(writer.mem, writer.size);
  WebPMemoryWriterClear(&writer);
  return rc;
}

IFB_EXTERN IFB_EXPORT const char *ifb_version(void) {
  static char ver[96];
  int v = WebPGetEncoderVersion();
  snprintf(ver, sizeof(ver), "cwebp (libwebp %d.%d.%d)", (v >> 16) & 0xff,
           (v >> 8) & 0xff, v & 0xff);
  return ver;
}
