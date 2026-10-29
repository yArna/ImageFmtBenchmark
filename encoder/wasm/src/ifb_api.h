// ImageFmtBenchmark — 统一的 WASM 编码器 C ABI
//
// 所有编码器模块都导出同一组符号，方便网页端用一个通用加载器驱动：
//
//   uint8_t* ifb_alloc(int size);                  // 分配输入缓冲
//   void     ifb_free_ptr(uint8_t* p);             // 释放输入缓冲
//   int      ifb_encode(const uint8_t* in, int len,
//                       int w, int h, const char* opts);  // 编码
//   const uint8_t* ifb_out_ptr(void);              // 结果数据指针
//   int      ifb_out_len(void);                    // 结果字节数
//   void     ifb_out_free(void);                   // 释放结果
//   const char* ifb_error(void);                   // 最近一次错误
//   const char* ifb_version(void);                 // 版本字符串
//
// `in` 的语义由编码器决定：
//   * 绝大多数编码器接收 RGBA8 原始像素（len = w * h * 4）
//   * oxipng 接收 PNG 文件字节（它本身是 PNG 重压缩器），此时 w/h 忽略
//
// `opts` 是形如 "q=80&effort=6&lossless=0" 的查询串，由各编码器自行解释。

#ifndef IFB_API_H
#define IFB_API_H

#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define IFB_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define IFB_EXPORT
#endif

#ifdef __cplusplus
#define IFB_EXTERN extern "C"
#else
#define IFB_EXTERN
#endif

#define IFB_MAX_ERROR 512

typedef struct {
  uint8_t *data;
  size_t size;
  size_t capacity;
} ifb_buf;

/* ---------------- 模块内共享状态 ---------------- */

static ifb_buf g_ifb_out = {NULL, 0, 0};
static char g_ifb_error[IFB_MAX_ERROR] = {0};

static void ifb_clear_error(void) { g_ifb_error[0] = '\0'; }

static void ifb_set_error(const char *msg) {
  if (!msg) msg = "unknown error";
  snprintf(g_ifb_error, sizeof(g_ifb_error), "%s", msg);
}

static void ifb_set_errorf(const char *fmt, const char *arg) {
  snprintf(g_ifb_error, sizeof(g_ifb_error), fmt, arg ? arg : "");
}

/* ---------------- 输出缓冲 ---------------- */

static void ifb_out_reset(void) {
  g_ifb_out.size = 0;
}

static int ifb_out_append(const void *src, size_t len) {
  if (g_ifb_out.size + len > g_ifb_out.capacity) {
    size_t cap = g_ifb_out.capacity ? g_ifb_out.capacity : 65536;
    while (cap < g_ifb_out.size + len) cap *= 2;
    uint8_t *p = (uint8_t *)realloc(g_ifb_out.data, cap);
    if (!p) {
      ifb_set_error("out of memory");
      return -1;
    }
    g_ifb_out.data = p;
    g_ifb_out.capacity = cap;
  }
  memcpy(g_ifb_out.data + g_ifb_out.size, src, len);
  g_ifb_out.size += len;
  return 0;
}

static int ifb_out_assign(void *src, size_t len) {
  ifb_out_reset();
  if (len == 0) return 0;
  return ifb_out_append(src, len);
}

/* ---------------- 参数解析（"k=v&k2=v2"） ---------------- */

static const char *ifb_param_value(const char *opts, const char *key) {
  if (!opts || !key) return NULL;
  size_t klen = strlen(key);
  const char *p = opts;
  while (*p) {
    const char *amp = strchr(p, '&');
    size_t seg = amp ? (size_t)(amp - p) : strlen(p);
    if (seg > klen && p[klen] == '=' && strncmp(p, key, klen) == 0) {
      return p + klen + 1;
    }
    if (!amp) break;
    p = amp + 1;
  }
  return NULL;
}

static int ifb_param_int(const char *opts, const char *key, int def) {
  const char *v = ifb_param_value(opts, key);
  if (!v) return def;
  return (int)strtol(v, NULL, 10);
}

static double ifb_param_double(const char *opts, const char *key, double def) {
  const char *v = ifb_param_value(opts, key);
  if (!v) return def;
  return strtod(v, NULL);
}

static int ifb_param_flag(const char *opts, const char *key, int def) {
  const char *v = ifb_param_value(opts, key);
  if (!v) return def;
  return (*v == '1' || *v == 't' || *v == 'T' || *v == 'y' || *v == 'Y');
}

/* ---------------- 像素辅助 ---------------- */

/** 扫描 alpha 通道，判断图片是否真的带透明像素。 */
static int ifb_has_alpha(const uint8_t *rgba, int w, int h) {
  size_t n = (size_t)w * (size_t)h;
  for (size_t i = 0; i < n; i++) {
    if (rgba[i * 4 + 3] != 255) return 1;
  }
  return 0;
}

/** RGBA -> RGB，丢弃 alpha 通道（JPEG 等无 alpha 的格式使用）。 */
static uint8_t *ifb_rgba_to_rgb(const uint8_t *rgba, int w, int h) {
  size_t n = (size_t)w * (size_t)h;
  uint8_t *rgb = (uint8_t *)malloc(n * 3);
  if (!rgb) return NULL;
  for (size_t i = 0; i < n; i++) {
    rgb[i * 3 + 0] = rgba[i * 4 + 0];
    rgb[i * 3 + 1] = rgba[i * 4 + 1];
    rgb[i * 3 + 2] = rgba[i * 4 + 2];
  }
  return rgb;
}

/** RGBA 合成到指定底色上（用于无 alpha 格式保留视觉一致性）。 */
static uint8_t *ifb_rgba_matte(const uint8_t *rgba, int w, int h,
                               uint8_t br, uint8_t bg, uint8_t bb) {
  size_t n = (size_t)w * (size_t)h;
  uint8_t *rgb = (uint8_t *)malloc(n * 3);
  if (!rgb) return NULL;
  for (size_t i = 0; i < n; i++) {
    const uint8_t *s = rgba + i * 4;
    int a = s[3];
    if (a == 255) {
      rgb[i * 3 + 0] = s[0];
      rgb[i * 3 + 1] = s[1];
      rgb[i * 3 + 2] = s[2];
    } else {
      rgb[i * 3 + 0] = (uint8_t)((s[0] * a + br * (255 - a) + 127) / 255);
      rgb[i * 3 + 1] = (uint8_t)((s[1] * a + bg * (255 - a) + 127) / 255);
      rgb[i * 3 + 2] = (uint8_t)((s[2] * a + bb * (255 - a) + 127) / 255);
    }
  }
  return rgb;
}

/* ---------------- 统一导出 ---------------- */

IFB_EXTERN IFB_EXPORT uint8_t *ifb_alloc(int size) {
  if (size <= 0) size = 1;
  return (uint8_t *)malloc((size_t)size);
}

IFB_EXTERN IFB_EXPORT void ifb_free_ptr(uint8_t *p, int size) {
  (void)size;
  free(p);
}

IFB_EXTERN IFB_EXPORT const uint8_t *ifb_out_ptr(void) { return g_ifb_out.data; }

IFB_EXTERN IFB_EXPORT int ifb_out_len(void) { return (int)g_ifb_out.size; }

IFB_EXTERN IFB_EXPORT void ifb_out_free(void) {
  free(g_ifb_out.data);
  g_ifb_out.data = NULL;
  g_ifb_out.size = 0;
  g_ifb_out.capacity = 0;
}

IFB_EXTERN IFB_EXPORT const char *ifb_error(void) { return g_ifb_error; }

#endif /* IFB_API_H */
