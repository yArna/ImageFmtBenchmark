<template>
  <div class="dk-chart-card">
    <div class="dk-chart-header">
      <div class="dk-chart-title-wrap">
        <div class="dk-chart-title-row">
          <slot name="tabs"></slot>
          <h3 class="dk-chart-title" v-if="title">{{ title }}</h3>
        </div>
        <p class="dk-chart-subtitle" v-if="subtitle">{{ subtitle }}</p>
      </div>
      <div class="dk-legend" v-if="series.length > 0">
        <button
          type="button"
          class="dk-legend-item dk-legend-all"
          :class="{
            'is-locked': !lockedKey && !spotlightKey && hiddenKeys.size === 0,
            'is-dimmed': Boolean(activeSpotlight) || hiddenKeys.size > 0,
          }"
          @click="selectAllSeries"
          title="点击切换查看全部编码器"
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
            'is-hidden': hiddenKeys.has(s.key),
          }"
          @mouseenter="hoveredLegendKey = s.key"
          @mouseleave="hoveredLegendKey = null"
          @click="toggleSeriesClick(s.key, $event)"
          title="悬停聚光灯高亮 / 点击锁定该编码器 / Shift+点击隐藏"
        >
          <span
            class="dk-legend-swatch"
            :style="{
              backgroundColor: s.color.hex,
              boxShadow: `0 0 8px ${s.color.hex}88`,
            }"
          ></span>
          <span class="dk-legend-label">{{ s.legendLabel ?? s.label }}</span>
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
        v-if="hoverIndex !== null && hoverXLabels[hoverIndex] !== undefined"
        class="dk-scrub-tooltip"
        :style="tooltipStyle"
      >
        <div class="dk-tooltip-head">
          <span>{{ xAxisPrefix }}{{ hoverXLabels[hoverIndex] }}{{ xAxisSuffix }}</span>
          <span class="dk-tooltip-hint">点击同步右侧与对比器</span>
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
  drawDitherColumn,
  getBloomFilterCss,
  getBloomOpacity,
  hashString,
} from './ditherEngine';

export interface AreaSeriesItem {
  key: string;
  label: string;
  legendLabel?: string;
  color: DitherPaletteEntry;
  values: (number | null)[];
  formattedValues?: (string | null)[];
  fillArea?: boolean;
  dashed?: boolean;
}

const props = withDefaults(
  defineProps<{
    title?: string;
    subtitle?: string;
    tag?: string;
    xLabels: (string | number)[];
    series: AreaSeriesItem[];
    selectedX?: string | number | null;
    spotlightKey?: string | null;
    height?: number;
    variant?: DitherVariant;
    bloom?: DitherBloom;
    sparkles?: boolean;
    pixelSize?: number;
    yUnit?: string;
    yBaseBytes?: number | null;
    xAxisPrefix?: string;
    xAxisSuffix?: string;
    logScale?: boolean;
    fillAllAreas?: boolean;
  }>(),
  {
    title: '',
    selectedX: null,
    spotlightKey: null,
    height: 340,
    variant: 'gradient',
    bloom: 'aura',
    sparkles: true,
    pixelSize: 2,
    yUnit: '',
    yBaseBytes: null,
    xAxisPrefix: '',
    xAxisSuffix: '',
    logScale: false,
    fillAllAreas: false,
  }
);

const emit = defineEmits<{
  (e: 'select-x', payload: { index: number; value: string | number }): void;
  (e: 'update:spotlightKey', value: string | null): void;
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const mainCanvasRef = ref<HTMLCanvasElement | null>(null);
const bloomCanvasRef = ref<HTMLCanvasElement | null>(null);

const hoveredLegendKey = ref<string | null>(null);
const lockedKey = ref<string | null>(null);
const hiddenKeys = ref<Set<string>>(new Set());
const hoverIndex = ref<number | null>(null);
const mousePos = ref<{ x: number; y: number }>({ x: 0, y: 0 });
const stageWidth = ref<number>(800);

const activeSpotlight = computed<string | null>(() => {
  return hoveredLegendKey.value ?? lockedKey.value ?? props.spotlightKey ?? null;
});

const visibleSeries = computed(() =>
  props.series.filter((s) => !hiddenKeys.value.has(s.key))
);

const hoverXLabels = computed(() => props.xLabels);
const bloomFilterCss = computed(() => getBloomFilterCss(props.bloom));
const bloomOpacity = computed(() => getBloomOpacity(props.bloom));

const selectedXIdx = computed(() => {
  if (props.selectedX === null || props.selectedX === undefined) return -1;
  return props.xLabels.findIndex((x) => String(x) === String(props.selectedX));
});

function selectAllSeries() {
  lockedKey.value = null;
  hoveredLegendKey.value = null;
  if (hiddenKeys.value.size > 0) {
    hiddenKeys.value = new Set();
  }
  emit('update:spotlightKey', null);
}

function toggleSeriesClick(key: string, ev: MouseEvent) {
  if (ev.shiftKey) {
    const next = new Set(hiddenKeys.value);
    if (next.has(key)) next.delete(key);
    else if (next.size < props.series.length - 1) next.add(key);
    hiddenKeys.value = next;
    return;
  }
  const nextKey = lockedKey.value === key ? null : key;
  lockedKey.value = nextKey;
  if (props.spotlightKey && props.spotlightKey !== nextKey) {
    emit('update:spotlightKey', null);
  }
}

function formatValue(val: number | null): string {
  if (val === null || !Number.isFinite(val)) return '--';
  if (Math.abs(val) >= 100) return `${val.toFixed(1)}${props.yUnit}`;
  if (Math.abs(val) >= 10) return `${val.toFixed(2)}${props.yUnit}`;
  return `${val.toFixed(3)}${props.yUnit}`;
}

const tooltipRows = computed(() => {
  const idx = hoverIndex.value;
  if (idx === null) return [];
  return visibleSeries.value
    .map((s) => {
      const v = s.values[idx] ?? null;
      const customStr = s.formattedValues?.[idx];
      return {
        key: s.key,
        label: s.label,
        color: s.color.hex,
        value: v,
        display: customStr ?? formatValue(v),
      };
    })
    .filter((r) => r.value !== null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
});

const tooltipStyle = computed(() => {
  const w = stageWidth.value;
  const x = mousePos.value.x;
  const placeLeft = x > w * 0.54;
  return {
    left: placeLeft ? `${Math.max(12, x - 275)}px` : `${Math.min(w - 275, x + 18)}px`,
    top: `${Math.max(10, Math.min(props.height - 210, mousePos.value.y - 24))}px`,
  };
});

const PAD = { top: 24, right: 22, bottom: 34, left: 64 };

function formatAxisCompactBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)}B`;
  const kb = bytes / 1024;
  if (kb < 10) return `${kb.toFixed(1)}KB`;
  if (kb < 1024) return `${Math.round(kb)}KB`;
  const mb = kb / 1024;
  return mb < 10 ? `${mb.toFixed(2)}MB` : `${mb.toFixed(1)}MB`;
}

function transformYVal(v: number): number {
  if (props.logScale) {
    return Math.log10(Math.max(0.1, v));
  }
  return v;
}

function inverseTransformYVal(tv: number): number {
  if (props.logScale) {
    return Math.pow(10, tv);
  }
  return tv;
}

function samplePolylineY(pts: { x: number; y: number }[], targetX: number): number | null {
  if (pts.length === 0) return null;
  if (pts.length === 1) return pts[0].y;
  if (targetX <= pts[0].x) return pts[0].y;
  if (targetX >= pts[pts.length - 1].x) return pts[pts.length - 1].y;

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    if (targetX >= p0.x && targetX <= p1.x) {
      const span = p1.x - p0.x;
      if (span <= 0.0001) return p0.y;
      const t = (targetX - p0.x) / span;
      const st = t * t * (3 - 2 * t);
      return p0.y + (p1.y - p0.y) * st;
    }
  }
  return pts[pts.length - 1].y;
}

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

  const plotW = Math.max(50, width - PAD.left - PAD.right);
  const plotH = Math.max(50, height - PAD.top - PAD.bottom);
  const plotLeft = PAD.left;
  const plotRight = PAD.left + plotW;
  const plotTop = PAD.top;
  const plotBottom = PAD.top + plotH;

  let minVal = Infinity;
  let maxVal = -Infinity;
  for (const s of visibleSeries.value) {
    for (const v of s.values) {
      if (v !== null && Number.isFinite(v)) {
        const tv = transformYVal(v);
        if (tv < minVal) minVal = tv;
        if (tv > maxVal) maxVal = tv;
      }
    }
  }
  if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) {
    minVal = 0;
    maxVal = 100;
  }
  if (!props.logScale && minVal < 0) maxVal = Math.max(0, maxVal);
  if (Math.abs(maxVal - minVal) < 1e-6) {
    maxVal += 1;
    minVal = minVal < 0 ? minVal - 1 : Math.max(0, minVal - 1);
  } else {
    const pad = (maxVal - minVal) * 0.08;
    if (!props.logScale) {
      minVal = minVal < 0 ? minVal - pad * 0.45 : Math.max(0, minVal - pad * 0.45);
    }
    maxVal += pad;
  }

  const yToPx = (v: number) => {
    const tv = transformYVal(v);
    const norm = (tv - minVal) / (maxVal - minVal);
    return plotBottom - norm * plotH;
  };

  const fillBase = !props.logScale && minVal < 0 ? yToPx(0) : plotBottom;
  const countX = Math.max(1, props.xLabels.length);
  const xToPx = (i: number) => {
    if (countX === 1) return plotLeft + plotW / 2;
    return plotLeft + (i / (countX - 1)) * plotW;
  };

  const yTicks = 5;
  const monoStack = '"JetBrains Mono", "Geist Mono", "SF Mono", monospace';
  mCtx.textAlign = 'right';
  mCtx.textBaseline = 'middle';

  for (let t = 0; t <= yTicks; t++) {
    const frac = t / yTicks;
    const py = Math.round(plotBottom - frac * plotH) + 0.5;
    const rawVal = inverseTransformYVal(minVal + frac * (maxVal - minVal));

    mCtx.fillStyle = t === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)';
    for (let gx = plotLeft; gx <= plotRight; gx += 4) {
      mCtx.fillRect(gx, py - 0.5, 2, 1);
    }

    if (props.yBaseBytes && props.yBaseBytes > 0) {
      const tickBytes = (rawVal / 100) * props.yBaseBytes;
      const byteStr = formatAxisCompactBytes(tickBytes);
      const pctStr =
        rawVal >= 10
          ? `${Math.round(rawVal)}%`
          : rawVal >= 1
          ? `${rawVal.toFixed(1)}%`
          : `${rawVal.toFixed(2)}%`;

      mCtx.font = `600 11px ${monoStack}`;
      mCtx.fillStyle = '#a1a1aa';
      mCtx.fillText(byteStr, plotLeft - 8, py - 5);

      mCtx.font = `9px ${monoStack}`;
      mCtx.fillStyle = '#71717a';
      mCtx.fillText(pctStr, plotLeft - 8, py + 6);
    } else {
      mCtx.font = `11px ${monoStack}`;
      mCtx.fillStyle = '#71717a';
      const labelStr =
        rawVal >= 100
          ? `${rawVal.toFixed(0)}${props.yUnit}`
          : rawVal >= 10
          ? `${rawVal.toFixed(1)}${props.yUnit}`
          : `${rawVal.toFixed(2)}${props.yUnit}`;
      mCtx.fillText(labelStr, plotLeft - 8, py);
    }
  }
  mCtx.font = `11px ${monoStack}`;

  if (selectedXIdx.value >= 0 && selectedXIdx.value < countX) {
    const sx = Math.round(xToPx(selectedXIdx.value));
    mCtx.fillStyle = 'rgba(34, 197, 94, 0.14)';
    mCtx.fillRect(sx - 6, plotTop, 12, plotH);
    mCtx.fillStyle = '#22c55e';
    for (let gy = plotTop; gy < plotBottom; gy += 3) {
      mCtx.fillRect(sx, gy, 1, 2);
    }
  }

  mCtx.textAlign = 'center';
  mCtx.textBaseline = 'top';
  const maxXLabels = Math.min(countX, Math.floor(plotW / 38));
  const stepX = Math.max(1, Math.ceil(countX / Math.max(1, maxXLabels)));
  for (let i = 0; i < countX; i++) {
    const isSelected = selectedXIdx.value === i;
    if (i % stepX !== 0 && i !== countX - 1 && !isSelected) continue;
    const px = Math.round(xToPx(i));
    mCtx.fillStyle = isSelected
      ? '#22c55e'
      : hoverIndex.value === i
      ? '#f4f4f5'
      : '#71717a';
    mCtx.fillText(`${props.xAxisPrefix}${props.xLabels[i]}${props.xAxisSuffix}`, px, plotBottom + 10);
  }

  const pxSize = Math.max(2, props.pixelSize);
  const spotlight = activeSpotlight.value;

  const orderedSeries = [...visibleSeries.value].sort((a, b) => {
    if (a.key === spotlight) return 1;
    if (b.key === spotlight) return -1;
    return 0;
  });

  for (const s of orderedSeries) {
    const isSpot = spotlight === s.key;
    const isDimmed = spotlight !== null && !isSpot;
    const alphaMult = isDimmed ? 0.14 : isSpot ? 1.0 : 0.86;

    const pts: { x: number; y: number; idx: number; val: number }[] = [];
    for (let i = 0; i < s.values.length; i++) {
      const v = s.values[i];
      if (v !== null && Number.isFinite(v)) {
        pts.push({ x: xToPx(i), y: yToPx(v), idx: i, val: v });
      }
    }
    if (pts.length === 0) continue;

    const shouldFillDither =
      !s.dashed &&
      (isSpot ||
        props.fillAllAreas ||
        s.fillArea ||
        orderedSeries.length <= 3 ||
        (spotlight === null && orderedSeries.indexOf(s) < 2));

    const seed = hashString(s.key);

    if (shouldFillDither && !isDimmed) {
      const gxStart = Math.floor(pts[0].x / pxSize);
      const gxEnd = Math.ceil(pts[pts.length - 1].x / pxSize);
      const fillAlpha = isSpot ? 0.9 : orderedSeries.length > 3 ? 0.38 : 0.68;

      for (let gx = gxStart; gx <= gxEnd; gx++) {
        const sampleX = gx * pxSize + pxSize * 0.5;
        const curveY = samplePolylineY(pts, sampleX);
        if (curveY === null) continue;
        drawDitherColumn(
          mCtx,
          gx,
          Math.min(curveY, fillBase),
          Math.max(curveY, fillBase),
          pxSize,
          s.color,
          props.variant,
          props.sparkles,
          seed,
          timeMs,
          fillAlpha
        );
        if (props.bloom !== 'off') {
          drawDitherColumn(
            bCtx,
            gx,
            Math.min(curveY, fillBase),
            Math.max(curveY, fillBase),
            pxSize * 2,
            s.color,
            'solid',
            false,
            seed,
            timeMs,
            fillAlpha * 0.72
          );
        }
      }
    }

    for (const targetCtx of props.bloom !== 'off' && !isDimmed ? [mCtx, bCtx] : [mCtx]) {
      targetCtx.save();
      if (s.dashed) {
        targetCtx.setLineDash([5, 4]);
      }
      targetCtx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (i === 0) {
          targetCtx.moveTo(p.x, p.y);
        } else {
          const prev = pts[i - 1];
          const cpx = (prev.x + p.x) / 2;
          targetCtx.bezierCurveTo(cpx, prev.y, cpx, p.y, p.x, p.y);
        }
      }
      targetCtx.strokeStyle = isSpot ? s.color.brightHex : s.color.hex;
      targetCtx.globalAlpha = alphaMult;
      targetCtx.lineWidth = isSpot ? 2.4 : s.dashed ? 1.5 : 1.8;
      targetCtx.stroke();
      targetCtx.restore();
    }

    if (!isDimmed && !s.dashed) {
      for (const p of pts) {
        const isHoveredNode = hoverIndex.value === p.idx || selectedXIdx.value === p.idx;
        const sz = isHoveredNode ? 6 : isSpot ? 4 : 3;
        mCtx.fillStyle = isHoveredNode ? '#ffffff' : s.color.brightHex;
        mCtx.fillRect(Math.round(p.x - sz / 2), Math.round(p.y - sz / 2), sz, sz);
        if (isHoveredNode) {
          mCtx.strokeStyle = s.color.hex;
          mCtx.lineWidth = 2;
          mCtx.strokeRect(Math.round(p.x - 5), Math.round(p.y - 5), 10, 10);
        }
      }
    }
  }

  if (hoverIndex.value !== null && hoverIndex.value >= 0 && hoverIndex.value < countX) {
    const cx = Math.round(xToPx(hoverIndex.value)) + 0.5;
    mCtx.fillStyle = 'rgba(244, 244, 245, 0.55)';
    for (let gy = plotTop; gy < plotBottom; gy += 4) {
      mCtx.fillRect(cx - 0.5, gy, 1, 2);
    }
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
  const countX = props.xLabels.length;
  if (countX <= 0) {
    hoverIndex.value = null;
    return;
  }
  const norm = (relX - PAD.left) / plotW;
  const idx = Math.round(norm * (countX - 1));
  hoverIndex.value = Math.max(0, Math.min(countX - 1, idx));
  drawChart(performance.now());
}

function onMouseLeave() {
  hoverIndex.value = null;
  drawChart(performance.now());
}

function onCanvasClick() {
  if (hoverIndex.value !== null && props.xLabels[hoverIndex.value] !== undefined) {
    emit('select-x', {
      index: hoverIndex.value,
      value: props.xLabels[hoverIndex.value],
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
    props.series,
    props.yBaseBytes,
    props.xLabels,
    props.selectedX,
    props.spotlightKey,
    props.variant,
    props.bloom,
    props.sparkles,
    props.pixelSize,
    props.logScale,
    props.fillAllAreas,
    activeSpotlight.value,
    hiddenKeys.value,
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
