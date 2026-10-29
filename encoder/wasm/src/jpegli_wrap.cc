// jpegli 编码器封装（Google 感知 JPEG 编码器，走 jpegli_* C API）
//
// opts:
//   q        = 0..100  -> jpegli_quality_to_distance
//   d        = 目标 Butteraugli 距离（优先于 q）
//   effort   = 0..2    -> progressive level（0 顺序扫描 / 1 / 2 多遍渐进）
//   subsample= 0:420 / 1:422 / 2:444 / 3:440
//   xyb      = 0/1     -> XYB 色彩空间
//   adaptive = 0/1     -> 心理视觉自适应量化（默认开）

#include "ifb_api.h"

#include "lib/jpegli/encode.h"

#include <setjmp.h>
#include <string.h>

typedef struct {
  struct jpeg_error_mgr pub;
  jmp_buf jb;
  char msg[JMSG_LENGTH_MAX];
} ifb_jpegli_err;

static void ifb_jpegli_error_exit(j_common_ptr cinfo) {
  ifb_jpegli_err *err = (ifb_jpegli_err *)cinfo->err;
  (*cinfo->err->format_message)(cinfo, err->msg);
  longjmp(err->jb, 1);
}

static void ifb_jpegli_emit_message(j_common_ptr cinfo, int level) {
  (void)cinfo;
  (void)level;
}

static int ifb_jpegli_encode(const uint8_t *rgba, int w, int h, const char *opts) {
  struct jpeg_compress_struct cinfo;
  ifb_jpegli_err jerr;
  memset(&cinfo, 0, sizeof(cinfo));
  memset(&jerr, 0, sizeof(jerr));

  cinfo.err = jpegli_std_error(&jerr.pub);
  jerr.pub.error_exit = ifb_jpegli_error_exit;
  jerr.pub.emit_message = ifb_jpegli_emit_message;

  if (setjmp(jerr.jb)) {
    jpegli_destroy_compress(&cinfo);
    ifb_set_errorf("jpegli: %s", jerr.msg);
    return -1;
  }

  jpegli_CreateCompress(&cinfo, JPEG_LIB_VERSION, sizeof(cinfo));

  unsigned char *outbuf = NULL;
  unsigned long outsize = 0;
  jpegli_mem_dest(&cinfo, &outbuf, &outsize);

  int quality = ifb_param_int(opts, "q", 90);
  int effort = ifb_param_int(opts, "effort", 2);
  int subsample = ifb_param_int(opts, "subsample", 2);
  int xyb = ifb_param_flag(opts, "xyb", 0);
  int adaptive = ifb_param_flag(opts, "adaptive", 1);
  double d_opt = ifb_param_double(opts, "d", -1.0);

  if (quality < 1) quality = 1;
  if (quality > 100) quality = 100;
  if (effort < 0) effort = 0;
  if (effort > 2) effort = 2;

  cinfo.image_width = (JDIMENSION)w;
  cinfo.image_height = (JDIMENSION)h;
  cinfo.input_components = 3;
  cinfo.in_color_space = JCS_RGB;

  jpegli_set_input_format(&cinfo, JPEGLI_TYPE_UINT8, JPEGLI_LITTLE_ENDIAN);
  if (xyb) jpegli_set_xyb_mode(&cinfo);
  jpegli_set_defaults(&cinfo);

  float distance = (d_opt >= 0.0) ? (float)d_opt : jpegli_quality_to_distance(quality);
  jpegli_set_distance(&cinfo, distance, TRUE);
  jpegli_set_progressive_level(&cinfo, effort);
  if (!adaptive) jpegli_enable_adaptive_quantization(&cinfo, 0);

  switch (subsample) {
    case 0:
      cinfo.comp_info[0].h_samp_factor = 2;
      cinfo.comp_info[0].v_samp_factor = 2;
      break;
    case 1:
      cinfo.comp_info[0].h_samp_factor = 2;
      cinfo.comp_info[0].v_samp_factor = 1;
      break;
    case 2:
      cinfo.comp_info[0].h_samp_factor = 1;
      cinfo.comp_info[0].v_samp_factor = 1;
      break;
    case 3:
      cinfo.comp_info[0].h_samp_factor = 1;
      cinfo.comp_info[0].v_samp_factor = 2;
      break;
    default:
      break;
  }

  jpegli_start_compress(&cinfo, TRUE);

  uint8_t *rgb = ifb_rgba_to_rgb(rgba, w, h);
  if (!rgb) {
    jpegli_destroy_compress(&cinfo);
    free(outbuf);
    ifb_set_error("out of memory");
    return -1;
  }

  JSAMPROW row;
  while (cinfo.next_scanline < cinfo.image_height) {
    row = (JSAMPROW)(rgb + (size_t)cinfo.next_scanline * (size_t)w * 3);
    jpegli_write_scanlines(&cinfo, &row, 1);
  }

  jpegli_finish_compress(&cinfo);
  free(rgb);

  int rc = ifb_out_assign(outbuf, (size_t)outsize);
  free(outbuf);
  jpegli_destroy_compress(&cinfo);
  return rc;
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
  ifb_out_reset();
  return ifb_jpegli_encode(in, w, h, opts);
}

IFB_EXTERN IFB_EXPORT const char *ifb_version(void) { return "cjpegli (jpegli)"; }
