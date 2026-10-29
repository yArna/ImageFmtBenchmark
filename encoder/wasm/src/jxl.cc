// libjxl 封装：编码（VarDCT / Modular）+ 解码（供浏览器预览，Chrome 原生不支持 JXL）
//
// opts:
//   q         = 0..100 -> 映射为 distance（90 = 视觉无损 1.0）
//   d         = 距离（优先于 q）
//   lossless  = 0/1    -> 数学无损（Modular）
//   effort    = 1..10  -> JXL_ENC_FRAME_SETTING_EFFORT
//   modular   = 0/1    -> 强制 Modular 模式
//   container = 0/1    -> 是否输出 .jxl 容器（默认 1，便于浏览器/工具识别）

#include "ifb_api.h"
#include <jxl/encode.h>
#include <jxl/decode.h>
#include <jxl/color_encoding.h>
#include <jxl/version.h>

#include <vector>
#include <string>

static std::vector<uint8_t> g_dec_pixels;
static int g_dec_w = 0;
static int g_dec_h = 0;
static int g_dec_channels = 4;

static float ifb_jxl_quality_to_distance(int quality) {
  /* 与 cjxl -q 一致的近似映射：100 -> 0（无损），90 -> 1.0，越往下距离越大 */
  if (quality >= 100) return 0.0f;
  if (quality <= 0) return 25.0f;
  float d = (100.0f - (float)quality) / 10.0f;
  return d;
}

static int ifb_jxl_encode(const uint8_t *rgba, int w, int h, const char *opts) {
  int quality = ifb_param_int(opts, "q", 90);
  int lossless = ifb_param_flag(opts, "lossless", 0);
  int effort = ifb_param_int(opts, "effort", 7);
  int modular = ifb_param_flag(opts, "modular", 0);
  int use_container = ifb_param_flag(opts, "container", 1);
  double d_opt = ifb_param_double(opts, "d", -1.0);

  if (effort < 1) effort = 1;
  if (effort > 10) effort = 10;

  float distance = (d_opt >= 0.0) ? (float)d_opt : ifb_jxl_quality_to_distance(quality);

  int has_alpha = ifb_has_alpha(rgba, w, h);
  int channels = has_alpha ? 4 : 3;

  uint8_t *rgb = nullptr;
  const uint8_t *src = rgba;
  if (!has_alpha) {
    rgb = ifb_rgba_to_rgb(rgba, w, h);
    if (!rgb) {
      ifb_set_error("out of memory");
      return -1;
    }
    src = rgb;
  }

  JxlEncoder *enc = JxlEncoderCreate(nullptr);
  if (!enc) {
    free(rgb);
    ifb_set_error("jxl: JxlEncoderCreate failed");
    return -1;
  }

  JxlEncoderFrameSettings *fs = JxlEncoderFrameSettingsCreate(enc, nullptr);
  if (!fs) {
    JxlEncoderDestroy(enc);
    free(rgb);
    ifb_set_error("jxl: frame settings failed");
    return -1;
  }

  JxlEncoderFrameSettingsSetOption(fs, JXL_ENC_FRAME_SETTING_EFFORT, effort);
  if (use_container) {
    JxlEncoderUseContainer(enc, JXL_TRUE);
  }

  if (lossless) {
    JxlEncoderSetFrameLossless(fs, JXL_TRUE);
  } else {
    JxlEncoderSetFrameLossless(fs, JXL_FALSE);
    JxlEncoderSetFrameDistance(fs, distance);
  }
  if (modular) {
    JxlEncoderFrameSettingsSetOption(fs, JXL_ENC_FRAME_SETTING_MODULAR, 1);
  }

  JxlBasicInfo info;
  JxlEncoderInitBasicInfo(&info);
  info.xsize = (uint32_t)w;
  info.ysize = (uint32_t)h;
  info.bits_per_sample = 8;
  info.exponent_bits_per_sample = 0;
  info.num_color_channels = 3;
  info.alpha_bits = has_alpha ? 8 : 0;
  info.num_extra_channels = has_alpha ? 1 : 0;
  info.uses_original_profile = lossless ? JXL_TRUE : JXL_FALSE;

  if (JxlEncoderSetBasicInfo(enc, &info) != JXL_ENC_SUCCESS) {
    JxlEncoderDestroy(enc);
    free(rgb);
    ifb_set_error("jxl: SetBasicInfo failed");
    return -1;
  }

  JxlColorEncoding ce;
  JxlColorEncodingSetToSRGB(&ce, JXL_FALSE);
  JxlEncoderSetColorEncoding(enc, &ce);

  JxlPixelFormat pf;
  pf.num_channels = (uint32_t)channels;
  pf.data_type = JXL_TYPE_UINT8;
  pf.endianness = JXL_LITTLE_ENDIAN;
  pf.align = 0;

  size_t pixels_size = (size_t)w * (size_t)h * (size_t)channels;
  if (JxlEncoderAddImageFrame(fs, &pf, src, pixels_size) != JXL_ENC_SUCCESS) {
    JxlEncoderDestroy(enc);
    free(rgb);
    ifb_set_error("jxl: AddImageFrame failed");
    return -1;
  }
  free(rgb);

  JxlEncoderCloseInput(enc);

  ifb_out_reset();
  // 64KB 的栈缓冲会直接撑爆默认栈，这里用静态区
  static uint8_t chunk[65536];
  JxlEncoderStatus status;
  do {
    uint8_t *next_out = chunk;
    size_t avail_out = sizeof(chunk);
    status = JxlEncoderProcessOutput(enc, &next_out, &avail_out);
    if (status == JXL_ENC_ERROR) {
      JxlEncoderDestroy(enc);
      ifb_set_error("jxl: ProcessOutput error");
      return -1;
    }
    size_t produced = sizeof(chunk) - avail_out;
    if (produced > 0) {
      if (ifb_out_append(chunk, produced) != 0) {
        JxlEncoderDestroy(enc);
        return -1;
      }
    }
  } while (status == JXL_ENC_NEED_MORE_OUTPUT);

  JxlEncoderDestroy(enc);
  return 0;
}

static int ifb_jxl_decode(const uint8_t *data, size_t size) {
  JxlDecoder *dec = JxlDecoderCreate(nullptr);
  if (!dec) {
    ifb_set_error("jxl: decoder create failed");
    return -1;
  }

  if (JxlDecoderSubscribeEvents(dec, JXL_DEC_BASIC_INFO | JXL_DEC_FULL_IMAGE) != JXL_DEC_SUCCESS) {
    JxlDecoderDestroy(dec);
    ifb_set_error("jxl: subscribe failed");
    return -1;
  }

  JxlDecoderSetInput(dec, data, size);
  JxlDecoderCloseInput(dec);

  JxlBasicInfo info;
  int have_info = 0;
  size_t out_size = 0;

  for (;;) {
    JxlDecoderStatus status = JxlDecoderProcessInput(dec);
    if (status == JXL_DEC_ERROR) {
      JxlDecoderDestroy(dec);
      ifb_set_error("jxl: decode error");
      return -1;
    }
    if (status == JXL_DEC_NEED_MORE_INPUT) {
      JxlDecoderDestroy(dec);
      ifb_set_error("jxl: truncated input");
      return -1;
    }
    if (status == JXL_DEC_BASIC_INFO) {
      if (JxlDecoderGetBasicInfo(dec, &info) != JXL_DEC_SUCCESS) {
        JxlDecoderDestroy(dec);
        ifb_set_error("jxl: basic info failed");
        return -1;
      }
      have_info = 1;
      g_dec_w = (int)info.xsize;
      g_dec_h = (int)info.ysize;
      g_dec_channels = 4;
      out_size = (size_t)g_dec_w * (size_t)g_dec_h * 4;
      g_dec_pixels.assign(out_size, 0);

      JxlPixelFormat pf = {4, JXL_TYPE_UINT8, JXL_LITTLE_ENDIAN, 0};
      if (JxlDecoderSetImageOutBuffer(dec, &pf, g_dec_pixels.data(), out_size) != JXL_DEC_SUCCESS) {
        JxlDecoderDestroy(dec);
        ifb_set_error("jxl: set out buffer failed");
        return -1;
      }
    } else if (status == JXL_DEC_FULL_IMAGE) {
      /* 单帧图片，拿到即完成 */
      break;
    } else if (status == JXL_DEC_SUCCESS) {
      break;
    }
  }

  JxlDecoderDestroy(dec);
  if (!have_info) {
    ifb_set_error("jxl: no image info");
    return -1;
  }
  return 0;
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
  return ifb_jxl_encode(in, w, h, opts);
}

IFB_EXTERN IFB_EXPORT int ifb_decode(const uint8_t *in, int len) {
  ifb_clear_error();
  if (!in || len <= 0) {
    ifb_set_error("invalid input");
    return -1;
  }
  return ifb_jxl_decode(in, (size_t)len);
}

IFB_EXTERN IFB_EXPORT const uint8_t *ifb_dec_ptr(void) { return g_dec_pixels.data(); }
IFB_EXTERN IFB_EXPORT int ifb_dec_w(void) { return g_dec_w; }
IFB_EXTERN IFB_EXPORT int ifb_dec_h(void) { return g_dec_h; }
IFB_EXTERN IFB_EXPORT int ifb_dec_channels(void) { return g_dec_channels; }

IFB_EXTERN IFB_EXPORT const char *ifb_version(void) {
  static char ver[96];
  snprintf(ver, sizeof(ver), "cjxl / djxl (libjxl %d.%d.%d)", JPEGXL_MAJOR_VERSION,
           JPEGXL_MINOR_VERSION, JPEGXL_PATCH_VERSION);
  return ver;
}
