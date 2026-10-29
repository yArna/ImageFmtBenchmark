#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <time.h>
#include "bench_timing.h"

#if defined(USE_SPNG)
#include <spng.h>
#include <zlib.h>
#else
#include <png.h>
#include <zlib.h>
#endif

typedef struct {
    uint8_t *data;
    size_t size;
    size_t capacity;
} mem_buf_t;

static void mem_buf_init(mem_buf_t *b, size_t cap) {
    b->data = (uint8_t *)malloc(cap);
    b->size = 0;
    b->capacity = cap;
}

static void mem_buf_free(mem_buf_t *b) {
    free(b->data);
    b->data = NULL;
    b->size = b->capacity = 0;
}

#if !defined(USE_SPNG)
typedef struct {
    const uint8_t *data;
    size_t size;
    size_t offset;
} mem_reader_t;

static void libpng_read_cb(png_structp png_ptr, png_bytep out, png_size_t count) {
    mem_reader_t *r = (mem_reader_t *)png_get_io_ptr(png_ptr);
    if (r->offset + count > r->size) {
        png_error(png_ptr, "Read past end of buffer");
    }
    memcpy(out, r->data + r->offset, count);
    r->offset += count;
}

static void libpng_write_cb(png_structp png_ptr, png_bytep in, png_size_t count) {
    mem_buf_t *b = (mem_buf_t *)png_get_io_ptr(png_ptr);
    if (b->size + count > b->capacity) {
        size_t new_cap = b->capacity ? b->capacity * 2 : 65536;
        while (new_cap < b->size + count) new_cap *= 2;
        b->data = (uint8_t *)realloc(b->data, new_cap);
        b->capacity = new_cap;
    }
    memcpy(b->data + b->size, in, count);
    b->size += count;
}

static void libpng_flush_cb(png_structp png_ptr) {
    (void)png_ptr;
}

static int decode_png_libpng(const uint8_t *in_buf, size_t in_size, uint8_t **out_rgba, uint32_t *w, uint32_t *h) {
    png_structp png = png_create_read_struct(PNG_LIBPNG_VER_STRING, NULL, NULL, NULL);
    if (!png) return -1;
    png_infop info = png_create_info_struct(png);
    if (!info) {
        png_destroy_read_struct(&png, NULL, NULL);
        return -1;
    }
    if (setjmp(png_jmpbuf(png))) {
        png_destroy_read_struct(&png, &info, NULL);
        return -1;
    }
    mem_reader_t reader = { in_buf, in_size, 0 };
    png_set_read_fn(png, &reader, libpng_read_cb);
    png_read_info(png, info);

    *w = png_get_image_width(png, info);
    *h = png_get_image_height(png, info);
    png_byte color_type = png_get_color_type(png, info);
    png_byte bit_depth  = png_get_bit_depth(png, info);

    if (bit_depth == 16) png_set_strip_16(png);
    if (color_type == PNG_COLOR_TYPE_PALETTE) png_set_palette_to_rgb(png);
    if (color_type == PNG_COLOR_TYPE_GRAY && bit_depth < 8) png_set_expand_gray_1_2_4_to_8(png);
    if (png_get_valid(png, info, PNG_INFO_tRNS)) png_set_tRNS_to_alpha(png);
    if (color_type == PNG_COLOR_TYPE_RGB || color_type == PNG_COLOR_TYPE_GRAY || color_type == PNG_COLOR_TYPE_PALETTE)
        png_set_filler(png, 0xFF, PNG_FILLER_AFTER);
    if (color_type == PNG_COLOR_TYPE_GRAY || color_type == PNG_COLOR_TYPE_GRAY_ALPHA)
        png_set_gray_to_rgb(png);

    png_read_update_info(png, info);

    size_t rowbytes = (size_t)(*w) * 4;
    if (!*out_rgba) {
        *out_rgba = (uint8_t *)malloc(rowbytes * (*h));
    }
    png_bytep *rows = (png_bytep *)malloc(sizeof(png_bytep) * (*h));
    for (uint32_t y = 0; y < *h; y++) {
        rows[y] = *out_rgba + y * rowbytes;
    }
    png_read_image(png, rows);
    png_read_end(png, NULL);
    free(rows);
    png_destroy_read_struct(&png, &info, NULL);
    return 0;
}

static int encode_png_libpng(const uint8_t *rgba, uint32_t w, uint32_t h, int level, int filter_mode, mem_buf_t *out_buf) {
    png_structp png = png_create_write_struct(PNG_LIBPNG_VER_STRING, NULL, NULL, NULL);
    if (!png) return -1;
    png_infop info = png_create_info_struct(png);
    if (!info) {
        png_destroy_write_struct(&png, NULL);
        return -1;
    }
    if (setjmp(png_jmpbuf(png))) {
        png_destroy_write_struct(&png, &info);
        return -1;
    }
    out_buf->size = 0;
    png_set_write_fn(png, out_buf, libpng_write_cb, libpng_flush_cb);
    png_set_compression_level(png, level);

    switch (filter_mode) {
        case 0: png_set_filter(png, 0, PNG_FILTER_NONE); break;
        case 1: png_set_filter(png, 0, PNG_FILTER_SUB); break;
        case 2: png_set_filter(png, 0, PNG_FILTER_UP); break;
        case 3: png_set_filter(png, 0, PNG_FILTER_AVG); break;
        case 4: png_set_filter(png, 0, PNG_FILTER_PAETH); break;
        default: png_set_filter(png, 0, PNG_ALL_FILTERS); break;
    }

    png_set_IHDR(png, info, w, h, 8, PNG_COLOR_TYPE_RGBA,
                 PNG_INTERLACE_NONE, PNG_COMPRESSION_TYPE_DEFAULT, PNG_FILTER_TYPE_DEFAULT);
    png_write_info(png, info);

    size_t rowbytes = (size_t)w * 4;
    png_bytep *rows = (png_bytep *)malloc(sizeof(png_bytep) * h);
    for (uint32_t y = 0; y < h; y++) {
        rows[y] = (png_bytep)(rgba + y * rowbytes);
    }
    png_write_image(png, rows);
    png_write_end(png, NULL);
    free(rows);
    png_destroy_write_struct(&png, &info);
    return 0;
}
#else
static int decode_png_spng(const uint8_t *in_buf, size_t in_size, uint8_t **out_rgba, uint32_t *w, uint32_t *h) {
    spng_ctx *ctx = spng_ctx_new(0);
    if (!ctx) return -1;
    if (spng_set_png_buffer(ctx, in_buf, in_size) != 0) {
        spng_ctx_free(ctx);
        return -1;
    }
    struct spng_ihdr ihdr;
    if (spng_get_ihdr(ctx, &ihdr) != 0) {
        spng_ctx_free(ctx);
        return -1;
    }
    *w = ihdr.width;
    *h = ihdr.height;
    size_t out_size = 0;
    if (spng_decoded_image_size(ctx, SPNG_FMT_RGBA8, &out_size) != 0) {
        spng_ctx_free(ctx);
        return -1;
    }
    if (!*out_rgba) {
        *out_rgba = (uint8_t *)malloc(out_size);
    }
    if (spng_decode_image(ctx, *out_rgba, out_size, SPNG_FMT_RGBA8, SPNG_DECODE_TRNS) != 0) {
        spng_ctx_free(ctx);
        return -1;
    }
    spng_ctx_free(ctx);
    return 0;
}

static int encode_png_spng(const uint8_t *rgba, uint32_t w, uint32_t h, int level, int filter_mode, mem_buf_t *out_buf) {
    spng_ctx *ctx = spng_ctx_new(SPNG_CTX_ENCODER);
    if (!ctx) return -1;
    spng_set_option(ctx, SPNG_ENCODE_TO_BUFFER, 1);

    struct spng_ihdr ihdr = {0};
    ihdr.width = w;
    ihdr.height = h;
    ihdr.bit_depth = 8;
    ihdr.color_type = SPNG_COLOR_TYPE_TRUECOLOR_ALPHA;
    spng_set_ihdr(ctx, &ihdr);

    spng_set_option(ctx, SPNG_IMG_COMPRESSION_LEVEL, level);
    int spng_choice = SPNG_FILTER_CHOICE_ALL;
    switch (filter_mode) {
        case 0: spng_choice = SPNG_DISABLE_FILTERING; break;
        case 1: spng_choice = SPNG_FILTER_CHOICE_SUB; break;
        case 2: spng_choice = SPNG_FILTER_CHOICE_UP; break;
        case 3: spng_choice = SPNG_FILTER_CHOICE_AVG; break;
        case 4: spng_choice = SPNG_FILTER_CHOICE_PAETH; break;
        default: spng_choice = SPNG_FILTER_CHOICE_ALL; break;
    }
    spng_set_option(ctx, SPNG_FILTER_CHOICE, spng_choice);

    size_t img_size = (size_t)w * h * 4;
    if (spng_encode_image(ctx, rgba, img_size, SPNG_FMT_PNG, SPNG_ENCODE_FINALIZE) != 0) {
        spng_ctx_free(ctx);
        return -1;
    }
    int err = 0;
    size_t png_size = 0;
    void *png_buf = spng_get_png_buffer(ctx, &png_size, &err);
    if (!png_buf || err != 0) {
        spng_ctx_free(ctx);
        return -1;
    }
    if (out_buf->capacity < png_size) {
        out_buf->data = (uint8_t *)realloc(out_buf->data, png_size);
        out_buf->capacity = png_size;
    }
    memcpy(out_buf->data, png_buf, png_size);
    out_buf->size = png_size;
    free(png_buf);
    spng_ctx_free(ctx);
    return 0;
}
#endif

static void print_version(void) {
#if defined(USE_SPNG)
    printf("png-libspng (libspng %s + zlib %s)\n", spng_version_string(), zlibVersion());
#elif defined(USE_ZLIB_NG)
    printf("png-libpng-zlibng (libpng %s + zlib-ng %s)\n", PNG_LIBPNG_VER_STRING, zlibVersion());
#else
    printf("png-libpng (libpng %s + zlib %s)\n", PNG_LIBPNG_VER_STRING, zlibVersion());
#endif
}

int main(int argc, char **argv) {
    const double t_total_start = bench_now_ms();
    if (argc < 2) {
        print_version();
        fprintf(stderr, "Usage: %s <input.png> [output.png] [-l 0..9] [-f 0..5] [-r runs] [-d|--decode] [--json]\n", argv[0]);
        return 1;
    }
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-v") == 0 || strcmp(argv[i], "--version") == 0) {
            print_version();
            return 0;
        }
    }

    const char *in_path = argv[1];
    const char *out_path = NULL;
    int level = 6;
    int filter_mode = 5;
    int runs = 1;
    int decode_only = 0;
    int json_out = 0;

    int arg_idx = 2;
    if (arg_idx < argc && argv[arg_idx][0] != '-') {
        out_path = argv[arg_idx++];
    }
    for (; arg_idx < argc; arg_idx++) {
        if (strcmp(argv[arg_idx], "-l") == 0 && arg_idx + 1 < argc) {
            level = atoi(argv[++arg_idx]);
        } else if (strcmp(argv[arg_idx], "-f") == 0 && arg_idx + 1 < argc) {
            filter_mode = atoi(argv[++arg_idx]);
        } else if (strcmp(argv[arg_idx], "-r") == 0 && arg_idx + 1 < argc) {
            runs = atoi(argv[++arg_idx]);
            if (runs < 1) runs = 1;
        } else if (strcmp(argv[arg_idx], "-d") == 0 || strcmp(argv[arg_idx], "--decode") == 0) {
            decode_only = 1;
        } else if (strcmp(argv[arg_idx], "-o") == 0 && arg_idx + 1 < argc) {
            out_path = argv[++arg_idx];
        } else if (strcmp(argv[arg_idx], "--json") == 0) {
            json_out = 1;
        }
    }

    /* Stage 1a: Read file from disk */
    const double t_read_start = bench_now_ms();
    FILE *fp = fopen(in_path, "rb");
    if (!fp) {
        fprintf(stderr, "Failed to open input: %s\n", in_path);
        return 1;
    }
    fseek(fp, 0, SEEK_END);
    size_t in_size = (size_t)ftell(fp);
    fseek(fp, 0, SEEK_SET);
    uint8_t *in_buf = (uint8_t *)malloc(in_size);
    if (fread(in_buf, 1, in_size, fp) != in_size) {
        fclose(fp);
        free(in_buf);
        return 1;
    }
    fclose(fp);
    const double file_read_ms = bench_now_ms() - t_read_start;

    /* Stage 1b: Decode PNG to RGBA in memory */
    uint8_t *rgba = NULL;
    uint32_t w = 0, h = 0;

    const double t_dec_start = bench_now_ms();
    for (int r = 0; r < runs; r++) {
#if defined(USE_SPNG)
        if (decode_png_spng(in_buf, in_size, &rgba, &w, &h) != 0) {
            fprintf(stderr, "spng decode failed\n");
            return 1;
        }
#else
        if (decode_png_libpng(in_buf, in_size, &rgba, &w, &h) != 0) {
            fprintf(stderr, "libpng decode failed\n");
            return 1;
        }
#endif
    }
    const double decode_ms = (bench_now_ms() - t_dec_start) / runs;

#if defined(USE_SPNG)
    const char *encoder_name = "png-libspng";
#elif defined(USE_ZLIB_NG)
    const char *encoder_name = "png-libpng-zlibng";
#else
    const char *encoder_name = "png-libpng";
#endif

    if (decode_only) {
        double write_ms = 0.0;
        size_t out_bytes = (size_t)w * h * 4;
        if (out_path) {
            const double t_write_start = bench_now_ms();
            FILE *ofp = fopen(out_path, "wb");
            if (!ofp) {
                fprintf(stderr, "Failed to open output: %s\n", out_path);
                return 1;
            }
            fprintf(ofp, "P7\nWIDTH %u\nHEIGHT %u\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n", w, h);
            fwrite(rgba, 1, out_bytes, ofp);
            fclose(ofp);
            write_ms = bench_now_ms() - t_write_start;
            out_bytes = bench_file_size(out_path);
        }
        const double total_ms = bench_now_ms() - t_total_start;
        bench_print_timing(encoder_name, "decode", t_dec_start - t_total_start, decode_ms, write_ms, total_ms, in_size, out_bytes);
        free(rgba);
        free(in_buf);
        return 0;
    }

    /* Stage 2: Encode RGBA to PNG in memory */
    mem_buf_t out_buf;
    mem_buf_init(&out_buf, in_size + 65536);

    const double t_enc_start = bench_now_ms();
    for (int r = 0; r < runs; r++) {
#if defined(USE_SPNG)
        if (encode_png_spng(rgba, w, h, level, filter_mode, &out_buf) != 0) {
            fprintf(stderr, "spng encode failed\n");
            return 1;
        }
#else
        if (encode_png_libpng(rgba, w, h, level, filter_mode, &out_buf) != 0) {
            fprintf(stderr, "libpng encode failed\n");
            return 1;
        }
#endif
    }
    const double encode_ms = (bench_now_ms() - t_enc_start) / runs;

    /* Stage 3: Write encoded PNG buffer to disk */
    double write_ms = 0.0;
    if (out_path) {
        const double t_write_start = bench_now_ms();
        FILE *ofp = fopen(out_path, "wb");
        if (!ofp) {
            fprintf(stderr, "Failed to open output: %s\n", out_path);
            return 1;
        }
        fwrite(out_buf.data, 1, out_buf.size, ofp);
        fclose(ofp);
        write_ms = bench_now_ms() - t_write_start;
    }

    const double total_ms = bench_now_ms() - t_total_start;
    const double read_input_ms = file_read_ms + decode_ms;

    if (json_out) {
        printf("{\"encoder\":\"%s\",\"zlib_version\":\"%s\",\"width\":%u,\"height\":%u,\"level\":%d,\"filter\":%d,\"input_bytes\":%zu,\"output_bytes\":%zu,\"file_read_ms\":%.3f,\"decode_ms\":%.3f,\"read_input_ms\":%.3f,\"encode_ms\":%.3f,\"write_output_ms\":%.3f,\"total_ms\":%.3f}\n",
               encoder_name, zlibVersion(), w, h, level, filter_mode, in_size, out_buf.size,
               file_read_ms, decode_ms, read_input_ms, encode_ms, write_ms, total_ms);
    } else {
        printf("[%s (zlib %s)] %ux%u | level=%d filter=%d | in=%zu B -> out=%zu B (%.1f%%) | read+dec=%.2f ms (io=%.2f, dec=%.2f) | enc=%.2f ms | write=%.2f ms\n",
               encoder_name, zlibVersion(), w, h, level, filter_mode, in_size, out_buf.size,
               (double)out_buf.size * 100.0 / (double)in_size,
               read_input_ms, file_read_ms, decode_ms, encode_ms, write_ms);
    }

    bench_print_timing(encoder_name, "encode", t_enc_start - t_total_start, encode_ms, write_ms, total_ms, in_size, out_buf.size);

    mem_buf_free(&out_buf);
    free(rgba);
    free(in_buf);
    return 0;
}
