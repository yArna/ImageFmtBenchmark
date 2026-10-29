#ifndef BENCH_TIMING_H_
#define BENCH_TIMING_H_

#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <stddef.h>
#include <time.h>
#include <sys/stat.h>

#ifdef __cplusplus
extern "C" {
#endif

static inline double bench_now_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (double)ts.tv_sec * 1000.0 + (double)ts.tv_nsec / 1e6;
}

static inline size_t bench_file_size(const char *path) {
    if (!path) return 0;
    struct stat st;
    if (stat(path, &st) == 0) {
        return (size_t)st.st_size;
    }
    return 0;
}

static inline double bench_read_file_to_mem(const char *path, uint8_t **out_buf, size_t *out_size) {
    const double t0 = bench_now_ms();
    if (!path) return 0.0;
    FILE *fp = fopen(path, "rb");
    if (!fp) return 0.0;
    fseek(fp, 0, SEEK_END);
    size_t sz = (size_t)ftell(fp);
    fseek(fp, 0, SEEK_SET);
    uint8_t *buf = (uint8_t *)malloc(sz ? sz : 1);
    if (buf && sz > 0) {
        fread(buf, 1, sz, fp);
    }
    fclose(fp);
    if (out_buf) {
        *out_buf = buf;
    } else {
        free(buf);
    }
    if (out_size) *out_size = sz;
    return bench_now_ms() - t0;
}

/*
 * Unified 3-stage timing output:
 * - ready_ms:  准备阶段（程序启动 -> 参数解析 -> 读入图片 -> 解码原图完成，下一步即开始编码）
 * - encode_ms: 编码阶段（进行图像编码，得到最终压缩数据；若为解码器则为解码得到像素数据）
 * - output_ms: 导出阶段（向外写出目标文件）
 */
static inline void bench_print_timing(
    const char *tool,
    const char *mode,
    double ready_ms,
    double encode_ms,
    double output_ms,
    double total_ms,
    size_t input_bytes,
    size_t output_bytes
) {
    fprintf(stderr,
            "[BENCH_TIMING] {\"tool\":\"%s\",\"mode\":\"%s\",\"ready_ms\":%.3f,\"encode_ms\":%.3f,\"output_ms\":%.3f,\"total_ms\":%.3f,\"input_bytes\":%zu,\"output_bytes\":%zu}\n",
            tool ? tool : "unknown",
            mode ? mode : "encode",
            ready_ms,
            encode_ms,
            output_ms,
            total_ms,
            input_bytes,
            output_bytes);
}

#ifdef __cplusplus
}
#endif

#endif /* BENCH_TIMING_H_ */
