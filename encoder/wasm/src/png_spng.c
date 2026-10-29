// libspng 编码器（标准 zlib）
//
// opts:
//   effort = 0..9 -> SPNG_IMG_COMPRESSION_LEVEL
//   filter = 0..5 -> 0 DISABLE / 1 SUB / 2 UP / 3 AVG / 4 PAETH / 5 ALL

#include "ifb_api.h"
#include <spng.h>
#include <zlib.h>

static int ifb_spng_encode(const uint8_t *rgba, int w, int h, int level, int filter) {
  spng_ctx *ctx = spng_ctx_new(SPNG_CTX_ENCODER);
  if (!ctx) {
    ifb_set_error("libspng: ctx alloc failed");
    return -1;
  }
  spng_set_option(ctx, SPNG_ENCODE_TO_BUFFER, 1);

  int has_alpha = ifb_has_alpha(rgba, w, h);
  struct spng_ihdr ihdr;
  memset(&ihdr, 0, sizeof(ihdr));
  ihdr.width = (uint32_t)w;
  ihdr.height = (uint32_t)h;
  ihdr.bit_depth = 8;
  ihdr.color_type = has_alpha ? SPNG_COLOR_TYPE_TRUECOLOR_ALPHA : SPNG_COLOR_TYPE_TRUECOLOR;
  if (spng_set_ihdr(ctx, &ihdr)) {
    spng_ctx_free(ctx);
    ifb_set_error("libspng: set_ihdr failed");
    return -1;
  }

  spng_set_option(ctx, SPNG_IMG_COMPRESSION_LEVEL, level);
  int choice = SPNG_FILTER_CHOICE_ALL;
  switch (filter) {
    case 0: choice = SPNG_DISABLE_FILTERING; break;
    case 1: choice = SPNG_FILTER_CHOICE_SUB; break;
    case 2: choice = SPNG_FILTER_CHOICE_UP; break;
    case 3: choice = SPNG_FILTER_CHOICE_AVG; break;
    case 4: choice = SPNG_FILTER_CHOICE_PAETH; break;
    default: choice = SPNG_FILTER_CHOICE_ALL; break;
  }
  spng_set_option(ctx, SPNG_FILTER_CHOICE, choice);

  uint8_t *rgb = NULL;
  const uint8_t *src = rgba;
  size_t img_size = (size_t)w * (size_t)h * 4;
  if (!has_alpha) {
    rgb = ifb_rgba_to_rgb(rgba, w, h);
    if (!rgb) {
      spng_ctx_free(ctx);
      ifb_set_error("out of memory");
      return -1;
    }
    src = rgb;
    img_size = (size_t)w * (size_t)h * 3;
  }

  int rc = spng_encode_image(ctx, src, img_size, SPNG_FMT_PNG, SPNG_ENCODE_FINALIZE);
  free(rgb);
  if (rc) {
    const char *msg = spng_strerror(rc);
    ifb_set_errorf("libspng: %s", msg);
    spng_ctx_free(ctx);
    return -1;
  }

  int err = 0;
  size_t png_size = 0;
  void *png_buf = spng_get_png_buffer(ctx, &png_size, &err);
  if (!png_buf || err) {
    spng_ctx_free(ctx);
    ifb_set_error("libspng: get_png_buffer failed");
    return -1;
  }

  ifb_out_reset();
  int ok = ifb_out_assign(png_buf, png_size);
  free(png_buf);
  spng_ctx_free(ctx);
  return ok;
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
  int level = ifb_param_int(opts, "effort", 6);
  int filter = ifb_param_int(opts, "filter", 5);
  if (level < 0) level = 0;
  if (level > 9) level = 9;
  if (filter < 0) filter = 0;
  if (filter > 5) filter = 5;
  return ifb_spng_encode(in, w, h, level, filter);
}

IFB_EXTERN IFB_EXPORT const char *ifb_version(void) {
  static char ver[160];
  snprintf(ver, sizeof(ver), "png-libspng (libspng %s + zlib %s)",
           spng_version_string(), zlibVersion());
  return ver;
}
