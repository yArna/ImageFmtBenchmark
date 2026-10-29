# ImageFmtBenchmark 本地编码器与评测工具集 (`./encoder`)

本目录包含为五大图片格式（**PNG、JPEG、JPEG XL、WebP、AVIF**）从源码级修改并编译（Apple Silicon `arm64` NEON 优化）的 **11 款核心编码器**、**9 款对应解码器**及 **2 款感知画质评估工具**。

所有编码器与解码器均已在源码层面注入统一的纳秒级单调时钟（`clock_gettime(CLOCK_MONOTONIC)`）**三阶段计时逻辑**（见 `src/bench_timing.h` 与 `src/apply_bench_timing_patches.py`），在**完全保留原命令行参数与“文件输入 -> 文件导出”真实用户工况**的前提下，精准输出 `ready_ms`、`encode_ms`、`output_ms` 三个阶段的耗时。

## 统一三阶段计时输出规范 (`[BENCH_TIMING]`)

每次执行任何编码器或解码器时，程序在完成文件导出后会自动向 `stderr` 输出一行结构化 JSON：

```text
[BENCH_TIMING] {"tool":"cwebp","mode":"encode","ready_ms":36.361,"encode_ms":113.207,"output_ms":0.105,"total_ms":149.674,"input_bytes":2908495,"output_bytes":125022}
```

### 三阶段字段定义

1. `ready_ms`（**准备阶段**）：程序启动后，完成命令行参数解析、从磁盘读入原图片并解码还原为内存像素数据，直到**进入图像编码前那一刻**的总准备耗时。
2. `encode_ms`（**编码阶段**）：纯粹进行目标格式图像压缩编码、在内存中得到最终编码数据的核心耗时（解码器模式下为解码还原像素的核心耗时）。
3. `output_ms`（**导出阶段**）：将编码完成的数据向外写出到目标文件（含 `fwrite` 与 `fflush` 落盘）的耗时。
4. `total_ms`（**总耗时**）：程序主流程从启动到完成导出的端到端耗时（满足 `ready_ms + encode_ms + output_ms ≈ total_ms`）。
5. `input_bytes` / `output_bytes`：输入原文件字节数与导出目标文件字节数。

## 可执行文件清单 (`./encoder/bin`)

### 1. PNG 编码器与解码器系列（4 款）
| 二进制文件 | 对应方案 | 编码与解码用法示例 |
| :--- | :--- | :--- |
| `bin/png-libpng` | 原生 `libpng` + 标准 `zlib` | 编码：`./encoder/bin/png-libpng in.png out.png -l 6`<br>解码：`./encoder/bin/png-libpng in.png out.pam -d` |
| `bin/png-libpng-zlibng` | `libpng` + `zlib-ng` (ARM64 NEON/ACLE 加速) | 编码：`./encoder/bin/png-libpng-zlibng in.png out.png -l 6`<br>解码：`./encoder/bin/png-libpng-zlibng in.png out.pam -d` |
| `bin/png-libspng` | `libspng` (默认链接标准 `zlib`) | 编码：`./encoder/bin/png-libspng in.png out.png -l 6`<br>解码：`./encoder/bin/png-libspng in.png out.pam -d` |
| `bin/oxipng` | `Oxipng` (Rust 多线程无损优化器，含内存管道计时驱动 `oxipng-core`) | 优化：`./encoder/bin/oxipng -o 4 --strip safe in.png --out out.png` |

### 2. JPEG 编码器与解码器系列（3 款）
| 二进制文件 | 对应方案 | 编码与解码用法示例 |
| :--- | :--- | :--- |
| `bin/cjpeg-turbo` / `bin/djpeg-turbo` | `libjpeg-turbo` (SIMD 速度基线，支持直接读 PNG) | 编码：`./encoder/bin/cjpeg-turbo -quality 80 -outfile out.jpg in.png`<br>解码：`./encoder/bin/djpeg-turbo -ppm -outfile out.ppm in.jpg` |
| `bin/cjpeg-mozjpeg` / `bin/djpeg-mozjpeg` | `MozJPEG` (Trellis 网格量化与渐进式优化) | 编码：`./encoder/bin/cjpeg-mozjpeg -quality 80 -optimize -progressive -outfile out.jpg in.png`<br>解码：`./encoder/bin/djpeg-mozjpeg -ppm -outfile out.ppm in.jpg` |
| `bin/cjpegli` / `bin/djpegli` | `Jpegli` (Google 新一代感知 JPEG 编码器) | 编码：`./encoder/bin/cjpegli in.png out.jpg -q 80`<br>解码：`./encoder/bin/djpegli in.jpg out.ppm` |

### 3. JPEG XL 编码器与解码器（1 款）
| 二进制文件 | 对应方案 | 编码与解码用法示例 |
| :--- | :--- | :--- |
| `bin/cjxl` / `bin/djxl` | `libjxl` 官方参考实现 | 有损：`./encoder/bin/cjxl in.png out.jxl -d 1.0 -e 7`<br>无损：`./encoder/bin/cjxl in.png out.jxl -d 0 -e 7`<br>解码：`./encoder/bin/djxl in.jxl out.ppm` |

### 4. WebP 编码器与解码器（1 款）
| 二进制文件 | 对应方案 | 编码与解码用法示例 |
| :--- | :--- | :--- |
| `bin/cwebp` / `bin/dwebp` | `libwebp` 官方参考实现 | 有损：`./encoder/bin/cwebp -q 80 -m 6 -sharp_yuv in.png -o out.webp`<br>无损：`./encoder/bin/cwebp -lossless -q 100 -m 6 in.png -o out.webp`<br>解码：`./encoder/bin/dwebp in.webp -ppm -o out.ppm` |

### 5. AVIF 编码器与解码器系列（2 款编码内核 + 1 款解码器）
| 二进制文件 | 对应方案 | 编码与解码用法示例 |
| :--- | :--- | :--- |
| `bin/avifenc -c aom` | `libavif` + `libaom` (静态图画质上限) | `./encoder/bin/avifenc -c aom -s 4 -q 75 -a tune=ssimulacra2 in.png out.avif` |
| `bin/avifenc -c svt` | `libavif` + `SVT-AV1` (高吞吐多核编码) | `./encoder/bin/avifenc -c svt -y 420 -s 6 -q 75 in.png out.avif` |
| `bin/avifdec -c dav1d` | `libavif` + `dav1d` (高性能 AV1 解码器) | `./encoder/bin/avifdec -c dav1d in.avif out.png` |

### 6. 视觉画质客观评估工具（2 款）
| 二进制文件 | 对应指标 | 用法示例 |
| :--- | :--- | :--- |
| `bin/ssimulacra2` | **SSIMULACRA 2** (人眼感知结构相似度，满分 100) | `./encoder/bin/ssimulacra2 orig.png decoded.png` |
| `bin/butteraugli_main` | **Butteraugli** (心理视觉局部最大误差距离，越小越好) | `./encoder/bin/butteraugli_main orig.png decoded.png` |
