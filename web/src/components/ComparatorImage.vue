<template>
  <div class="ComparatorImage">
    <div class="image-layer" :style="transformStyle">
      <PreviewImage
        v-if="src"
        :key="requestUrl"
        v-show="state === 'ready'"
        :src="requestUrl"
        :alt="alt"
        :width="width"
        :height="height"
        :style="imageStyle"
        class="comparison-image"
        draggable="false"
        @load="onImageLoad"
        @error="onImageError"
      />
    </div>
    <div v-if="state !== 'ready'" class="image-message" :class="`is-${side}`" role="status">
      <span>{{ state === 'missing' ? '所选参数暂无测试结果' : state === 'error' ? '图片加载失败' : '正在加载图片…' }}</span>
      <button v-if="state === 'error'" type="button" class="knob-btn" @mousedown.stop @click.stop="retry">重试</button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import PreviewImage from './PreviewImage.vue';

/** 图片请求状态与参数记录分开呈现；失败时不展示上一张图片。 */
type IImageState = 'missing' | 'loading' | 'ready' | 'error';

/** 根据原图尺寸直接计算展示尺寸，状态提示不随图片缩放和平移。 */
export default defineComponent({
  components: { PreviewImage },
  props: {
    /** 当前实际产物地址，包含数据版本。 */
    src: { type: String, required: true },
    /** 无障碍图片说明。 */
    alt: { type: String, required: true },
    /** 原图像素宽度。 */
    width: { type: Number, required: true },
    /** 原图像素高度。 */
    height: { type: Number, required: true },
    /** 各对比面板共用的物理像素倍率。 */
    zoom: { type: Number, default: 1 },
    /** 屏幕像素密度，用于将物理像素换算为 CSS 尺寸。 */
    pixelRatio: { type: Number, default: 1 },
    /** 各对比面板共用的平移变换。 */
    transformStyle: { type: Object as PropType<Record<string, string>>, required: true },
    /** 提示居中到分割线对应一侧。 */
    side: { type: String as PropType<'left' | 'right'>, required: true },
  },
  data() {
    return { state: 'missing' as IImageState, attempt: 0 };
  },
  methods: {
    /** 忽略旧请求的延迟事件，避免覆盖新图片的加载状态。 */
    isCurrentRequest(event: Event): boolean {
      return (event.target as HTMLImageElement).dataset.requestUrl === this.requestUrl;
    },
    onImageLoad(event: Event) {
      if (this.isCurrentRequest(event)) this.state = 'ready';
    },
    onImageError(event: Event) {
      if (this.isCurrentRequest(event)) this.state = 'error';
    },
    retry() {
      this.attempt++;
      this.state = 'loading';
    },
  },
  computed: {
    /** 直接缩放图片，避免先绘制原尺寸再放大父图层；放大时不混合相邻像素颜色。 */
    imageStyle(): Record<string, string> {
      return {
        width: `${this.width * this.zoom / this.pixelRatio}px`,
        height: `${this.height * this.zoom / this.pixelRatio}px`,
        imageRendering: this.zoom > 1 ? 'crisp-edges' : 'auto',
      };
    },
    requestUrl(): string {
      return this.attempt === 0 ? this.src : `${this.src}${this.src.includes('?') ? '&' : '?'}retry=${this.attempt}`;
    },
  },
  watch: {
    src: {
      immediate: true,
      handler(value: string) {
        this.attempt = 0;
        this.state = value ? 'loading' : 'missing';
      },
    },
  },
});
</script>
