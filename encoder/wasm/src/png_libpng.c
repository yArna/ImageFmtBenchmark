// libpng 编码器（配合标准 zlib 或 zlib-ng，两者 API 完全一致）
//
// opts:
//   effort = 0..9  -> png_set_compression_level
//   filter = 0..5  -> 0 NONE / 1 SUB / 2 UP / 3 AVG / 4 PAETH / 5 ALL

#include "ifb_api.h"
#include <zlib.h>
#include <png.h>

#ifndef IFB_TOOL_NAME
#define IFB_TOOL_NAME "png-libpng"
#endif

static void ifb_png_write_cb(png_structp png_ptr, png_bytep data, png_size_t len) {
  (void)png_ptr;
  ifb_out_append(data, (size_t)len);
}

static void ifb_png_flush_cb(png_structp png_ptr) { (void)png_ptr; }

static int ifb_png_encode(const uint8_t *rgba, int w, int h, int level, int filter) {
  png_structp png = png_create_write_struct(PNG_LIBPNG_VER_STRING, NULL, NULL, NULL);
  if (!png) {
    ifb_set_error("libpng: create_write_struct failed");
    return -1;
  }
  png_infop info = png_create_info_struct(png);
  if (!info) {
    png_destroy_write_struct(&png, NULL);
    ifb_set_error("libpng: create_info_struct failed");
    return -1;
  }
  if (setjmp(png_jmpbuf(png))) {
    png_destroy_write_struct(&png, &info);
    ifb_set_error("libpng: encode error (setjmp)");
    return -1;
  }

  ifb_out_reset();
  png_set_write_fn(png, NULL, ifb_png_write_cb, ifb_png_flush_cb);
  png_set_compression_level(png, level);

  switch (filter) {
    case 0: png_set_filter(png, 0, PNG_FILTER_NONE); break;
    case 1: png_set_filter(png, 0, PNG_FILTER_SUB); break;
    case 2: png_set_filter(png, 0, PNG_FILTER_UP); break;
    case 3: png_set_filter(png, 0, PNG_FILTER_AVG); break;
    case 4: png_set_filter(png, 0, PNG_FILTER_PAETH); break;
    default: png_set_filter(png, 0, PNG_ALL_FILTERS); break;
  }

  int has_alpha = ifb_has_alpha(rgba, w, h);
  int channels = has_alpha ? 4 : 3;

  png_set_IHDR(png, info, (png_uint_32)w, (png_uint_32)h, 8,
               has_alpha ? PNG_COLOR_TYPE_RGBA : PNG_COLOR_TYPE_RGB,
               PNG_INTERLACE_NONE, PNG_COMPRESSION_TYPE_DEFAULT, PNG_FILTER_TYPE_DEFAULT);
  png_write_info(png, info);

  uint8_t *rgb = NULL;
  const uint8_t *src = rgba;
  if (!has_alpha) {
    rgb = ifb_rgba_to_rgb(rgba, w, h);
    if (!rgb) {
      png_destroy_write_struct(&png, &info);
      ifb_set_error("out of memory");
      return -1;
    }
    src = rgb;
  }

  size_t rowbytes = (size_t)w * (size_t)channels;
  png_bytep *rows = (png_bytep *)malloc(sizeof(png_bytep) * (size_t)h);
  if (!rows) {
    free(rgb);
    png_destroy_write_struct(&png, &info);
    ifb_set_error("out of memory");
    return -1;
  }
  for (int y = 0; y < h; y++) rows[y] = (png_bytep)(src + (size_t)y * rowbytes);

  png_write_image(png, rows);
  png_write_end(png, NULL);

  free(rows);
  free(rgb);
  png_destroy_write_struct(&png, &info);
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
  int level = ifb_param_int(opts, "effort", 6);
  int filter = ifb_param_int(opts, "filter", 5);
  if (level < 0) level = 0;
  if (level > 9) level = 9;
  if (filter < 0) filter = 0;
  if (filter > 5) filter = 5;
  return ifb_png_encode(in, w, h, level, filter);
}

IFB_EXTERN IFB_EXPORT const char *ifb_version(void) {
  static char ver[160];
  snprintf(ver, sizeof(ver), "%s (libpng %s + zlib %s)", IFB_TOOL_NAME,
           PNG_LIBPNG_VER_STRING, zlibVersion());
  return ver;
}
