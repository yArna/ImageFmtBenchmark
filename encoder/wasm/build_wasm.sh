#!/usr/bin/env bash
# ImageFmtBenchmark — 把 encoder/src 下的 11 款编码器编译成 WebAssembly
#
# 用法：
#   ./build_wasm.sh                 # 全量构建
#   ./build_wasm.sh png webp jpeg   # 只构建指定分组（png / jpeg / webp / jxl / avif）
#   ./build_wasm.sh clean           # 清理构建目录
#
# 依赖：emscripten（emcc）、cmake、ninja、cargo（oxipng）
# 产物：web/public/wasm/<encoder>.{js,wasm}

set -uo pipefail

WASM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$WASM_DIR/../.." && pwd)"
SRC_DIR="$ROOT_DIR/encoder/src"
BUILD_DIR="$WASM_DIR/build"
OUT_DIR="$ROOT_DIR/web/public/wasm"
SRC="$WASM_DIR/src"
LOG="$BUILD_DIR/.last.log"

EMSDK_DIR="${EMSDK:-$HOME/.emsdk}"
if [ -f "$EMSDK_DIR/emsdk_env.sh" ]; then
  # shellcheck disable=SC1091
  source "$EMSDK_DIR/emsdk_env.sh" >/dev/null 2>&1 || true
fi

if ! command -v emcc >/dev/null 2>&1; then
  echo "错误：找不到 emcc。请先安装 emscripten 并 source emsdk_env.sh" >&2
  exit 1
fi

JOBS="$(sysctl -n hw.ncpu 2>/dev/null || echo 8)"
TOOLCHAIN="$EMSDK_DIR/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake"
LLVM_AR="$EMSDK_DIR/upstream/bin/llvm-ar"
[ -x "$LLVM_AR" ] || LLVM_AR="$(command -v llvm-ar || echo ar)"

mkdir -p "$BUILD_DIR" "$OUT_DIR"

# 把 emscripten 的 sysroot 缓存放在工程内，避免写用户目录（也便于清理）
export EM_CACHE="$BUILD_DIR/emcache"
export PYTHONDONTWRITEBYTECODE=1

EXPORTED_FUNCS="_ifb_alloc,_ifb_free_ptr,_ifb_encode,_ifb_out_ptr,_ifb_out_len,_ifb_out_free,_ifb_error,_ifb_version,_malloc,_free"
RUNTIME_METHODS="HEAPU8,HEAPU32,UTF8ToString,stringToUTF8,lengthBytesUTF8"

emflags() {
  local name="$1"
  shift
  echo "-sMODULARIZE=1 -sEXPORT_ES6=0 -sEXPORT_NAME=$name \
-sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=2147483648 \
-sSTACK_SIZE=1048576 \
-sENVIRONMENT=web,worker -sASSERTIONS=0 \
-sEXPORTED_FUNCTIONS=$EXPORTED_FUNCS \
-sEXPORTED_RUNTIME_METHODS=$RUNTIME_METHODS \
-sINCOMING_MODULE_JS_API=locateFile,wasmBinary \
$*"
}

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[跳过] %s\033[0m\n' "$*"; }

# 统一执行并保留日志，失败时打印末尾若干行
run() {
  local label="$1"
  shift
  if ! "$@" >"$LOG" 2>&1; then
    printf '\033[1;31m✗ %s 失败\033[0m\n' "$label"
    tail -25 "$LOG" | sed 's/^/    /'
    return 1
  fi
  return 0
}

cm() { emcmake cmake "$@"; }

# ---------------------------------------------------------------- zlib
build_zlib() {
  local prefix="$BUILD_DIR/prefix/zlib"
  [ -f "$prefix/lib/libz.a" ] && return 0
  log "构建 zlib (wasm)"
  run "zlib configure" cm "$SRC_DIR/zlib" -B "$BUILD_DIR/zlib" -G Ninja \
    -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX="$prefix" \
    -DCMAKE_C_FLAGS="-DHAVE_UNISTD_H=1 -DHAVE_STDARG_H=1" \
    -DZLIB_BUILD_EXAMPLES=OFF -DZLIB_BUILD_SHARED=OFF || return 1
  run "zlib build" cmake --build "$BUILD_DIR/zlib" -j "$JOBS" || return 1
  run "zlib install" cmake --install "$BUILD_DIR/zlib" || return 1
}

# ---------------------------------------------------------------- libpng (+zlib)
build_png_libpng() {
  build_zlib || return 1
  # libpng 的 git 快照里没有 pnglibconf.h.prebuilt（发布包才会带），
  # 用仓库里已有的 pnglibconf.h 顶替，否则 ninja 会在 symbols.out 处卡住
  local prebuilt="$SRC_DIR/libpng/pnglibconf.h.prebuilt"
  if [ ! -f "$prebuilt" ] && [ -f "$SRC_DIR/libpng/pnglibconf.h" ]; then
    cp "$SRC_DIR/libpng/pnglibconf.h" "$prebuilt"
  fi
  local prefix="$BUILD_DIR/prefix/zlib"
  log "构建 libpng (wasm, 标准 zlib)"
  run "libpng configure" cm "$SRC_DIR/libpng" -B "$BUILD_DIR/libpng-std" -G Ninja \
    -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN" \
    -DCMAKE_BUILD_TYPE=Release \
    -DPNG_SHARED=OFF -DPNG_STATIC=ON -DPNG_TESTS=OFF -DPNG_TOOLS=OFF \
    -DPNG_FRAMEWORK=OFF -DPNG_EXECUTABLES=OFF \
    -DZLIB_INCLUDE_DIR="$prefix/include" -DZLIB_LIBRARY="$prefix/lib/libz.a" || return 1
  run "libpng build" cmake --build "$BUILD_DIR/libpng-std" -j "$JOBS" || return 1

  log "链接 png-libpng.wasm"
  run "png-libpng link" emcc "$SRC/png_libpng.c" -O3 -DNDEBUG \
    -I"$SRC" -I"$BUILD_DIR/libpng-std" -I"$prefix/include" -I"$SRC_DIR/libpng" \
    "$BUILD_DIR/libpng-std/libpng18.a" "$prefix/lib/libz.a" \
    $(emflags ifb_png_libpng) \
    -o "$OUT_DIR/png-libpng.js" || return 1
}

# ---------------------------------------------------------------- libpng + zlib-ng
build_png_libpng_zlibng() {
  local prefix="$BUILD_DIR/prefix/zlibng"
  if [ ! -f "$prefix/lib/libz.a" ]; then
    log "构建 zlib-ng (wasm, zlib-compat)"
    run "zlib-ng configure" cm "$SRC_DIR/zlib-ng" -B "$BUILD_DIR/zlib-ng" -G Ninja \
      -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN" \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_INSTALL_PREFIX="$prefix" \
      -DCMAKE_C_FLAGS="-DHAVE_UNISTD_H=1 -DHAVE_STDARG_H=1" \
      -DZLIB_COMPAT=ON -DZLIB_ENABLE_TESTS=OFF -DWITH_GTEST=OFF \
      -DWITH_BENCHMARKS=OFF -DWITH_RUNTIME_CPU_DETECTION=OFF \
      -DWITH_OPTIM=OFF -DBUILD_SHARED_LIBS=OFF || return 1
    # utils/ 下的示例程序依赖 unistd，wasm 下没必要编译，只构建静态库
    run "zlib-ng build" cmake --build "$BUILD_DIR/zlib-ng" -j "$JOBS" --target libz.a || return 1
  fi
  # 头文件每次都同步：zlib-ng 的 zconf.h 会 include zlib_name_mangling.h
  mkdir -p "$prefix/lib" "$prefix/include"
  cp "$BUILD_DIR/zlib-ng/libz.a" "$prefix/lib/" || return 1
  cp "$BUILD_DIR/zlib-ng/zlib.h" "$BUILD_DIR/zlib-ng/zconf.h" \
     "$BUILD_DIR/zlib-ng/zlib_name_mangling.h" "$prefix/include/" || return 1

  log "构建 libpng (wasm, zlib-ng)"
  run "libpng-ng configure" cm "$SRC_DIR/libpng" -B "$BUILD_DIR/libpng-ng" -G Ninja \
    -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN" \
    -DCMAKE_BUILD_TYPE=Release \
    -DPNG_SHARED=OFF -DPNG_STATIC=ON -DPNG_TESTS=OFF -DPNG_TOOLS=OFF \
    -DPNG_FRAMEWORK=OFF -DPNG_EXECUTABLES=OFF \
    -DZLIB_INCLUDE_DIR="$prefix/include" -DZLIB_LIBRARY="$prefix/lib/libz.a" || return 1
  run "libpng-ng build" cmake --build "$BUILD_DIR/libpng-ng" -j "$JOBS" || return 1

  log "链接 png-libpng-zlibng.wasm"
  run "png-libpng-zlibng link" emcc "$SRC/png_libpng.c" -O3 -DNDEBUG -DIFB_TOOL_NAME='"png-libpng-zlibng"' \
    -I"$SRC" -I"$BUILD_DIR/libpng-ng" -I"$prefix/include" -I"$SRC_DIR/libpng" \
    "$BUILD_DIR/libpng-ng/libpng18.a" "$prefix/lib/libz.a" \
    $(emflags ifb_png_libpng_zlibng) \
    -o "$OUT_DIR/png-libpng-zlibng.js" || return 1
}

# ---------------------------------------------------------------- libspng
build_png_libspng() {
  build_zlib || return 1
  local prefix="$BUILD_DIR/prefix/zlib"
  log "构建 libspng (wasm)"
  run "libspng configure" cm "$SRC_DIR/libspng" -B "$BUILD_DIR/libspng" -G Ninja \
    -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN" \
    -DCMAKE_BUILD_TYPE=Release \
    -DSPNG_SHARED=OFF -DSPNG_STATIC=ON -DSPNG_TESTS=OFF -DSPNG_EXAMPLES=OFF \
    -DBUILD_SHARED_LIBS=OFF \
    -DZLIB_INCLUDE_DIR="$prefix/include" -DZLIB_LIBRARY="$prefix/lib/libz.a" || return 1
  run "libspng build" cmake --build "$BUILD_DIR/libspng" -j "$JOBS" || return 1

  log "链接 png-libspng.wasm"
  run "png-libspng link" emcc "$SRC/png_spng.c" -O3 -DNDEBUG \
    -I"$SRC" -I"$prefix/include" -I"$SRC_DIR/libspng/spng" \
    "$BUILD_DIR/libspng/libspng_static.a" "$prefix/lib/libz.a" \
    $(emflags ifb_png_libspng) \
    -o "$OUT_DIR/png-libspng.js" || return 1
}

# ---------------------------------------------------------------- libjpeg-turbo
build_jpeg_turbo() {
  log "构建 libjpeg-turbo (wasm)"
  run "libjpeg-turbo configure" cm "$SRC_DIR/libjpeg-turbo" -B "$BUILD_DIR/jpeg-turbo" -G Ninja \
    -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN" \
    -DCMAKE_BUILD_TYPE=Release \
    -DENABLE_SHARED=OFF -DENABLE_STATIC=ON -DWITH_SIMD=OFF \
    -DWITH_TURBOJPEG=OFF -DWITH_JAVA=OFF -DWITH_TOOLS=OFF \
    -DCMAKE_POLICY_VERSION_MINIMUM=3.5 || return 1
  run "libjpeg-turbo build" cmake --build "$BUILD_DIR/jpeg-turbo" -j "$JOBS" || return 1

  log "链接 cjpeg-turbo.wasm"
  run "cjpeg-turbo link" emcc "$SRC/jpeg.c" -O3 -DNDEBUG \
    -I"$SRC" -I"$BUILD_DIR/jpeg-turbo" -I"$SRC_DIR/libjpeg-turbo/src" \
    "$BUILD_DIR/jpeg-turbo/libjpeg.a" \
    $(emflags ifb_cjpeg_turbo) \
    -o "$OUT_DIR/cjpeg-turbo.js" || return 1
}

# ---------------------------------------------------------------- mozjpeg
build_mozjpeg() {
  log "构建 mozjpeg (wasm)"
  run "mozjpeg configure" cm "$SRC_DIR/mozjpeg" -B "$BUILD_DIR/mozjpeg" -G Ninja \
    -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN" \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_SHARED_LIBS=OFF -DWITH_SIMD=OFF \
    -DWITH_TURBOJPEG=OFF -DWITH_JAVA=OFF -DPNG_SUPPORTED=0 \
    -DCMAKE_POLICY_VERSION_MINIMUM=3.5 || return 1
  # mozjpeg 的 CMakeLists 里没有 WITH_TOOLS 开关，工具链总会编译；
  # 只构建 jpeg-static（输出 libjpeg.a）即可，工具链的链接在 wasm 下也会失败
  run "mozjpeg build" cmake --build "$BUILD_DIR/mozjpeg" -j "$JOBS" --target jpeg-static || return 1

  log "链接 cjpeg-mozjpeg.wasm"
  run "cjpeg-mozjpeg link" emcc "$SRC/jpeg.c" -O3 -DNDEBUG -DIFB_MOZJPEG \
    -I"$SRC" -I"$BUILD_DIR/mozjpeg" -I"$SRC_DIR/mozjpeg" \
    "$BUILD_DIR/mozjpeg/libjpeg.a" \
    $(emflags ifb_cjpeg_mozjpeg) \
    -o "$OUT_DIR/cjpeg-mozjpeg.js" || return 1
}

# ---------------------------------------------------------------- jpegli
build_jpegli() {
  log "构建 jpegli (wasm)"
  run "jpegli configure" cm "$SRC_DIR/jpegli" -B "$BUILD_DIR/jpegli" -G Ninja \
    -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN" \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_TESTING=OFF -DJPEGLI_ENABLE_TOOLS=OFF -DJPEGLI_ENABLE_BENCHMARK=OFF \
    -DJPEGLI_ENABLE_MANPAGES=OFF -DJPEGLI_ENABLE_JNI=OFF \
    -DJPEGLI_ENABLE_SJPEG=OFF -DJPEGLI_ENABLE_OPENEXR=OFF \
    -DJPEGLI_ENABLE_SKCMS=ON -DJPEGLI_ENABLE_PLUGINS=OFF \
    -DJPEGLI_BUNDLE_LIBPNG=OFF -DJPEGLI_BUNDLE_ZLIB=OFF \
    -DCMAKE_POLICY_VERSION_MINIMUM=3.5 || return 1
  run "jpegli build" cmake --build "$BUILD_DIR/jpegli" -j "$JOBS" --target jpegli-static || return 1

  log "链接 cjpegli.wasm"
  run "cjpegli link" em++ "$SRC/jpegli_wrap.cc" -O3 -DNDEBUG -std=c++17 \
    -I"$SRC" -I"$SRC_DIR/jpegli" -I"$BUILD_DIR/jpegli/lib/include" \
    -I"$BUILD_DIR/jpegli/lib/include/jpegli" \
    "$BUILD_DIR/jpegli/lib/libjpegli-static.a" \
    "$BUILD_DIR/jpegli/third_party/highway/libhwy.a" \
    $(emflags ifb_cjpegli) \
    -o "$OUT_DIR/cjpegli.js" || return 1
}

# ---------------------------------------------------------------- libwebp
build_webp() {
  log "构建 libwebp (wasm)"
  run "libwebp configure" cm "$SRC_DIR/libwebp" -B "$BUILD_DIR/libwebp" -G Ninja \
    -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN" \
    -DCMAKE_BUILD_TYPE=Release \
    -DWEBP_BUILD_ANIM_UTILS=OFF -DWEBP_BUILD_CWEBP=OFF -DWEBP_BUILD_DWEBP=OFF \
    -DWEBP_BUILD_GIF2WEBP=OFF -DWEBP_BUILD_IMG2WEBP=OFF -DWEBP_BUILD_VWEBP=OFF \
    -DWEBP_BUILD_WEBPINFO=OFF -DWEBP_BUILD_WEBPMUX=OFF -DWEBP_BUILD_EXTRAS=OFF \
    -DWEBP_BUILD_LIBWEBPMUX=OFF -DWEBP_ENABLE_SIMD=OFF -DBUILD_SHARED_LIBS=OFF \
    -DCMAKE_POLICY_VERSION_MINIMUM=3.5 || return 1
  run "libwebp build" cmake --build "$BUILD_DIR/libwebp" -j "$JOBS" --target webp sharpyuv || return 1

  log "链接 cwebp.wasm"
  run "cwebp link" emcc "$SRC/webp.c" -O3 -DNDEBUG \
    -I"$SRC" -I"$SRC_DIR/libwebp/src" \
    "$BUILD_DIR/libwebp/libwebp.a" "$BUILD_DIR/libwebp/libsharpyuv.a" \
    $(emflags ifb_cwebp) \
    -o "$OUT_DIR/cwebp.js" || return 1
}

# ---------------------------------------------------------------- libjxl
build_jxl() {
  log "构建 libjxl (wasm)"
  run "libjxl configure" cm "$SRC_DIR/libjxl" -B "$BUILD_DIR/libjxl" -G Ninja \
    -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN" \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_TESTING=OFF \
    -DJPEGXL_ENABLE_TOOLS=OFF -DJPEGXL_ENABLE_DEVTOOLS=OFF \
    -DJPEGXL_ENABLE_BENCHMARK=OFF -DJPEGXL_ENABLE_EXAMPLES=OFF \
    -DJPEGXL_ENABLE_MANPAGES=OFF -DJPEGXL_ENABLE_JNI=OFF \
    -DJPEGXL_ENABLE_SJPEG=OFF -DJPEGXL_ENABLE_OPENEXR=OFF \
    -DJPEGXL_ENABLE_SKCMS=ON -DJPEGXL_ENABLE_PLUGINS=OFF \
    -DJPEGXL_ENABLE_DOXYGEN=OFF -DJPEGXL_ENABLE_FUZZERS=OFF \
    -DJPEGXL_BUNDLE_LIBPNG=OFF -DJPEGXL_BUNDLE_SKCMS=ON \
    -DCMAKE_POLICY_VERSION_MINIMUM=3.5 || return 1
  run "libjxl build" cmake --build "$BUILD_DIR/libjxl" -j "$JOBS" --target jxl-internal jxl_dec-internal || return 1

  # jxl_cms（skcms 色彩管理）是 OBJECT 库，不会被归档进 libjxl-internal.a，需要单独链接
  local cms_objs
  cms_objs=$(find "$BUILD_DIR/libjxl/lib/CMakeFiles/jxl_cms.dir" -name '*.o' | tr '\n' ' ')
  if [ -z "$cms_objs" ]; then
    printf '\033[1;31m✗ 找不到 jxl_cms 目标文件\033[0m\n'
    return 1
  fi

  log "链接 cjxl.wasm (含解码)"
  run "cjxl link" em++ "$SRC/jxl.cc" -O3 -DNDEBUG -std=c++17 \
    -I"$SRC" -I"$SRC_DIR/libjxl/lib/include" -I"$BUILD_DIR/libjxl/lib/include" \
    "$BUILD_DIR/libjxl/lib/libjxl-internal.a" \
    "$BUILD_DIR/libjxl/lib/libjxl_dec-internal.a" \
    $cms_objs \
    "$BUILD_DIR/libjxl/third_party/brotli/libbrotlienc.a" \
    "$BUILD_DIR/libjxl/third_party/brotli/libbrotlidec.a" \
    "$BUILD_DIR/libjxl/third_party/brotli/libbrotlicommon.a" \
    "$BUILD_DIR/libjxl/third_party/highway/libhwy.a" \
    -sEXPORTED_FUNCTIONS="$EXPORTED_FUNCS,_ifb_decode,_ifb_dec_ptr,_ifb_dec_w,_ifb_dec_h,_ifb_dec_channels" \
    $(emflags ifb_cjxl | sed "s#-sEXPORTED_FUNCTIONS=[^ ]*##") \
    -o "$OUT_DIR/cjxl.js" || return 1
}

# ---------------------------------------------------------------- libaom
build_aom() {
  local prefix="$BUILD_DIR/prefix/aom"
  if [ ! -f "$prefix/lib/libaom.a" ]; then
    log "构建 libaom (wasm, generic 单线程)"
    run "aom configure" cm "$SRC_DIR/aom" -B "$BUILD_DIR/aom" -G Ninja \
      -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN" \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_INSTALL_PREFIX="$prefix" \
      -DAOM_TARGET_CPU=generic \
      -DCONFIG_AV1_ENCODER=1 -DCONFIG_AV1_DECODER=0 \
      -DCONFIG_MULTITHREAD=0 -DCONFIG_PIC=1 \
      -DENABLE_TESTS=0 -DENABLE_EXAMPLES=0 -DENABLE_TOOLS=0 -DENABLE_DOCS=0 \
      -DENABLE_NASM=0 -DBUILD_SHARED_LIBS=0 \
      -DCMAKE_POLICY_VERSION_MINIMUM=3.5 || return 1
    run "aom build" cmake --build "$BUILD_DIR/aom" -j "$JOBS" || return 1
    run "aom install" cmake --install "$BUILD_DIR/aom" || return 1
  fi

  # libaom 安装的 config 叫 AOMConfig.cmake（变量是 AOM_FOUND），
  # 而 libavif 用 find_package(aom) 并检查 aom_FOUND，这里补一层小写别名。
  local cfg_dir="$prefix/lib/cmake/aom"
  if [ -d "$cfg_dir" ] && [ ! -f "$cfg_dir/aom-config.cmake" ]; then
    cat >"$cfg_dir/aom-config.cmake" <<'EOF'
# 仅转发到官方 AOMConfig.cmake；<pkg>_FOUND 由 CMake 在 config 模式成功时自动置位
include("${CMAKE_CURRENT_LIST_DIR}/AOMConfig.cmake")
set(aom_VERSION "${AOM_VERSION}")
EOF
  fi
}

# ---------------------------------------------------------------- libavif + aom
build_avif_aom() {
  build_aom || return 1
  local prefix="$BUILD_DIR/prefix/aom"
  log "构建 libavif (wasm, aom)"
  run "libavif configure" cm "$SRC_DIR/libavif" -B "$BUILD_DIR/libavif-aom" -G Ninja \
    -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_PREFIX_PATH="$prefix" \
    -DCMAKE_FIND_ROOT_PATH_MODE_PACKAGE=BOTH \
    -DCMAKE_FIND_ROOT_PATH_MODE_LIBRARY=BOTH \
    -DCMAKE_FIND_ROOT_PATH_MODE_INCLUDE=BOTH \
    -DAVIF_CODEC_AOM=SYSTEM -DAVIF_CODEC_AOM_DECODE=OFF \
    -DAVIF_CODEC_DAV1D=OFF -DAVIF_CODEC_RAV1E=OFF \
    -DAVIF_CODEC_SVT=OFF -DAVIF_CODEC_LIBGAV1=OFF -DAVIF_CODEC_FFMPEG=OFF \
    -DAVIF_LIBYUV=OFF -DAVIF_ENABLE_WERROR=OFF \
    -DAVIF_BUILD_APPS=OFF -DAVIF_BUILD_TESTS=OFF -DAVIF_BUILD_EXAMPLES=OFF \
    -DBUILD_SHARED_LIBS=OFF \
    -DCMAKE_POLICY_VERSION_MINIMUM=3.5 || return 1
  run "libavif build" cmake --build "$BUILD_DIR/libavif-aom" -j "$JOBS" || return 1

  log "链接 avifenc-aom.wasm"
  run "avifenc-aom link" emcc "$SRC/avif.c" -O3 -DNDEBUG -DIFB_AVIF_CODEC_AOM=1 \
    -I"$SRC" -I"$SRC_DIR/libavif/include" \
    "$BUILD_DIR/libavif-aom/libavif.a" "$prefix/lib/libaom.a" \
    $(emflags ifb_avif_aom) \
    -o "$OUT_DIR/avifenc-aom.js" || return 1
}

# ---------------------------------------------------------------- oxipng (Rust)
build_oxipng() {
  log "构建 oxipng (wasm32-unknown-unknown)"
  if ! rustup target list --installed | grep -q wasm32-unknown-unknown; then
    run "rustup target add" rustup target add wasm32-unknown-unknown || return 1
  fi

  # macOS 自带的 ar/ranlib 会为 wasm 目标产出坏档（"not a mach-o file"），
  # 必须让 cc crate 使用 LLVM 的 ar/ranlib。
  export AR_wasm32_unknown_unknown="$LLVM_AR"
  export RANLIB_wasm32_unknown_unknown="$EMSDK_DIR/upstream/bin/llvm-ranlib"
  [ -x "$RANLIB_wasm32_unknown_unknown" ] || unset RANLIB_wasm32_unknown_unknown

  (
    cd "$WASM_DIR/oxipng-wasm" || exit 1
    cargo clean -p libdeflate-sys >/dev/null 2>&1
    cargo build --release --target wasm32-unknown-unknown
  ) >"$LOG" 2>&1 || {
    printf '\033[1;31m✗ oxipng 构建失败\033[0m\n'; tail -25 "$LOG" | sed 's/^/    /'; return 1
  }

  cp "$WASM_DIR/oxipng-wasm/target/wasm32-unknown-unknown/release/ifb_oxipng_wasm.wasm" \
     "$OUT_DIR/oxipng.wasm" || return 1
}

# ---------------------------------------------------------------- 分发
run_group() {
  case "$1" in
    png)    build_png_libpng; build_png_libpng_zlibng; build_png_libspng; build_oxipng ;;
    jpeg)   build_jpeg_turbo; build_mozjpeg; build_jpegli ;;
    webp)   build_webp ;;
    jxl)    build_jxl ;;
    avif)   build_avif_aom ;;
    all)    run_group png; run_group jpeg; run_group webp; run_group jxl; run_group avif ;;
    *)      echo "未知分组: $1" >&2; return 1 ;;
  esac
}

if [ "${1:-}" = "clean" ]; then
  rm -rf "$BUILD_DIR" "$WASM_DIR/oxipng-wasm/target"
  echo "已清理构建目录"
  exit 0
fi

if [ $# -eq 0 ]; then
  set -- all
fi

FAILED=()
for group in "$@"; do
  if ! run_group "$group"; then
    FAILED+=("$group")
  fi
done

echo
if [ ${#FAILED[@]} -gt 0 ]; then
  printf '\033[1;31m构建失败的分组: %s\033[0m\n' "${FAILED[*]}"
  exit 1
fi

log "构建完成，产物位于 $OUT_DIR"
ls -lh "$OUT_DIR" | sed 's/^/  /'
