<template>
  <div class="cmp-card">
    <!-- Top Header & Controls -->
    <div class="cmp-header">
      <div class="cmp-title-group">
        <h3 class="dk-chart-title">
          图片对比器 — <span style="color: var(--accent-green)">{{ currentImage.name }}</span>
          <span class="cmp-dim-tag">{{ currentImage.width }}×{{ currentImage.height }} · 原图 {{ formatKB(currentImage.inputBytes) }}</span>
        </h3>
      </div>

      <div class="cmp-toolbar-right">
        <div class="control-field">
          <span class="control-label" title="100%：1 个原图像素对应 1 个屏幕物理像素；自动适配屏幕像素密度">缩放 {{ (zoom * 100).toFixed(0) }}%</span>
          <div class="knob-pill-group">
            <button type="button" class="knob-btn" @click="stepZoom(-1)">−</button>
            <button
              v-for="z in [0.5, 1, 2, 4, 8]"
              :key="z"
              type="button"
              class="knob-btn"
              :class="{ 'is-active': Math.abs(zoom - z) < 0.05 }"
              @click="setZoom(z)"
            >
              {{ Math.round(z * 100) }}%
            </button>
            <button type="button" class="knob-btn" @click="stepZoom(1)">+</button>
            <button type="button" class="knob-btn" @click="fitViewport">适合窗口</button>
            <button type="button" class="knob-btn" @click="resetViewport">重置视图</button>
          </div>
        </div>

        <div class="control-field">
          <span class="control-label">底色</span>
          <div class="knob-pill-group">
            <button
              v-for="bg in bgOptions"
              :key="bg.key"
              type="button"
              class="knob-btn"
              :class="{ 'is-active': backdropMode === bg.key }"
              @click="backdropMode = bg.key"
            >
              {{ bg.label }}
            </button>
          </div>
        </div>

        <div class="control-field">
          <span class="control-label">对比模式</span>
          <div class="knob-pill-group">
            <button
              type="button"
              class="knob-btn"
              :class="{ 'is-active': compareMode === 'ab' }"
              @click="compareMode = 'ab'"
            >
              AB 对比
            </button>
            <button
              type="button"
              class="knob-btn"
              :class="{ 'is-active': compareMode === 'quad' }"
              @click="compareMode = 'quad'"
            >
              四宫格对比
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Slot A and Slot B Parameter Selector Bars -->
    <div class="cmp-slots-grid">
      <!-- SLOT A -->
      <div class="cmp-slot-box" :style="{ borderColor: `${metaA.color.hex}66` }">
        <div class="cmp-slot-head">
          <div class="cmp-slot-badge" :style="{ backgroundColor: metaA.color.hex, color: '#09090b' }">A 图</div>
          <span class="cmp-slot-title" :style="{ color: metaA.color.brightHex }">{{ metaA.displayName }}</span>
          <span class="cmp-slot-ver" v-if="!isOriginalA">{{ metaA.version }}</span>
        </div>

        <div class="cmp-slot-controls" :class="{ 'is-original-only': isOriginalA }">
          <label class="cmp-ctrl-item">
            <span>编码器</span>
            <select :value="slotAEncoder" @change="onChangeEncoderA(($event.target as HTMLSelectElement).value)" class="dk-select">
              <option :value="ORIGINAL_ENCODER_ID">原图</option>
              <option v-for="enc in encoders" :key="enc.name" :value="enc.name">
                {{ getEncoderDisplayName(enc.name) }} ({{ encoderModeLabel(enc.name) }})
              </option>
            </select>
          </label>

          <template v-if="!isOriginalA">
            <label class="cmp-ctrl-item">
              <span>力度档位</span>
              <select :value="slotAEffort" @change="emit('update:slotAEffort', ($event.target as HTMLSelectElement).value)" class="dk-select">
                <option v-for="ef in effortsForA" :key="ef.tag" :value="ef.tag">
                  {{ formatCleanEffort(slotAEncoder, ef.tag) }}
                </option>
              </select>
            </label>

            <label class="cmp-ctrl-item" v-if="!metaA.lossless">
              <span>质量档位</span>
              <select
                :value="slotAQuality"
                @change="emit('update:slotAQuality', Number(($event.target as HTMLSelectElement).value))"
                class="dk-select"
              >
                <option v-if="hasIndependentMode(slotAEncoder)" :value="-1">{{ qualityLabel(slotAEncoder, slotAEffort, null) }}</option>
                <option v-for="q in qualityLevels" :key="q" :value="q">
                  {{ qualityLabel(slotAEncoder, slotAEffort, q) }}
                </option>
              </select>
            </label>
            <div class="cmp-ctrl-item" v-else>
              <span>质量模式</span>
              <div class="cmp-lossless-pill">{{ qualityLabel(slotAEncoder, slotAEffort, null) }}</div>
            </div>
          </template>
        </div>

        <div class="cmp-slot-telemetry" v-if="isOriginalA">
          <div class="cmp-telemetry-vol">
            <span class="lbl">体积</span>
            <strong class="cmp-vol-highlight" style="color: #ffffff">
              {{ formatKB(currentImage.inputBytes) }} <span class="cmp-vol-pct">(100%)</span>
            </strong>
          </div>
        </div>
        <div class="cmp-slot-telemetry" v-else-if="recordA">
          <div class="cmp-telemetry-vol">
            <span class="lbl">体积</span>
            <strong class="cmp-vol-highlight" :style="{ color: metaA.color.brightHex }">
              {{ formatKB(recordA.outputBytes) }} <span class="cmp-vol-pct">({{ Math.round(recordA.compressionRatio * 100) }}%)</span>
            </strong>
          </div>
          <div class="cmp-telemetry-time">
            <span class="lbl">耗时：</span>
            <strong class="val">{{ formatMs(recordA.encode_ms) }}</strong>
          </div>
        </div>
        <div v-else class="cmp-slot-telemetry">所选参数暂无测试结果</div>
      </div>

      <!-- SLOT B -->
      <div class="cmp-slot-box" :style="{ borderColor: `${metaB.color.hex}66` }">
        <div class="cmp-slot-head">
          <div class="cmp-slot-badge" :style="{ backgroundColor: metaB.color.hex, color: '#09090b' }">B 图</div>
          <span class="cmp-slot-title" :style="{ color: metaB.color.brightHex }">{{ metaB.displayName }}</span>
          <span class="cmp-slot-ver" v-if="!isOriginalB">{{ metaB.version }}</span>
        </div>

        <div class="cmp-slot-controls" :class="{ 'is-original-only': isOriginalB }">
          <label class="cmp-ctrl-item">
            <span>编码器</span>
            <select :value="slotBEncoder" @change="onChangeEncoderB(($event.target as HTMLSelectElement).value)" class="dk-select">
              <option :value="ORIGINAL_ENCODER_ID">原图</option>
              <option v-for="enc in encoders" :key="enc.name" :value="enc.name">
                {{ getEncoderDisplayName(enc.name) }} ({{ encoderModeLabel(enc.name) }})
              </option>
            </select>
          </label>

          <template v-if="!isOriginalB">
            <label class="cmp-ctrl-item">
              <span>力度档位</span>
              <select :value="slotBEffort" @change="emit('update:slotBEffort', ($event.target as HTMLSelectElement).value)" class="dk-select">
                <option v-for="ef in effortsForB" :key="ef.tag" :value="ef.tag">
                  {{ formatCleanEffort(slotBEncoder, ef.tag) }}
                </option>
              </select>
            </label>

            <label class="cmp-ctrl-item" v-if="!metaB.lossless">
              <span>质量档位</span>
              <select
                :value="slotBQuality"
                @change="emit('update:slotBQuality', Number(($event.target as HTMLSelectElement).value))"
                class="dk-select"
              >
                <option v-if="hasIndependentMode(slotBEncoder)" :value="-1">{{ qualityLabel(slotBEncoder, slotBEffort, null) }}</option>
                <option v-for="q in qualityLevels" :key="q" :value="q">
                  {{ qualityLabel(slotBEncoder, slotBEffort, q) }}
                </option>
              </select>
            </label>
            <div class="cmp-ctrl-item" v-else>
              <span>质量模式</span>
              <div class="cmp-lossless-pill">{{ qualityLabel(slotBEncoder, slotBEffort, null) }}</div>
            </div>
          </template>
        </div>

        <div class="cmp-slot-telemetry" v-if="isOriginalB">
          <div class="cmp-telemetry-vol">
            <span class="lbl">体积</span>
            <strong class="cmp-vol-highlight" style="color: #ffffff">
              {{ formatKB(currentImage.inputBytes) }} <span class="cmp-vol-pct">(100%)</span>
            </strong>
          </div>
        </div>
        <div class="cmp-slot-telemetry" v-else-if="recordB">
          <div class="cmp-telemetry-vol">
            <span class="lbl">体积</span>
            <strong class="cmp-vol-highlight" :style="{ color: metaB.color.brightHex }">
              {{ formatKB(recordB.outputBytes) }} <span class="cmp-vol-pct">({{ Math.round(recordB.compressionRatio * 100) }}%)</span>
            </strong>
          </div>
          <div class="cmp-telemetry-time">
            <span class="lbl">耗时：</span>
            <strong class="val">{{ formatMs(recordB.encode_ms) }}</strong>
          </div>
        </div>
        <div v-else class="cmp-slot-telemetry">所选参数暂无测试结果</div>
      </div>
    </div>

    <!-- Unified Interactive Viewport (Supports AB Mode & 4-Grid Synchronized Dual-Row Mode, Pan & Pixelated Zoom) -->
    <div
      ref="stageRef"
      class="cmp-stage-unified"
      :class="[`bg-${backdropMode}`, { 'is-panning': dragState === 'pan', 'is-quad-mode': compareMode === 'quad' }]"
      :style="{
        '--split-x': `${splitX}%`,
      }"
      @wheel.prevent="onWheelZoom"
      @mousedown="onStageMouseDown"
    >
      <!-- MODE 1: AB Split (Left = A, Right = B) -->
      <template v-if="compareMode === 'ab'">
        <div class="cmp-clip-ab-left">
          <ComparatorImage
              :src="urlA"
              :alt="labelA"
              :width="currentImage.width"
              :height="currentImage.height"
              :transform-style="panZoomStyle"
              :zoom="zoom"
              :pixel-ratio="pixelRatio"
              side="left"
            />
        </div>

        <div class="cmp-clip-ab-right">
          <ComparatorImage
              :src="urlB"
              :alt="labelB"
              :width="currentImage.width"
              :height="currentImage.height"
              :transform-style="panZoomStyle"
              :zoom="zoom"
              :pixel-ratio="pixelRatio"
              side="right"
            />
        </div>

        <div class="cmp-corner-tag cmp-pos-top-left" :style="{ borderColor: metaA.color.hex }">
          <span class="dot" :style="{ backgroundColor: metaA.color.hex }"></span>
          <span>A: {{ labelA }}</span>
          <strong v-if="isOriginalA">{{ formatKB(currentImage.inputBytes) }} (100%)</strong>
          <strong v-else-if="recordA">{{ formatKB(recordA.outputBytes) }} ({{ Math.round(recordA.compressionRatio * 100) }}%)</strong>
        </div>

        <div class="cmp-corner-tag cmp-pos-top-right" :style="{ borderColor: metaB.color.hex }">
          <span class="dot" :style="{ backgroundColor: metaB.color.hex }"></span>
          <span>B: {{ labelB }}</span>
          <strong v-if="isOriginalB">{{ formatKB(currentImage.inputBytes) }} (100%)</strong>
          <strong v-else-if="recordB">{{ formatKB(recordB.outputBytes) }} ({{ Math.round(recordB.compressionRatio * 100) }}%)</strong>
        </div>

        <!-- 1px 反色垂直分割线 -->
        <div
          class="cmp-vline-hit"
          :style="{ left: `${splitX}%` }"
          @mousedown.stop="startSplitDrag($event)"
        >
          <div class="cmp-line-1px-black-v"></div>
        </div>
      </template>

      <!-- MODE 2: 4-Grid Split (Top Row: Left=A / Right=原图; Bottom Row: Left=B / Right=原图, Identical View & Offset) -->
      <template v-else>
        <!-- Top Half: A vs 原图 -->
        <div class="cmp-quad-half is-top">
          <div class="cmp-clip-ab-left">
            <ComparatorImage
              :src="urlA"
              :alt="labelA"
              :width="currentImage.width"
              :height="currentImage.height"
              :transform-style="panZoomStyle"
              :zoom="zoom"
              :pixel-ratio="pixelRatio"
              side="left"
            />
          </div>

          <div class="cmp-clip-ab-right">
            <ComparatorImage
              :src="origUrl"
              :alt="currentImage.name"
              :width="currentImage.width"
              :height="currentImage.height"
              :transform-style="panZoomStyle"
              :zoom="zoom"
              :pixel-ratio="pixelRatio"
              side="right"
            />
          </div>

          <div class="cmp-corner-tag cmp-pos-top-left" :style="{ borderColor: metaA.color.hex }">
            <span class="dot" :style="{ backgroundColor: metaA.color.hex }"></span>
            <span>A: {{ labelA }}</span>
            <strong v-if="isOriginalA">{{ formatKB(currentImage.inputBytes) }} (100%)</strong>
            <strong v-else-if="recordA">{{ formatKB(recordA.outputBytes) }} ({{ Math.round(recordA.compressionRatio * 100) }}%)</strong>
          </div>

          <div class="cmp-corner-tag cmp-pos-top-right" style="border-color: #71717a">
            <span class="dot" style="background: #ffffff"></span>
            <span>原图</span>
            <strong>{{ formatKB(currentImage.inputBytes) }}</strong>
          </div>
        </div>

        <!-- Bottom Half: B vs 原图 (Identical Offset & View as Top Half) -->
        <div class="cmp-quad-half is-bottom">
          <div class="cmp-clip-ab-left">
            <ComparatorImage
              :src="urlB"
              :alt="labelB"
              :width="currentImage.width"
              :height="currentImage.height"
              :transform-style="panZoomStyle"
              :zoom="zoom"
              :pixel-ratio="pixelRatio"
              side="left"
            />
          </div>

          <div class="cmp-clip-ab-right">
            <ComparatorImage
              :src="origUrl"
              :alt="currentImage.name"
              :width="currentImage.width"
              :height="currentImage.height"
              :transform-style="panZoomStyle"
              :zoom="zoom"
              :pixel-ratio="pixelRatio"
              side="right"
            />
          </div>

          <div class="cmp-corner-tag cmp-pos-top-left" :style="{ borderColor: metaB.color.hex }">
            <span class="dot" :style="{ backgroundColor: metaB.color.hex }"></span>
            <span>B: {{ labelB }}</span>
            <strong v-if="isOriginalB">{{ formatKB(currentImage.inputBytes) }} (100%)</strong>
            <strong v-else-if="recordB">{{ formatKB(recordB.outputBytes) }} ({{ Math.round(recordB.compressionRatio * 100) }}%)</strong>
          </div>

          <div class="cmp-corner-tag cmp-pos-top-right" style="border-color: #71717a">
            <span class="dot" style="background: #ffffff"></span>
            <span>原图</span>
            <strong>{{ formatKB(currentImage.inputBytes) }}</strong>
          </div>
        </div>

        <!-- 跨越上下两部分的 1px 反色垂直分割线 -->
        <div
          class="cmp-vline-hit"
          :style="{ left: `${splitX}%` }"
          @mousedown.stop="startSplitDrag($event)"
        >
          <div class="cmp-line-1px-black-v"></div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import ComparatorImage from './ComparatorImage.vue';
import { buildImagePreviewUrl } from '../lib/assetUrls';
import { findExactEncodingRecord, formatEncodingQuality, type IPixelVerification } from '../../../lib/benchmarkData';
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import {
  ORIGINAL_ENCODER_ID,
  getEncoderMeta,
  getEncoderDisplayName,
  formatCleanEffort,
} from './dither-kit/ditherEngine';

export interface CompImageMeta {
  name: string;
  stem: string;
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  inputBytes: number;
}

export interface CompEncoderConfig {
  name: string;
  format: string;
  lossless: boolean;
  supportsLossless?: boolean;
  efforts: { effort: number | string; tag: string; label: string }[];
}

export interface CompRecord {
  image: string;
  encoder: string;
  format: string;
  lossless: boolean;
  quality: number | null;
  actualQuality?: number | null;
  pixelVerification?: IPixelVerification;
  encodingLossless?: boolean;
  /** 现有产物独立补算的视觉评分；旧数据可缺省。 */
  ssimulacra2?: number;
  effortTag: string;
  effortLabel: string;
  inputBytes: number;
  outputBytes: number;
  compressionRatio: number;
  spaceSavingPct: number;
  bpp: number;
  ready_ms: number;
  encode_ms: number;
  output_ms: number;
  total_ms: number;
  decode_ms?: number;
  outputFile: string;
}

const props = defineProps<{
  currentImage: CompImageMeta;
  /** 当前数据版本用于刷新同名编码产物。 */
  dataVersion?: string;
  encoders: CompEncoderConfig[];
  qualityLevels: number[];
  recordsForImage: CompRecord[];
  slotAEncoder: string;
  slotAEffort: string;
  slotAQuality: number;
  slotBEncoder: string;
  slotBEffort: string;
  slotBQuality: number;
}>();

const emit = defineEmits<{
  (e: 'update:slotAEncoder', v: string): void;
  (e: 'update:slotAEffort', v: string): void;
  (e: 'update:slotAQuality', v: number): void;
  (e: 'update:slotBEncoder', v: string): void;
  (e: 'update:slotBEffort', v: string): void;
  (e: 'update:slotBQuality', v: number): void;
}>();

const stageRef = ref<HTMLDivElement | null>(null);
const compareMode = ref<'ab' | 'quad'>('ab');
const backdropMode = ref<'checker' | 'dark' | 'light'>('checker');

// Vertical split line position (%)
const splitX = ref<number>(50);

// Pan & Zoom state (shared identically by A, B, and Original in both AB & Quad modes)
// 倍率以物理像素为单位；CSS 展示倍率为 zoom / pixelRatio。
const zoom = ref<number>(1);
const pixelRatio = ref(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
let densityQuery: MediaQueryList | undefined;
const panX = ref<number>(0);
const panY = ref<number>(0);

const dragState = ref<'none' | 'x' | 'pan'>('none');
const panStartMouse = ref<{ x: number; y: number }>({ x: 0, y: 0 });
const panStartOffset = ref<{ x: number; y: number }>({ x: 0, y: 0 });

const panZoomStyle = computed(() => ({
  // 只平移，不缩放合成图层；图片按目标尺寸直接采样原始数据。
  transform: `translate(${panX.value}px, ${panY.value}px)`,
}));

const bgOptions = [
  { key: 'checker' as const, label: '透明棋盘' },
  { key: 'dark' as const, label: '深色底' },
  { key: 'light' as const, label: '浅色底' },
];

const isOriginalA = computed(() => props.slotAEncoder === ORIGINAL_ENCODER_ID);
const isOriginalB = computed(() => props.slotBEncoder === ORIGINAL_ENCODER_ID);

const metaA = computed(() => getEncoderMeta(props.slotAEncoder));
const metaB = computed(() => getEncoderMeta(props.slotBEncoder));

function encoderSupportsLossless(encName: string): boolean {
  return props.recordsForImage.some((r) => r.encoder === encName && r.lossless);
}

function hasIndependentMode(encName: string): boolean {
  return props.recordsForImage.some((record) => record.encoder === encName && record.quality === null);
}

function encoderModeLabel(encName: string): string {
  const records = props.recordsForImage.filter((record) => record.encoder === encName);
  return records.length && records.every((record) => record.lossless) ? '无损' : encoderSupportsLossless(encName) ? '有损/无损' : '有损';
}

function qualityLabel(encoder: string, effortTag: string, quality: number | null): string {
  const record = findExactEncodingRecord(props.recordsForImage, encoder, effortTag, quality);
  return formatEncodingQuality(encoder, quality, record?.actualQuality, record?.lossless);
}

const effortsForA = computed(
  () => props.encoders.find((e) => e.name === props.slotAEncoder)?.efforts ?? []
);
const effortsForB = computed(
  () => props.encoders.find((e) => e.name === props.slotBEncoder)?.efforts ?? []
);

function onChangeEncoderA(newEnc: string) {
  emit('update:slotAEncoder', newEnc);
  if (newEnc === ORIGINAL_ENCODER_ID) return;
  const cfg = props.encoders.find((e) => e.name === newEnc);
  if (cfg && cfg.efforts.length > 0 && !cfg.efforts.some((ef) => ef.tag === props.slotAEffort)) {
    const midIdx = Math.floor(cfg.efforts.length / 2);
    emit('update:slotAEffort', cfg.efforts[midIdx].tag);
  }
  if (props.slotAQuality === -1 && !hasIndependentMode(newEnc)) {
    emit('update:slotAQuality', 80);
  }
}

function onChangeEncoderB(newEnc: string) {
  emit('update:slotBEncoder', newEnc);
  if (newEnc === ORIGINAL_ENCODER_ID) return;
  const cfg = props.encoders.find((e) => e.name === newEnc);
  if (cfg && cfg.efforts.length > 0 && !cfg.efforts.some((ef) => ef.tag === props.slotBEffort)) {
    const midIdx = Math.floor(cfg.efforts.length / 2);
    emit('update:slotBEffort', cfg.efforts[midIdx].tag);
  }
  if (props.slotBQuality === -1 && !hasIndependentMode(newEnc)) {
    emit('update:slotBQuality', 80);
  }
}

/** 没有完全匹配的测试结果时保持空缺，避免图片与所选参数不一致。 */
function findBestRecord(encoder: string, effortTag: string, quality: number): CompRecord | null {
  if (encoder === ORIGINAL_ENCODER_ID) return null;
  const selectedQuality = getEncoderMeta(encoder).lossless || quality === -1 ? null : quality;
  return findExactEncodingRecord(props.recordsForImage, encoder, effortTag, selectedQuality);
}

const recordA = computed(() =>
  findBestRecord(props.slotAEncoder, props.slotAEffort, props.slotAQuality)
);
const recordB = computed(() =>
  findBestRecord(props.slotBEncoder, props.slotBEffort, props.slotBQuality)
);

const origUrl = computed(() => buildImagePreviewUrl('source-image', props.currentImage.name, props.dataVersion));
const urlA = computed(() => {
  if (isOriginalA.value) return origUrl.value;
  return recordA.value ? buildImagePreviewUrl('result-file', recordA.value.outputFile, props.dataVersion) : '';
});
const urlB = computed(() => {
  if (isOriginalB.value) return origUrl.value;
  return recordB.value ? buildImagePreviewUrl('result-file', recordB.value.outputFile, props.dataVersion) : '';
});

const labelA = computed(() => {
  if (isOriginalA.value) return '原图';
  if (!recordA.value) return `${metaA.value.displayName} · 所选参数暂无测试结果`;
  return `${metaA.value.displayName} (${formatCleanEffort(props.slotAEncoder, recordA.value.effortTag)} · ${formatEncodingQuality(recordA.value.encoder, recordA.value.quality, recordA.value.actualQuality, recordA.value.lossless)})`;
});

const labelB = computed(() => {
  if (isOriginalB.value) return '原图';
  if (!recordB.value) return `${metaB.value.displayName} · 所选参数暂无测试结果`;
  return `${metaB.value.displayName} (${formatCleanEffort(props.slotBEncoder, recordB.value.effortTag)} · ${formatEncodingQuality(recordB.value.encoder, recordB.value.quality, recordB.value.actualQuality, recordB.value.lossless)})`;
});

function formatKB(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)}B`;
  const kb = bytes / 1024;
  return kb < 10 ? `${kb.toFixed(1)}KB` : `${Math.round(kb)}KB`;
}

function formatMs(ms: number): string {
  return ms < 10 ? `${ms.toFixed(1)}ms` : `${Math.round(ms)}ms`;
}

/** 视口尺寸按内容区域计算；四宫格每一行使用同一原图像素比例。 */
function getViewportSize() {
  const stage = stageRef.value;
  if (!stage) return null;
  return { width: stage.clientWidth, height: stage.clientHeight / (compareMode.value === 'quad' ? 2 : 1) };
}

/** 按钮与滚轮共用锚点算法，放大后仍观察同一处细节。 */
function setZoom(newZoom: number, anchorX = 0, anchorY = 0) {
  const nextZoom = Math.max(0.01, Math.min(16, Number(newZoom.toFixed(3))));
  const ratio = nextZoom / zoom.value;
  panX.value = anchorX - (anchorX - panX.value) * ratio;
  panY.value = anchorY - (anchorY - panY.value) * ratio;
  zoom.value = nextZoom;
}

function stepZoom(dir: 1 | -1) {
  setZoom(zoom.value * (dir > 0 ? 1.25 : 0.8));
}

/** 重置明确回到原图像素 100%，适配窗口是另一项显式操作。 */
function resetViewport() {
  zoom.value = 1;
  panX.value = 0;
  panY.value = 0;
  splitX.value = 50;
  onStageMouseUp();
}

/** 适配只调整实际倍率，不修改图片自身的像素尺寸。 */
function fitViewport() {
  const size = getViewportSize();
  if (!size || size.width === 0 || size.height === 0) return;
  panX.value = 0;
  panY.value = 0;
  setZoom(Math.min(1, size.width * pixelRatio.value * 0.92 / props.currentImage.width, size.height * pixelRatio.value * 0.92 / props.currentImage.height));
}

function onWheelZoom(ev: WheelEvent) {
  const stage = stageRef.value;
  const size = getViewportSize();
  if (!stage || !size) return;
  const rect = stage.getBoundingClientRect();
  const x = ev.clientX - rect.left - stage.clientLeft - size.width / 2;
  const localY = ev.clientY - rect.top - stage.clientTop;
  const y = (compareMode.value === 'quad' ? localY % size.height : localY) - size.height / 2;
  setZoom(zoom.value * (ev.deltaY < 0 ? 1.15 : 1 / 1.15), x, y);
}

/** 跨屏幕或浏览器缩放时保持物理倍率和视口中心观察的原图位置。 */
function updatePixelRatio() {
  const next = window.devicePixelRatio || 1;
  if (next !== pixelRatio.value) {
    const ratio = pixelRatio.value / next;
    panX.value *= ratio;
    panY.value *= ratio;
    pixelRatio.value = next;
  }
  // resolution 查询只监测当前密度；变化后重新订阅下一次变化。
  densityQuery?.removeEventListener('change', updatePixelRatio);
  densityQuery = window.matchMedia(`(resolution: ${next}dppx)`);
  densityQuery.addEventListener('change', updatePixelRatio);
}

onMounted(() => {
  updatePixelRatio();
  window.addEventListener('resize', updatePixelRatio);
});
onUnmounted(() => {
  onStageMouseUp();
  densityQuery?.removeEventListener('change', updatePixelRatio);
  window.removeEventListener('resize', updatePixelRatio);
});

/** 换图片时重置旧视口；平移不受图片或窗口边界限制。 */
watch(() => [props.currentImage.name, props.currentImage.width, props.currentImage.height], resetViewport, { flush: 'sync' });

function startSplitDrag(ev: MouseEvent) {
  if (ev.button !== 0) return;
  ev.preventDefault();
  dragState.value = 'x';
  listenForDrag();
  updateSplitPosition(ev);
}

function updateSplitPosition(ev: MouseEvent) {
  const stage = stageRef.value;
  if (!stage) return;
  const rect = stage.getBoundingClientRect();
  if (dragState.value === 'x') {
    const px = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * 100;
    splitX.value = Math.max(1, Math.min(99, px));
  }
}

function onStageMouseDown(ev: MouseEvent) {
  if (ev.button !== 0) return;
  dragState.value = 'pan';
  listenForDrag();
  panStartMouse.value = { x: ev.clientX, y: ev.clientY };
  panStartOffset.value = { x: panX.value, y: panY.value };
}

function onStageMouseMove(ev: MouseEvent) {
  if (dragState.value === 'none') return;
  if (dragState.value === 'pan') {
    panX.value = panStartOffset.value.x + (ev.clientX - panStartMouse.value.x);
    panY.value = panStartOffset.value.y + (ev.clientY - panStartMouse.value.y);
  } else {
    updateSplitPosition(ev);
  }
}

function onStageMouseUp() {
  dragState.value = 'none';
  window.removeEventListener('mousemove', onStageMouseMove);
  window.removeEventListener('mouseup', onStageMouseUp);
  window.removeEventListener('blur', onStageMouseUp);
}

function listenForDrag() {
  window.addEventListener('mousemove', onStageMouseMove);
  window.addEventListener('mouseup', onStageMouseUp);
  window.addEventListener('blur', onStageMouseUp);
}
</script>
