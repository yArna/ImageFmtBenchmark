<template>
  <div class="online-enc">
    <!-- ==================== 顶部状态条 ==================== -->
    <div class="view-control-banner">
      <div class="vcb-left">
        <span class="vcb-badge">
          WASM 在线编码 · {{ probing ? '检测中…' : `${availableCount}/${WASM_ENCODERS.length} 可用` }}
        </span>
        <span class="vcb-desc">
          图片只在浏览器本地编码，不会上传服务器。用不同编码器、参数多次编码，每次都会追加一个结果；右侧多宫格同时对比多个结果与原图，下方表格比较体积、耗时与质量。
        </span>
      </div>
      <div class="vcb-right">
        <span class="online-result-count">{{ results.length }} 个结果 · 对比 {{ selectedIds.length }}</span>
        <button type="button" class="online-download-btn" :disabled="!results.length" @click="clearResults">清空结果</button>
      </div>
    </div>

    <div class="online-grid">
      <!-- ==================== 左侧：源图 + 编码器 + 参数 ==================== -->
      <aside class="online-side">
        <!-- 源图 -->
        <section class="online-block">
          <div class="online-block-head">
            <span class="online-block-idx">01</span>
            <span class="online-block-title">源图片</span>
            <button type="button" class="reset-mini-btn" @click="pickFile">重新选择</button>
          </div>

          <div
            class="online-drop"
            :class="{ 'is-drag': isDragging, 'has-image': !!sourceUrl }"
            @click="pickFile"
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop.prevent="onDrop"
          >
            <template v-if="sourceUrl">
              <img :src="sourceUrl" alt="源图预览" class="online-drop-thumb bg-checker" />
              <div class="online-drop-meta">
                <strong>{{ sourceName }}</strong>
                <span>{{ sourceWidth }} × {{ sourceHeight }} px · {{ formatBytes(sourceBytes) }}</span>
                <span v-if="downscaled" class="online-warn">已缩小到 {{ maxPixels / 1e6 }}MP 以内以保证 WASM 内存安全</span>
              </div>
            </template>
            <template v-else>
              <span class="online-drop-icon">＋</span>
              <span class="online-drop-tip">点击或拖入图片</span>
              <span class="online-drop-sub">PNG / JPEG / WebP / AVIF / GIF · 支持透明通道</span>
            </template>
          </div>

          <div class="online-quick-row">
            <button type="button" class="knob-btn" @click="loadBenchmarkImage">载入当前测试图</button>
            <span class="online-hint">复用 01–05 视图里选中的基准测试图</span>
          </div>
        </section>

        <!-- 编码器 -->
        <section class="online-block">
          <div class="online-block-head">
            <span class="online-block-idx">02</span>
            <span class="online-block-title">编码器</span>
            <span class="online-hint">{{ activeEncoder?.format }}</span>
          </div>

          <div class="online-enc-grid">
            <button
              v-for="enc in WASM_ENCODERS"
              :key="enc.id"
              type="button"
              class="online-enc-btn"
              :class="{ 'is-active': encoderId === enc.id, 'is-missing': !probing && !availableIds.has(enc.id) }"
              :style="{ '--enc-accent': encoderAccent(enc.id) }"
              @click="encoderId = enc.id"
            >
              <span class="online-enc-fmt">{{ enc.format }}</span>
              <span class="online-enc-name">{{ enc.displayName }}</span>
              <span v-if="!probing && !availableIds.has(enc.id)" class="online-enc-missing">未构建</span>
            </button>
          </div>

          <p v-if="activeEncoder" class="online-kernel">{{ activeEncoder.kernel }}</p>
        </section>

        <!-- 参数 -->
        <section class="online-block">
          <div class="online-block-head">
            <span class="online-block-idx">03</span>
            <span class="online-block-title">编码参数</span>
            <div class="online-block-actions">
              <button type="button" class="reset-mini-btn" title="恢复界面预设参数" @click="resetParams">恢复预设</button>
              <button type="button" class="reset-mini-btn" title="所有参数都不传给编码器，使用编码器自身的默认值" @click="unsetAllParams">全部默认</button>
            </div>
          </div>

          <div class="online-param-list" v-if="activeEncoder">
            <div v-for="p in activeEncoder.params" :key="p.key" class="online-param" :class="{ 'is-unset': isUnset(p.key) }">
              <div class="online-param-head">
                <span class="online-param-label">{{ p.label }}</span>
                <span class="online-param-value">{{ displayParamValue(p) }}</span>
                <button
                  v-if="!p.locked"
                  type="button"
                  class="online-unset-btn"
                  :class="{ 'is-on': isUnset(p.key) }"
                  :title="isUnset(p.key) ? '点击改为手动指定' : '不指定该参数，由编码器使用默认值'"
                  @click="toggleUnset(p)"
                >
                  默认
                </button>
              </div>

              <input
                v-if="p.type === 'range'"
                type="range"
                class="dk-range-slider"
                :min="p.min ?? 0"
                :max="p.max ?? 100"
                :step="p.step ?? 1"
                :value="Number(effectiveValue(p))"
                :disabled="isParamDisabled(p.key)"
                @input="setParam(p.key, Number(($event.target as HTMLInputElement).value))"
              />

              <select
                v-else-if="p.type === 'select'"
                class="dk-select dk-select-full"
                :value="String(effectiveValue(p))"
                @change="onSelectParam(p, ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="o in p.options" :key="o.value" :value="String(o.value)">{{ o.label }}</option>
              </select>

              <button
                v-else
                type="button"
                class="online-toggle"
                :class="{ 'is-on': !!effectiveValue(p), 'is-locked': p.locked }"
                :disabled="p.locked"
                @click="onToggleParam(p)"
              >
                <span class="online-toggle-dot"></span>
                <span>{{ effectiveValue(p) ? '开启' : '关闭' }}</span>
              </button>

              <span v-if="p.hint" class="online-param-hint">{{ p.hint }}</span>
            </div>
          </div>

          <div class="online-param-cmd" v-if="activeEncoder">
            <span class="online-param-cmd-label">等价命令</span>
            <code>{{ cliPreview }}</code>
          </div>

          <button
            type="button"
            class="online-run-btn"
            :class="`is-${runState}`"
            :disabled="!canEncode || busy"
            @click="runEncode"
          >
            <span v-if="busy" class="online-spinner"></span>
            <span>{{ runLabel }}</span>
            <span v-if="runState === 'encoding'" class="online-run-timer">{{ (elapsedMs / 1000).toFixed(1) }}s</span>
          </button>

          <p v-if="runState === 'loading'" class="online-run-hint">
            正在下载并初始化 WASM 模块（{{ activeEncoder?.displayName }}），仅首次需要…
          </p>
          <p v-else-if="runState === 'done' && lastResult" class="online-run-hint is-ok">
            已添加结果 #{{ lastResult.id }} · {{ formatBytes(lastResult.bytes) }} · {{ (lastResult.encodeMs / 1000).toFixed(2) }}s，可继续调整参数再编码
          </p>

          <p v-if="errorMessage" class="online-error">{{ errorMessage }}</p>
        </section>
      </aside>

      <!-- ==================== 右侧：多宫格对比 + 结果表格 ==================== -->
      <div class="online-stage-col">
        <OnlineCompareGrid
          ref="gridRef"
          :results="selectedResults"
          :source-url="sourceUrl"
          :source-width="sourceWidth"
          :source-height="sourceHeight"
          :source-bytes="sourceBytes"
        />

        <OnlineResultTable
          :results="results"
          :selected-ids="selectedIds"
          :source-bytes="sourceBytes"
          :source-width="sourceWidth"
          :source-height="sourceHeight"
          :max-compare="MAX_COMPARE"
          @toggle="toggleSelected"
          @remove="removeResult"
          @download="downloadResult"
          @clear="clearResults"
          @select-latest="selectLatest"
          @clear-selection="selectedIds = []"
        />

        <p class="online-footnote">
          对比舞台：拖拽平移、滚轮缩放；分割线可拖动，所有宫格同步。JXL 预览由 WASM 解码器实时解码（浏览器原生不支持该格式）。
          SVT-AV1 依赖 pthreads / SharedArrayBuffer，需要跨源隔离头，因此在线编码只提供 libaom 内核。
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { buildImagePreviewUrl, siteAssetUrl } from '../lib/assetUrls';
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import OnlineCompareGrid from './OnlineCompareGrid.vue';
import OnlineResultTable from './OnlineResultTable.vue';
import { getEncoderMeta } from './dither-kit/ditherEngine';
import {
  WASM_ENCODERS,
  encodeWithWasm,
  formatBytes,
  loadEncoder,
  type EncodeResult,
  type WasmEncoderDef,
  type WasmParamDef,
  type WasmParamValue,
} from '../wasm/codecWasm';
import { computeQualityMetrics } from '../lib/imageQuality';
import { MAX_COMPARE, getResultColor, summarizeParams, type IOnlineResult } from '../lib/onlineResult';

const props = defineProps<{
  /** 当前基准测试图名称与版本，用于「载入当前测试图」 */
  benchmarkImageName: string;
  dataVersion?: string;
}>();

/** 上限 20MP：超过就等比缩小，避免 wasm 内存与编码时间失控 */
const maxPixels = 20_000_000;

const encoderId = ref<string>('cwebp');
const paramValues = reactive<Record<string, WasmParamValue>>({});

const sourceUrl = ref<string>('');
const sourceName = ref<string>('');
const sourceBytes = ref<number>(0);
const sourceWidth = ref<number>(0);
const sourceHeight = ref<number>(0);
const downscaled = ref(false);
const sourcePixels = ref<Uint8ClampedArray | null>(null);
const sourcePngBytes = ref<Uint8Array | null>(null);

/** 全部编码结果，按编码先后排列 */
const results = ref<IOnlineResult[]>([]);
/** 参与宫格对比的结果序号，按勾选先后排列 */
const selectedIds = ref<number[]>([]);
/** 下一个结果的序号；换源图后重新从 1 开始 */
let nextResultId = 1;
/** idle 未编码 / loading 拉取 WASM / encoding 编码中 / done 完成 / error 失败 */
type RunState = 'idle' | 'loading' | 'encoding' | 'done' | 'error';
const runState = ref<RunState>('idle');
/** 编码阶段的实时计时，给按钮一个「还在跑」的反馈 */
const elapsedMs = ref(0);
const errorMessage = ref('');
const isDragging = ref(false);

const availableIds = ref<Set<string>>(new Set());
/** 探测期间不显示「未构建」，避免首屏闪一下全部灰掉 */
const probing = ref(true);

const gridRef = ref<InstanceType<typeof OnlineCompareGrid> | null>(null);

const activeEncoder = computed<WasmEncoderDef | undefined>(() =>
  WASM_ENCODERS.find((e) => e.id === encoderId.value)
);
const availableCount = computed(() => availableIds.value.size);

function encoderAccent(id: string): string {
  const meta = getEncoderMeta(id);
  return meta?.color?.brightHex || '#22c55e';
}

/* ---------------- 参数 ---------------- */

function resetParams() {
  const def = activeEncoder.value;
  if (!def) return;
  for (const p of def.params) paramValues[p.key] = p.default;
}

/** 所有参数都不指定，完全交给编码器封装的缺省值；锁定的参数保持预设值 */
function unsetAllParams() {
  const def = activeEncoder.value;
  if (!def) return;
  for (const p of def.params) paramValues[p.key] = p.locked ? p.default : null;
}

function setParam(key: string, value: WasmParamValue) {
  paramValues[key] = value;
}

function isUnset(key: string): boolean {
  return paramValues[key] === null;
}

/** 切换「默认（不指定）」；取消时回到界面预设值 */
function toggleUnset(p: WasmParamDef) {
  paramValues[p.key] = isUnset(p.key) ? p.default : null;
}

/** 不指定时控件展示编码器实际采用的值，数值无法解析时退回界面预设值 */
function effectiveValue(p: WasmParamDef): number | string | boolean {
  const v = paramValues[p.key];
  if (v !== null && v !== undefined) return v;
  if (p.type === 'toggle') return p.implicit === '开';
  if (p.type === 'range') {
    const n = Number.parseFloat(p.implicit ?? '');
    return Number.isFinite(n) ? n : p.default;
  }
  const hit = p.options?.find((o) => p.implicit?.startsWith(o.label.split(/[（\s]/)[0]));
  return hit ? hit.value : p.default;
}

/** 不指定状态下操作开关，等同于在编码器默认行为的基础上取反 */
function onToggleParam(p: WasmParamDef) {
  setParam(p.key, !effectiveValue(p));
}

function onSelectParam(p: WasmParamDef, raw: string) {
  const opt = p.options?.find((o) => String(o.value) === raw);
  paramValues[p.key] = opt ? opt.value : raw;
}

/** 无损模式下质量参数无意义，置灰但不改值；cwebp 无损时 -q 表示压缩力度，仍然有效 */
function isParamDisabled(key: string): boolean {
  if (!paramValues['lossless'] || encoderId.value === 'cwebp') return false;
  return key === 'q';
}

function displayParamValue(p: WasmParamDef): string {
  const v = paramValues[p.key];
  if (v === null) return `默认 → ${p.implicit ?? '编码器决定'}`;
  if (p.type === 'toggle') return v ? '开' : '关';
  if (p.type === 'select') {
    const hit = p.options?.find((o) => String(o.value) === String(v));
    return hit ? hit.label : String(v ?? '');
  }
  return `${v ?? ''}${p.unit ?? ''}`;
}

const MOZJPEG_TUNES = ['', 'psnr', 'ssim', 'ms-ssim', 'hvs-psnr'];

/** 等价命令行：不指定的参数不输出对应选项 */
const cliPreview = computed(() => {
  const def = activeEncoder.value;
  if (!def) return '';
  const v = paramValues;
  const arg = (key: string, render: (value: number | string | boolean) => string): string => {
    const value = v[key];
    if (value === null || value === undefined) return '';
    const text = render(value);
    return text ? ` ${text}` : '';
  };
  const on = (key: string, flag: string): string => (v[key] ? ` ${flag}` : '');
  const sample = (names: string[], prefix: string) => arg('subsample', (x) => `${prefix}${names[Number(x)] ?? names[0]}`);
  switch (def.id) {
    case 'png-libpng':
    case 'png-libpng-zlibng':
    case 'png-libspng':
      return `${def.id} in.png out.png${arg('effort', (x) => `-l ${x}`)}${arg('filter', (x) => `-f ${x}`)}`;
    case 'oxipng':
      return `oxipng${arg('effort', (x) => `-o ${x}`)}${on('alpha', '-a')}${on('zopfli', '-z')}${arg('strip', (x) => (x ? '--strip safe' : '--strip none'))} in.png`;
    case 'cjpeg-turbo':
      return `cjpeg-turbo${arg('q', (x) => `-quality ${x}`)}${on('progressive', '-progressive')}${on('optimize', '-optimize')}${sample(['2x2', '2x1', '1x1', '1x2'], '-sample ')}`;
    case 'cjpeg-mozjpeg':
      return `cjpeg-mozjpeg${arg('q', (x) => `-quality ${x}`)}${sample(['2x2', '2x1', '1x1', '1x2'], '-sample ')}${arg('tune', (x) => (Number(x) ? `-tune-${MOZJPEG_TUNES[Number(x)]}` : ''))}${on('fastcrush', '-fastcrush')}${on('progressive', '-progressive')}`;
    case 'cjpegli':
      return `cjpegli${arg('q', (x) => `-q ${x}`)}${arg('effort', (x) => `-p ${x}`)}${sample(['420', '422', '444', '440'], '--chroma_subsampling=')}${on('xyb', '--xyb')}`;
    case 'cjxl':
      return v['lossless']
        ? `cjxl -d 0${arg('effort', (x) => `-e ${x}`)}`
        : `cjxl${arg('q', (x) => `-q ${x}`)}${arg('effort', (x) => `-e ${x}`)}${on('modular', '--modular=1')}`;
    case 'cwebp':
      return v['lossless']
        ? `cwebp -lossless${arg('q', (x) => `-q ${x}`)}${arg('effort', (x) => `-m ${x}`)}${arg('nearll', (x) => (Number(x) < 100 ? `-near_lossless ${x}` : ''))}${on('exact', '-exact')}`
        : `cwebp${arg('q', (x) => `-q ${x}`)}${arg('effort', (x) => `-m ${x}`)}${on('sharpyuv', '-sharp_yuv')}${arg('nearll', (x) => (Number(x) < 100 ? `-near_lossless ${x}` : ''))}`;
    case 'avifenc-aom':
    case 'avifenc-svt':
      return `avifenc -c ${def.id.endsWith('svt') ? 'svt' : 'aom'}${v['lossless'] ? ' -l' : arg('q', (x) => `-q ${x}`)}${arg('speed', (x) => `-s ${x}`)}${arg('depth', (x) => `--depth ${x}`)}${arg('yuv', (x) => `-y ${x}`)}${arg('tune', (x) => `-a tune=${x}`)}`;
    default:
      return def.id;
  }
});

/* ---------------- 源图 ---------------- */

function pickFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) void loadFile(file);
  };
  input.click();
}

function onDrop(ev: DragEvent) {
  isDragging.value = false;
  const file = ev.dataTransfer?.files?.[0];
  if (file) void loadFile(file);
}

async function loadFile(file: File) {
  errorMessage.value = '';
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    errorMessage.value = '无法解析该图片，请换一张试试。';
    return;
  }
  applyBitmap(bitmap, file.name, file.size);
}

async function loadBenchmarkImage() {
  errorMessage.value = '';
  if (!props.benchmarkImageName) return;
  const url = buildImagePreviewUrl('source-image', props.benchmarkImageName, props.dataVersion ?? '');
  const blob = await fetch(url).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
  if (!blob) {
    errorMessage.value = `无法加载基准测试图 ${props.benchmarkImageName}`;
    return;
  }
  const bitmap = await createImageBitmap(blob).catch(() => null);
  if (!bitmap) {
    errorMessage.value = '基准测试图解码失败。';
    return;
  }
  applyBitmap(bitmap, props.benchmarkImageName, blob.size);
}

function applyBitmap(bitmap: ImageBitmap, name: string, bytes: number) {
  let w = bitmap.width;
  let h = bitmap.height;
  downscaled.value = false;
  if (w * h > maxPixels) {
    const scale = Math.sqrt(maxPixels / (w * h));
    w = Math.max(1, Math.floor(w * scale));
    h = Math.max(1, Math.floor(h * scale));
    downscaled.value = true;
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    errorMessage.value = '当前浏览器不支持 Canvas 2D。';
    return;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  sourcePixels.value = ctx.getImageData(0, 0, w, h).data;

  sourceName.value = name;
  sourceBytes.value = bytes;
  sourceWidth.value = w;
  sourceHeight.value = h;

  // 预览与 oxipng 的输入共用同一份 PNG blob，避免大图生成超长 base64
  sourcePngBytes.value = null;
  const prevUrl = sourceUrl.value;
  canvas.toBlob((b) => {
    if (!b) return;
    if (prevUrl) URL.revokeObjectURL(prevUrl);
    sourceUrl.value = URL.createObjectURL(b);
    void b.arrayBuffer().then((ab) => {
      sourcePngBytes.value = new Uint8Array(ab);
    });
  }, 'image/png');

  // 结果都是针对旧源图编码的，换图后全部作废
  clearResults();
  gridRef.value?.resetViewport();
  // 小图默认 100% 会缩在舞台中央，载入后自动适配窗口更直观
  void nextTick(() => gridRef.value?.fitViewport());
  bitmap.close?.();
}

/* ---------------- 结果管理 ---------------- */

/** 宫格按勾选先后排列，保证新加入的结果出现在末尾 */
const selectedResults = computed(() =>
  selectedIds.value
    .map((id) => results.value.find((r) => r.id === id))
    .filter((r): r is IOnlineResult => !!r)
);
const lastResult = computed(() => results.value[results.value.length - 1]);

/** 勾选已满时，新勾选会挤掉最早勾选的结果，避免用户手动取消 */
function selectResult(id: number) {
  if (selectedIds.value.includes(id)) return;
  const next = [...selectedIds.value, id];
  selectedIds.value = next.length > MAX_COMPARE ? next.slice(next.length - MAX_COMPARE) : next;
}

function toggleSelected(id: number) {
  if (selectedIds.value.includes(id)) {
    selectedIds.value = selectedIds.value.filter((x) => x !== id);
  } else {
    selectResult(id);
  }
}

function selectLatest() {
  selectedIds.value = results.value.slice(-MAX_COMPARE).map((r) => r.id);
}

function removeResult(id: number) {
  const hit = results.value.find((r) => r.id === id);
  if (hit) URL.revokeObjectURL(hit.url);
  results.value = results.value.filter((r) => r.id !== id);
  selectedIds.value = selectedIds.value.filter((x) => x !== id);
}

function clearResults() {
  for (const r of results.value) URL.revokeObjectURL(r.url);
  results.value = [];
  selectedIds.value = [];
  nextResultId = 1;
  if (runState.value === 'done' || runState.value === 'error') runState.value = 'idle';
}

/* ---------------- 编码 ---------------- */

const canEncode = computed(
  () => !probing.value && !!sourcePixels.value && !!activeEncoder.value && availableIds.value.has(activeEncoder.value.id)
);
const busy = computed(() => runState.value === 'loading' || runState.value === 'encoding');

const runLabel = computed(() => {
  switch (runState.value) {
    case 'loading':
      return '正在加载编码器…';
    case 'encoding':
      return '编码中…';
    case 'error':
      return '重试编码';
    default:
      return '编码并添加结果';
  }
});

async function runEncode() {
  const def = activeEncoder.value;
  const pixels = sourcePixels.value;
  if (!def || !pixels) return;

  if (def.inputKind === 'png' && !sourcePngBytes.value) {
    errorMessage.value = 'PNG 输入尚未准备好，请稍后重试。';
    return;
  }

  errorMessage.value = '';
  elapsedMs.value = 0;
  runState.value = 'loading';
  // 编码期间用户可能换图，结果要绑定在发起时的源图上
  const sourceAtStart = sourcePixels.value;
  const values = { ...paramValues };

  let timer = 0;
  try {
    // 先把 WASM 模块拉起来，这样「加载」和「编码」两个阶段能分别给出提示
    await loadEncoder(def);

    runState.value = 'encoding';
    const t0 = performance.now();
    timer = window.setInterval(() => {
      elapsedMs.value = performance.now() - t0;
    }, 100);

    const res = await encodeWithWasm(
      def,
      {
        pixels,
        width: sourceWidth.value,
        height: sourceHeight.value,
        pngBytes: sourcePngBytes.value ?? undefined,
      },
      values
    );
    if (sourcePixels.value !== sourceAtStart) return;

    const blob = new Blob([res.bytes as unknown as BlobPart], { type: def.mime });
    const preview = res.decoded ? await decodedToPreview(res.decoded) : null;
    const id = nextResultId++;
    const result: IOnlineResult = {
      id,
      encoderId: def.id,
      encoderName: def.displayName,
      format: def.format,
      ext: def.ext,
      color: getResultColor(id),
      params: values,
      paramSummary: summarizeParams(def, values),
      cli: cliPreview.value,
      bytes: res.bytes.length,
      encodeMs: res.encodeMs,
      url: URL.createObjectURL(preview?.blob ?? blob),
      blob,
      metricState: 'pending',
      psnr: null,
      ssim: null,
    };
    results.value = [...results.value, result];
    selectResult(id);
    runState.value = 'done';

    void measureQuality(id, preview?.rgba ?? null, blob, pixels);
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err);
    runState.value = 'error';
  } finally {
    if (timer) window.clearInterval(timer);
  }
}

/** 浏览器无法预览的格式（JXL）：把 wasm 解码出的像素转成 PNG 预览，同时返回 RGBA 供质量计算 */
async function decodedToPreview(decoded: NonNullable<EncodeResult['decoded']>): Promise<{ blob: Blob; rgba: Uint8ClampedArray } | null> {
  const { width, height, channels } = decoded;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += channels) {
    const gray = channels < 3;
    rgba[i] = decoded.pixels[j];
    rgba[i + 1] = decoded.pixels[gray ? j : j + 1];
    rgba[i + 2] = decoded.pixels[gray ? j : j + 2];
    rgba[i + 3] = channels === 4 ? decoded.pixels[j + 3] : channels === 2 ? decoded.pixels[j + 1] : 255;
  }
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/png'));
  return blob ? { blob, rgba } : null;
}

/** 解码编码产物并与源图比较，算出 PSNR / SSIM 后回写到结果上 */
async function measureQuality(id: number, decodedRgba: Uint8ClampedArray | null, blob: Blob, reference: Uint8ClampedArray) {
  const width = sourceWidth.value;
  const height = sourceHeight.value;
  // 让出一帧，先把新结果渲染出来再做耗时的逐像素计算
  await new Promise((resolve) => window.setTimeout(resolve, 30));
  let psnr: number | null = null;
  let ssim: number | null = null;
  try {
    const rgba = decodedRgba ?? (await decodeInBrowser(blob, width, height));
    if (!rgba) throw new Error('无法解码编码结果');
    const m = computeQualityMetrics(reference, rgba, width, height);
    psnr = m.psnr;
    ssim = m.ssim;
  } catch {
    /* 解码或尺寸不一致时只缺质量指标，不影响结果本身 */
  }
  const hit = results.value.find((r) => r.id === id);
  if (!hit) return;
  hit.psnr = psnr;
  hit.ssim = ssim;
  hit.metricState = psnr === null ? 'error' : 'done';
}

/** 浏览器原生解码（PNG / JPEG / WebP / AVIF），关闭色彩管理与预乘以拿到原始像素 */
async function decodeInBrowser(blob: Blob, width: number, height: number): Promise<Uint8ClampedArray | null> {
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }).catch(() => null);
  if (!bitmap) return null;
  if (bitmap.width !== width || bitmap.height !== height) {
    bitmap.close();
    return null;
  }
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, width, height).data;
}

function downloadResult(id: number) {
  const r = results.value.find((x) => x.id === id);
  if (!r) return;
  const base = (sourceName.value || 'image').replace(/\.[^.]+$/, '');
  const url = URL.createObjectURL(r.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${base}-${r.id}-${r.encoderId}.${r.ext}`;
  a.rel = 'noopener';
  // 部分浏览器要求锚点在文档里才会触发下载
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* ---------------- 初始化 ---------------- */

onMounted(async () => {
  // 探测哪些编码器已构建：脚本可加载即视为可用
  const ids = new Set<string>();
  await Promise.all(
    WASM_ENCODERS.map(async (def) => {
      if (def.id === 'oxipng') {
        try {
          await loadEncoder(def);
          ids.add(def.id);
        } catch {
          /* 未构建 */
        }
        return;
      }
      try {
        const resp = await fetch(siteAssetUrl(`wasm/${def.file}`), { method: 'HEAD' });
        if (resp.ok) ids.add(def.id);
      } catch {
        /* 未构建 */
      }
    })
  );
  availableIds.value = ids;
  probing.value = false;
  if (!ids.has(encoderId.value)) {
    const first = WASM_ENCODERS.find((e) => ids.has(e.id));
    if (first) encoderId.value = first.id;
  }
  resetParams();
});

// 换编码器只重置参数；已有结果保留，用于跨编码器对比
watch(encoderId, () => {
  resetParams();
  if (runState.value === 'done' || runState.value === 'error') runState.value = 'idle';
}, { flush: 'post' });

// 首次挂载时若默认编码器不可用，确保参数已按新编码器初始化
resetParams();
</script>

<style scoped>
.online-enc {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.online-grid {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

@media (max-width: 1280px) {
  .online-grid {
    grid-template-columns: 1fr;
  }
}

.online-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.online-block {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.online-block-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.online-block-idx {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--accent-cyan);
  border: 1px solid rgba(6, 182, 212, 0.4);
  padding: 1px 4px;
}

.online-block-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.02em;
}

.online-block-head .reset-mini-btn,
.online-block-head .online-hint {
  margin-left: auto;
}

.online-hint {
  font-size: 10.5px;
  color: var(--text-muted);
}

.online-drop {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px dashed var(--border-strong);
  background: var(--bg-elevated);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  min-height: 72px;
}

.online-drop:hover,
.online-drop.is-drag {
  border-color: var(--accent-cyan);
  background: var(--bg-hover);
}

.online-drop-thumb {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border: 1px solid var(--border-subtle);
  flex: none;
}

.online-drop-meta {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.online-drop-meta strong {
  font-size: 12px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.online-drop-meta span {
  font-size: 10.5px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
}

.online-warn {
  color: var(--accent-orange) !important;
}

.online-drop-icon {
  font-size: 22px;
  color: var(--text-muted);
  width: 56px;
  text-align: center;
}

.online-drop-tip {
  font-size: 12.5px;
  color: var(--text-primary);
}

.online-drop-sub {
  display: block;
  font-size: 10.5px;
  color: var(--text-muted);
}

.online-quick-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.online-enc-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.online-enc-btn {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 7px 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.online-enc-btn:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.online-enc-btn.is-active {
  border-color: var(--enc-accent);
  background: color-mix(in srgb, var(--enc-accent) 14%, transparent);
  color: var(--text-primary);
}

.online-enc-btn.is-missing {
  opacity: 0.45;
}

.online-enc-fmt {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.06em;
  color: var(--enc-accent);
  text-transform: uppercase;
}

.online-enc-name {
  font-size: 11.5px;
  line-height: 1.25;
}

.online-enc-missing {
  position: absolute;
  top: 5px;
  right: 5px;
  font-size: 8.5px;
  color: var(--accent-orange);
}

.online-kernel {
  margin: 0;
  font-size: 10.5px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.online-param-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.online-param {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.online-param-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.online-param-label {
  font-size: 11.5px;
  color: var(--text-secondary);
}

.online-param-value {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent-cyan);
}

.online-block-actions {
  margin-left: auto;
  display: flex;
  gap: 4px;
}

/* 不指定的参数：控件半透明但仍可操作，操作即转为手动指定 */
.online-param.is-unset .dk-range-slider,
.online-param.is-unset .dk-select,
.online-param.is-unset .online-toggle {
  opacity: 0.4;
}

.online-param.is-unset .online-param-value {
  color: var(--text-muted);
}

.online-unset-btn {
  flex: none;
  padding: 1px 6px;
  background: transparent;
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  font-size: 9.5px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.online-unset-btn:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.online-unset-btn.is-on {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  background: color-mix(in srgb, var(--accent-cyan) 12%, transparent);
}

.online-param-hint {
  font-size: 10px;
  color: var(--text-muted);
  line-height: 1.35;
}

.online-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  align-self: flex-start;
}

.online-toggle.is-on {
  border-color: var(--accent-green);
  color: var(--text-primary);
}

.online-toggle-dot {
  width: 8px;
  height: 8px;
  background: var(--text-muted);
}

.online-toggle.is-locked {
  cursor: not-allowed;
  opacity: 0.6;
}

.online-toggle.is-on .online-toggle-dot {
  background: var(--accent-green);
}

.online-param-cmd {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  background: #08080b;
  border: 1px solid var(--border-subtle);
}

.online-param-cmd-label {
  font-size: 9.5px;
  color: var(--text-muted);
  letter-spacing: 0.06em;
}

.online-param-cmd code {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: #a5f3fc;
  word-break: break-all;
  line-height: 1.45;
}

.online-run-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 12px;
  background: var(--accent-green);
  color: #06120a;
  border: none;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition: filter 0.15s, background 0.15s, color 0.15s;
  overflow: hidden;
}

.online-run-btn:hover:not(:disabled) {
  filter: brightness(1.1);
}

.online-run-btn:disabled {
  background: var(--bg-hover);
  color: var(--text-muted);
  cursor: not-allowed;
}

/* 编码中：按钮底部走一条流动的进度条，避免只有转圈看不出还在动 */
.online-run-btn.is-encoding,
.online-run-btn.is-loading {
  background: var(--bg-hover);
  color: var(--text-primary);
  cursor: progress;
}

.online-run-btn.is-encoding::after,
.online-run-btn.is-loading::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  width: 40%;
  background: var(--accent-green);
  animation: online-progress 1.1s ease-in-out infinite;
}

@keyframes online-progress {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(260%);
  }
}

.online-run-btn.is-done {
  background: transparent;
  color: var(--accent-green);
  box-shadow: inset 0 0 0 1px var(--accent-green);
}

.online-run-btn.is-error {
  background: #f87171;
  color: #1b0505;
}

.online-run-timer {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
}

.online-run-hint {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.45;
  color: var(--text-muted);
}

.online-run-hint.is-ok {
  color: var(--accent-green);
}

.online-download-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  color: var(--text-secondary);
  font-size: 11.5px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.online-download-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.online-download-btn:hover:not(:disabled) {
  border-color: #f87171;
  color: #f87171;
}

.online-result-count {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
}

.online-spinner {
  width: 11px;
  height: 11px;
  border: 2px solid rgba(0, 0, 0, 0.25);
  border-top-color: #06120a;
  border-radius: 50%;
  animation: online-spin 0.7s linear infinite;
}

.online-run-btn.is-loading .online-spinner,
.online-run-btn.is-encoding .online-spinner {
  border-color: rgba(255, 255, 255, 0.22);
  border-top-color: var(--accent-green);
}

@keyframes online-spin {
  to {
    transform: rotate(360deg);
  }
}

.online-error {
  margin: 0;
  font-size: 11px;
  color: #f87171;
  line-height: 1.4;
  word-break: break-word;
}

.online-stage-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.online-footnote {
  margin: 0;
  font-size: 10.5px;
  color: var(--text-muted);
  line-height: 1.5;
}
</style>
