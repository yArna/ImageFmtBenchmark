<template>
  <div ref="wrapRef" class="dk-gradient-wash" :style="{ height: `${height}px` }">
    <canvas ref="canvasRef" class="dk-gradient-canvas"></canvas>
    <div class="dk-gradient-content">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import {
  DITHER_PALETTE,
  shouldLightDitherCell,
  type DitherVariant,
} from './ditherEngine';

const props = withDefaults(
  defineProps<{
    from?: string;
    to?: string;
    direction?: 'up' | 'down' | 'left' | 'right';
    variant?: DitherVariant;
    height?: number;
    pixelSize?: number;
  }>(),
  {
    from: 'green',
    to: 'purple',
    direction: 'down',
    variant: 'gradient',
    height: 120,
    pixelSize: 3,
  }
);

const wrapRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);

function render() {
  const wrap = wrapRef.value;
  const c = canvasRef.value;
  if (!wrap || !c) return;

  const w = Math.max(200, Math.floor(wrap.getBoundingClientRect().width));
  const h = props.height;
  c.width = w;
  c.height = h;

  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);

  const cFrom = DITHER_PALETTE[props.from] ?? DITHER_PALETTE.green;
  const cTo = DITHER_PALETTE[props.to] ?? DITHER_PALETTE.purple;
  const px = Math.max(2, props.pixelSize);
  const cols = Math.ceil(w / px);
  const rows = Math.ceil(h / px);

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const tx = gx / Math.max(1, cols - 1);
      const ty = gy / Math.max(1, rows - 1);
      const density =
        props.direction === 'down'
          ? (1 - ty) * 0.65
          : props.direction === 'up'
          ? ty * 0.65
          : props.direction === 'right'
          ? tx * 0.65
          : (1 - tx) * 0.65;

      if (!shouldLightDitherCell(gx, gy, density, props.variant)) continue;

      const r = Math.round(cFrom.rgb.r + (cTo.rgb.r - cFrom.rgb.r) * tx);
      const g = Math.round(cFrom.rgb.g + (cTo.rgb.g - cFrom.rgb.g) * tx);
      const b = Math.round(cFrom.rgb.b + (cTo.rgb.b - cFrom.rgb.b) * tx);
      ctx.fillStyle = `rgba(${r},${g},${b},${(0.18 + density * 0.55).toFixed(3)})`;
      ctx.fillRect(gx * px, gy * px, px, px);
    }
  }
}

let ro: ResizeObserver | null = null;
watch(() => [props.from, props.to, props.direction, props.variant, props.pixelSize], render);

onMounted(() => {
  render();
  if (wrapRef.value) {
    ro = new ResizeObserver(render);
    ro.observe(wrapRef.value);
  }
});

onBeforeUnmount(() => {
  if (ro) ro.disconnect();
});
</script>

<style scoped>
.dk-gradient-wash {
  position: relative;
  width: 100%;
  overflow: hidden;
}
.dk-gradient-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  image-rendering: pixelated;
}
.dk-gradient-content {
  position: relative;
  z-index: 1;
  height: 100%;
}
</style>
