/**
 * 在线编码器（WASM）统一加载与调用层。
 *
 * 所有编码器模块由 `encoder/wasm/build_wasm.sh` 编译产出，导出同一套 C ABI：
 *   ifb_alloc / ifb_free_ptr / ifb_encode / ifb_out_ptr / ifb_out_len / ifb_out_free / ifb_error
 * 因此这里只需要一份加载逻辑，就能驱动全部编码器。
 */

export type WasmFormat = 'PNG' | 'JPEG' | 'JPEG XL' | 'WebP' | 'AVIF';

export interface WasmParamOption {
  value: number | string;
  label: string;
}

/** 参数取值；null 表示「默认（不指定）」，编码时不传该键，由编码器封装自行决定 */
export type WasmParamValue = number | string | boolean | null;

export interface WasmParamDef {
  key: string;
  label: string;
  /** range：滑块；select：下拉；toggle：开关 */
  type: 'range' | 'select' | 'toggle';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: WasmParamOption[];
  /** 界面预设值，「恢复默认」与取消「不指定」时使用 */
  default: number | string | boolean;
  /** 固定为界面预设值、不允许修改（编码器封装不支持关闭等情况） */
  locked?: boolean;
  /** 不指定时编码器实际采用的值（来自 encoder/wasm/src 各封装的缺省回退），仅用于展示 */
  implicit?: string;
  hint?: string;
}

export interface WasmEncoderDef {
  id: string;
  /** 侧栏/标题中展示的名称 */
  displayName: string;
  format: WasmFormat;
  /** 该编码器内核的一句话说明 */
  kernel: string;
  mime: string;
  ext: string;
  /** 全局工厂函数名（emcc -sEXPORT_NAME） */
  factory: string;
  /** web/public/wasm 下的 js 文件名 */
  file: string;
  /** rgba：直接喂像素；png：先编码成 PNG 字节（oxipng 这类重压缩器） */
  inputKind: 'rgba' | 'png';
  /** 是否自带解码器（JXL 浏览器不支持预览） */
  hasDecoder?: boolean;
  params: WasmParamDef[];
}

const SUBSAMPLE_OPTIONS: WasmParamOption[] = [
  { value: 0, label: '4:2:0（最小体积）' },
  { value: 1, label: '4:2:2' },
  { value: 2, label: '4:4:4（无色度抽样）' },
  { value: 3, label: '4:4:0' },
];

const PNG_LEVEL_HINT = '0 不压缩 / 1 最快 / 6 默认 / 9 最高压缩';
const PNG_FILTER_OPTIONS: WasmParamOption[] = [
  { value: 0, label: '0 None' },
  { value: 1, label: '1 Sub' },
  { value: 2, label: '2 Up' },
  { value: 3, label: '3 Avg' },
  { value: 4, label: '4 Paeth' },
  { value: 5, label: '5 自适应全滤波' },
];

function pngParams(): WasmParamDef[] {
  return [
    { key: 'effort', label: '压缩级别 -l', type: 'range', min: 0, max: 9, step: 1, default: 6, implicit: '6', hint: PNG_LEVEL_HINT },
    { key: 'filter', label: '行滤波 -f', type: 'select', options: PNG_FILTER_OPTIONS, default: 5, implicit: '5 自适应全滤波' },
  ];
}

export const WASM_ENCODERS: WasmEncoderDef[] = [
  {
    id: 'png-libpng',
    displayName: 'libpng + zlib',
    format: 'PNG',
    kernel: 'libpng 1.8 + 标准 zlib',
    mime: 'image/png',
    ext: 'png',
    factory: 'ifb_png_libpng',
    file: 'png-libpng.js',
    inputKind: 'rgba',
    params: pngParams(),
  },
  {
    id: 'png-libpng-zlibng',
    displayName: 'libpng + zlib-ng',
    format: 'PNG',
    kernel: 'libpng + zlib-ng（deflate_medium/quick 路径）',
    mime: 'image/png',
    ext: 'png',
    factory: 'ifb_png_libpng_zlibng',
    file: 'png-libpng-zlibng.js',
    inputKind: 'rgba',
    params: pngParams(),
  },
  {
    id: 'png-libspng',
    displayName: 'libspng',
    format: 'PNG',
    kernel: 'libspng 0.7.4 + 标准 zlib',
    mime: 'image/png',
    ext: 'png',
    factory: 'ifb_png_libspng',
    file: 'png-libspng.js',
    inputKind: 'rgba',
    params: pngParams(),
  },
  {
    id: 'oxipng',
    displayName: 'oxipng',
    format: 'PNG',
    kernel: 'oxipng 10.2.1（Rust，无损重压缩）',
    mime: 'image/png',
    ext: 'png',
    factory: '',
    file: 'oxipng.wasm',
    inputKind: 'png',
    params: [
      { key: 'effort', label: '优化级别 -o', type: 'range', min: 0, max: 6, step: 1, default: 2, implicit: '2', hint: '0 最快 / 2 默认 / 6 极限' },
      { key: 'alpha', label: '清理透明像素 -a', type: 'toggle', default: false, implicit: '关', hint: '改写全透明像素的隐藏 RGB 以提升压缩率' },
      { key: 'zopfli', label: 'Zopfli -z', type: 'toggle', default: false, implicit: '关', hint: '体积最小但慢 10~50 倍' },
      { key: 'strip', label: '剥离元数据 --strip safe', type: 'toggle', default: true, implicit: '开' },
    ],
  },
  {
    id: 'cjpeg-turbo',
    displayName: 'libjpeg-turbo',
    format: 'JPEG',
    kernel: 'libjpeg-turbo（SIMD 速度基线）',
    mime: 'image/jpeg',
    ext: 'jpg',
    factory: 'ifb_cjpeg_turbo',
    file: 'cjpeg-turbo.js',
    inputKind: 'rgba',
    params: [
      { key: 'q', label: '质量 -quality', type: 'range', min: 1, max: 100, step: 1, default: 80, implicit: '80' },
      { key: 'subsample', label: '色度抽样 -sample', type: 'select', options: SUBSAMPLE_OPTIONS, default: 0, implicit: '4:2:0' },
      { key: 'progressive', label: '渐进式 -progressive', type: 'toggle', default: true, implicit: '关' },
      { key: 'optimize', label: '优化霍夫曼表 -optimize', type: 'toggle', default: true, implicit: '开' },
    ],
  },
  {
    id: 'cjpeg-mozjpeg',
    displayName: 'MozJPEG',
    format: 'JPEG',
    kernel: 'mozjpeg（Trellis + 渐进扫描搜索）',
    mime: 'image/jpeg',
    ext: 'jpg',
    factory: 'ifb_cjpeg_mozjpeg',
    file: 'cjpeg-mozjpeg.js',
    inputKind: 'rgba',
    params: [
      { key: 'q', label: '质量 -quality', type: 'range', min: 1, max: 100, step: 1, default: 80, implicit: '80' },
      { key: 'subsample', label: '色度抽样 -sample', type: 'select', options: SUBSAMPLE_OPTIONS, default: 0, implicit: '4:2:0' },
      { key: 'tune', label: '调优目标 -tune', type: 'select', default: 0, implicit: 'mozjpeg 内置（HVS-PSNR）', options: [
        { value: 0, label: '默认（HVS-PSNR）' },
        { value: 1, label: 'PSNR' },
        { value: 2, label: 'SSIM' },
        { value: 3, label: 'MS-SSIM' },
        { value: 4, label: 'HVS-PSNR' },
      ] },
      { key: 'progressive', label: '渐进式', type: 'toggle', default: true, implicit: '开', locked: true, hint: 'mozjpeg 默认就输出渐进式 JPEG，封装无法关闭，因此固定开启' },
      { key: 'trellis', label: 'Trellis 网格量化', type: 'toggle', default: true, implicit: '开' },
      { key: 'fastcrush', label: '跳过扫描穷举 -fastcrush', type: 'toggle', default: false, implicit: '关', hint: '编码快 2~3 倍，体积约 +1.5%' },
    ],
  },
  {
    id: 'cjpegli',
    displayName: 'Jpegli',
    format: 'JPEG',
    kernel: 'jpegli（感知量化 + XYB 可选）',
    mime: 'image/jpeg',
    ext: 'jpg',
    factory: 'ifb_cjpegli',
    file: 'cjpegli.js',
    inputKind: 'rgba',
    params: [
      { key: 'q', label: '质量 -q', type: 'range', min: 1, max: 100, step: 1, default: 90, implicit: '90', hint: '90 ≈ 视觉无损（Butteraugli 1.0）' },
      { key: 'effort', label: '渐进级别 -p', type: 'range', min: 0, max: 2, step: 1, default: 2, implicit: '2', hint: '0 顺序扫描 / 2 多遍渐进' },
      { key: 'subsample', label: '色度抽样', type: 'select', options: SUBSAMPLE_OPTIONS, default: 2, implicit: '4:4:4' },
      { key: 'xyb', label: 'XYB 色彩空间', type: 'toggle', default: false, implicit: '关' },
      { key: 'adaptive', label: '自适应量化', type: 'toggle', default: true, implicit: '开' },
    ],
  },
  {
    id: 'cjxl',
    displayName: 'libjxl (cjxl)',
    format: 'JPEG XL',
    kernel: 'libjxl（VarDCT / Modular）',
    mime: 'image/jxl',
    ext: 'jxl',
    factory: 'ifb_cjxl',
    file: 'cjxl.js',
    inputKind: 'rgba',
    hasDecoder: true,
    params: [
      { key: 'lossless', label: '数学无损 -d 0', type: 'toggle', default: false, implicit: '关' },
      { key: 'q', label: '质量 -q', type: 'range', min: 1, max: 100, step: 1, default: 90, implicit: '90', hint: '90 ≈ 视觉无损（distance 1.0）' },
      { key: 'effort', label: '算力 -e', type: 'range', min: 1, max: 10, step: 1, default: 7, implicit: '7', hint: '7 默认 / 9 高画质 / 10 极慢' },
      { key: 'modular', label: 'Modular 模式', type: 'toggle', default: false, implicit: '关' },
    ],
  },
  {
    id: 'cwebp',
    displayName: 'cwebp',
    format: 'WebP',
    kernel: 'libwebp 1.6',
    mime: 'image/webp',
    ext: 'webp',
    factory: 'ifb_cwebp',
    file: 'cwebp.js',
    inputKind: 'rgba',
    params: [
      { key: 'lossless', label: '无损 -lossless', type: 'toggle', default: false, implicit: '关' },
      { key: 'q', label: '质量 -q', type: 'range', min: 0, max: 100, step: 1, default: 80, implicit: '80' },
      { key: 'effort', label: '压缩方法 -m', type: 'range', min: 0, max: 6, step: 1, default: 4, implicit: '4', hint: '0 最快 / 4 默认 / 6 最优' },
      { key: 'sharpyuv', label: 'Sharp YUV -sharp_yuv', type: 'toggle', default: true, implicit: '开', hint: '避免红底黑字、UI 边缘的色彩晕染' },
      { key: 'nearll', label: '近无损 -near_lossless', type: 'range', min: 0, max: 100, step: 1, default: 100, implicit: '100（关闭）', hint: '100 关闭；60 左右肉眼难辨。小于 100 时自动转为无损编码（同 cwebp）' },
      { key: 'exact', label: '严格保留透明像素 -exact', type: 'toggle', default: false, implicit: '关' },
    ],
  },
  {
    id: 'avifenc-aom',
    displayName: 'avifenc · libaom',
    format: 'AVIF',
    kernel: 'libavif + libaom（画质上限）',
    mime: 'image/avif',
    ext: 'avif',
    factory: 'ifb_avif_aom',
    file: 'avifenc-aom.js',
    inputKind: 'rgba',
    params: [
      { key: 'lossless', label: '无损 -l', type: 'toggle', default: false, implicit: '关' },
      { key: 'q', label: '质量 -q', type: 'range', min: 1, max: 100, step: 1, default: 68, implicit: '70' },
      { key: 'speed', label: '速度 -s', type: 'range', min: 0, max: 10, step: 1, default: 6, implicit: '6', hint: '0 最慢 / 6 默认 / 10 最快' },
      { key: 'depth', label: '位深 --depth', type: 'select', default: 8, implicit: '8 bit', options: [
        { value: 8, label: '8 bit' },
        { value: 10, label: '10 bit（减少渐变断层）' },
      ] },
      { key: 'yuv', label: '色度格式 -y', type: 'select', default: '444', implicit: '4:4:4', options: [
        { value: '444', label: '4:4:4' },
        { value: '422', label: '4:2:2' },
        { value: '420', label: '4:2:0' },
      ] },
      { key: 'tune', label: '调优 -a tune', type: 'select', default: 'iq', implicit: 'libaom 内置', options: [
        { value: 'iq', label: 'IQ（静态图）' },
        { value: 'ssim', label: 'SSIM' },
        { value: 'psnr', label: 'PSNR' },
      ] },
    ],
  },
];

export const WASM_BASE = '/wasm/';

/* ------------------------------------------------------------------ */
/* 模块加载                                                            */
/* ------------------------------------------------------------------ */

interface EmscriptenModule {
  HEAPU8: Uint8Array;
  _malloc(size: number): number;
  _free(ptr: number): void;
  _ifb_alloc(size: number): number;
  _ifb_free_ptr(ptr: number, size: number): void;
  _ifb_encode(inPtr: number, len: number, w: number, h: number, optsPtr: number): number;
  _ifb_out_ptr(): number;
  _ifb_out_len(): number;
  _ifb_out_free(): void;
  _ifb_error(): number;
  _ifb_version(): number;
  _ifb_decode?: (ptr: number, len: number) => number;
  _ifb_dec_ptr?: () => number;
  _ifb_dec_w?: () => number;
  _ifb_dec_h?: () => number;
  _ifb_dec_channels?: () => number;
  UTF8ToString(ptr: number): string;
  stringToUTF8(str: string, ptr: number, maxBytes: number): void;
  lengthBytesUTF8(str: string): number;
}

type ModuleFactory = (opts?: Record<string, unknown>) => Promise<EmscriptenModule>;

const moduleCache = new Map<string, Promise<EmscriptenModule>>();
const scriptPromises = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const cached = scriptPromises.get(src);
  if (cached) return cached;
  const p = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`无法加载编码器脚本：${src}`));
    document.head.appendChild(el);
  });
  scriptPromises.set(src, p);
  return p;
}

export function isWasmEncoderAvailable(def: WasmEncoderDef): boolean {
  if (!def.factory) return true; // 裸 wasm（oxipng）
  return typeof (window as unknown as Record<string, unknown>)[def.factory] === 'function';
}

export async function loadEncoder(def: WasmEncoderDef): Promise<EmscriptenModule> {
  const cached = moduleCache.get(def.id);
  if (cached) return cached;

  const task = (async () => {
    if (def.id === 'oxipng') {
      return loadRawOxipng();
    }
    await loadScript(WASM_BASE + def.file);
    const factory = (window as unknown as Record<string, ModuleFactory>)[def.factory];
    if (typeof factory !== 'function') {
      throw new Error(`${def.displayName} 的 WASM 尚未构建（缺少 ${def.file}）`);
    }
    return factory({
      locateFile: (path: string) => (path.endsWith('.wasm') ? WASM_BASE + path : path),
    });
  })();

  moduleCache.set(def.id, task);
  task.catch(() => moduleCache.delete(def.id));
  return task;
}

/** oxipng 是 Rust 直接产出的裸 wasm，没有 emscripten 胶水层，这里手写最小绑定。 */
async function loadRawOxipng(): Promise<EmscriptenModule> {
  const url = WASM_BASE + 'oxipng.wasm';
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`oxipng WASM 尚未构建（${url}）`);
  const bytes = await resp.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {
    env: {},
    wasi_snapshot_preview1: {
      proc_exit: () => {},
      fd_write: () => 0,
    },
  });
  const ex = instance.exports as unknown as Record<string, unknown>;
  const memory = ex.memory as WebAssembly.Memory;
  const need = (name: string) => {
    const fn = ex[name];
    if (typeof fn !== 'function') throw new Error(`oxipng wasm 缺少导出 ${name}`);
    return fn as (...args: number[]) => number;
  };

  const api = {
    get HEAPU8() {
      return new Uint8Array(memory.buffer);
    },
    _malloc: need('ifb_alloc'),
    _free: (ptr: number) => need('ifb_free_ptr')(ptr, 0),
    _ifb_alloc: need('ifb_alloc'),
    _ifb_free_ptr: need('ifb_free_ptr'),
    _ifb_encode: need('ifb_encode'),
    _ifb_out_ptr: need('ifb_out_ptr'),
    _ifb_out_len: need('ifb_out_len'),
    _ifb_out_free: need('ifb_out_free'),
    _ifb_error: need('ifb_error'),
    _ifb_version: need('ifb_version'),
    UTF8ToString: (ptr: number) => {
      const heap = new Uint8Array(memory.buffer);
      let end = ptr;
      while (heap[end] !== 0) end++;
      return new TextDecoder().decode(heap.subarray(ptr, end));
    },
    stringToUTF8: (str: string, ptr: number, maxBytes: number) => {
      const heap = new Uint8Array(memory.buffer);
      const encoded = new TextEncoder().encode(str);
      const n = Math.min(encoded.length, maxBytes - 1);
      heap.set(encoded.subarray(0, n), ptr);
      heap[ptr + n] = 0;
    },
    lengthBytesUTF8: (str: string) => new TextEncoder().encode(str).length,
  };
  return api as unknown as EmscriptenModule;
}

/* ------------------------------------------------------------------ */
/* 编码执行                                                            */
/* ------------------------------------------------------------------ */

export interface EncodeInput {
  /** RGBA8 像素（inputKind === 'rgba'） */
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  /** PNG 字节（inputKind === 'png'） */
  pngBytes?: Uint8Array;
}

export interface EncodeResult {
  bytes: Uint8Array;
  /** 仅耗时编码调用本身，不含模块加载 */
  encodeMs: number;
  /** 解码预览用的 RGBA（JXL 等浏览器不支持的格式） */
  decoded?: { pixels: Uint8Array; width: number; height: number; channels: number };
}

/** 只序列化明确指定的参数；值为 null（不指定）的键不出现在查询串里 */
function paramsToQuery(def: WasmEncoderDef, values: Record<string, WasmParamValue>): string {
  const parts: string[] = [];
  for (const p of def.params) {
    const v = p.key in values ? values[p.key] : p.default;
    if (v === null) continue;
    if (p.type === 'toggle') {
      parts.push(`${p.key}=${v ? 1 : 0}`);
    } else {
      parts.push(`${p.key}=${v}`);
    }
  }
  return parts.join('&');
}

export async function encodeWithWasm(
  def: WasmEncoderDef,
  input: EncodeInput,
  values: Record<string, WasmParamValue>
): Promise<EncodeResult> {
  const mod = await loadEncoder(def);
  const opts = paramsToQuery(def, values);

  let inPtr: number;
  let inLen: number;
  if (def.inputKind === 'png') {
    const bytes = input.pngBytes;
    if (!bytes) throw new Error('缺少 PNG 输入数据');
    inLen = bytes.length;
    inPtr = mod._ifb_alloc(inLen);
    mod.HEAPU8.set(bytes, inPtr);
  } else {
    const pixels = input.pixels;
    inLen = pixels.length;
    inPtr = mod._ifb_alloc(inLen);
    mod.HEAPU8.set(pixels, inPtr);
  }

  const optsLen = mod.lengthBytesUTF8(opts) + 1;
  const optsPtr = mod._malloc(optsLen);
  mod.stringToUTF8(opts, optsPtr, optsLen);

  let rc = -1;
  let encodeMs = 0;
  const t0 = performance.now();
  try {
    rc = mod._ifb_encode(inPtr, inLen, input.width, input.height, optsPtr);
    encodeMs = performance.now() - t0;
  } finally {
    if (!encodeMs) encodeMs = performance.now() - t0;
    mod._free(optsPtr);
    mod._ifb_free_ptr(inPtr, inLen);
  }

  if (rc !== 0) {
    throw new Error(mod.UTF8ToString(mod._ifb_error()) || `${def.displayName} 编码失败`);
  }

  const outPtr = mod._ifb_out_ptr();
  const outLen = mod._ifb_out_len();
  const bytes = mod.HEAPU8.slice(outPtr, outPtr + outLen);
  mod._ifb_out_free();

  const result: EncodeResult = { bytes, encodeMs };

  if (def.hasDecoder && mod._ifb_decode) {
    try {
      const dPtr = mod._ifb_alloc(bytes.length);
      mod.HEAPU8.set(bytes, dPtr);
      const ok = mod._ifb_decode(dPtr, bytes.length);
      mod._ifb_free_ptr(dPtr, bytes.length);
      if (ok === 0 && mod._ifb_dec_ptr && mod._ifb_dec_w && mod._ifb_dec_h && mod._ifb_dec_channels) {
        const p = mod._ifb_dec_ptr();
        const w = mod._ifb_dec_w();
        const h = mod._ifb_dec_h();
        const c = mod._ifb_dec_channels();
        result.decoded = {
          pixels: mod.HEAPU8.slice(p, p + w * h * c),
          width: w,
          height: h,
          channels: c,
        };
      }
    } catch {
      /* 解码失败不影响编码结果，浏览器可能本来就能显示 */
    }
  }

  return result;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
