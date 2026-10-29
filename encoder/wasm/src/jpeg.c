// libjpeg 系编码器封装：libjpeg-turbo 与 mozjpeg 共用（编译时定义 IFB_MOZJPEG）
//
// opts:
//   q          = 0..100
//   progressive= 0/1   -> jpeg_simple_progression
//   optimize   = 0/1   -> optimize_coding
//   subsample  = 0:420 / 1:422 / 2:444 / 3:440
//   tune       = 0 默认 / 1 PSNR / 2 SSIM / 3 MS-SSIM / 4 HVS-PSNR（仅 mozjpeg）
//   fastcrush  = 0/1   -> 关闭渐进扫描穷举搜索（仅 mozjpeg）
//   trellis    = 0/1   -> 网格量化开关（仅 mozjpeg）

#include "ifb_api.h"
#include <jpeglib.h>
#include "jversion.h"
#include <setjmp.h>

typedef struct {
  struct jpeg_error_mgr pub;
  jmp_buf jb;
  char msg[JMSG_LENGTH_MAX];
} ifb_jpeg_err;

static void ifb_jpeg_error_exit(j_common_ptr cinfo) {
  ifb_jpeg_err *err = (ifb_jpeg_err *)cinfo->err;
  (*cinfo->err->format_message)(cinfo, err->msg);
  longjmp(err->jb, 1);
}

static void ifb_jpeg_emit_message(j_common_ptr cinfo, int level) {
  (void)cinfo;
  (void)level; /* 静默：wasm 下不往 stderr 刷告警 */
}

static int ifb_jpeg_encode(const uint8_t *rgba, int w, int h, const char *opts) {
  struct jpeg_compress_struct cinfo;
  ifb_jpeg_err jerr;
  memset(&cinfo, 0, sizeof(cinfo));
  memset(&jerr, 0, sizeof(jerr));

  cinfo.err = jpeg_std_error(&jerr.pub);
  jerr.pub.error_exit = ifb_jpeg_error_exit;
  jerr.pub.emit_message = ifb_jpeg_emit_message;

  if (setjmp(jerr.jb)) {
    jpeg_destroy_compress(&cinfo);
    ifb_set_errorf("jpeg: %s", jerr.msg);
    return -1;
  }

  jpeg_create_compress(&cinfo);

  unsigned char *outbuf = NULL;
  unsigned long outsize = 0;
  jpeg_mem_dest(&cinfo, &outbuf, &outsize);

  int quality = ifb_param_int(opts, "q", 80);
  if (quality < 0) quality = 0;
  if (quality > 100) quality = 100;
  int progressive = ifb_param_flag(opts, "progressive", 0);
  int optimize = ifb_param_flag(opts, "optimize", 1);
  int subsample = ifb_param_int(opts, "subsample", 0);
  int tune = ifb_param_int(opts, "tune", 0);
  int fastcrush = ifb_param_flag(opts, "fastcrush", 0);
  int trellis = ifb_param_flag(opts, "trellis", 1);

  cinfo.image_width = (JDIMENSION)w;
  cinfo.image_height = (JDIMENSION)h;
  cinfo.input_components = 3;
  cinfo.in_color_space = JCS_RGB;

  /* jpeg_set_defaults 会按 JCP_MAX_COMPRESSION 重置 trellis / optimize_scans / lambda / 量化表，
     所以 mozjpeg 的扩展参数必须放在它之后（与官方 cjpeg 的 parse_switches 顺序一致），
     量化表编号则要在 jpeg_set_quality 之前确定。 */
  jpeg_set_defaults(&cinfo);
#ifdef IFB_MOZJPEG
  if (fastcrush) {
    jpeg_c_set_bool_param(&cinfo, JBOOLEAN_OPTIMIZE_SCANS, FALSE);
  }
  if (!trellis) {
    jpeg_c_set_bool_param(&cinfo, JBOOLEAN_TRELLIS_QUANT, FALSE);
    jpeg_c_set_bool_param(&cinfo, JBOOLEAN_TRELLIS_QUANT_DC, FALSE);
    jpeg_c_set_bool_param(&cinfo, JBOOLEAN_TRELLIS_Q_OPT, FALSE);
  }
  /* 各 tune 取值与 mozjpeg cjpeg.c 的 -tune-* 完全一致 */
  switch (tune) {
    case 1: /* PSNR */
      jpeg_c_set_int_param(&cinfo, JINT_BASE_QUANT_TBL_IDX, 1);
      jpeg_c_set_float_param(&cinfo, JFLOAT_LAMBDA_LOG_SCALE1, 9.0);
      jpeg_c_set_float_param(&cinfo, JFLOAT_LAMBDA_LOG_SCALE2, 0.0);
      jpeg_c_set_bool_param(&cinfo, JBOOLEAN_USE_LAMBDA_WEIGHT_TBL, FALSE);
      break;
    case 2: /* SSIM */
      jpeg_c_set_int_param(&cinfo, JINT_BASE_QUANT_TBL_IDX, 1);
      jpeg_c_set_float_param(&cinfo, JFLOAT_LAMBDA_LOG_SCALE1, 11.5);
      jpeg_c_set_float_param(&cinfo, JFLOAT_LAMBDA_LOG_SCALE2, 12.75);
      jpeg_c_set_bool_param(&cinfo, JBOOLEAN_USE_LAMBDA_WEIGHT_TBL, FALSE);
      break;
    case 3: /* MS-SSIM */
      jpeg_c_set_int_param(&cinfo, JINT_BASE_QUANT_TBL_IDX, 3);
      jpeg_c_set_float_param(&cinfo, JFLOAT_LAMBDA_LOG_SCALE1, 12.0);
      jpeg_c_set_float_param(&cinfo, JFLOAT_LAMBDA_LOG_SCALE2, 13.0);
      jpeg_c_set_bool_param(&cinfo, JBOOLEAN_USE_LAMBDA_WEIGHT_TBL, TRUE);
      break;
    case 4: /* HVS-PSNR（即 mozjpeg 默认值） */
      jpeg_c_set_int_param(&cinfo, JINT_BASE_QUANT_TBL_IDX, 3);
      jpeg_c_set_float_param(&cinfo, JFLOAT_LAMBDA_LOG_SCALE1, 14.75);
      jpeg_c_set_float_param(&cinfo, JFLOAT_LAMBDA_LOG_SCALE2, 16.5);
      jpeg_c_set_bool_param(&cinfo, JBOOLEAN_USE_LAMBDA_WEIGHT_TBL, TRUE);
      break;
    default: break;
  }
#endif
  jpeg_set_quality(&cinfo, quality, TRUE);

  switch (subsample) {
    case 0: /* 4:2:0 */
      cinfo.comp_info[0].h_samp_factor = 2;
      cinfo.comp_info[0].v_samp_factor = 2;
      break;
    case 1: /* 4:2:2 */
      cinfo.comp_info[0].h_samp_factor = 2;
      cinfo.comp_info[0].v_samp_factor = 1;
      break;
    case 2: /* 4:4:4 */
      cinfo.comp_info[0].h_samp_factor = 1;
      cinfo.comp_info[0].v_samp_factor = 1;
      break;
    case 3: /* 4:4:0 */
      cinfo.comp_info[0].h_samp_factor = 1;
      cinfo.comp_info[0].v_samp_factor = 2;
      break;
    default:
      break;
  }

  if (optimize) cinfo.optimize_coding = TRUE;
  if (progressive) jpeg_simple_progression(&cinfo);

  jpeg_start_compress(&cinfo, TRUE);

  uint8_t *rgb = ifb_rgba_to_rgb(rgba, w, h);
  if (!rgb) {
    jpeg_destroy_compress(&cinfo);
    free(outbuf);
    ifb_set_error("out of memory");
    return -1;
  }

  JSAMPROW row;
  while (cinfo.next_scanline < cinfo.image_height) {
    row = (JSAMPROW)(rgb + (size_t)cinfo.next_scanline * (size_t)w * 3);
    jpeg_write_scanlines(&cinfo, &row, 1);
  }

  jpeg_finish_compress(&cinfo);
  free(rgb);

  int ok = ifb_out_assign(outbuf, (size_t)outsize);
  free(outbuf);
  jpeg_destroy_compress(&cinfo);
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
  ifb_out_reset();
  return ifb_jpeg_encode(in, w, h, opts);
}

IFB_EXTERN IFB_EXPORT const char *ifb_version(void) {
#ifdef IFB_MOZJPEG
  return "cjpeg-mozjpeg (" JVERSION ")";
#else
  return "cjpeg-turbo (" JVERSION ")";
#endif
}
