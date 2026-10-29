<template>
  <div class="dk-chart-card">
    <div class="dk-chart-header">
      <div class="dk-chart-title-wrap">
        <div class="dk-chart-tag" v-if="tag">{{ tag }}</div>
        <h3 class="dk-chart-title">{{ title }}</h3>
        <p class="dk-chart-subtitle" v-if="subtitle">{{ subtitle }}</p>
      </div>
      <div class="dk-legend" v-if="series.length > 0">
        <button
          type="button"
          class="dk-legend-item dk-legend-all"
          :class="{
            'is-locked': !lockedKey,
            'is-dimmed': Boolean(activeSpotlight),
          }"
          @click="lockedKey = null; hoveredLegendKey = null"
          title="点击切换查看全部"
        >
          <span class="dk-legend-label">全部</span>
        </button>
        <button
          v-for="s in series"
          :key="s.key"
          type="button"
          class="dk-legend-item"
          :class="{
            'is-dimmed': activeSpotlight && activeSpotlight !== s.key,
            'is-locked': lockedKey === s.key,
          }"
          @mouseenter="hoveredLegendKey = s.key"
          @mouseleave="hoveredLegendKey = null"
          @click="lockedKey = lockedKey === s.key ? null : s.key"
        >
          <span
            class="dk-legend-swatch"
            :style="{
              backgroundColor: s.color.hex,
              boxShadow: `0 0 8px ${s.color.hex}88`,
            }"
          ></span>
          <span class="dk-legend-label">{{ s.label }}</span>
        </button>
      </div>
    </div>

    <div
      ref="containerRef"
      class="dk-canvas-stage"
      :style="{ height: `${height}px` }"
      @mousemove="onMouseMove"
      @mouseleave="onMouseLeave"
      @click="onCanvasClick"
    >
      <canvas
        ref="bloomCanvasRef"
        class="dk-canvas dk-bloom-layer"
        :style="{
          filter: bloomFilterCss,
          opacity: bloomOpacity,
        }"
      ></canvas>
      <canvas ref="mainCanvasRef" class="dk-canvas dk-main-layer"></canvas>

      <div
        v-if="hoverIndex !== null && categories[hoverIndex] !== undefined"
        class="dk-scrub-tooltip"
        :style="tooltipStyle"
      >
        <div class="dk-tooltip-head">
          <span>{{ categories[hoverIndex] }}</span>
          <span class="dk-tooltip-hint">点击同步对比器</span>
        </div>
        <div v-if="categoryMeta && categoryMeta[hoverIndex]?.cli" class="dk-tooltip-param-box">
          <code class="dk-tooltip-cli">{{ categoryMeta[hoverIndex].cli }}</code>
        </div>
        <div class="dk-tooltip-rows">
          <div
            v-for="row in tooltipRows"
            :key="row.key"
            class="dk-tooltip-row"
            :class="{ 'is-spotlight': activeSpotlight === row.key }"
          >
            <span class="dk-tooltip-dot" :style="{ backgroundColor: row.color }"></span>
            <span class="dk-tooltip-name">{{ row.label }}</span>
            <span class="dk-tooltip-val">{{ row.display }}</span>
          </div>
          <div v-if="stackType === 'stacked' && tooltipRows.length > 1 && tooltipRows.some((row) => row.value !== null)" class="dk-tooltip-total">
            <span>合计</span>
            <span>{{ formatValue(tooltipTotal) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import {
  type DitherVariant,
  type DitherBloom,
  type DitherPaletteEntry,
  drawDitherRect,
  getBloomFilterCss,
  getBloomOpacity,
  hashString,
} from './ditherEngine';

export interface BarCategoryMeta {
  tags?: string;
  cli?: string;
}

export interface BarSeriesItem {
  key: string;
  label: string;
  color: DitherPaletteEntry;
  values: (number | null)[];
  formattedValues?: (string | null)[];
  perBarColors?: DitherPaletteEntry[];
}

const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    tag?: string;
    categories: string[];
    categoryMeta?: BarCategoryMeta[];
    series: BarSeriesItem[];
    selectedCategory?: string | null;
    stackType?: 'default' | 'stacked' | 'percent';
    height?: number;
    variant?: DitherVariant;
    bloom?: DitherBloom;
    sparkles?: boolean;
    pixelSize?: number;
    yUnit?: string;
    yBaseBytes?: number | null;
    /** 自定义 Y 轴参考最大值（用于跨维度/跨力度固定刻度） */
    yMax?: number | null;
  }>(),
  {
    selectedCategory: null,
    stackType: 'default',
    height: 310,
    variant: 'gradient',
    bloom: 'aura',
    sparkles: true,
    pixelSize: 2,
    yUnit: '',
    yBaseBytes: null,
    yMax: null,
  }
);

const emit = defineEmits<{
  (e: 'select-category', payload: { index: number; category: string }): void;
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const mainCanvasRef = ref<HTMLCanvasElement | null>(null);
const bloomCanvasRef = ref<HTMLCanvasElement | null>(null);

const hoveredLegendKey = ref<string | null>(null);
const lockedKey = ref<string | null>(null);
const hoverIndex = ref<number | null>(null);
const mousePos = ref<{ x: number; y: number }>({ x: 0, y: 0 });
const stageWidth = ref<number>(800);

const activeSpotlight = computed(() => hoveredLegendKey.value ?? lockedKey.value);
const bloomFilterCss = computed(() => getBloomFilterCss(props.bloom));
const bloomOpacity = computed(() => getBloomOpacity(props.bloom));

const PAD = { top: 24, right: 20, bottom: 52, left: 64 };

function formatAxisCompactBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)}B`;
  const kb = bytes / 1024;
  if (kb < 10) return `${kb.toFixed(1)}KB`;
  if (kb < 1024) return `${Math.round(kb)}KB`;
  const mb = kb / 1024;
  return mb < 10 ? `${mb.toFixed(2)}MB` : `${mb.toFixed(1)}MB`;
}

function formatValue(val: number | null): string {
  if (val === null) return '暂无测试结果';
  if (!Number.isFinite(val)) return '--';
  if (Math.abs(val) >= 100) return `${val.toFixed(1)}${props.yUnit}`;
  if (Math.abs(val) >= 10) return `${val.toFixed(2)}${props.yUnit}`;
  return `${val.toFixed(3)}${props.yUnit}`;
}

const tooltipRows = computed(() => {
  const idx = hoverIndex.value;
  if (idx === null) return [];
  return props.series.map((s) => {
    const val = s.values[idx] ?? null;
    const custom = s.formattedValues?.[idx];
    return {
      key: s.key,
      label: s.label,
      color: (s.perBarColors?.[idx] ?? s.color).hex,
      value: val,
      display: custom ?? formatValue(val),
    };
  });
});

const tooltipTotal = computed(() =>
  tooltipRows.value.reduce((acc, r) => acc + (r.value || 0), 0)
);

const tooltipStyle = computed(() => {
  const w = stageWidth.value;
  const x = mousePos.value.x;
  const placeLeft = x > w * 0.6;
  return {
    left: placeLeft ? `${Math.max(12, x - 245)}px` : `${Math.min(w - 245, x + 18)}px`,
    top: `${Math.max(12, Math.min(props.height - 180, mousePos.value.y - 20))}px`,
  };
});

function drawChart(timeMs: number) {
  const mainCanvas = mainCanvasRef.value;
  const bloomCanvas = bloomCanvasRef.value;
  const container = containerRef.value;
  if (!mainCanvas || !bloomCanvas || !container) return;

  const rect = container.getBoundingClientRect();
  const width = Math.max(260, Math.floor(rect.width));
  const height = props.height;
  stageWidth.value = width;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  for (const c of [mainCanvas, bloomCanvas]) {
    if (c.width !== width * dpr || c.height !== height * dpr) {
      c.width = width * dpr;
      c.height = height * dpr;
    }
  }

  const mCtx = mainCanvas.getContext('2d');
  const bCtx = bloomCanvas.getContext('2d');
  if (!mCtx || !bCtx) return;

  mCtx.save();
  bCtx.save();
  mCtx.scale(dpr, dpr);
  bCtx.scale(dpr, dpr);
  mCtx.clearRect(0, 0, width, height);
  bCtx.clearRect(0, 0, width, height);

  const catCount = Math.max(1, props.categories.length);
  const prelimPlotW = Math.max(50, width - PAD.left - PAD.right);
  const prelimSlotW = prelimPlotW / catCount;

  mCtx.font = '10.5px "JetBrains Mono", "Geist Mono", "SF Mono", monospace';
  let maxLabelW = 0;
  for (const cat of props.categories) {
    const w = mCtx.measureText(cat).width;
    if (w > maxLabelW) maxLabelW = w;
  }

  const needsRotate = maxLabelW > prelimSlotW - 8;
  const dynamicBottomPad = needsRotate
    ? Math.min(92, Math.max(62, Math.ceil(maxLabelW * 0.62) + 18))
    : 36;

  const plotW = Math.max(50, width - PAD.left - PAD.right);
  const plotH = Math.max(50, height - PAD.top - dynamicBottomPad);
  const plotLeft = PAD.left;
  const plotRight = PAD.left + plotW;
  const plotTop = PAD.top;
  const plotBottom = PAD.top + plotH;
  let maxVal = 0;

  if (props.stackType === 'percent') {
    maxVal = 100;
  } else if (props.stackType === 'stacked') {
    for (let i = 0; i < catCount; i++) {
      let sum = 0;
      for (const s of props.series) {
        sum += Math.max(0, s.values[i] ?? 0);
      }
      if (sum > maxVal) maxVal = sum;
    }
    if (props.yMax != null && props.yMax > 0 && props.yMax > maxVal) {
      maxVal = props.yMax;
    }
    maxVal = maxVal > 0 ? maxVal * 1.1 : 100;
  } else {
    for (const s of props.series) {
      for (const v of s.values) {
        if (v !== null && v > maxVal) maxVal = v;
      }
    }
    if (props.yMax != null && props.yMax > 0 && props.yMax > maxVal) {
      maxVal = props.yMax;
    }
    maxVal = maxVal > 0 ? maxVal * 1.1 : 100;
  }

  // 1. Horizontal dotted gridlines
  const yTicks = 5;
  const monoStack = '"JetBrains Mono", "Geist Mono", "SF Mono", monospace';
  mCtx.textAlign = 'right';
  mCtx.textBaseline = 'middle';

  for (let t = 0; t <= yTicks; t++) {
    const frac = t / yTicks;
    const py = Math.round(plotBottom - frac * plotH) + 0.5;
    const val = frac * maxVal;

    mCtx.fillStyle = t === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)';
    for (let gx = plotLeft; gx <= plotRight; gx += 4) {
      mCtx.fillRect(gx, py - 0.5, 2, 1);
    }

    if (props.yBaseBytes && props.yBaseBytes > 0) {
      const tickBytes = (val / 100) * props.yBaseBytes;
      const byteStr = formatAxisCompactBytes(tickBytes);
      const pctStr =
        val >= 10
          ? `${Math.round(val)}%`
          : val >= 1
          ? `${val.toFixed(1)}%`
          : `${val.toFixed(2)}%`;

      mCtx.font = `600 11px ${monoStack}`;
      mCtx.fillStyle = '#a1a1aa';
      mCtx.fillText(byteStr, plotLeft - 8, py - 5);

      mCtx.font = `9px ${monoStack}`;
      mCtx.fillStyle = '#71717a';
      mCtx.fillText(pctStr, plotLeft - 8, py + 6);
    } else {
      mCtx.font = `11px ${monoStack}`;
      mCtx.fillStyle = '#71717a';
      const unit = props.stackType === 'percent' ? '%' : props.yUnit;
      const labelStr = val >= 100 ? `${val.toFixed(0)}${unit}` : `${val.toFixed(1)}${unit}`;
      mCtx.fillText(labelStr, plotLeft - 8, py);
    }
  }
  mCtx.font = `11px ${monoStack}`;

  const slotW = plotW / catCount;
  const pxSize = Math.max(2, props.pixelSize);
  const spotlight = activeSpotlight.value;

  for (let i = 0; i < catCount; i++) {
    const slotX = plotLeft + i * slotW;
    const isHoveredCat = hoverIndex.value === i;
    const isSelectedCat = props.selectedCategory === props.categories[i];

    if (isSelectedCat) {
      mCtx.fillStyle = 'rgba(34, 197, 94, 0.12)';
      mCtx.fillRect(slotX + 1, plotTop, slotW - 2, plotH);
      mCtx.strokeStyle = 'rgba(34, 197, 94, 0.45)';
      mCtx.strokeRect(slotX + 1.5, plotTop + 0.5, slotW - 3, plotH - 1);
    } else if (isHoveredCat) {
      mCtx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      mCtx.fillRect(slotX + 2, plotTop, slotW - 4, plotH);
    }

    if (props.stackType === 'stacked' || props.stackType === 'percent') {
      const barW = Math.max(8, Math.min(48, slotW * 0.62));
      const barX = Math.round(slotX + (slotW - barW) / 2);

      let totalCat = 0;
      for (const s of props.series) totalCat += Math.max(0, s.values[i] ?? 0);

      let currentBottom = plotBottom;
      for (let sIdx = 0; sIdx < props.series.length; sIdx++) {
        const s = props.series[sIdx];
        const rawV = Math.max(0, s.values[i] ?? 0);
        const normV =
          props.stackType === 'percent'
            ? totalCat > 0
              ? (rawV / totalCat) * 100
              : 0
            : rawV;
        const barH = Math.max(0, (normV / maxVal) * plotH);
        const barY = currentBottom - barH;
        currentBottom = barY;

        if (barH < 1) continue;

        const isSpot = spotlight === s.key;
        const isDimmed = spotlight !== null && !isSpot;
        const alphaMult = isDimmed ? 0.18 : 1;
        const color = s.perBarColors?.[i] ?? s.color;
        const seed = hashString(`${s.key}_${i}`);

        drawDitherRect(
          mCtx,
          barX,
          barY,
          barW,
          barH,
          pxSize,
          color,
          props.variant,
          'up',
          props.sparkles,
          seed,
          timeMs,
          alphaMult,
          isHoveredCat || isSelectedCat ? 0.15 : 0
        );

        if (props.bloom !== 'off' && !isDimmed) {
          drawDitherRect(
            bCtx,
            barX,
            barY,
            barW,
            barH,
            pxSize * 2,
            color,
            'solid',
            'up',
            false,
            seed,
            timeMs,
            0.7
          );
        }

        mCtx.fillStyle = isDimmed ? `${color.hex}33` : color.brightHex;
        mCtx.fillRect(barX, Math.round(barY), barW, 2);
      }
    } else {
      const sCount = Math.max(1, props.series.length);
      const groupW = Math.min(slotW * 0.76, sCount * 38);
      const gap = sCount > 1 ? 3 : 0;
      const barW = Math.max(4, (groupW - gap * (sCount - 1)) / sCount);
      const startX = slotX + (slotW - groupW) / 2;

      for (let sIdx = 0; sIdx < sCount; sIdx++) {
        const s = props.series[sIdx];
        const value = s?.values[i];
        if (value === null || value === undefined) continue;
        const rawV = Math.max(0, value);
        const barH = Math.max(2, (rawV / maxVal) * plotH);
        const barX = Math.round(startX + sIdx * (barW + gap));
        const barY = plotBottom - barH;

        const isSpot = spotlight === s.key;
        const isDimmed = spotlight !== null && !isSpot;
        const alphaMult = isDimmed ? 0.18 : 1;
        const color = s.perBarColors?.[i] ?? s.color;
        const seed = hashString(`${s.key}_${i}`);

        drawDitherRect(
          mCtx,
          barX,
          barY,
          Math.ceil(barW),
          barH,
          pxSize,
          color,
          props.variant,
          'up',
          props.sparkles,
          seed,
          timeMs,
          alphaMult,
          isHoveredCat || isSelectedCat ? 0.15 : 0
        );

        if (props.bloom !== 'off' && !isDimmed) {
          drawDitherRect(
            bCtx,
            barX,
            barY,
            Math.ceil(barW),
            barH,
            pxSize * 2,
            color,
            'solid',
            'up',
            false,
            seed,
            timeMs,
            0.75
          );
        }

        mCtx.fillStyle = isDimmed ? `${color.hex}33` : color.brightHex;
        mCtx.fillRect(barX, Math.round(barY), Math.ceil(barW), 2);
      }
    }

    const cx = Math.round(slotX + slotW / 2);
    mCtx.save();
    mCtx.fillStyle = isSelectedCat ? '#22c55e' : isHoveredCat ? '#f4f4f5' : '#a1a1aa';
    mCtx.font = `${needsRotate ? '10.5px' : '11px'} "JetBrains Mono", "Geist Mono", "SF Mono", monospace`;
    if (needsRotate) {
      mCtx.translate(cx + 3, plotBottom + 8);
      mCtx.rotate(-0.66); // -38 degrees: parallel diagonal baselines with >24px perpendicular clearance
      mCtx.textAlign = 'right';
      mCtx.textBaseline = 'middle';
      mCtx.fillText(props.categories[i], 0, 0);
    } else {
      mCtx.textAlign = 'center';
      mCtx.textBaseline = 'top';
      mCtx.fillText(props.categories[i], cx, plotBottom + 10);
    }
    mCtx.restore();
  }

  mCtx.restore();
  bCtx.restore();
}

function onMouseMove(ev: MouseEvent) {
  const container = containerRef.value;
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const relX = ev.clientX - rect.left;
  const relY = ev.clientY - rect.top;
  mousePos.value = { x: relX, y: relY };

  const plotW = Math.max(50, rect.width - PAD.left - PAD.right);
  const catCount = props.categories.length;
  if (catCount <= 0 || relX < PAD.left || relX > PAD.left + plotW) {
    hoverIndex.value = null;
    drawChart(performance.now());
    return;
  }
  const idx = Math.floor(((relX - PAD.left) / plotW) * catCount);
  hoverIndex.value = Math.max(0, Math.min(catCount - 1, idx));
  drawChart(performance.now());
}

function onMouseLeave() {
  hoverIndex.value = null;
  drawChart(performance.now());
}

function onCanvasClick() {
  if (hoverIndex.value !== null && props.categories[hoverIndex.value] !== undefined && props.series.some((series) => series.values[hoverIndex.value!] != null)) {
    emit('select-category', {
      index: hoverIndex.value,
      category: props.categories[hoverIndex.value],
    });
  }
}

let rafId = 0;
let lastFrame = 0;
let resizeObserver: ResizeObserver | null = null;

function tick(now: number) {
  if (props.sparkles && now - lastFrame >= 45) {
    lastFrame = now;
    drawChart(now);
  }
  rafId = requestAnimationFrame(tick);
}

watch(
  () => [
    props.categories,
    props.series,
    props.yBaseBytes,
    props.selectedCategory,
    props.stackType,
    props.variant,
    props.bloom,
    props.sparkles,
    props.pixelSize,
    activeSpotlight.value,
  ],
  () => {
    drawChart(performance.now());
  },
  { deep: true }
);

onMounted(() => {
  drawChart(performance.now());
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => drawChart(performance.now()));
    resizeObserver.observe(containerRef.value);
  }
  rafId = requestAnimationFrame(tick);
});

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId);
  if (resizeObserver) resizeObserver.disconnect();
});
</script>
