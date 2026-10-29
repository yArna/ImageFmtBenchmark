<template>
  <div class="OnlineCompareGrid">
    <div class="toolbar">
      <div class="control-field">
        <span class="control-label">缩放 {{ (zoom * 100).toFixed(0) }}%</span>
        <div class="knob-pill-group">
          <button type="button" class="knob-btn" @click="stepZoom(-1)">−</button>
          <button
            v-for="z in ZOOM_PRESETS"
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
          <button type="button" class="knob-btn" @click="resetViewport">重置</button>
        </div>
      </div>

      <div class="control-field">
        <span class="control-label">底色</span>
        <div class="knob-pill-group">
          <button
            v-for="bg in BG_OPTIONS"
            :key="bg.key"
            type="button"
            class="knob-btn"
            :class="{ 'is-active': backdrop === bg.key }"
            @click="backdrop = bg.key"
          >
            {{ bg.label }}
          </button>
        </div>
      </div>

      <span class="grid-info">{{ gridInfo }}</span>
    </div>

    <div
      ref="stage"
      class="stage"
      :class="[`bg-${backdrop}`, { 'is-panning': panning }]"
      :style="stageStyle"
      @wheel.prevent="onWheelZoom"
      @mousedown="onStageMouseDown"
    >
      <div v-if="!sourceUrl" class="empty">
        <strong>还没有源图</strong>
        <span>在左侧选择一张图片，或载入当前基准测试图。</span>
      </div>

      <!-- 还没有选中的结果时只展示原图，方便先检查源图 -->
      <div v-else-if="!results.length" class="row" data-anchor style="--split-x: 100%">
        <ComparatorImage
          :src="sourceUrl"
          alt="原图"
          :width="sourceWidth"
          :height="sourceHeight"
          :zoom="zoom"
          :pixel-ratio="pixelRatio"
          :transform-style="panStyle"
          side="left"
        />
        <div class="cmp-corner-tag cmp-pos-top-left" style="border-color: #71717a">
          <span class="dot" style="background: #ffffff"></span>
          <span>原图 · 尚无对比结果</span>
          <strong>{{ formatBytes(sourceBytes) }}</strong>
        </div>
      </div>

      <!-- 与图片对比器的四宫格一致：每行左侧为编码结果、右侧为原图，各行视图与偏移完全相同 -->
      <template v-else>
        <div v-for="r in results" :key="r.id" class="row" data-anchor>
          <div class="cmp-clip-ab-left">
            <ComparatorImage
              :src="r.url"
              :alt="`结果 #${r.id}`"
              :width="sourceWidth"
              :height="sourceHeight"
              :zoom="zoom"
              :pixel-ratio="pixelRatio"
              :transform-style="panStyle"
              side="left"
            />
          </div>
          <div class="cmp-clip-ab-right">
            <ComparatorImage
              :src="sourceUrl"
              alt="原图"
              :width="sourceWidth"
              :height="sourceHeight"
              :zoom="zoom"
              :pixel-ratio="pixelRatio"
              :transform-style="panStyle"
              side="right"
            />
          </div>

          <div class="cmp-corner-tag cmp-pos-top-left" :style="{ borderColor: r.color }" :title="r.cli">
            <span class="dot" :style="{ backgroundColor: r.color }"></span>
            <span>#{{ r.id }} {{ r.encoderName }}</span>
            <strong>{{ formatBytes(r.bytes) }} ({{ ratioLabel(r) }})</strong>
            <span v-if="r.psnr !== null" class="metric">{{ formatPsnr(r.psnr) }}</span>
          </div>
          <div class="cmp-corner-tag cmp-pos-bottom-left params-tag">{{ r.paramSummary }}</div>
          <div class="cmp-corner-tag cmp-pos-top-right" style="border-color: #71717a">
            <span class="dot" style="background: #ffffff"></span>
            <span>原图</span>
            <strong>{{ formatBytes(sourceBytes) }}</strong>
          </div>
        </div>
      </template>

      <!-- 跨越所有行的 1px 反色垂直分割线 -->
      <div v-if="sourceUrl && results.length" class="cmp-vline-hit" :style="{ left: `${splitX}%` }" @mousedown.stop="startSplitDrag">
        <div class="cmp-line-1px-black-v"></div>
      </div>
    </div>
  </div>
</template>

<style>
.OnlineCompareGrid {
  display: flex;
  flex-direction: column;
  gap: 10px;

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: center;
    padding: 8px 10px;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
  }

  .grid-info {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: var(--text-muted);
  }

  .stage {
    position: relative;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-strong);
    overflow: hidden;
    user-select: none;
    cursor: grab;

    &.is-panning {
      cursor: grabbing;
    }
  }

  /* 各行等高，行与行之间用 1px 黑线分隔（同四宫格下半部分） */
  .row {
    position: relative;
    flex: 1 1 0;
    min-height: 0;
    overflow: hidden;

    & + .row {
      box-shadow: inset 0 1px #000;
    }
  }

  .empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--text-secondary);
    font-size: 12px;

    strong {
      font-size: 13px;
      color: var(--text-primary);
    }
  }

  .cmp-corner-tag {
    max-width: calc(50% - 20px);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;

    .dot {
      flex: none;
    }

    .metric {
      color: var(--text-secondary);
    }
  }

  .params-tag {
    border-color: var(--border-strong);
    color: var(--text-secondary);
    font-size: 10px;
  }
}
</style>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import ComparatorImage from './ComparatorImage.vue';
import { formatBytes } from '../wasm/codecWasm';
import type { IOnlineResult } from '../lib/onlineResult';

/** 宫格底色 */
type IBackdrop = 'checker' | 'dark' | 'light';
/** 拖拽状态：平移画面或拖动分割线 */
type IDragMode = 'none' | 'pan' | 'split';

const ZOOM_PRESETS = [0.5, 1, 2, 4, 8];
const BG_OPTIONS: { key: IBackdrop; label: string }[] = [
  { key: 'checker', label: '透明棋盘' },
  { key: 'dark', label: '深色底' },
  { key: 'light', label: '浅色底' },
];
/** 单个结果时的舞台高度，与图片对比器保持一致 */
const SINGLE_STAGE_HEIGHT = 560;
/** 多行时每行的高度：两行同四宫格（680 / 2），行数更多时不低于该值，舞台随之变高 */
const ROW_HEIGHT = 340;
const MIN_ROW_HEIGHT = 220;

/** 多结果多宫格对比器：参照图片对比器的四宫格，每个结果占一行（左侧编码结果、右侧原图），所有行同步缩放、平移与分割线 */
export default defineComponent({
  components: { ComparatorImage },
  props: {
    /** 参与对比的编码结果，按宫格顺序排列 */
    results: { type: Array as PropType<IOnlineResult[]>, required: true },
    /** 原图预览地址 */
    sourceUrl: { type: String, required: true },
    /** 原图像素宽度 */
    sourceWidth: { type: Number, required: true },
    /** 原图像素高度 */
    sourceHeight: { type: Number, required: true },
    /** 原图文件字节数 */
    sourceBytes: { type: Number, required: true },
  },
  data() {
    return {
      ZOOM_PRESETS,
      BG_OPTIONS,
      backdrop: 'checker' as IBackdrop,
      zoom: 1,
      panX: 0,
      panY: 0,
      splitX: 50,
      panning: false,
      pixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
      dragMode: 'none' as IDragMode,
      dragStart: { x: 0, y: 0, panX: 0, panY: 0 },
      /** 拖动分割线时的舞台区域 */
      dragRect: null as DOMRect | null,
    };
  },
  unmounted() {
    this.onMouseUp();
  },
  methods: {
    formatBytes,
    ratioLabel(r: IOnlineResult): string {
      return this.sourceBytes ? `${((r.bytes / this.sourceBytes) * 100).toFixed(1)}%` : '—';
    },
    formatPsnr(psnr: number): string {
      return Number.isFinite(psnr) ? `${psnr.toFixed(2)} dB` : '无损';
    },
    /** 以宫格中心为原点的锚点缩放，保持鼠标下的像素不动 */
    setZoom(next: number, anchorX = 0, anchorY = 0) {
      const nz = Math.max(0.05, Math.min(16, Number(next.toFixed(3))));
      const ratio = nz / this.zoom;
      this.panX = anchorX - (anchorX - this.panX) * ratio;
      this.panY = anchorY - (anchorY - this.panY) * ratio;
      this.zoom = nz;
    },
    stepZoom(dir: 1 | -1) {
      this.setZoom(this.zoom * (dir > 0 ? 1.25 : 0.8));
    },
    resetViewport() {
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
      this.splitX = 50;
    },
    /** 按单行的尺寸适配整图 */
    fitViewport() {
      const stage = this.$refs.stage as HTMLDivElement | undefined;
      const pane = stage?.querySelector<HTMLElement>('[data-anchor]');
      if (!pane || !this.sourceWidth) return;
      this.panX = 0;
      this.panY = 0;
      this.setZoom(
        Math.min(
          1,
          (pane.clientWidth * this.pixelRatio * 0.92) / this.sourceWidth,
          (pane.clientHeight * this.pixelRatio * 0.92) / this.sourceHeight
        )
      );
    },
    onWheelZoom(ev: WheelEvent) {
      const pane = (ev.target as Element).closest<HTMLElement>('[data-anchor]');
      if (!pane) return;
      const rect = pane.getBoundingClientRect();
      const x = ev.clientX - rect.left - rect.width / 2;
      const y = ev.clientY - rect.top - rect.height / 2;
      this.setZoom(this.zoom * (ev.deltaY < 0 ? 1.15 : 1 / 1.15), x, y);
    },
    startSplitDrag(ev: MouseEvent) {
      if (ev.button !== 0) return;
      ev.preventDefault();
      const stage = this.$refs.stage as HTMLDivElement | undefined;
      if (!stage) return;
      this.dragMode = 'split';
      this.dragRect = stage.getBoundingClientRect();
      this.listenForDrag();
    },
    onStageMouseDown(ev: MouseEvent) {
      if (ev.button !== 0 || this.dragMode === 'split') return;
      this.dragMode = 'pan';
      this.panning = true;
      this.dragStart = { x: ev.clientX, y: ev.clientY, panX: this.panX, panY: this.panY };
      this.listenForDrag();
    },
    onMouseMove(ev: MouseEvent) {
      if (this.dragMode === 'split' && this.dragRect) {
        const rect = this.dragRect;
        this.splitX = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100));
        return;
      }
      if (this.dragMode === 'pan') {
        this.panX = this.dragStart.panX + (ev.clientX - this.dragStart.x);
        this.panY = this.dragStart.panY + (ev.clientY - this.dragStart.y);
      }
    },
    onMouseUp() {
      this.dragMode = 'none';
      this.dragRect = null;
      this.panning = false;
      window.removeEventListener('mousemove', this.onMouseMove);
      window.removeEventListener('mouseup', this.onMouseUp);
      window.removeEventListener('blur', this.onMouseUp);
    },
    listenForDrag() {
      window.addEventListener('mousemove', this.onMouseMove);
      window.addEventListener('mouseup', this.onMouseUp);
      window.addEventListener('blur', this.onMouseUp);
    },
  },
  computed: {
    panStyle(): Record<string, string> {
      return { transform: `translate(${this.panX}px, ${this.panY}px)` };
    },
    stageStyle(): Record<string, string> {
      const n = this.results.length;
      const height = n <= 1 ? SINGLE_STAGE_HEIGHT : n * Math.max(MIN_ROW_HEIGHT, Math.round((ROW_HEIGHT * 2) / n));
      return { height: `${height}px`, '--split-x': `${this.splitX}%` };
    },
    gridInfo(): string {
      if (!this.results.length) return '在下方结果表格勾选要对比的结果';
      return `${this.results.length} 个结果 · ${this.results.length}×2 宫格 · 左：编码结果 / 右：原图`;
    },
  },
});
</script>
