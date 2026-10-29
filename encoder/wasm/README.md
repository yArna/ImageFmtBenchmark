# WASM 在线编码器

把 `encoder/src` 下的 10 个编码器内核编译成 WebAssembly，供网页「06 在线编码」视图在浏览器本地完成图片编码（不上传服务器）。

## 产物

全部输出到 `web/public/wasm/`：

| 编码器 | 文件 | 输入 | 内核 |
| --- | --- | --- | --- |
| libpng + zlib | `png-libpng.{js,wasm}` | RGBA | libpng 1.8 + zlib 1.3.2 |
| libpng + zlib-ng | `png-libpng-zlibng.{js,wasm}` | RGBA | libpng 1.8 + zlib-ng (zlib-compat) |
| libspng | `png-libspng.{js,wasm}` | RGBA | libspng 0.7.4 + zlib |
| oxipng | `oxipng.wasm`（裸 wasm） | PNG 字节 | oxipng 10.x（Rust，无损重压缩） |
| libjpeg-turbo | `cjpeg-turbo.{js,wasm}` | RGBA | libjpeg-turbo |
| MozJPEG | `cjpeg-mozjpeg.{js,wasm}` | RGBA | mozjpeg（trellis + 扫描搜索） |
| Jpegli | `cjpegli.{js,wasm}` | RGBA | jpegli（XYB 可选） |
| libjxl | `cjxl.{js,wasm}` | RGBA | libjxl 0.13（编码 + 解码预览） |
| libwebp | `cwebp.{js,wasm}` | RGBA | libwebp 1.6 |
| libavif + libaom | `avifenc-aom.{js,wasm}` | RGBA | libavif 1.4 + libaom 3.15（generic，单线程） |

SVT-AV1 依赖 pthreads / SharedArrayBuffer，需要 COOP/COEP 跨源隔离头，静态托管场景不可用，因此没有提供 WASM 版。

## 构建

```bash
source ~/.emsdk/emsdk_env.sh      # 需要 emcc / emcmake
cd encoder/wasm
./build_wasm.sh                   # 全量
./build_wasm.sh png jpeg          # 只构建指定分组：png / jpeg / webp / jxl / avif
./build_wasm.sh clean             # 清理 build/ 与 oxipng 的 target/
```

依赖：emscripten（emcc）、cmake ≥ 3.20、ninja、cargo + `wasm32-unknown-unknown` target。

构建目录：`encoder/wasm/build/`（各组 cmake 构建树 + `prefix/` 安装前缀 + emscripten 缓存 `emcache/`）。

### 需要注意的坑

- **libpng**：仓库里的 libpng 是 git 快照，缺 `pnglibconf.h.prebuilt`，脚本会用同目录的 `pnglibconf.h` 补一份。
- **zlib-ng**：`utils/` 下的示例依赖 unistd，wasm 下不编译，只构建 `libz.a` 目标；`zconf.h` 会 include `zlib_name_mangling.h`，安装头文件时要一起拷。
- **oxipng**：macOS 自带 `ar` 会为 wasm 目标产出坏档，脚本显式指定 emsdk 的 `llvm-ar` / `llvm-ranlib`。
- **jpegli / libjxl**：需要 `third_party/highway`、`skcms`（jpegli 还要 `skcms`；libjxl 还要 `brotli`）。skcms 的代码在仓库的 `mirror` 分支上，不在 `main`。
- **libavif**：emsdk 的工具链把 `CMAKE_FIND_ROOT_PATH_MODE_PACKAGE` 设为 `ONLY`，找不到 `prefix/aom` 里的 config，需要显式改成 `BOTH`；另外 aom 安装的 config 叫 `AOMConfig.cmake`，而 libavif 用 `find_package(aom)`，脚本会补一个 `aom-config.cmake` 别名。
- **栈**：默认 64KB 栈会被 libjxl 的 64KB 输出缓冲撑爆，统一 `-sSTACK_SIZE=1048576`。

## 统一 C ABI

所有模块导出同一组符号（见 `src/ifb_api.h`）：

```c
uint8_t *ifb_alloc(int size);
void     ifb_free_ptr(uint8_t *p, int size);
int      ifb_encode(const uint8_t *in, int len, int w, int h, const char *opts);
const uint8_t *ifb_out_ptr(void);
int      ifb_out_len(void);
void     ifb_out_free(void);
const char *ifb_error(void);
const char *ifb_version(void);
```

`opts` 是 `k=v&k2=v2` 形式的查询串，各编码器自行解析（`src/ifb_api.h` 里的 `ifb_param_int` / `ifb_param_flag` 等）。

`cjxl` 额外导出解码接口，供浏览器预览 JXL（Chrome 不支持原生解码）：

```c
int      ifb_decode(const uint8_t *data, int len);
const uint8_t *ifb_dec_ptr(void);
int      ifb_dec_w(void);
int      ifb_dec_h(void);
int      ifb_dec_channels(void);
```

## 网页侧

- `web/src/wasm/codecWasm.ts`：编码器元数据（名称、参数定义、mime、工厂函数名）+ 统一的加载 / 编码调用。emscripten 模块用 `-sMODULARIZE=1 -sEXPORT_NAME=ifb_xxx`，通过 `window.ifb_xxx()` 拿到实例；oxipng 是裸 wasm，手写了一份最小绑定。
- `web/src/components/OnlineEncoder.vue`：06 视图本体 —— 拖拽/选择图片、选编码器、调参数、编码、AB 分割对比、下载结果。

新增编码器的步骤：在 `build_wasm.sh` 里加一个 `build_xxx()` 并在 `run_group` 注册，然后往 `WASM_ENCODERS` 里加一条定义即可，网页侧不需要别的改动。
