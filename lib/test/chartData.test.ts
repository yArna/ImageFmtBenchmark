import { ref, computed, reactive } from '../../web/node_modules/vue';
import * as engine from '../../web/src/components/dither-kit/ditherEngine';
import { loadVueScript } from './util/loadVueScript';

/** 以轻量画布替身验证实际绘图函数，捕获空值被绘成柱体和负值被坐标轴裁掉的回归。 */
function openChart(name: string, input: Record<string, unknown>) {
  const labels: string[] = [];
  const bars: unknown[][] = [];
  const events: string[] = [];
  const context = {
    save() {}, restore() {}, scale() {}, clearRect() {}, fillRect() {}, strokeRect() {}, translate() {}, rotate() {},
    beginPath() {}, moveTo() {}, bezierCurveTo() {}, stroke() {}, setLineDash() {},
    measureText: (text: string) => ({ width: text.length * 6 }),
    fillText: (text: string) => labels.push(text),
  };
  const props = reactive({ title: 'test', height: 310, sparkles: false, bloom: 'off', variant: 'solid', ...input });
  const chart = loadVueScript(`web/src/components/dither-kit/${name}.vue`, {
    ref, computed, ...engine,
    watch() {}, onMounted() {}, onBeforeUnmount() {},
    defineProps: () => props,
    withDefaults: (value: object, defaults: object) => Object.assign(value, { ...defaults, ...value }),
    defineEmits: () => (event: string) => events.push(event),
    window: { devicePixelRatio: 1 },
    drawDitherRect: (...args: unknown[]) => bars.push(args),
    drawDitherColumn() {},
  }, ['drawChart', 'mainCanvasRef', 'bloomCanvasRef', 'containerRef', 'hoverIndex', 'tooltipRows', 'onCanvasClick']);
  chart.state.mainCanvasRef.value = { width: 0, height: 0, getContext: () => context };
  chart.state.bloomCanvasRef.value = { width: 0, height: 0, getContext: () => context };
  chart.state.containerRef.value = { getBoundingClientRect: () => ({ width: 600, height: 310, top: 0, left: 0 }) };
  return { ...chart, labels, bars, events };
}

test('柱状图的缺失值不绘制最小柱，不显示零值，也不触发加载', () => {
  const chart = openChart('DitherBarChart', { categories: ['m0'], series: [{ key: 'missing', label: '无数据', color: engine.DITHER_PALETTE.green, values: [null] }] });
  try {
    chart.state.drawChart(0);
    expect(chart.bars).toHaveLength(0);
    chart.state.hoverIndex.value = 0;
    expect(chart.state.tooltipRows.value[0].display).toBe('暂无测试结果');
    chart.state.onCanvasClick();
    expect(chart.events).toHaveLength(0);
  } finally { chart.stop(); }
});

test('全部边际值为负数时，曲线坐标仍显示负刻度和零基线', () => {
  const chart = openChart('DitherAreaChart', { xLabels: [96, 100], series: [{ key: 'negative', label: '边际变化', color: engine.DITHER_PALETTE.green, values: [-4, -2] }], yUnit: '百分点/Q' });
  try {
    chart.state.drawChart(0);
    expect(chart.labels.some((label) => /^-/.test(label))).toBe(true);
    expect(chart.labels.some((label) => /^0/.test(label))).toBe(true);
  } finally { chart.stop(); }
});
