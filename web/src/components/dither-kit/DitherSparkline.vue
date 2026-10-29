<template>
  <canvas
    ref="canvasRef"
    class="dk-sparkline"
    :width="width * 2"
    :height="height * 2"
    :style="{ width: `${width}px`, height: `${height}px` }"
  ></canvas>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import {
  type DitherPaletteEntry,
  type DitherVariant,
  drawDitherColumn,
  hashString,
} from './ditherEngine';

const props = withDefaults(
  defineProps<{
    data: number[];
    color: DitherPaletteEntry;
    width?: number;
    height?: number;
    variant?: DitherVariant;
  }>(),
  {
    width: 110,
    height: 32,
    variant: 'gradient',
  }
);

const canvasRef = ref<HTMLCanvasElement | null>(null);

function render() {
  const c = canvasRef.value;
  if (!c) return;
  const ctx = c.getContext('2d');
  if (!ctx) return;

  const w = props.width;
  const h = props.height;
  ctx.save();
  ctx.scale(2, 2);
  ctx.clearRect(0, 0, w, h);

  const vals = props.data.filter((v) => Number.isFinite(v));
  if (vals.length < 2) {
    ctx.restore();
    return;
  }

  let minV = Math.min(...vals);
  let maxV = Math.max(...vals);
  if (Math.abs(maxV - minV) < 1e-6) {
    maxV += 1;
    minV = Math.max(0, minV - 1);
  }

  const pts = vals.map((v, i) => ({
    x: 2 + (i / (vals.length - 1)) * (w - 4),
    y: h - 3 - ((v - minV) / (maxV - minV)) * (h - 7),
  }));

  const pxSize = 2;
  const gxEnd = Math.floor(w / pxSize);
  const seed = hashString(props.color.name);

  for (let gx = 0; gx < gxEnd; gx++) {
    const sx = gx * pxSize + 1;
    let py = pts[0].y;
    for (let i = 0; i < pts.length - 1; i++) {
      if (sx >= pts[i].x && sx <= pts[i + 1].x) {
        const t = (sx - pts[i].x) / Math.max(1e-4, pts[i + 1].x - pts[i].x);
        py = pts[i].y + (pts[i + 1].y - pts[i].y) * t;
        break;
      }
    }
    drawDitherColumn(ctx, gx, py, h - 1, pxSize, props.color, props.variant, false, seed, 0, 0.85);
  }

  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
    else ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.strokeStyle = props.color.brightHex;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.restore();
}

watch(() => [props.data, props.color, props.variant], render, { deep: true });
onMounted(render);
</script>

<style scoped>
.dk-sparkline {
  display: block;
  image-rendering: pixelated;
}
</style>
