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
        v-if="hoverAxisIdx !== null && axes[hoverAxisIdx] !== undefined"
        class="dk-scrub-tooltip"
        style="right: 16px; top: 16px"
      >
        <div class="dk-tooltip-head">
          <span>{{ axes[hoverAxisIdx] }}</span>
          <span class="dk-tooltip-hint">综合评分 / 100</span>
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
            <span class="dk-tooltip-val">{{ row.value.toFixed(1) }}</span>
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
  shouldLightDitherCell,
  isSparkleCell,
  getBloomFilterCss,
  getBloomOpacity,
  hashString,
} from './ditherEngine';

export interface RadarSeriesItem {
  key: string;
  label: string;
  color: DitherPaletteEntry;
  values: number[]; // 0..100 normalized scores
}

const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    tag?: string;
    axes: string[];
    series: RadarSeriesItem[];
    height?: number;
    variant?: DitherVariant;
    bloom?: DitherBloom;
    sparkles?: boolean;
    pixelSize?: number;
  }>(),
  {
    height: 340,
    variant: 'gradient',
    bloom: 'aura',
    sparkles: true,
    pixelSize: 2,
  }
);

const containerRef = ref<HTMLDivElement | null>(null);
const mainCanvasRef = ref<HTMLCanvasElement | null>(null);
const bloomCanvasRef = ref<HTMLCanvasElement | null>(null);

const hoveredLegendKey = ref<string | null>(null);
const lockedKey = ref<string | null>(null);
const hoverAxisIdx = ref<number | null>(null);

const activeSpotlight = computed(() => hoveredLegendKey.value ?? lockedKey.value);
const bloomFilterCss = computed(() => getBloomFilterCss(props.bloom));
const bloomOpacity = computed(() => getBloomOpacity(props.bloom));

const tooltipRows = computed(() => {
  const idx = hoverAxisIdx.value;
  if (idx === null) return [];
  return [...props.series]
    .map((s) => ({
      key: s.key,
      label: s.label,
      color: s.color.hex,
      value: s.values[idx] ?? 0,
    }))
    .sort((a, b) => b.value - a.value);
});

function pointInPolygon(x: number, y: number, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y;
    const xj = poly[j].x,
      yj = poly[j].y;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function drawChart(timeMs: number) {
  const mainCanvas = mainCanvasRef.value;
  const bloomCanvas = bloomCanvasRef.value;
  const container = containerRef.value;
  if (!mainCanvas || !bloomCanvas || !container) return;

  const rect = container.getBoundingClientRect();
  const width = Math.max(280, Math.floor(rect.width));
  const height = props.height;

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

  const cx = width * 0.5;
  const cy = height * 0.52;
  const maxR = Math.min(width, height) * 0.36;
  const nAxes = Math.max(3, props.axes.length);

  const angleFor = (idx: number) => -Math.PI / 2 + (idx * 2 * Math.PI) / nAxes;

  // 1. Draw concentric polygonal web rings
  const rings = [0.25, 0.5, 0.75, 1.0];
  for (const rFrac of rings) {
    const r = maxR * rFrac;
    mCtx.beginPath();
    for (let i = 0; i < nAxes; i++) {
      const ang = angleFor(i);
      const px = cx + Math.cos(ang) * r;
      const py = cy + Math.sin(ang) * r;
      if (i === 0) mCtx.moveTo(px, py);
      else mCtx.lineTo(px, py);
    }
    mCtx.closePath();
    mCtx.strokeStyle = rFrac === 1.0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.09)';
    mCtx.lineWidth = 1;
    mCtx.stroke();
  }

  // 2. Draw spokes & axis labels
  mCtx.font = '11px "JetBrains Mono", "Geist Mono", "SF Mono", monospace';
  for (let i = 0; i < nAxes; i++) {
    const ang = angleFor(i);
    const ex = cx + Math.cos(ang) * maxR;
    const ey = cy + Math.sin(ang) * maxR;

    mCtx.beginPath();
    mCtx.moveTo(cx, cy);
    mCtx.lineTo(ex, ey);
    mCtx.strokeStyle =
      hoverAxisIdx.value === i ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.12)';
    mCtx.stroke();

    const lx = cx + Math.cos(ang) * (maxR + 22);
    const ly = cy + Math.sin(ang) * (maxR + 18);
    mCtx.fillStyle = hoverAxisIdx.value === i ? '#ffffff' : '#a1a1aa';
    mCtx.textAlign =
      Math.abs(Math.cos(ang)) < 0.2 ? 'center' : Math.cos(ang) > 0 ? 'left' : 'right';
    mCtx.textBaseline = 'middle';
    mCtx.fillText(props.axes[i], lx, ly);
  }

  // 3. Draw dithered radar polygons
  const pxSize = Math.max(2, props.pixelSize);
  const spotlight = activeSpotlight.value;
  const ordered = [...props.series].sort((a, b) => {
    if (a.key === spotlight) return 1;
    if (b.key === spotlight) return -1;
    return 0;
  });

  for (const s of ordered) {
    const isSpot = spotlight === s.key;
    const isDimmed = spotlight !== null && !isSpot;
    const alphaMult = isDimmed ? 0.14 : isSpot ? 0.95 : 0.65;

    const poly: { x: number; y: number }[] = [];
    let minX = cx,
      maxX = cx,
      minY = cy,
      maxY = cy;
    for (let i = 0; i < nAxes; i++) {
      const val = Math.max(5, Math.min(100, s.values[i] ?? 0)) / 100;
      const ang = angleFor(i);
      const px = cx + Math.cos(ang) * (maxR * val);
      const py = cy + Math.sin(ang) * (maxR * val);
      poly.push({ x: px, y: py });
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }

    const seed = hashString(s.key);
    if (!isDimmed && (isSpot || ordered.indexOf(s) >= ordered.length - 3)) {
      const gxStart = Math.floor(minX / pxSize);
      const gxEnd = Math.ceil(maxX / pxSize);
      const gyStart = Math.floor(minY / pxSize);
      const gyEnd = Math.ceil(maxY / pxSize);
      const { r, g, b } = s.color.rgb;

      for (let gy = gyStart; gy <= gyEnd; gy++) {
        for (let gx = gxStart; gx <= gxEnd; gx++) {
          const px = gx * pxSize + pxSize * 0.5;
          const py = gy * pxSize + pxSize * 0.5;
          if (!pointInPolygon(px, py, poly)) continue;

          const dist = Math.hypot(px - cx, py - cy) / Math.max(1, maxR);
          const density =
            props.variant === 'solid'
              ? 0.78
              : Math.min(0.92, 0.22 + dist * 0.72);
          if (!shouldLightDitherCell(gx, gy, density, props.variant)) continue;

          const sp = props.sparkles ? isSparkleCell(gx, gy, seed, timeMs) : 0;
          if (sp > 0.05) {
            mCtx.fillStyle = `rgba(255,255,255,${alphaMult})`;
          } else {
            mCtx.fillStyle = `rgba(${r},${g},${b},${(0.48 + dist * 0.4) * alphaMult})`;
          }
          mCtx.fillRect(gx * pxSize, gy * pxSize, pxSize, pxSize);
        }
      }
    }

    // Polygon outline + bloom
    for (const targetCtx of props.bloom !== 'off' && !isDimmed ? [mCtx, bCtx] : [mCtx]) {
      targetCtx.beginPath();
      for (let i = 0; i < poly.length; i++) {
        if (i === 0) targetCtx.moveTo(poly[i].x, poly[i].y);
        else targetCtx.lineTo(poly[i].x, poly[i].y);
      }
      targetCtx.closePath();
      targetCtx.strokeStyle = isSpot ? s.color.brightHex : s.color.hex;
      targetCtx.globalAlpha = isDimmed ? 0.16 : 0.95;
      targetCtx.lineWidth = isSpot ? 2.2 : 1.5;
      targetCtx.stroke();
      targetCtx.globalAlpha = 1;
    }

    if (!isDimmed) {
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i];
        const sz = hoverAxisIdx.value === i ? 6 : 4;
        mCtx.fillStyle = hoverAxisIdx.value === i ? '#ffffff' : s.color.brightHex;
        mCtx.fillRect(Math.round(p.x - sz / 2), Math.round(p.y - sz / 2), sz, sz);
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
  const rx = ev.clientX - rect.left - rect.width * 0.5;
  const ry = ev.clientY - rect.top - props.height * 0.52;
  let ang = Math.atan2(ry, rx) + Math.PI / 2;
  if (ang < 0) ang += Math.PI * 2;
  const nAxes = Math.max(3, props.axes.length);
  const idx = Math.round((ang / (Math.PI * 2)) * nAxes) % nAxes;
  hoverAxisIdx.value = idx;
  drawChart(performance.now());
}

function onMouseLeave() {
  hoverAxisIdx.value = null;
  drawChart(performance.now());
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
    props.axes,
    props.series,
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
