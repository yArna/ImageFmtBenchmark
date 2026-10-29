<template>
  <canvas
    ref="canvasRef"
    class="dk-avatar"
    :width="size * 2"
    :height="size * 2"
    :style="{ width: `${size}px`, height: `${size}px` }"
  ></canvas>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { drawMirroredAvatar, type DitherPaletteEntry } from './ditherEngine';

const props = withDefaults(
  defineProps<{
    name: string;
    size?: number;
    color?: DitherPaletteEntry;
  }>(),
  {
    size: 28,
  }
);

const canvasRef = ref<HTMLCanvasElement | null>(null);

function render() {
  if (canvasRef.value) {
    drawMirroredAvatar(canvasRef.value, props.name, props.color);
  }
}

watch(() => [props.name, props.size, props.color], render, { deep: true });
onMounted(render);
</script>

<style scoped>
.dk-avatar {
  display: inline-block;
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.16);
  image-rendering: pixelated;
  background: #0d0d11;
}
</style>
