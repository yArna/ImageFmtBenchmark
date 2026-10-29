<template>
  <div class="dk-chart-card">
    <div class="dk-chart-header">
      <div class="dk-chart-title-wrap">
        <div class="dk-chart-tag" v-if="tag">{{ tag }}</div>
        <h3 class="dk-chart-title">{{ title }}</h3>
        <p class="dk-chart-subtitle" v-if="subtitle">{{ subtitle }}</p>
      </div>
      <div class="dk-legend" v-if="encoderKeys.length > 0">
        <button
          type="button"
          class="dk-legend-item dk-legend-all"
          :class="{
            'is-locked': !lockedKey,
            'is-dimmed': Boolean(activeSpotlight),
          }"
          @click="lockedKey = null; hoveredLegendKey = null"
          title="点击切换查看全部编码器"
        >
          <span class="dk-legend-label">全部</span>
        </button>
        <button
          v-for="enc in encoderKeys"
          :key="enc"
          type="button"
          class="dk-legend-item"
          :class="{
            'is-dimmed': activeSpotlight && activeSpotlight !== enc,
            'is-locked': lockedKey === enc,
          }"
          @mouseenter="hoveredLegendKey = enc"
          @mouseleave="hoveredLegendKey = null"
          @click="lockedKey = lockedKey === enc ? null : enc"
        >
          <span
            class="dk-legend-swatch"
            :style="{
              backgroundColor: getEncoderColor(enc).hex,
              boxShadow: `0 0 8px ${getEncoderColor(enc).hex}88`,
            }"
          ></span>
          <span class="dk-legend-label">{{ getEncoderDisplayName(enc) }}</span>
        </button>
      </div>
    </div>

    <div
      ref="containerRef"
      class="dk-canvas-stage"
      :style="{ height: `${height}px` }"
      @mousemove="onMouseMove"
      @mouseleave="onMouseLeave"
      @click="onPointClick"
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

      <div v-if="hoveredPoint" class="dk-scrub-tooltip" :style="tooltipStyle">
        <div class="dk-tooltip-head">
          <span>{{ getEncoderDisplayName(hoveredPoint.encoder) }} // {{ hoveredPoint.effortTag }}</span>
          <span class="dk-tooltip-hint">
            {{ hoveredPoint.quality !== null ? `Q=${hoveredPoint.quality}` : 'LOSSLESS' }}
          </span>
        </div>
        <div class="dk-tooltip-rows">
          <div class="dk-tooltip-row">
            <span class="dk-tooltip-name">压缩耗时 (encode_ms)</span>
            <span class="dk-tooltip-val">{{ hoveredPoint.x.toFixed(2) }} ms</span>
          </div>
          <div class="dk-tooltip-row">
            <span class="dk-tooltip-name">{{ yLabel }}</span>
            <span class="dk-tooltip-val">{{ hoveredPoint.y.toFixed(2) }}{{ yUnit }}</span>
          </div>
          <div class="dk-tooltip-row">
            <span class="dk-tooltip-name">点击同步到对比器</span>
            <span class="dk-tooltip-val" style="color: var(--accent-green)">点击加载</span>
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
  drawDitherColumn,
  drawDitherRect,
  getEncoderColor,
  getEncoderDisplayName,
  getBloomFilterCss,
  getBloomOpacity,
  hashString,
  DITHER_PALETTE,
} from './ditherEngine';

export interface ScatterPointItem {
  id: string;
  encoder: string;
  effortTag: string;
  effortLabel: string;
  quality: number | null;
  x: number;
  y: number;
  bpp: number;
}

const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    tag?: string;
    points: ScatterPointItem[];
    height?: number;
    variant?: DitherVariant;
    bloom?: DitherBloom;
    sparkles?: boolean;
    pixelSize?: number;
    yLabel?: string;
    yUnit?: string;
  }>(),
  {
    height: 320,
    variant: 'gradient',
    bloom: 'aura',
    sparkles: true,
    pixelSize: 2,
    yLabel: '体积占比',
    yUnit: '%',
  }
);

const emit = defineEmits<{
  (e: 'select-point', pt: ScatterPointItem): void;
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const mainCanvasRef = ref<HTMLCanvasElement | null>(null);
const bloomCanvasRef = ref<HTMLCanvasElement | null>(null);

const hoveredLegendKey = ref<string | null>(null);
const lockedKey = ref<string | null>(null);
const hoveredPoint = ref<ScatterPointItem | null>(null);
const mousePos = ref<{ x: number; y: number }>({ x: 0, y: 0 });
const stageWidth = ref<number>(800);

const activeSpotlight = computed(() => hoveredLegendKey.value ?? lockedKey.value);
const bloomFilterCss = computed(() => getBloomFilterCss(props.bloom));
const bloomOpacity = computed(() => getBloomOpacity(props.bloom));

const encoderKeys = computed(() => {
  const s = new Set<string>();
  for (const p of props.points) s.add(p.encoder);
  return Array.from(s);
});

const tooltipStyle = computed(() => {
  const w = stageWidth.value;
  const x = mousePos.value.x;
  const placeLeft = x > w * 0.58;
  return {
    left: placeLeft ? `${Math.max(12, x - 260)}px` : `${Math.min(w - 260, x + 18)}px`,
    top: `${Math.max(12, Math.min(props.height - 150, mousePos.value.y - 20))}px`,
  };
});

const PAD = { top: 22, right: 24, bottom: 36, left: 56 };

let cachedScreenPts: { pt: ScatterPointItem; px: number; py: number }[] = [];

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

  let minLogX = Infinity,
    maxLogX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;

  for (const p of props.points) {
    const lx = Math.log10(Math.max(0.2, p.x));
    if (lx < minLogX) minLogX = lx;
    if (lx > maxLogX) maxLogX = lx;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  if (!Number.isFinite(minLogX)) {
    minLogX = 0;
    maxLogX = 3;
    minY = 0;
    maxY = 100;
  }
  minLogX -= 0.1;
  maxLogX += 0.1;
  const ySpan = Math.max(1, maxY - minY);
  minY = Math.max(0, minY - ySpan * 0.08);
  maxY += ySpan * 0.08;

  const xToPx = (ms: number) => {
    const lx = Math.log10(Math.max(0.2, ms));
    return plotLeft + ((lx - minLogX) / (maxLogX - minLogX)) * plotW;
  };
  const yToPx = (y: number) => {
    return plotBottom - ((y - minY) / (maxY - minY)) * plotH;
  };

  mCtx.font = '11px "JetBrains Mono", "Geist Mono", "SF Mono", monospace';
  mCtx.textAlign = 'right';
  mCtx.textBaseline = 'middle';
  for (let t = 0; t <= 5; t++) {
    const frac = t / 5;
    const py = Math.round(plotBottom - frac * plotH) + 0.5;
    const val = minY + frac * (maxY - minY);
    mCtx.fillStyle = t === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)';
    for (let gx = plotLeft; gx <= plotRight; gx += 4) {
      mCtx.fillRect(gx, py - 0.5, 2, 1);
    }
    mCtx.fillStyle = '#71717a';
    mCtx.fillText(`${val.toFixed(1)}${props.yUnit}`, plotLeft - 8, py);
  }

  const logTicks = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  mCtx.textAlign = 'center';
  mCtx.textBaseline = 'top';
  for (const ms of logTicks) {
    const lx = Math.log10(ms);
    if (lx < minLogX || lx > maxLogX) continue;
    const px = Math.round(xToPx(ms));
    mCtx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let gy = plotTop; gy < plotBottom; gy += 4) {
      mCtx.fillRect(px, gy, 1, 2);
    }
    mCtx.fillStyle = '#71717a';
    mCtx.fillText(ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`, px, plotBottom + 10);
  }

  const sortedByX = [...props.points].sort((a, b) => a.x - b.x);
  const pareto: { x: number; y: number; pt: ScatterPointItem }[] = [];
  let bestY = Infinity;
  for (const p of sortedByX) {
    if (p.y < bestY) {
      bestY = p.y;
      pareto.push({ x: xToPx(p.x), y: yToPx(p.y), pt: p });
    }
  }

  const pxSize = Math.max(2, props.pixelSize);
  if (pareto.length >= 2) {
    const gxStart = Math.floor(pareto[0].x / pxSize);
    const gxEnd = Math.ceil(pareto[pareto.length - 1].x / pxSize);
    for (let gx = gxStart; gx <= gxEnd; gx++) {
      const sx = gx * pxSize + pxSize * 0.5;
      let py = pareto[0].y;
      for (let i = 0; i < pareto.length - 1; i++) {
        if (sx >= pareto[i].x && sx <= pareto[i + 1].x) {
          const t = (sx - pareto[i].x) / Math.max(1e-4, pareto[i + 1].x - pareto[i].x);
          py = pareto[i].y + (pareto[i + 1].y - pareto[i].y) * t;
          break;
        }
      }
      drawDitherColumn(
        mCtx,
        gx,
        py,
        plotBottom,
        pxSize,
        DITHER_PALETTE.green,
        props.variant,
        false,
        42,
        timeMs,
        0.22
      );
    }

    mCtx.beginPath();
    mCtx.setLineDash([4, 4]);
    for (let i = 0; i < pareto.length; i++) {
      if (i === 0) mCtx.moveTo(pareto[i].x, pareto[i].y);
      else mCtx.lineTo(pareto[i].x, pareto[i].y);
    }
    mCtx.strokeStyle = 'rgba(134, 239, 172, 0.55)';
    mCtx.lineWidth = 1.5;
    mCtx.stroke();
    mCtx.setLineDash([]);
  }

  const spotlight = activeSpotlight.value;
  cachedScreenPts = [];

  for (const enc of encoderKeys.value) {
    const isSpot = spotlight === enc;
    const isDimmed = spotlight !== null && !isSpot;
    const encPts = props.points
      .filter((p) => p.encoder === enc)
      .sort((a, b) => a.x - b.x);
    const color = getEncoderColor(enc);

    if (encPts.length > 1) {
      mCtx.beginPath();
      for (let i = 0; i < encPts.length; i++) {
        const sx = xToPx(encPts[i].x);
        const sy = yToPx(encPts[i].y);
        if (i === 0) mCtx.moveTo(sx, sy);
        else mCtx.lineTo(sx, sy);
      }
      mCtx.strokeStyle = isSpot ? color.brightHex : color.hex;
      mCtx.globalAlpha = isDimmed ? 0.12 : isSpot ? 0.9 : 0.45;
      mCtx.lineWidth = isSpot ? 2 : 1.25;
      mCtx.stroke();
      mCtx.globalAlpha = 1;
    }

    for (const p of encPts) {
      const sx = xToPx(p.x);
      const sy = yToPx(p.y);
      cachedScreenPts.push({ pt: p, px: sx, py: sy });

      const isHovered = hoveredPoint.value?.id === p.id;
      const boxSz = isHovered ? 14 : isSpot ? 10 : 8;
      const seed = hashString(p.id);

      drawDitherRect(
        mCtx,
        Math.round(sx - boxSz / 2),
        Math.round(sy - boxSz / 2),
        boxSz,
        boxSz,
        2,
        color,
        'solid',
        'up',
        props.sparkles,
        seed,
        timeMs,
        isDimmed ? 0.16 : 0.95
      );

      if (props.bloom !== 'off' && !isDimmed) {
        bCtx.fillStyle = color.hex;
        bCtx.fillRect(Math.round(sx - boxSz / 2), Math.round(sy - boxSz / 2), boxSz, boxSz);
      }

      if (isHovered || isSpot) {
        mCtx.strokeStyle = isHovered ? '#ffffff' : color.brightHex;
        mCtx.lineWidth = isHovered ? 2 : 1;
        mCtx.strokeRect(
          Math.round(sx - boxSz / 2) - 1,
          Math.round(sy - boxSz / 2) - 1,
          boxSz + 2,
          boxSz + 2
        );
      }
    }
  }

  mCtx.restore();
  bCtx.restore();
}

function onMouseMove(ev: MouseEvent) {
  const container = containerRef.value;
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const rx = ev.clientX - rect.left;
  const ry = ev.clientY - rect.top;
  mousePos.value = { x: rx, y: ry };

  let best: ScatterPointItem | null = null;
  let bestDist = 28;
  for (const item of cachedScreenPts) {
    const d = Math.hypot(item.px - rx, item.py - ry);
    if (d < bestDist) {
      bestDist = d;
      best = item.pt;
    }
  }
  hoveredPoint.value = best;
  drawChart(performance.now());
}

function onMouseLeave() {
  hoveredPoint.value = null;
  drawChart(performance.now());
}

function onPointClick() {
  if (hoveredPoint.value) {
    emit('select-point', hoveredPoint.value);
  }
}

let rafId = 0;
let lastFrame = 0;
let resizeObserver: ResizeObserver | null = null;

function tick(now: number) {
  if (props.sparkles && now - lastFrame >= 50) {
    lastFrame = now;
    drawChart(now);
  }
  rafId = requestAnimationFrame(tick);
}

watch(
  () => [
    props.points,
    props.variant,
    props.bloom,
    props.sparkles,
    props.pixelSize,
    activeSpotlight.value,
  ],
  () => drawChart(performance.now()),
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
