# 11 款图像编码器推荐参数指南（文档、源码与网络最佳实践）

本文档结合 **官方文档与内置 CLI 帮助**、**本地源码 (`encoder/src/`) 默认配置与预设表** 以及 **网络与行业工程最佳实践**，为评测集中的 5 种图像格式（PNG、JPEG、JPEG XL、WebP、AVIF）共 11 款编码器梳理推荐参数与评测档位建议。

## 1. 全编码器推荐参数总表

| 格式 | 编码器 | 极速档 (Fast) | 均衡/默认推荐档 (Balanced / Default) | 高画质/高压缩推荐档 (High / Best) | 无损/视觉无损特殊推荐 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **PNG** | `png-libpng` | `-l 1 -f 0` (`Z_BEST_SPEED` + `PNG_FILTER_NONE`) | `-l 6 -f 5` (`Z_DEFAULT_COMPRESSION` + 全滤波器自适应) | `-l 9 -f 5` (`Z_BEST_COMPRESSION` + 全滤波器自适应) | 像素级无损；UI/图标可试 `-f 1` (`Sub`) 或 `-f 4` (`Paeth`) |
| **PNG** | `png-libpng-zlibng` | `-l 1 -f 0` (`deflate_quick` 路径 + 无滤波) | `-l 6 -f 5` (`deflate_medium` 路径 + 全滤波器自适应) | `-l 9 -f 5` (`deflate_slow` 路径 + 全滤波器自适应) | 像素级无损；`zlib-ng` 在 `-l 3..6` 下兼顾高吞吐与高压缩率 |
| **PNG** | `png-libspng` | `-l 1 -f 0` (`SPNG_DISABLE_FILTERING`) | `-l 6 -f 5` (`SPNG_FILTER_CHOICE_ALL`) | `-l 9 -f 5` (`SPNG_FILTER_CHOICE_ALL`) | 像素级无损；源码默认关闭滤波，需显式传 `-f 5` 开启行滤波搜索 |
| **PNG** | `oxipng` | `-o 0 --strip safe` (`--zc 5 -f 0,5 --fast`) | `-o 2 --strip safe` (默认预设：`--zc 11 -f 0,1,6,7 --fast`) | `-o 4 --strip safe` (`--zc 12 -f 0,1,6,7,8,9 --fast --brute-level 1 --brute-lines 4`) | 视觉无损透明像素清理加 `-a` (`--alpha`)；极限归档用 `-o max -z --fast` |
| **JPEG** | `cjpeg-turbo` | `-quality 75` (Baseline Huffman，最快) | `-quality 85 -optimize` (单遍/优化霍夫曼表) | `-quality 90 -progressive -optimize -sample 1x1` | 无损模式 `-lossless 1` 兼容性差，工程上推荐 `-quality 95 -sample 1x1` |
| **JPEG** | `cjpeg-mozjpeg` | `-quality 75 -fastcrush -notrellis` | `-quality 80` (源码默认开启渐进扫描优化 + Trellis + Robidoux 量化表 3) | `-quality 85 -tune-ssim -sample 1x1` (或照片用 `-tune-hvs-psnr`) | 锐利边缘/UI 图加 `-sample 1x1` 关闭色度抽样 |
| **JPEG** | `cjpegli` | `-q 85 -p 0` (顺序扫描，关闭多遍渐进) | `-q 90` 或 `-d 1.0` (默认 `-p 2` + 自适应量化 + 感知量化表) | `-d 0.5 --chroma_subsampling=444` (或 `-q 95 --chroma_subsampling=444`) | 默认 `-d 1.0` (`-q 90`) 即为 Butteraugli 视觉无损标准 |
| **JPEG XL** | `cjxl` | `-d 1.0 -e 3` (Effort 3 `falcon`) | `-d 1.0 -e 7` (默认视觉无损，Effort 7 `squirrel`) | `-d 0.5 -e 9` (高画质，Effort 9 `tortoise`) | 数学无损用 `-d 0.0 -e 7` (Modular 模式)；JPEG 无损重压缩默认 `-j 1` |
| **WebP** | `cwebp` | `-q 75 -m 1 -mt` | `-q 80 -m 4 -sharp_yuv -mt` | `-q 85 -m 6 -sharp_yuv -mt` (UI/文字可加 `-preset picture` 或 `text`) | 数学无损用 `-z 6 -mt` (均衡) 或 `-z 9 -mt` (极限无损，映射 `-m 6 -q 100`) |
| **AVIF** | `avifenc -c aom` | `-c aom -s 8 -q 65 -j all` (`RealTime` 模式) | `-c aom -s 6 -q 68 --depth 10 -y 444 -a tune=iq -j all` | `-c aom -s 4 -q 78 --depth 10 -y 444 -a tune=iq -j all` | 数学无损用 `-c aom -l -s 6 -j all` (自动设置 `-q 100` 与 `matrixCoefficients=0`) |
| **AVIF** | `avifenc -c svt` | `-c svt -s 8 -q 65 -y 420 -j all` | `-c svt -s 6 -q 70 --depth 10 -y 420 -a tune=3 -j all` | `-c svt -s 4 -q 80 --depth 10 -y 420 -a tune=3 -j all` | `SVT-AV1` 静态图专用调优为 `-a tune=3` (`IQ`) 或 `-a tune=0` (`VQ`) |

## 2. PNG 编码器参数详解

### 2.1 `png-libpng`（[libpng](https://github.com/pnggroup/libpng) + 标准 [zlib](https://github.com/madler/zlib)）
* **文档与 CLI 选项**：
  * `-l 0..9`：对应 `png_set_compression_level()`，底层传递给 `zlib` 的 `deflateInit2()`。`0` 为不压缩，`1` 为最快 (`Z_BEST_SPEED`)，`6` 为默认 (`Z_DEFAULT_COMPRESSION`)，`9` 为最高压缩 (`Z_BEST_COMPRESSION`)。
  * `-f 0..5`：对应 `png_set_filter()`。`0` = `PNG_FILTER_NONE`、`1` = `SUB`、`2` = `UP`、`3` = `AVG`、`4` = `PAETH`、`5` = `PNG_ALL_FILTERS`（逐行使用最小绝对差和 MinSum 启发式自动选择最优滤波器）。
* **源码默认配置**（[`encoder/src/png_bench_tool.c`](file:///Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/png_bench_tool.c) 与 [`encoder/src/zlib/deflate.c`](file:///Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/zlib/deflate.c)）：
  * `zlib/deflate.c` 的 `configuration_table[10]` 中：Level 1..3 使用 `deflate_fast`（无懒惰匹配），Level 4..9 使用 `deflate_slow`；其中 Level 6 的 `max_chain=128`，Level 9 的 `max_chain=4096`（耗时显著增加但压缩率仅比 Level 6 提升约 0.5%~1.5%）。
* **网络与工程推荐**：
  * **通用均衡**：`-l 6 -f 5`（默认级别 + 全滤波器启发式选择）。
  * **高速实时**：`-l 1 -f 0` 或 `-l 3 -f 1`（跳过逐行 5 种滤波器尝试，编码耗时可降低 60% 以上）。

### 2.2 `png-libpng-zlibng`（[libpng](https://github.com/pnggroup/libpng) + [zlib-ng](https://github.com/zlib-ng/zlib-ng)）
* **文档与 CLI 选项**：与 `png-libpng` 完全一致（`-l 0..9 -f 0..5`）。
* **源码默认配置**（[`encoder/src/zlib-ng/deflate.c`](file:///Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/zlib-ng/deflate.c)）：
  * `zlib-ng` 在 `configuration_table[10]` 中重构了不同压缩级别的内部算法路径：
    * **Level 1**：采用专用高速 `deflate_quick` 路径；
    * **Level 2**：采用 `deflate_fast`；
    * **Level 3..6**：采用 `deflate_medium`（结合 SIMD 哈希链与块分裂启发式，在接近标准 `zlib` Level 9 压缩率的同时，速度比标准 `zlib` 快约 2~3 倍）；
    * **Level 7..9**：采用 `deflate_slow`。
* **网络与工程推荐**：
  * **最佳性价比**：`-l 4 -f 5` 或 `-l 6 -f 5`（命中 `zlib-ng` 的 `deflate_medium` 核心优化路径）。
  * **极速吞吐**：`-l 1 -f 0`（命中 `deflate_quick`）。

### 2.3 `png-libspng`（[libspng](https://github.com/randy408/libspng) + 标准 `zlib`）
* **文档与 CLI 选项**：与 `png-libpng` 一致（`-l 0..9 -f 0..5`）。
* **源码默认配置**（[`encoder/src/libspng/spng/spng.c`](file:///Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/libspng/spng/spng.c)）：
  * `libspng` 内部通过 `SPNG_IMG_COMPRESSION_LEVEL` 设置 `zlib` 级别，通过 `SPNG_FILTER_CHOICE` 控制行滤波。注意 `libspng` 源码默认若只保存调色板索引图会禁用滤波，对真彩色图若不指定 `SPNG_FILTER_CHOICE_ALL`（工具中 `-f 5` 默认已启用）会影响压缩比。
* **网络与工程推荐**：
  * **通用推荐**：`-l 6 -f 5`。

### 2.4 `oxipng`（[Oxipng](https://github.com/oxipng/oxipng)）
* **文档与 CLI 选项**：
  * `-o 0..6` 或 `-o max`：预设优化级别，默认 `-o 2`。
  * `-s` / `--strip safe`：剥离非关键且不影响显示效果的元数据块（保留 `cICP`、`iCCP`、`sRGB`、`pHYs`、APNG 块）。
  * `-a` / `--alpha`：清理全透明像素 (`alpha == 0`) 下隐藏的 RGB 杂色值（视觉无损，对带透明通道的 UI/贴图能显著减小体积）。
  * `-z` / `--zopfli`：启用 Zopfli 压缩器替代 `libdeflate`（体积最小，但慢 10~50 倍）。
* **源码默认配置**（[`encoder/src/oxipng/src/options.rs`](file:///Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/oxipng/src/options.rs)）：
  * `from_preset(level)` 定义了每档的具体组合（底层使用高性能 `libdeflate`，级别 `zc` 范围 `0..12`）：
    * `-o 0`：`--zc 5 -f 0,5 --fast`
    * `-o 1`：`--zc 10 -f 0,7 --fast`
    * `-o 2`（**默认**）：`--zc 11 -f 0,1,6,7 --fast`（利用快速评估筛选 `None`、`Sub`、`Entropy`、`Bigrams` 4 种滤波策略后再用 `libdeflate` Level 11 压缩一次）
    * `-o 3`：`--zc 11 -f 0,1,6,7,8,9 --fast --brute-level 1 --brute-lines 3`
    * `-o 4`：`--zc 12 -f 0,1,6,7,8,9 --fast --brute-level 1 --brute-lines 4`
    * `-o 5`：`--zc 12 -f 0,1,6,7,8,9 --brute-level 1 --brute-lines 8`（关闭 `--fast`，对所有候选滤波器执行完整 Level 12 压缩）
    * `-o 6` / `-o max`：`--zc 12 -f 0-9 --brute-level 5 --brute-lines 8`
  * 此外，Oxipng 在编码阶段会自动尝试无损位深缩减 (`bit_depth_reduction`)、色彩类型缩减 (`color_type_reduction`，如 RGBA 自动降为 RGB/Grayscale/Indexed 调色板) 和去隔行 (`interlace: Off`)。
* **网络与工程推荐**：
  * **日常构建/CI 推荐**：`-o 2 --strip safe`（如果允许修改完全透明像素的隐藏 RGB 值，强烈建议加 `-a`）。
  * **发布归档推荐**：`-o 4 --strip safe`（启用 `libdeflate` 最高级 `--zc 12` 及 `BigEnt`/`Brute` 滤波器，同时仍保持 `--fast` 快速筛选，性价比极高；`-o 5`/`-o 6` 耗时剧增但收益极小）。

## 3. JPEG 编码器参数详解

### 3.1 `cjpeg-turbo`（[libjpeg-turbo](https://github.com/libjpeg-turbo/libjpeg-turbo)）
* **文档与 CLI 选项**（[`encoder/src/libjpeg-turbo/doc/usage.txt`](file:///Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/libjpeg-turbo/doc/usage.txt)）：
  * `-quality N`：`0..100`，默认 `75`，官方推荐有效范围 `50..95`。支持逗号分隔分别指定亮度与色度质量（如 `-quality 85,75`）。
  * `-optimize`：执行多遍统计以生成图像专属的最优霍夫曼表（文件更小，解码速度不变）。
  * `-progressive`：生成渐进式 JPEG（自动隐含 `-optimize`）。
  * `-sample HxV`：色度抽样率，默认 `2x2` (`4:2:0`)，`2x1` 为 `4:2:2`，`1x1` 为 `4:4:4`（无色度下采样）。
  * `-dct int`（默认精确整数 DCT，推荐）vs `-dct fast`（质量 >90 时会有 PSNR 损失，>97 时退化，官方不推荐在高画质使用）。
* **源码默认配置**：
  * 默认 `quality = 75`、Baseline 固定霍夫曼表 (`optimize_coding = FALSE`)、Annex K 标准量化表、`4:2:0` 色度抽样。
* **网络与工程推荐**：
  * **极速基线对比**：`-quality 75` 或 `-quality 85`（测试 SIMD 硬件极限吞吐）。
  * **生产推荐**：`-quality 85 -progressive -optimize`（根据 [libjpeg-turbo 官方关于 MozJPEG 的评测](https://www.libjpeg-turbo.org/About/Mozjpeg)，仅开启 `-progressive -optimize` 即可比 Baseline 平均减小约 11% 体积）。

### 3.2 `cjpeg-mozjpeg`（[MozJPEG](https://github.com/mozilla/mozjpeg)）
* **文档与 CLI 选项**（[`encoder/src/mozjpeg/cjpeg.c`](file:///Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/cjpeg.c)）：
  * `-quality N`：默认 `75`。
  * `-quant-table 0..8`：内置 9 套量化表（`0` = JPEG Annex K 标准表；`2` = Kodak MS-SSIM 调优表；`3` = Nicolas Robidoux ImageMagick 表，**MozJPEG 默认**；`4` = PSNR-HVS 调优表）。
  * `-tune-psnr` / `-tune-hvs-psnr`（**默认**）/ `-tune-ssim` / `-tune-ms-ssim`：调整网格量化 (Trellis Quantization) 的率失真优化目标。
  * `-notrellis` / `-notrellis-dc`：禁用 AC 或 DC 系数的网格量化。
  * `-fastcrush`：禁用渐进式扫描脚本穷举搜索（退回固定渐进扫描脚本，大幅提速）。
  * `-revert`：退回标准 `libjpeg-turbo` 默认行为。
* **源码默认配置**（[`encoder/src/mozjpeg/jcparam.c`](file:///Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/mozjpeg/jcparam.c)）：
  * MozJPEG 默认将 `compress_profile` 设为 `JCP_MAX_COMPRESSION`：默认自动开启 `-progressive`、`-optimize`、`optimize_scans = TRUE`（通过 `jpeg_search_progression` 测试 64 个候选扫描通道组合寻找最小体积，即内置 `jpgcrush`）、`trellis_quant = TRUE`、`trellis_quant_dc = TRUE`、`overshoot_deringing = TRUE`（黑底白字抗振铃）以及 `quant_tbl_master_idx = 3`（Robidoux 量化表）。
* **网络与工程推荐**：
  * **Web 通用推荐**：直接传 `-quality 75` 或 `-quality 82`（直接享受 MozJPEG 默认全套 Trellis + 渐进扫描优化，体积比同质量 `libjpeg-turbo` 小 10%~18%）。
  * **客观指标/感知调优**：若评测看重 SSIM/MS-SSIM，可传 `-quality 82 -tune-ssim`；若希望编码提速 2~3 倍且仅损失约 1.5% 压缩率，可加 `-fastcrush`。

### 3.3 `cjpegli`（[Jpegli](https://github.com/google/jpegli)）
* **文档与 CLI 选项**（[`encoder/src/jpegli/tools/cjpegli.cc`](file:///Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/jpegli/tools/cjpegli.cc)）：
  * `-d maxError` / `--distance=maxError`：目标 Butteraugli 视觉距离，默认 `1.0`（视觉无损），官方推荐范围 `0.5 .. 3.0`。
  * `-q QUALITY` / `--quality=QUALITY`：默认 `90`（内部映射到 `--distance=1.0`），官方推荐范围 `68 .. 96`。
  * `--chroma_subsampling=444|440|422|420`：色度抽样（默认不传时对常规 sRGB 使用 4:4:4 或按距离自适应，可通过该参数显式固定 `444` 或 `420`）。
  * `-p 0..2` / `--progressive_level=0..2`：渐进级别，默认 `2`（多遍渐进扫描），`0` 为顺序扫描。
  * `--xyb`：使用感知 XYB 色彩空间写入 ICC Profile（文件更小但部分旧看图器不解析 ICC 会偏色，通用兼容建议保持默认 YCbCr）。
  * `--std_quant` / `--noadaptive_quantization`：退回 Annex K 量化表或关闭心理视觉自适应量化（一般不建议关闭）。
* **源码默认配置**：
  * 默认启用心理视觉自适应量化 (Adaptive Quantization)、10+ bit 高精度中间计算、定制感知量化矩阵、霍夫曼表优化及 `-p 2` 渐进编码。
* **网络与工程推荐**：
  * **视觉无损标准档**：`-d 1.0`（等价于 `-q 90`）。
  * **Web 高性价比档**：`-q 80` 或 `-q 85`（在相同 SSIMULACRA2 / Butteraugli 得分下，比 `libjpeg-turbo` 和 `MozJPEG` 节省约 15%~30% 体积且振铃伪影更少）。
  * **公平对比色度抽样**：与传统 JPEG 对比 4:2:0 时显式指定 `--chroma_subsampling=420`，对比 UI/文字高画质时指定 `--chroma_subsampling=444`。

## 4. JPEG XL 编码器参数详解 (`cjxl`)

* **文档与 CLI 选项**（[libjxl](https://github.com/libjxl/libjxl) / [`encoder/src/libjxl/tools/cjxl_main.cc`](file:///Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/libjxl/tools/cjxl_main.cc)）：
  * `-d DISTANCE` / `--distance=DISTANCE`：以 JND (Just Noticeable Difference，Butteraugli 距离) 为单位的视觉距离，范围 `0.0 .. 25.0`。
    * `0.0` = **数学无损**（自动切换至 Modular 编码器）；
    * `1.0` = **视觉无损**（PNG/PPM 输入的默认值）；
    * 官方推荐有损范围：`0.5 .. 3.0`。
  * `-q QUALITY`：范围 `0 .. 100`，内部自动映射为 `--distance`（`100` = 数学无损 `-d 0.0`；`90` = 视觉无损 `-d 1.0`；官方推荐范围 `68 .. 96`）。
  * `-e EFFORT` / `--effort=1..10`：编码算力投入级别，**默认 `7`** (`squirrel`)：
    * `1` (`lightning`)、`2` (`thunder`)、`3` (`falcon`)、`4` (`cheetah`)、`5` (`hare`)、`6` (`wombat`)、`7` (`squirrel`，默认)、`8` (`kitten`)、`9` (`tortoise`)、`10` (`glacier`)。
  * `-j 0|1` / `--lossless_jpeg=0|1`：输入为 JPEG 时，默认 `1`（执行 DCT 系数级无损重压缩，体积缩小约 20% 且可逐字节还原原 JPEG）；若需测试从像素重新有损/无损编码，必须传 `-j 0`。
* **源码默认配置**：
  * 对 PNG 输入默认采用 `-d 1.0 -e 7`，有损模式使用 VarDCT + 局部自适应量化 + 样条/块特征建模 + Gaborish 环路滤波；无损模式 (`-d 0`) 自动使用 Modular 预测树学习。
* **网络与工程推荐**：
  * **有损评测推荐档位**：
    * 高画质 / 视觉无损：`-d 1.0 -e 7`（对应 `-q 90 -e 7`）
    * 均衡 Web 档：`-d 1.5 -e 7`（约对应 `-q 85`）或 `-d 2.0 -e 7`（约对应 `-q 80`）
    * 高压缩档：`-d 3.0 -e 7`（约对应 `-q 68`）
  * **无损评测推荐档位**：
    * 速度与体积均衡无损：`-d 0.0 -e 7`
    * 极速无损（对标 PNG）：`-d 0.0 -e 3`
    * 极限无损归档：`-d 0.0 -e 9`（`-e 10` 耗时极长，仅适合离线小图研究）

## 5. WebP 编码器参数详解 (`cwebp`)

* **文档与 CLI 选项**（[libwebp](https://github.com/webmproject/libwebp) / [`encoder/src/libwebp/examples/cwebp.c`](file:///Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/libwebp/examples/cwebp.c)）：
  * `-q <float>`：`0..100`，默认 `75`。
  * `-m <int>`：压缩方法 (`0..6`)，默认 `4`。`0` 最快，`6` 最慢但率失真最优（启用全部宏块模式与多遍 RD 搜索）。
  * `-sharp_yuv`：使用迭代优化的 Sharp RGB->YUV420 转换算法（避免常规平均下采样在红底黑字、UI 图标边缘产生严重的色彩晕染，强烈推荐有损模式开启）。
  * `-preset <name>`：场景预设（**必须写在命令行最前面**，否则会覆盖后续参数）：`default`、`photo`、`picture`、`drawing`、`icon`、`text`。
  * `-z 0..9`：无损编码快捷预设（自动开启 `-lossless` 并映射 `-m` 与 `-q`）。
  * `-near_lossless 0..100`：近无损像素预处理（默认 `100` 关闭；常设为 `60` 配合 `-lossless` 在肉眼难辨的前提下大幅缩减无损 WebP 体积）。
  * `-mt`：开启多线程编码。
* **源码默认配置**（[`encoder/src/libwebp/src/enc/config_enc.c`](file:///Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/libwebp/src/enc/config_enc.c)）：
  * 默认 `quality = 75`、`method = 4`、`sns_strength = 50`、`filter_strength = 60`、`segments = 4`、`use_sharp_yuv = 0`。
  * 无损预设表 `kLosslessPresets[10]` 源码映射关系：
    * `-z 0` -> `-m 0 -q 0`
    * `-z 6`（无损默认）-> `-m 4 -q 75`
    * `-z 9`（无损最高）-> `-m 6 -q 100`
* **网络与工程推荐**：
  * **有损通用高画质**：`-q 80 -m 6 -sharp_yuv -mt`（或对速度敏感时用 `-m 4`）。
  * **数学无损对比**：`-z 6 -mt`（标准无损）与 `-z 9 -mt`（极限无损）。注意无损模式下默认会清除全透明区域的 RGB 值以提升压缩率，若需严格逐字节保留透明像素 RGB 需加 `-exact`。

## 6. AVIF 编码器参数详解 (`avifenc`)

### 6.1 `avifenc -c aom`（[libavif](https://github.com/AOMediaCodec/libavif) + [libaom](https://aomedia.googlesource.com/aom/) v3.14.1）
* **文档与 CLI 选项**：
  * `-q` / `--qcolor 0..100`：色彩质量（`100` 为无损）。
  * `--qalpha 0..100`：Alpha 通道质量（默认与 `-q` 同步或独立设为更高值如 `85`~`100`）。
  * `-s` / `--speed 0..10`：速度档位，**默认 `6`**。
  * `-d` / `--depth 8|10|12`：输出位深。即使输入是 8-bit PNG，指定 `--depth 10` 也能借助 10-bit 内部变换显著减少平滑渐变区域的色彩断层 (Banding)，并在同等画质下提升压缩率。
  * `-y` / `--yuv auto|444|422|420|400`：对 PNG 输入，`auto` **默认使用 `444`**；若指定 `-y 420`，建议配合 `--sharpyuv`。
  * `-a key=value`：透传给 `libaom` 的高级参数，核心包括 `-a tune=iq` / `ssim` / `psnr`、`-a aq-mode=0..3`、`-a sharpness=0..7`、`-a enable-chroma-deltaq=1`、`-a color:qm-min=4`。
* **源码默认配置**（[`encoder/src/libavif/src/codec_aom.c`](file:///Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/libavif/src/codec_aom.c)）：
  * **All-Intra 模式与 Speed 映射**：对单张静态图，`codec_aom.c` 自动启用 `AOM_USAGE_ALL_INTRA`，并将 `-s 0..9` 映射为 `aomCpuUsed = 0..9`（`-s 0..6` 为 GoodQuality/All-Intra 核心档，`-s 7..9` 为 RealTime 快速档）。
  * **默认 `tune=iq`（Image Quality）**：从 `libaom v3.13.0+`（当前编译版本为 `v3.14.1`）起，`codec_aom.c` 对静态彩色图像**默认自动启用 `AOM_TUNE_IQ` (`tune=iq`)**，并使用源码中的分段线性查表 `tuneIqQualityToQuantizer[101]` 将 `-q 0..100` 映射为 `qp 0..63`（例如 `-q 60` 对应 `qp 30`，`-q 75` 对应 `qp 19`，`-q 85` 对应 `qp 12`）。而对 Alpha 通道则默认使用 `AOM_TUNE_PSNR` 以避免边缘振铃。
* **网络与工程推荐**：
  * **生产级黄金组合（均衡）**：`-c aom -s 6 -q 68 --depth 10 -y 444 -a tune=iq -j all`
  * **离线高画质档**：`-c aom -s 4 -q 78 --depth 10 -y 444 -a tune=iq -j all`（`-s 4` 是 `libaom` 静态图质量与耗时的甜点位；低于 `-s 3` 耗时呈指数增长但收益微乎其微）。
  * **传统 `tune=ssim` 对比档**：若想对比旧版调优，可显式传 `-a c:tune=ssim -a c:aq-mode=1 -a c:enable-chroma-deltaq=1`。

### 6.2 `avifenc -c svt`（[libavif](https://github.com/AOMediaCodec/libavif) + [SVT-AV1](https://gitlab.com/AOMediaCodec/SVT-AV1) v4.1.0）
* **文档与 CLI 选项**（[`encoder/src/SVT-AV1/Docs/Parameters.md`](file:///Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/SVT-AV1/Docs/Parameters.md)）：
  * `-s` / `--speed 0..13`：映射为 `SVT-AV1` 的 `--preset` (`enc_mode`)，`avifenc` 默认传 `6`。
  * `-y 420`：注意 `SVT-AV1` 编码器目前对静态图主要支持 `YUV420`（若不传 `-y 420`，PNG 输入默认 `auto` 会选 `444`，而部分 `SVT-AV1` 流水线或带 Alpha 通道转换在非 420 下受限，因此**评测 `avifenc -c svt` 时必须显式加 `-y 420`**）。
  * **与 aom 的色度采样不同**：本地 SVT-AV1 源码 `Source/Lib/Globals/enc_settings.c` 直接拒绝非 420 输入（`Only support 420 now`），所以基准中 `avifenc-svt` 固定 4:2:0，`avifenc-aom` 显式 `-y 444`。两者的体积与画质差异包含色度采样差异，不是同配置对比；SVT 也因此没有像素无损模式。
  * `-a tune=0..4`：`SVT-AV1 v4.1.0` 支持通过 `-a` 传入 `svt_av1_enc_parse_parameter` 参数：
    * `tune=0`：VQ（主观视频与静态图视觉质量）
    * `tune=1`：PSNR（`SVT-AV1` 内部默认）
    * `tune=2`：SSIM
    * `tune=3`：**IQ（Still Image Only，专为静态图像设计的视觉质量调优）**
    * `tune=4`：MS-SSIM
* **源码默认配置**（[`encoder/src/libavif/src/codec_svt.c`](file:///Users/yarna/Project/MoonvyRoot/products/Apps/ImageFmtBenchmark/encoder/src/libavif/src/codec_svt.c)）：
  * `codec_svt.c` 默认设置 `svt_config->aq_mode = 2`（自适应量化模式 2）、`rate_control_mode = 0` (CRF)，并将 `-q 0..100` 按公式 `((100 - quality) * 63 + 50) / 100` 线性映射为 `qp`。
  * 在 `SVT-AV1 >= 4.0.0` 下，`codec_svt.c`（第 256 行）已自动设置 `svt_config->avif = true`（启用静态图专属编码路径）。
* **网络与工程推荐**：
  * **静态图推荐组合（均衡）**：`-c svt -s 6 -q 70 --depth 10 -y 420 -a tune=3 -j all`
  * **高速批量编码**：`-c svt -s 8 -q 70 --depth 10 -y 420 -a tune=3 -j all`
  * **高画质静态图**：`-c svt -s 4 -q 80 --depth 10 -y 420 -a tune=3 -j all`

## 7. 横向基准评测（Benchmark）公平对比建议

在搭建统一图像格式基准测试时，为了避免因单一固定参数导致的偏差，建议按以下两个维度设计测试矩阵：

1. **无损压缩组（Lossless Track）**：
   * 固定输出为**数学无损**，对比 `encode_ms`（编码耗时）、`decode_ms`（解码耗时）与**压缩率（输出字节 / 原始像素字节）**：
     * `png-libpng`：`-l 1 -f 0`、`-l 6 -f 5`、`-l 9 -f 5`
     * `png-libpng-zlibng`：`-l 1 -f 0`、`-l 6 -f 5`、`-l 9 -f 5`
     * `png-libspng`：`-l 1 -f 0`、`-l 6 -f 5`、`-l 9 -f 5`
     * `oxipng`：`-o 0 --strip safe`、`-o 2 --strip safe`、`-o 4 --strip safe`（另可单列 `-o 2 --strip safe -a` 观察透明通道优化收益）
     * `cjxl`：`-d 0.0 -e 3`、`-d 0.0 -e 7`、`-d 0.0 -e 9`
     * `cwebp`：`-z 3 -mt`、`-z 6 -mt`、`-z 9 -mt`
     * `avifenc -c aom`：`-c aom -l -s 6 -j all`
2. **有损率失真曲线组（Lossy Rate-Distortion Track）**：
   * 由于不同编码器的 `-q` 标度并不等价（例如 `cjxl -q 75`、`cjpegli -q 75`、`cwebp -q 75`、`avifenc -q 75` 的实际压缩率与画质差距极大），业界标准做法（如 [Codec Compare](https://github.com/webmproject/codec-compare) 与 [JPEG XL 官方评测](https://jpegxl.info/)）是**在每个编码器推荐的“均衡生产档”与“高画质慢速档”下，扫描 4~5 个质量梯度**，随后使用已编译的 `ssimulacra2` 和 `butteraugli_main` 计算客观感知得分，绘制 **BPP（每像素比特数 / 文件大小）vs. SSIMULACRA2 / Butteraugli / 编码耗时** 的帕累托前沿曲线：
     * **中低码率档（目标 SSIMULACRA2 ≈ 65~72）**：`cjpeg-turbo -quality 65`、`cjpeg-mozjpeg -quality 68`、`cjpegli -q 72`、`cwebp -q 68`、`cjxl -d 2.5`、`avifenc -c aom -q 55`、`avifenc -c svt -q 58`
     * **Web 主流视觉良好档（目标 SSIMULACRA2 ≈ 78~82）**：`cjpeg-turbo -quality 80`、`cjpeg-mozjpeg -quality 80`、`cjpegli -q 82`、`cwebp -q 80`、`cjxl -d 1.5`、`avifenc -c aom -q 68`、`avifenc -c svt -q 70`
     * **视觉无损高画质档（目标 SSIMULACRA2 ≈ 88~92，Butteraugli ≈ 1.0）**：`cjpeg-turbo -quality 92 -sample 1x1`、`cjpeg-mozjpeg -quality 90 -sample 1x1`、`cjpegli -d 1.0 --chroma_subsampling=444`、`cwebp -q 90 -sharp_yuv`、`cjxl -d 1.0`、`avifenc -c aom -q 80 -y 444`、`avifenc -c svt -q 82 -y 420`
