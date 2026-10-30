import { computed, nextTick, reactive, ref, watch } from '../../web/node_modules/vue';
import { buildImagePreviewUrl, siteAssetUrl } from '../../web/src/lib/assetUrls';
import { loadVueScript } from './util/loadVueScript';

/** 验证真实发布地址，包括中文、空格和固定提交，而非复写 URL 实现。 */
test('开发路径与 GitHub Pages / Raw 快照路径分别生成', () => {
  vi.stubGlobal('__IFB_SITE_BASE__', '/');
  vi.stubGlobal('__IFB_RAW_BASE__', '');
  expect(buildImagePreviewUrl('source-image', '插画 测试.png', 'v 1')).toBe('/source-image/%E6%8F%92%E7%94%BB%20%E6%B5%8B%E8%AF%95.png?v=v%201');
  vi.stubGlobal('__IFB_SITE_BASE__', '/ImageFmtBenchmark/');
  vi.stubGlobal('__IFB_RAW_BASE__', 'https://raw.githubusercontent.com/yArna/ImageFmtBenchmark/abc123/');
  expect(siteAssetUrl('wasm/cjxl.wasm')).toBe('/ImageFmtBenchmark/wasm/cjxl.wasm');
  expect(buildImagePreviewUrl('result-file', 'images/插画/a.jxl')).toBe('https://raw.githubusercontent.com/yArna/ImageFmtBenchmark/abc123/result/images/%E6%8F%92%E7%94%BB/a.jxl');
  expect(buildImagePreviewUrl('source-image', 'a.png')).toBe('https://raw.githubusercontent.com/yArna/ImageFmtBenchmark/abc123/images/a.png');
  vi.unstubAllGlobals();
});

/** 运行真实组件脚本，网络完成顺序与解码结果由测试控制。 */
function openPreview() {
  const props = reactive({ src: '/result-file/a.jxl' });
  const emit = vi.fn();
  const fetch = vi.fn();
  const decodeJxlPreview = vi.fn(async () => new Blob(['png']));
  const createObjectURL = vi.fn(() => 'blob:preview');
  const revokeObjectURL = vi.fn();
  const app = loadVueScript('web/src/components/PreviewImage.vue', {
    ref, watch, computed, defineProps: () => props, defineEmits: () => emit,
    fetch, decodeJxlPreview, URL: { createObjectURL, revokeObjectURL },
  }, ['displaySrc', 'onError']);
  const event = (url = props.src) => ({ target: { dataset: { requestUrl: url } } });
  return { ...app, props, emit, fetch, decodeJxlPreview, createObjectURL, revokeObjectURL, event };
}

test('JXL 加载失败才解码，切图时释放 Blob，普通图片失败保持错误反馈', async () => {
  const app = openPreview();
  try {
    expect(app.fetch).not.toHaveBeenCalled();
    app.fetch.mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
    await app.state.onError(app.event());
    expect(app.decodeJxlPreview).toHaveBeenCalledOnce();
    expect(app.state.displaySrc.value).toBe('blob:preview');
    app.props.src = '/result-file/b.png'; await nextTick();
    expect(app.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    await app.state.onError(app.event());
    expect(app.emit).toHaveBeenCalledWith('error', expect.anything());
    expect(app.fetch).toHaveBeenCalledOnce();
  } finally { app.stop(); }
});

test('切图与卸载取消旧请求，旧解码完成不能覆盖新图', async () => {
  const app = openPreview();
  let finish!: (value: Blob) => void;
  app.fetch.mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
  app.decodeJxlPreview.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  try {
    const pending = app.state.onError(app.event());
    await vi.waitFor(() => expect(app.decodeJxlPreview).toHaveBeenCalledOnce());
    const signal = app.fetch.mock.calls[0][1].signal;
    app.props.src = '/result-file/b.jxl'; await nextTick();
    expect(signal.aborted).toBe(true);
    finish(new Blob(['old'])); await pending;
    expect(app.state.displaySrc.value).toBe('/result-file/b.jxl');
    expect(app.createObjectURL).not.toHaveBeenCalled();
    await app.state.onError(app.event('/result-file/a.jxl'));
    expect(app.fetch).toHaveBeenCalledOnce();
  } finally { app.stop(); }
});
