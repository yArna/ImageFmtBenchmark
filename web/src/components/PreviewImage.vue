<template>
  <img
    :key="src"
    :src="displaySrc"
    :srcset="density ? `${displaySrc} ${density}x` : undefined"
    :data-request-url="src"
    @load="emit('load', $event)"
    @error="onError"
  />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { decodeJxlPreview } from '../wasm/codecWasm';

/** 普通图片直接显示；静态站点上的 JXL 原生加载失败时按需启用 WASM。 */
const props = defineProps<{ src: string; density?: number }>();
const emit = defineEmits<{ load: [event: Event]; error: [event: Event] }>();
const displaySrc = ref(props.src);
let request = { controller: new AbortController(), attempted: false, objectUrl: '' };

watch(() => props.src, (src, _old, cleanup) => {
  const current = { controller: new AbortController(), attempted: false, objectUrl: '' };
  request = current;
  displaySrc.value = src;
  cleanup(() => {
    current.controller.abort();
    if (current.objectUrl) URL.revokeObjectURL(current.objectUrl);
  });
}, { immediate: true });

/** 取消已切走图片的请求；异步完成后不覆盖当前选择。 */
async function onError(event: Event) {
  const current = request;
  if (current.controller.signal.aborted || (event.target as HTMLImageElement).dataset.requestUrl !== props.src) return;
  if (current.attempted || !/\.jxl(?:[?#]|$)/i.test(props.src)) {
    emit('error', event);
    return;
  }
  current.attempted = true;
  const src = props.src;
  try {
    const response = await fetch(src, { signal: current.controller.signal });
    if (!response.ok) throw new Error(`JXL HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (current.controller.signal.aborted) return;
    const blob = await decodeJxlPreview(bytes);
    if (current.controller.signal.aborted) return;
    current.objectUrl = URL.createObjectURL(blob);
    displaySrc.value = current.objectUrl;
  } catch {
    if (!current.controller.signal.aborted) emit('error', event);
  }
}
</script>
