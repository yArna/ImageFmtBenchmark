import * as assetTools from '../../web/src/lib/assetUrls';
import { ref, computed, reactive, watch, nextTick, createRenderer, defineComponent, h } from '../../web/node_modules/vue';
import * as dataTools from '../benchmarkData';
import * as engine from '../../web/src/components/dither-kit/ditherEngine';
import { loadVueScript, loadVueOptions } from './util/loadVueScript';

vi.stubGlobal('__IFB_SITE_BASE__', '/');
vi.stubGlobal('__IFB_RAW_BASE__', '');

/** 运行对比器的真实参数匹配与视口交互；视口尺寸固定以便校验像素坐标。 */
function openComparator(pixelRatio = 1) {
  let mount = () => {};
  let unmount = () => {};
  const queries: { addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> }[] = [];
  const screenWindow = {
    devicePixelRatio: pixelRatio,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    matchMedia: vi.fn(() => {
      const query = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
      queries.push(query);
      return query;
    }),
  };
  const props = reactive({
    currentImage: { name: 'large.png', width: 1200, height: 900 }, dataVersion: 'v1', encoders: [], qualityLevels: [80],
    recordsForImage: [{ encoder: 'cjxl', effortTag: 'e7', quality: 80, lossless: false, outputFile: 'images/示例/cjxl.jxl' }],
    slotAEncoder: 'cjxl', slotAEffort: 'e7', slotAQuality: 80,
    slotBEncoder: 'cwebp', slotBEffort: 'm4', slotBQuality: 80,
  });
  const app = loadVueScript('web/src/components/ImageSplitComparator.vue', {
    ref, computed, watch, window: screenWindow,
    onMounted: (callback: () => void) => { mount = callback; },
    onUnmounted: (callback: () => void) => { unmount = callback; },
    ...dataTools, ...assetTools, ...engine, defineProps: () => props, defineEmits: () => () => {},
  }, ['qualityLabel', 'encoderModeLabel', 'findBestRecord', 'zoom', 'panX', 'panY', 'splitX', 'setZoom', 'onWheelZoom', 'fitViewport', 'onStageMouseDown', 'onStageMouseMove', 'onStageMouseUp', 'compareMode', 'stageRef', 'urlA', 'urlB', 'origUrl', 'resetViewport', 'panZoomStyle', 'pixelRatio', 'updatePixelRatio']);
  const stage = { clientWidth: 600, clientHeight: 520, clientLeft: 0, clientTop: 0, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  app.state.stageRef.value = stage;
  mount();
  return { ...app, props, stage, screenWindow, queries, stop: () => { unmount(); app.stop(); } };
}

/** 大图直接按目标尺寸绘制，不能把原尺寸图层再次放大。 */
test('共享变换只平移，缩放不再放大父图层', () => {
  const app = openComparator(); const s = app.state;
  try {
    s.panX.value = 12; s.panY.value = -7;
    s.setZoom(4);
    expect(s.panZoomStyle.value.transform).toBe('translate(48px, -28px)');
  } finally { app.stop(); }
});

test('倍率按钮和滚轮都保留观察锚点', () => {
  const app = openComparator(); const s = app.state;
  try {
    s.panX.value = -50; s.panY.value = -30;
    s.setZoom(2);
    expect(-s.panX.value / s.zoom.value).toBe(50);
    expect(-s.panY.value / s.zoom.value).toBe(30);
    s.resetViewport(); s.panX.value = -50; s.panY.value = -30;
    s.onWheelZoom({ clientX: 300, clientY: 260, deltaY: -1 });
    expect(-s.panX.value / s.zoom.value).toBeCloseTo(50);
    expect(-s.panY.value / s.zoom.value).toBeCloseTo(30);
  } finally { app.stop(); }
});

test('适合窗口使用真实倍率，换模式保持倍率，换图重置旧视口', async () => {
  const app = openComparator(); const s = app.state;
  try {
    s.fitViewport(); expect(s.zoom.value).toBe(0.46);
    s.setZoom(2); app.stage.clientHeight = 680; s.compareMode.value = 'quad'; await nextTick();
    expect(s.zoom.value).toBe(2);
    s.panX.value = 5000; s.panY.value = 5000;
    app.props.currentImage = { name: 'small.png', width: 100, height: 100 };
    expect([s.zoom.value, s.panX.value, s.panY.value, s.splitX.value]).toEqual([1, 0, 0, 50]);
  } finally { app.stop(); }
});

test('小图也可自由平移，切换模式、调整窗口和缩放不会限制平移位置', async () => {
  const app = openComparator(); const s = app.state;
  try {
    s.setZoom(0.1);
    s.onStageMouseDown({ button: 0, clientX: 100, clientY: 100 });
    s.onStageMouseMove({ clientX: 5100, clientY: -4900 });
    s.onStageMouseUp();
    expect([s.panX.value, s.panY.value]).toEqual([5000, -5000]);
    s.compareMode.value = 'quad'; app.stage.clientHeight = 680; await nextTick();
    expect([s.panX.value, s.panY.value]).toEqual([5000, -5000]);
    s.setZoom(0.2);
    expect([s.panX.value, s.panY.value]).toEqual([10000, -10000]);
  } finally { app.stop(); }
});

test('四宫格上下行在同一局部坐标滚轮缩放时保持同一锚点', () => {
  const app = openComparator(); const s = app.state;
  try {
    app.stage.clientHeight = 680; s.compareMode.value = 'quad';
    s.onWheelZoom({ clientX: 350, clientY: 100, deltaY: -1 });
    const top = [s.zoom.value, s.panX.value, s.panY.value];
    s.resetViewport();
    s.onWheelZoom({ clientX: 350, clientY: 440, deltaY: -1 });
    expect([s.zoom.value, s.panX.value, s.panY.value]).toEqual(top);
  } finally { app.stop(); }
});

test('数据版本变化更新源图和产物地址，缺少记录仍不回退原图', () => {
  const app = openComparator(); const s = app.state;
  try {
    const previous = s.urlA.value;
    app.props.dataVersion = 'v2';
    expect(s.urlA.value).not.toBe(previous);
    expect(s.urlA.value).toContain('?v=v2');
    expect(s.origUrl.value).toContain('?v=v2');
    expect(s.urlB.value).toBe('');
  } finally { app.stop(); }
});

/** 用 Vue 自身的无 DOM 渲染器执行 Options API，请求完成顺序保持可控。 */
function openImage() {
  const component = loadVueOptions('web/src/components/ComparatorImage.vue', defineComponent, { PreviewImage: {} });
  component.render = () => null;
  const props = reactive({ src: '/result-file/a.png?v=1', alt: 'test', width: 100, height: 100, zoom: 1, pixelRatio: 1, transformStyle: {}, side: 'left' });
  const instance = ref<any>(null);
  const renderer = createRenderer({
    patchProp() {}, insert() {}, remove() {}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    setText() {}, setElementText() {}, parentNode: () => null, nextSibling: () => null,
  });
  const app = renderer.createApp({ render: () => h(component, { ...props, ref: instance }) });
  app.mount({});
  return { vm: instance.value, props, stop: () => app.unmount() };
}

/** 构造与 DOM 属性一致的请求事件，不模拟图片解码本身。 */
function imageEvent(src: string) {
  return { target: { dataset: { requestUrl: src } } };
}

test('新请求隐藏旧图并忽略旧请求的延迟完成事件', async () => {
  const app = openImage(); const vm = app.vm;
  try {
    expect(vm.state).toBe('loading');
    vm.onImageLoad(imageEvent(vm.requestUrl)); expect(vm.state).toBe('ready');
    const old = vm.requestUrl;
    app.props.src = '/result-file/b.png?v=2'; await nextTick();
    expect(vm.state).toBe('loading');
    vm.onImageLoad(imageEvent(old)); expect(vm.state).toBe('loading');
    vm.onImageError(imageEvent(old)); expect(vm.state).toBe('loading');
    vm.onImageLoad(imageEvent(vm.requestUrl)); expect(vm.state).toBe('ready');
  } finally { app.stop(); }
});

test('加载失败支持独立重试；无数据不伪装为加载失败', async () => {
  const app = openImage(); const vm = app.vm;
  try {
    vm.onImageError(imageEvent(vm.requestUrl)); expect(vm.state).toBe('error');
    const failed = vm.requestUrl; vm.retry();
    expect(vm.state).toBe('loading'); expect(vm.requestUrl).not.toBe(failed);
    vm.onImageError(imageEvent(failed)); expect(vm.state).toBe('loading');
    vm.onImageLoad(imageEvent(vm.requestUrl)); expect(vm.state).toBe('ready');
    app.props.src = ''; await nextTick(); expect(vm.state).toBe('missing');
  } finally { app.stop(); }
});


test('对比器区分实测无损 Q100 和像素不一致的独立无损开关', () => {
  const app = openComparator(); const s = app.state;
  try {
    app.props.recordsForImage.push(
      { encoder: 'cjxl', effortTag: 'e7', quality: 100, lossless: true, outputFile: 'images/true-lossless.jxl' },
      { encoder: 'cwebp', effortTag: 'm4', quality: null as any, lossless: false, outputFile: 'images/changed-rgb.webp' },
    );
    expect(s.qualityLabel('cjxl', 'e7', 100)).toBe('Q=100（无损）');
    expect(s.qualityLabel('cwebp', 'm4', null)).toBe('无损模式（像素不一致）');
    expect(s.encoderModeLabel('cjxl')).toBe('有损/无损');
    expect(s.encoderModeLabel('cwebp')).toBe('有损');
    expect(s.findBestRecord('cjxl', 'e7', 100).outputFile).toBe('images/true-lossless.jxl');
    expect(s.findBestRecord('cwebp', 'm4', -1).outputFile).toBe('images/changed-rgb.webp');
  } finally { app.stop(); }
});

/** 宽高不受视口裁剪改变；同一张图缩放时不重新请求或替换数据。 */
test('直接按原尺寸乘倍率展示，正常显示平滑、放大保留像素颜色', async () => {
  const app = openImage();
  try {
    const request = app.vm.requestUrl;
    app.props.width = 1200; app.props.height = 900;
    for (const zoom of [0.46, 1, 1.15, 2, 4, 8]) {
      app.props.zoom = zoom; await nextTick();
      expect(app.vm.imageStyle).toEqual({
        width: `${1200 * zoom}px`, height: `${900 * zoom}px`,
        imageRendering: zoom > 1 ? 'crisp-edges' : 'auto',
      });
      expect(app.vm.requestUrl).toBe(request);
    }
  } finally { app.stop(); }
});

/** 同一物理倍率在不同密度屏幕上的 CSS 尺寸不同，100% 不应将 Retina 像素放大。 */
test('1 倍、Retina 和分数密度屏幕按物理像素展示', async () => {
  const app = openImage();
  try {
    app.props.width = 1200; app.props.height = 900;
    for (const pixelRatio of [1, 1.25, 2, 3]) {
      app.props.pixelRatio = pixelRatio;
      for (const zoom of [0.5, 1, 2, 4]) {
        app.props.zoom = zoom; await nextTick();
        expect(parseFloat(app.vm.imageStyle.width) * pixelRatio).toBeCloseTo(1200 * zoom);
        expect(parseFloat(app.vm.imageStyle.height) * pixelRatio).toBeCloseTo(900 * zoom);
        expect(app.vm.imageStyle.imageRendering).toBe(zoom > 1 ? 'crisp-edges' : 'auto');
      }
    }
  } finally { app.stop(); }
});

/** 窗口尺寸仍为 CSS 像素，适配计算须换算到物理像素空间。 */
test('高清屏适合窗口和滚轮锚点使用一致的物理倍率', () => {
  const app = openComparator(2); const s = app.state;
  try {
    s.fitViewport(); expect(s.zoom.value).toBe(0.92);
    expect(app.props.currentImage.width * s.zoom.value / s.pixelRatio.value).toBe(552);
    s.panX.value = -30; s.panY.value = -20;
    const anchor = { x: 50, y: 40 };
    const before = [(anchor.x - s.panX.value) * 2 / s.zoom.value, (anchor.y - s.panY.value) * 2 / s.zoom.value];
    s.onWheelZoom({ clientX: 350, clientY: 300, deltaY: -1 });
    expect((anchor.x - s.panX.value) * 2 / s.zoom.value).toBeCloseTo(before[0]);
    expect((anchor.y - s.panY.value) * 2 / s.zoom.value).toBeCloseTo(before[1]);
    s.resetViewport(); expect(s.zoom.value).toBe(1);
  } finally { app.stop(); }
});

/** 跨屏后倍率不变，中心对应的原图位置不变，并重订阅密度变化。 */
test('跨屏或页面缩放更新密度并清理监听器', () => {
  const app = openComparator(2); const s = app.state;
  const firstQuery = app.queries[0];
  try {
    s.setZoom(4); s.panX.value = -40; s.panY.value = 20;
    app.screenWindow.devicePixelRatio = 1.25;
    s.updatePixelRatio();
    expect(s.pixelRatio.value).toBe(1.25);
    expect(s.zoom.value).toBe(4);
    expect([s.panX.value, s.panY.value]).toEqual([-64, 32]);
    expect(firstQuery.removeEventListener).toHaveBeenCalledWith('change', s.updatePixelRatio);
    expect(app.screenWindow.matchMedia).toHaveBeenLastCalledWith('(resolution: 1.25dppx)');
  } finally { app.stop(); }
  expect(app.queries.at(-1)!.removeEventListener).toHaveBeenCalledWith('change', s.updatePixelRatio);
  expect(app.screenWindow.removeEventListener).toHaveBeenCalledWith('resize', s.updatePixelRatio);
});
