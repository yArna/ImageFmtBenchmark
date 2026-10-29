# 图像编码器源码修改意图与修改文件清单 (`encoder-edit.md`)

本文档记录了为五大图片格式（**PNG、JPEG、JPEG XL、WebP、AVIF**）构建统一评测基准，对 `./encoder/src/` 下 **11 款编码器（及对应解码器、构建目录）** 所做的全部修改意图与修改文件清单。

## 一、 总体修改意图

在保留所有命令行工具**原有参数选项**及**“读取输入文件 -> 导出输出文件”真实用户工况**的前提下，消除跨工具对比时的两大干扰：
1. **剥离输入原图预解码开销**：各命令行工具读取 `.png` 原图时，需先将 PNG 解压为内存像素（耗时约 `20~50 ms`），若不剥离会掩盖极速编码器（如 `libjpeg-turbo` 仅 `4.5 ms`）的真实编码速度。
2. **剥离磁盘 I/O 与二次编码开销**：避免边编码边写盘（如 `cwebp`、`cjpeg` 默认行为）或解码器导出文件时重编码（如 `avifdec` 导出 PNG）干扰核心算法计时。

所有编码器与解码器均使用单调时钟（C/C++ `clock_gettime(CLOCK_MONOTONIC)`、Rust `std::time::Instant`），在运行结束时向 `stderr` 输出统一的三阶段耗时 JSON：

```text
[BENCH_TIMING] {"tool":"<名称>","mode":"encode|decode","ready_ms":...,"encode_ms":...,"output_ms":...,"total_ms":...,"input_bytes":...,"output_bytes":...}
```

* **`ready_ms`（准备阶段）**：程序启动、参数解析、从磁盘读入原图片并解码还原为内存像素数据，直到**进入图像编码前那一刻**的耗时。
* **`encode_ms`（编码阶段）**：在内存中执行图像压缩编码算法、**得到最终压缩数据**的核心耗时（解码器中为解码得到内存像素的耗时）。
* **`output_ms`（导出阶段）**：将内存中的最终数据向外写出到目标文件（`fwrite` + `fflush`）的耗时。

## 二、 新增的公共文件

| 新增文件路径 | 用途与意图说明 |
| :--- | :--- |
| `encoder/src/bench_timing.h` | 公共 C/C++ 计时头文件，提供 `bench_now_ms()`（高精度单调时钟毫秒计时）、`bench_file_size()`（获取文件大小）与 `bench_print_timing()`（统一输出 `[BENCH_TIMING]` JSON）。 |
| `encoder/src/png_bench_tool.c` | 为 `libpng`、`libpng + zlib-ng`、`libspng` 三个纯 C 语言库编写的统一命令行评测程序（这些库本身不提供独立 CLI 转换器）。 |
| `encoder/src/apply_bench_timing_patches.py` | 自动化补丁脚本，用于将各 C/C++ 上游仓库重置为纯净状态后一键注入三阶段计时点。 |

## 三、 各编码器修改文件与修改意图汇总表

| 格式 | 编码器方案 | 产出二进制 (`encoder/bin/`) | 修改的源码 / 配置文件路径 | 修改意图与改动内容说明 |
| :--- | :--- | :--- | :--- | :--- |
| **PNG** | **libpng (原生)** | `png-libpng` | • `encoder/src/png_bench_tool.c`<br>*(上游 `libpng` 与 `zlib` 源码未做任何修改)* | 使用 `png_bench_tool.c` 静态链接 `libpng` + 标准 `zlib`：从启动、读文件到 `png_read_image` 解码为 RGBA 计入 `ready_ms`；通过内存写回调 `png_write_image` 编码为 PNG 内存流计入 `encode_ms`；`fwrite` 写盘计入 `output_ms`。 |
| **PNG** | **libpng + zlib-ng** | `png-libpng-zlibng` | • `encoder/src/png_bench_tool.c`<br>*(上游 `libpng` 与 `zlib-ng` 源码未做任何修改)* | 使用同一份 `png_bench_tool.c`（开启 `-DUSE_ZLIB_NG`）静态链接 `libpng` + `zlib-ng`（`zlib-compat` 模式），确保与 `png-libpng` 除底层 DEFLATE 库外 100% 逻辑一致。 |
| **PNG** | **libspng (默认)** | `png-libspng` | • `encoder/src/png_bench_tool.c`<br>*(上游 `libspng` 与 `zlib` 源码未做任何修改)* | 使用同一份 `png_bench_tool.c`（开启 `-DUSE_SPNG`）静态链接 `libspng` + 默认标准 `zlib`：调用 `spng_decode_image` 计入 `ready_ms`，调用 `spng_encode_image`（`SPNG_ENCODE_TO_BUFFER`）计入 `encode_ms`，写文件计入 `output_ms`。 |
| **PNG** | **Oxipng** | `oxipng` | • `encoder/src/oxipng/src/main.rs`<br>• `encoder/src/oxipng/src/lib.rs` | **不改动任何原有读写、解码与优化逻辑**，仅植入 `Instant::now()`：在 `main.rs` 入口记录启动时间 `BENCH_START`；在 `lib.rs` 的 `optimize()` 中，`PngData::from_slice` 解码完成后记录 `ready_ms`，`optimize_png` 内存压缩完成后记录 `encode_ms`，`BufWriter::write_all` + `flush` 写出文件后记录 `output_ms`。<br>*(注：需在终端执行一次 `cargo build --release` 覆盖 `encoder/bin/oxipng`)* |
| **JPEG** | **libjpeg-turbo** | `cjpeg-turbo`<br>`djpeg-turbo` | • `encoder/src/libjpeg-turbo/src/cjpeg.c`<br>• `encoder/src/libjpeg-turbo/src/djpeg.c` | 1. **解除写盘耦合**：在 `cjpeg.c` 中统一使用 `jpeg_mem_dest` 先将 JPEG 数据编码至内存缓冲，结束后再 `fwrite` 写出到文件（计入 `output_ms`）；<br>2. **拆分交织的扫描线循环**：在 `while (next_scanline < image_height)` 循环中，分别统计每次 `get_pixel_rows`（读取并解码一行输入 PNG，累加进 `ready_ms`）与 `jpeg_write_scanlines`（编码一行 JPEG，累加进 `encode_ms`）的耗时；<br>3. **`djpeg.c`**：先将输入 JPEG 读入内存（`ready_ms`），统计 `jpeg_read_scanlines` 解码耗时與 `put_pixel_rows` 写出耗时。 |
| **JPEG** | **MozJPEG** | `cjpeg-mozjpeg`<br>`djpeg-mozjpeg` | • `encoder/src/mozjpeg/cjpeg.c`<br>• `encoder/src/mozjpeg/djpeg.c` | 与 `libjpeg-turbo` 完全相同：通过 `jpeg_mem_dest` 先在内存中完成编码与多遍网格量化（Trellis）/渐进式扫描优化（计入 `encode_ms`），将扫描线读取 `get_pixel_rows` 累加至 `ready_ms`，最后一次性 `fwrite` 写出文件（计入 `output_ms`）。 |
| **JPEG** | **Jpegli** | `cjpegli`<br>`djpegli` | • `encoder/src/jpegli/tools/cjpegli.cc`<br>• `encoder/src/jpegli/tools/djpegli.cc` | 原生即为清晰的三段式内存结构，零改动数据流，直接打点：在 `cjpegli.cc` 中，从启动、`ReadFile` 到 `DecodeBytes` 解码为 `PackedPixelFile` 完成计入 `ready_ms`；`EncodeJpeg` 编码至 `jpeg_bytes` 向量计入 `encode_ms`；`WriteFile` 写出文件计入 `output_ms`（`djpegli.cc` 对称打点）。 |
| **JPEG XL** | **libjxl** | `cjxl`<br>`djxl` | • `encoder/src/libjxl/tools/cjxl_main.cc`<br>• `encoder/src/libjxl/tools/djxl_main.cc` | 原生即为三段式内存结构，零改动数据流，直接打点：在 `cjxl_main.cc` 中，从启动、`ReadFile`、`DecodeBytes` 解码原图到线程池初始化完成计入 `ready_ms`；`EncodeImageJXL` 编码至 `compressed` 向量计入 `encode_ms`；`WriteFile` 写出文件计入 `output_ms`（`djxl_main.cc` 对称打点）。 |
| **WebP** | **libwebp** | `cwebp`<br>`dwebp` | • `encoder/src/libwebp/examples/cwebp.c`<br>• `encoder/src/libwebp/examples/dwebp.c` | 1. **解除写盘耦合**：将 `cwebp.c` 中 `use_memory_writer` 设为在 `out_file != NULL` 时始终启用，使 `WebPEncode` 先输出至原生内存写入器 `memory_writer`，再由原生 `WriteWebPWithMetadata` 写出到文件（导出文件内容逐字节不变）；<br>2. **打点位置**：从启动到 `ReadPicture` 解码原图及预处理完成计入 `ready_ms`，`WebPEncode` 计入 `encode_ms`，`WriteWebPWithMetadata` + `fflush` 计入 `output_ms`（`dwebp.c` 对 `LoadWebP`、`DecodeWebP`、`SaveOutput` 对称打点）。 |
| **AVIF** | **libaom**<br>**SVT-AV1**<br>**dav1d** | `avifenc`<br>`avifdec` | • `encoder/src/libavif/apps/avifenc.c`<br>• `encoder/src/libavif/apps/avifdec.c`<br>• `encoder/src/libavif/CMakeLists.txt`<br>*(底层 `aom`、`SVT-AV1`、`dav1d` 源码未做任何修改)* | 1. **`avifenc.c`**：从启动到 `avifInputReadImage` 读取并解码原图完成计入 `ready_ms`；调用 `avifEncodeImages` 编码至内存 `avifRWData raw` 计入 `encode_ms`；`fopen` + `fwrite` + `fclose` 写出文件计入 `output_ms`，并根据 `-c aom` / `-c svt` 自动输出 `"avifenc-aom"` 或 `"avifenc-svt"`；<br>2. **`avifdec.c`**：对 `avifDecoderParse`、`avifDecoderNextImage`、`avifWriteToFile` 三处分界打点；<br>3. **`CMakeLists.txt`**：跳过需联网拉取 `libargparse` 的无关工具 `avifgainmaputil`，仅编译 `avifenc` 与 `avifdec`。 |

## 四、 构建目录软链接说明（非源码逻辑修改）

为使各仓库在本地离线完成编译，在 `encoder/src/` 下创建了以下目录/头文件软链接：
1. **`libjxl/third_party/` 与 `jpegli/third_party/` 软链接**：将其下的 `libjpeg-turbo`、`libpng`、`zlib` 软链接至 `encoder/src/` 下已克隆的对应源码目录，复用同一份依赖源码。
2. **`encoder/src/libjpeg-turbo/` 根目录头文件软链接**：由于 `libjpeg-turbo 3.x` 将公开头文件（`jpeglib.h`、`jmorecfg.h`、`jerror.h`、`jconfig.h.in`）移至 `src/` 子目录，在 `libjpeg-turbo/` 根目录下创建了指向 `src/*.h` 与 `src/*.h.in` 的软链接，以兼容 `jpegli` 的 CMake 查找路径。
