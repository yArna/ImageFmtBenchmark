import * as assetTools from '../../web/src/lib/assetUrls';
import { ref, computed } from '../../web/node_modules/vue';
import * as dataTools from '../benchmarkData';
import * as engine from '../../web/src/components/dither-kit/ditherEngine';
import { loadVueScript } from './util/loadVueScript';

vi.stubGlobal('__IFB_SITE_BASE__', '/');
vi.stubGlobal('__IFB_RAW_BASE__', '');

/** 用少量可控记录覆盖不同编码模式和力度，推荐结果不受真实机器计时波动影响。 */
function makeFixture() {
  const images = [{ name: 'fixture.png', stem: 'fixture', width: 10, height: 10, bitDepth: 8, colorType: 2, inputBytes: 1000 }];
  const qualityLevels = [0, 65, 80, 93, 96, 100];
  const specs = [
    { name: 'png-libpng', tags: ['l1', 'l6', 'l8'], lossless: true, supportsLossless: true },
    { name: 'cjpegli', tags: ['p0', 'p2'], lossless: false, supportsLossless: false },
    { name: 'cjxl', tags: ['e1', 'e3', 'e7'], lossless: false, supportsLossless: true },
    { name: 'cwebp', tags: ['m0', 'm4', 'm5'], lossless: false, supportsLossless: true },
    { name: 'cwebp-sharp-yuv', tags: ['m0', 'm4', 'm5'], lossless: false, supportsLossless: false },
    { name: 'avifenc-aom', tags: ['s6', 's9'], lossless: false, supportsLossless: true },
  ];
  const encoders = specs.map((spec) => ({ ...spec, format: 'test', efforts: spec.tags.map((tag) => ({ tag, effort: Number(tag.slice(1)), label: `-${tag[0]} ${tag.slice(1)}` })) }));
  const records = encoders.flatMap((cfg) => cfg.efforts.flatMap((ef, index) => {
    const qualities: (number | null)[] = cfg.lossless ? [null] : [...qualityLevels, ...(cfg.supportsLossless ? [null] : [])];
    return qualities.map((q) => {
      const bytes = q === null ? 550 : cfg.name === 'cjxl' && q === 100 ? 550 : Math.round(100 + q * 5 + (2 - index) * 20);
      const encode = [1, 2, 30][index];
      const row: any[] = ['fixture.png', cfg.name, cfg.format, q === null ? 1 : 0, q, ef.tag, ef.label, 1000, bytes, bytes / 1000, 100 - bytes / 10, 8, 1, encode, 1, encode + 2, `${cfg.name}/${ef.tag}/${q}`, 1];
      const lossless = q === null || cfg.name === 'cjxl' && q === 100;
      row[20] = { key: 'a'.repeat(64), rgbEqual: lossless, alphaEqual: true, dimensionsEqual: true, colorEncodingEqual: true };
      row[21] = lossless;
      return row;
    });
  }));
  return { generatedAt: '', totalElapsedMs: 1, config: { qualityLevels, encoders }, summary: {}, images, records };
}

/** 组件内只替换加载入口，所有计算、事件与选中态均运行真实源码。 */
async function openViews(scores?: (number | null)[]) {
  const fixture = makeFixture();
  scores?.forEach((score, index) => { fixture.records[index][19] = score; });
  let mount = async () => {};
  const app = loadVueScript('web/src/App.vue', {
    ref, computed, ...dataTools, ...assetTools, ...engine,
    onMounted: (callback: () => Promise<void>) => { mount = callback; },
    fetch: async () => ({ json: async () => fixture }),
  }, [
    'qualityChartLevels', 'selectQualityChartTab', 'qualityTimeSeries', 'qualityChartTab', 'qualityObjectiveSeries', 'activeQualityChartSeries', 'onSelectQualityOnChart', 'dataset', 'syncedQuality', 'slotAEncoder', 'slotAEffort', 'slotAQuality', 'slotBEncoder', 'slotBEffort', 'slotBQuality',
    'loadRecordIntoSlot', 'applyOptimalToSlot', 'encoderOptimalRecommendations', 'optimalFocusEncoder', 'currentOptimalFocusItem',
    'onSelectOptimalQualityOnChart', 'selectEffortEncoder', 'onEncoderRowClick', 'effortQualitySelection', 'effortFocusVolumeSeries',
    'effortFocusTimeSeries', 'effortFocusEncoder', 'isSlotSelection', 'syncQualitySlots', 'losslessReferenceCounts', 'qualityEncoderCount',
    'optimalQualityChartTab', 'optimalQualityChartSeries', 'unavailableOptimalEncoders', 'effortStrategy', 'getActiveLosslessEfforts',
    'overviewFilterMode', 'overviewLosslessMode', 'targetSsimulacra2', 'encoderSummaryCards', 'overviewMissingScoreEncoders',
    'effortHasPixelLossyIndependentMode', 'effortQualityLabel', 'qualityVolumeSeries', 'selectedXEncoderDetails', 'includeLosslessInQualityChart', 'onSelectEffortOnChart', 'selectEffortQuality', 'aggregateAllImages', 'selectOverviewCard', 'overviewRatioBarSeries', 'onObjectiveSliderInput', 'objectiveSliderIndex', 'objectiveTickPresets', 'formatOverviewScore',
  ]);
  await mount();
  return app;
}

let app: Awaited<ReturnType<typeof openViews>>;
beforeEach(async () => { app = await openViews(); });
afterEach(() => { app.stop(); });

test('网页兼容新旧评分列，保留负分和零分，缺失值不伪装为零', async () => {
  const scored = await openViews([-40.5, 0, 100, null]);
  try {
    const records = scored.state.dataset.value.records;
    expect(records.slice(0, 5).map((record: any) => record.ssimulacra2)).toEqual([-40.5, 0, 100, undefined, undefined]);
    expect(records[0].outputFile).toContain('png-libpng/');
    expect(records[0].decode_ms).toBe(1);
  } finally { scored.stop(); }
});

/** 评分不保证随 Q 单调增加；客观匹配仅使用有损编码器的质量档位。 */
test('客观指标按实测评分匹配，旧无损开关不影响匹配和对比器参数', () => {
  const s = app.state;
  for (const record of s.dataset.value.records) record.ssimulacra2 = record.encoder === 'png-libpng' ? 66 : record.quality === null ? 80 : record.quality === 80 ? 79 : 0;
  s.overviewLosslessMode.value = true; s.overviewFilterMode.value = 'objective';
  const card = s.encoderSummaryCards.value.find((item: any) => item.encoder === 'cwebp');
  expect([card.matchedQuality, card.avgSsimulacra2]).toEqual([80, 79]);
  expect(card.previewUrl).toContain('cwebp/m4/80');
  const png = s.encoderSummaryCards.value.find((item: any) => item.encoder === 'png-libpng');
  expect(png).toBeUndefined();
  expect(s.encoderSummaryCards.value.every((item: any) => item.matchedQuality !== null)).toBe(true);
  const other = [s.slotBEncoder.value, s.slotBEffort.value, s.slotBQuality.value];
  s.selectOverviewCard(card);
  expect([s.slotAEncoder.value, s.slotAEffort.value, s.slotAQuality.value]).toEqual(['cwebp', 'm4', 80]);
  expect([s.slotBEncoder.value, s.slotBEffort.value, s.slotBQuality.value]).toEqual(other);
  expect(s.overviewRatioBarSeries.value[0].formattedValues.some((value: string) => value.includes('SS2 79.00') && value.includes('-1.00'))).toBe(true);
});

test('全集按同一档全部图片的平均分匹配，排除缺少评分的档位', () => {
  const s = app.state, data = s.dataset.value;
  for (const record of data.records) record.ssimulacra2 = record.quality === 65 ? 100 : record.quality === 80 ? 80 : 0;
  data.images.push({ ...data.images[0], name: 'second.png', stem: 'second' });
  data.records.push(...data.records.map((record: any) => ({ ...record, image: 'second.png', ssimulacra2: record.quality === 65 ? 60 : record.quality === 80 ? 20 : 0 })));
  s.overviewFilterMode.value = 'objective'; s.aggregateAllImages.value = true;
  let card = s.encoderSummaryCards.value.find((item: any) => item.encoder === 'cwebp');
  expect([card.matchedQuality, card.avgSsimulacra2]).toEqual([65, 80]);
  data.records.find((record: any) => record.image === 'second.png' && record.encoder === 'cwebp' && record.effortTag === 'm4' && record.quality === 65).ssimulacra2 = undefined;
  card = s.encoderSummaryCards.value.find((item: any) => item.encoder === 'cwebp');
  expect([card.matchedQuality, card.avgSsimulacra2]).toEqual([80, 50]);
  s.aggregateAllImages.value = false;
  expect(s.encoderSummaryCards.value.find((item: any) => item.encoder === 'cwebp').matchedQuality).toBe(65);
});

test('力度策略分别匹配评分，相同偏差优先选择体积较小的实测档位', () => {
  const s = app.state;
  for (const record of s.dataset.value.records) {
    record.ssimulacra2 = record.effortTag === 'm0' && record.quality === 65 ? 80 : record.effortTag === 'm4' && record.quality === 80 ? 80 : record.effortTag === 'm5' && [65, 80].includes(record.quality) ? record.quality === 65 ? 78 : 82 : 0;
  }
  s.overviewFilterMode.value = 'objective';
  for (const [strategy, effort, quality] of [['fastest', 'm0', 65], ['default', 'm4', 80], ['best', 'm5', 65]]) {
    s.effortStrategy.value = strategy;
    const card = s.encoderSummaryCards.value.find((item: any) => item.encoder === 'cwebp');
    expect([card.effortTag, card.matchedQuality]).toEqual([effort, quality]);
  }
});

test('客观评分滑块与刻度一致，缺失评分不伪装为零，实际负分按简写显示', () => {
  const s = app.state;
  s.overviewFilterMode.value = 'objective';
  expect(s.encoderSummaryCards.value).toEqual([]);
  expect(s.overviewMissingScoreEncoders.value).toHaveLength(5);
  for (const [index, score] of s.objectiveTickPresets.entries()) {
    s.onObjectiveSliderInput(index);
    expect(s.targetSsimulacra2.value).toBe(score);
    expect(s.objectiveSliderIndex.value).toBe(index);
  }
  s.onObjectiveSliderInput(-1); s.onObjectiveSliderInput(1000);
  expect(s.targetSsimulacra2.value).toBe(100);
  const record = s.dataset.value.records.find((record: any) => record.encoder === 'cwebp' && record.effortTag === 'm4' && record.quality === 0);
  record.ssimulacra2 = 0; s.onObjectiveSliderInput(0);
  expect(s.encoderSummaryCards.value[0].avgSsimulacra2).toBe(0);
  record.ssimulacra2 = 9.82; s.onObjectiveSliderInput(s.objectiveTickPresets.indexOf(30));
  expect(s.formatOverviewScore(s.encoderSummaryCards.value[0])).toBe('SS2 9.82 (-20.18)');
  record.ssimulacra2 = -10;
  expect(s.formatOverviewScore(s.encoderSummaryCards.value[0])).toBe('SS2 -10.00 (-40.00)');
});

test('详细记录与推荐的单槽操作保留另一侧参数和全局质量', () => {
  const s = app.state;
  const record = s.dataset.value.records.find((r: any) => r.encoder === 'cjpegli' && r.quality === 65);
  const recommendation = s.encoderOptimalRecommendations.value.find((r: any) => r.encoder === 'cjpegli');
  for (const slot of ['A', 'B']) {
    const other = slot === 'A' ? 'B' : 'A';
    s[`slot${other}Quality`].value = -1;
    s.loadRecordIntoSlot(slot, record);
    expect(s[`slot${other}Quality`].value).toBe(-1);
    s.applyOptimalToSlot(slot, recommendation);
    expect(s[`slot${other}Quality`].value).toBe(-1);
    expect(s.syncedQuality.value).toBe(80);
  }
  s.syncQualitySlots(93);
  expect([s.slotAQuality.value, s.slotBQuality.value]).toEqual([93, 93]);
});

test('点击优选质量曲线加载同一力度下的实际记录', () => {
  const s = app.state;
  const item = s.encoderOptimalRecommendations.value.find((r: any) => r.encoder === 'cjxl');
  expect(item.bestEffortTag).not.toBe(item.qualityEffortTag);
  s.slotBQuality.value = -1;
  for (const point of item.qualityPoints) {
    s.onSelectOptimalQualityOnChart({ index: 0, value: point.q });
    const record = dataTools.findExactEncodingRecord(s.dataset.value.records, s.slotAEncoder.value, s.slotAEffort.value, s.slotAQuality.value);
    expect(record?.effortTag).toBe(item.qualityEffortTag);
    expect((record as any)?.outputBytes).toBe(point.bytes);
    expect(s.slotBQuality.value).toBe(-1);
  }
});

test('缺失编码器不产生零值柱体、虚构得分或借用其他推荐', () => {
  const s = app.state;
  s.dataset.value.records = s.dataset.value.records.filter((r: any) => r.encoder !== 'cjxl');
  s.selectEffortEncoder('cjxl');
  expect(s.effortFocusVolumeSeries.value[0].values).toEqual([null, null, null]);
  for (const series of s.effortFocusTimeSeries.value) expect(series.values).toEqual([null, null, null]);
  expect(s.encoderOptimalRecommendations.value.some((r: any) => r.encoder === 'cjxl')).toBe(false);
  expect(s.currentOptimalFocusItem.value).toBeNull();
  expect(s.unavailableOptimalEncoders.value).toContain('JXL-cjxl');
});

test('候选质量不足时只推荐有实际结果的档位', () => {
  const s = app.state;
  s.dataset.value.records = s.dataset.value.records.filter((r: any) => r.encoder !== 'cjxl' || r.quality === 65);
  const item = s.encoderOptimalRecommendations.value.find((r: any) => r.encoder === 'cjxl');
  expect(item.bestQuality).toBe(65);
  expect(item.outputBytes).toBeGreaterThan(0);
});

test('高亮区分有损与无损，并识别纯无损编码器的实际模式', () => {
  const s = app.state;
  expect(s.isSlotSelection('A', 'cjxl', 'e7', 80)).toBe(true);
  expect(s.isSlotSelection('A', 'cjxl', 'e7', null)).toBe(false);
  s.slotAQuality.value = -1;
  expect(s.isSlotSelection('A', 'cjxl', 'e7', 80)).toBe(false);
  expect(s.isSlotSelection('A', 'cjxl', 'e7', null)).toBe(true);
  s.slotAEncoder.value = 'png-libpng'; s.slotAEffort.value = 'l6'; s.slotAQuality.value = 80;
  expect(s.isSlotSelection('A', 'png-libpng', 'l6', null)).toBe(true);
});

test('边际曲线保留体积下降的负值，并用有符号的百分点展示', () => {
  const s = app.state;
  s.optimalFocusEncoder.value = 'cwebp';
  for (const record of s.dataset.value.records) {
    if (record.encoder === 'cwebp' && record.quality === 100) record.outputBytes = 200;
  }
  const item = s.currentOptimalFocusItem.value;
  expect(item.qualityPoints.find((point: any) => point.q === 100).marginalPctPerQ).toBeLessThan(0);
  s.optimalQualityChartTab.value = 'marginal';
  expect(s.optimalQualityChartSeries.value[0].formattedValues.at(-1)).toMatch(/^-.*个百分点/);
});

test('参考线数量随有效数据变化，均衡档不受其他力度策略影响', () => {
  const s = app.state;
  expect(s.qualityEncoderCount.value).toBe(5);
  expect(s.losslessReferenceCounts.value).toEqual({ balanced: 5, extremes: 10, all: 14 });
  s.effortStrategy.value = 'fastest';
  const config = s.dataset.value.config.encoders.find((cfg: any) => cfg.name === 'cjxl');
  expect(s.getActiveLosslessEfforts(config).map((ef: any) => ef.tag)).toEqual(['e7']);
  s.dataset.value.records = s.dataset.value.records.filter((r: any) => r.encoder !== 'cjxl');
  expect(s.losslessReferenceCounts.value).toEqual({ balanced: 3, extremes: 6, all: 8 });
});

test('两个力度编码器入口采用相同的质量模式切换规则', () => {
  const s = app.state;
  s.selectEffortEncoder('png-libpng');
  expect(s.effortQualitySelection.value).toBe('lossless');
  s.onEncoderRowClick('cjxl');
  expect(s.effortQualitySelection.value).toBe(80);
  s.selectEffortEncoder('png-libpng'); s.selectEffortEncoder('cjxl');
  expect(s.effortQualitySelection.value).toBe(80);
});


test('实测 Q100 无损移入无损参考线，并保持对比器的实际 Q100 参数', () => {
  const s = app.state;
  s.includeLosslessInQualityChart.value = true;
  const curve = s.qualityVolumeSeries.value.find((series: any) => series.key === 'cjxl');
  expect(curve.values.at(-1)).toBeNull();
  expect(s.qualityVolumeSeries.value.some((series: any) => series.dashed && series.key === 'cjxl__e7__100')).toBe(true);
  expect(s.selectedXEncoderDetails.value.some((item: any) => item.encoder === 'cjxl' && item.lossless && item.quality === 100)).toBe(true);
  s.selectEffortEncoder('cjxl'); s.selectEffortQuality('lossless');
  s.dataset.value.records = s.dataset.value.records.filter((record: any) => !(record.encoder === 'cjxl' && record.quality === null));
  s.onSelectEffortOnChart({ index: 2, category: 'e7' });
  expect([s.slotAEncoder.value, s.slotAEffort.value, s.slotAQuality.value]).toEqual(['cjxl', 'e7', 100]);
});

test('无损声明未通过像素验证时进入有损匹配，全集不只保留通过的图片', () => {
  const s = app.state, data = s.dataset.value;
  data.images.push({ ...data.images[0], name: 'second.png', stem: 'second' });
  data.records.push(...data.records.map((record: any) => ({ ...record, image: 'second.png' })));
  const failed = data.records.find((record: any) => record.image === 'second.png' && record.encoder === 'cwebp' && record.effortTag === 'm4' && record.quality === null);
  failed.lossless = false; failed.pixelVerification = { ...failed.pixelVerification, rgbEqual: false }; failed.outputBytes = 1550;
  for (const record of data.records) record.ssimulacra2 = record.quality === null ? 80 : 0;
  s.aggregateAllImages.value = true; s.overviewFilterMode.value = 'objective';
  const card = s.encoderSummaryCards.value.find((card: any) => card.encoder === 'cwebp');
  expect([card.matchedQuality, card.lossless, card.avgBytes]).toEqual([null, false, 1050]);
  s.overviewFilterMode.value = 'quality'; s.overviewLosslessMode.value = true;
  expect(s.encoderSummaryCards.value.find((card: any) => card.encoder === 'cwebp')).toBeUndefined();
});


test('力度视图保留像素不一致的独立无损开关，并精确同步空质量参数', () => {
  const s = app.state;
  for (const record of s.dataset.value.records) {
    if (record.encoder === 'cwebp' && record.quality === null) record.lossless = false;
  }
  s.selectEffortEncoder('cwebp');
  expect(s.effortHasPixelLossyIndependentMode.value).toBe(true);
  s.selectEffortQuality('encoded-lossless');
  expect(s.effortQualitySelection.value).toBe('encoded-lossless');
  expect(s.effortQualityLabel.value).toBe('无损模式（像素不一致）');
  for (const value of s.effortFocusVolumeSeries.value[0].values) expect(value).toBeCloseTo(55);
  s.onSelectEffortOnChart({ index: 1, category: 'm4' });
  expect([s.slotAEncoder.value, s.slotAEffort.value, s.slotAQuality.value]).toEqual(['cwebp', 'm4', -1]);
});


test('客观目标低分不选择体积更大且评分退化的 Q100，仍允许有效的有损 Q100', () => {
  const s = app.state, data = s.dataset.value;
  const cfg = data.config.encoders.find((encoder: any) => encoder.name === 'avifenc-aom');
  cfg.name = 'avifenc-svt';
  for (const record of data.records) {
    if (record.encoder !== 'avifenc-aom') continue;
    record.encoder = 'avifenc-svt';
    record.ssimulacra2 = record.quality === 0 ? -25 : record.quality === 100 ? 32.79 : record.quality === 65 ? 38.98 : 80;
    record.outputBytes = record.quality === 100 ? 1243164 : record.quality === 65 ? 30576 : record.quality === 0 ? 9552 : 100000;
  }
  cfg.efforts = ['s6', 's12', 's5'].map((tag) => ({ tag, effort: Number(tag.slice(1)), label: tag }));
  const sourceRecords = data.records.filter((record: any) => record.encoder === 'avifenc-svt' && record.effortTag === 's6');
  data.records.push(...['s12', 's5'].flatMap((effortTag) => sourceRecords.map((record: any) => ({ ...record, effortTag }))));
  s.overviewFilterMode.value = 'objective'; s.targetSsimulacra2.value = 20;
  for (const strategy of ['default', 'fastest', 'best']) {
    s.effortStrategy.value = strategy;
    const card = s.encoderSummaryCards.value.find((card: any) => card.encoder === 'avifenc-svt');
    expect([card.matchedQuality, card.avgSsimulacra2, card.avgBytes]).toEqual([65, 38.98, 30576]);
  }
  data.images.push({ ...data.images[0], name: 'second.png', stem: 'second' });
  data.records.push(...data.records.map((record: any) => ({ ...record, image: 'second.png' })));
  s.aggregateAllImages.value = true;
  expect(s.encoderSummaryCards.value.find((card: any) => card.encoder === 'avifenc-svt').matchedQuality).toBe(65);
  // Q100 仍为真实有损记录；当其体积更小、评分有效时不能按参数值硬排除。
  for (const record of data.records) if (record.encoder === 'avifenc-svt' && record.quality === 100) record.outputBytes = 10000;
  expect(s.encoderSummaryCards.value.find((card: any) => card.encoder === 'avifenc-svt').matchedQuality).toBe(100);
});

/** 实测曲线不按 Q 推算评分；AVIF Q100 按视图规则隐藏。 */
test('质量客观视觉展示真实零分负分，隐藏 AVIF Q100 和无损参考', () => {
  const s = app.state;
  for (const record of s.dataset.value.records) record.ssimulacra2 = record.quality === 80 ? -25 : record.quality === 65 ? 0 : record.quality === 100 ? 32.79 : 80;
  s.qualityChartTab.value = 'objective'; s.includeLosslessInQualityChart.value = true;
  const series = s.activeQualityChartSeries.value;
  expect(series).toBe(s.qualityObjectiveSeries.value);
  expect(series.some((item: any) => item.key === 'png-libpng' || item.dashed)).toBe(false);
  expect(series.find((item: any) => item.key === 'avifenc-aom').values).toEqual([0, -25, 80, 80, null]);
  expect(series.find((item: any) => item.key === 'avifenc-aom').formattedValues[1]).toBe('SS2 -25.00');
  expect(series.find((item: any) => item.key === 'cjxl').values.at(-1)).toBeNull();
  s.onSelectQualityOnChart({ index: 1, value: 65 });
  expect([s.syncedQuality.value, s.slotAQuality.value, s.slotBQuality.value]).toEqual([65, 65, 65]);
  expect(s.selectedXEncoderDetails.value.every((item: any) => !item.lossless && item.ssimulacra2 === 0)).toBe(true);
});

/** 全集各点必须使用同一套图片，缺测和缺少记录均不能用剩余图片冒充全集均分。 */
test('质量客观视觉按完整图片集平均，缺测留空并随力度切换', () => {
  const s = app.state, data = s.dataset.value;
  for (const record of data.records) record.ssimulacra2 = record.effortTag === 'm0' ? -40 : 80;
  data.images.push({ ...data.images[0], name: 'second.png', stem: 'second' });
  data.records.push(...data.records.map((record: any) => ({ ...record, image: 'second.png', ssimulacra2: record.effortTag === 'm0' ? 0 : 20 })));
  s.aggregateAllImages.value = true; s.qualityChartTab.value = 'objective';
  const webp = () => s.qualityObjectiveSeries.value.find((item: any) => item.key === 'cwebp');
  expect(webp().values[1]).toBe(50);
  s.onSelectQualityOnChart({ index: 2, value: 80 });
  expect(s.selectedXEncoderDetails.value.find((item: any) => item.encoder === 'cwebp').ssimulacra2).toBe(50);
  data.records.find((record: any) => record.image === 'second.png' && record.encoder === 'cwebp' && record.effortTag === 'm4' && record.quality === 80).ssimulacra2 = undefined;
  expect(webp().values[1]).toBeNull();
  expect(s.selectedXEncoderDetails.value.find((item: any) => item.encoder === 'cwebp').ssimulacra2).toBeNull();
  data.records = data.records.filter((record: any) => !(record.image === 'second.png' && record.encoder === 'cwebp' && record.effortTag === 'm4' && record.quality === 65));
  expect(webp().values[0]).toBeNull();
  s.effortStrategy.value = 'fastest';
  expect(webp().label).toContain('m0');
  expect(webp().values[1]).toBe(-20);
  s.aggregateAllImages.value = false;
  expect(webp().values[1]).toBe(-40);
});

/** AVIF Q100 仅在质量参数视图隐藏，不能删除数据或影响其他编码器 Q100。 */
test('质量参数三个图表和明细统一排除两种 AVIF Q100', () => {
  const s = app.state, data = s.dataset.value;
  const aom = data.config.encoders.find((encoder: any) => encoder.name === 'avifenc-aom');
  data.config.encoders.push({ ...aom, name: 'avifenc-svt' });
  data.records.push(...data.records.filter((record: any) => record.encoder === 'avifenc-aom').map((record: any) => ({ ...record, encoder: 'avifenc-svt' })));
  for (const record of data.records) record.ssimulacra2 = 60;
  const count = data.records.length;
  for (const tab of ['volume', 'time', 'objective']) {
    s.qualityChartTab.value = tab;
    for (const encoder of ['avifenc-aom', 'avifenc-svt']) {
      const series = s.activeQualityChartSeries.value.find((item: any) => item.key === encoder);
      expect(series.values.at(-1)).toBeNull();
      expect(series.values.at(-2)).not.toBeNull();
    }
    expect(s.activeQualityChartSeries.value.find((item: any) => item.key === 'cwebp').values.at(-1)).not.toBeNull();
    s.onSelectQualityOnChart({ index: 5, value: 100 });
    expect(s.selectedXEncoderDetails.value.some((item: any) => item.encoder.startsWith('avifenc-') && item.quality === 100)).toBe(false);
    s.onSelectQualityOnChart({ index: 4, value: 96 });
    expect(s.selectedXEncoderDetails.value.some((item: any) => item.encoder === 'avifenc-aom')).toBe(true);
  }
  expect(data.records.length).toBe(count);
  expect(data.records.some((record: any) => record.encoder === 'avifenc-aom' && record.quality === 100)).toBe(true);
});

/** 客观视觉必须移除横轴和对应数据，不能只隐藏点而让曲线索引错位。 */
test('客观视觉剔除 Q0，切换图表保持横轴数据与对比器选择一致', () => {
  const s = app.state;
  s.syncQualitySlots(0);
  s.selectQualityChartTab('objective');
  expect(s.qualityChartLevels.value).toEqual([65, 80, 93, 96, 100]);
  expect([s.syncedQuality.value, s.slotAQuality.value, s.slotBQuality.value]).toEqual([65, 65, 65]);
  for (const series of s.activeQualityChartSeries.value) {
    expect(series.values).toHaveLength(s.qualityChartLevels.value.length);
    expect(series.formattedValues).toHaveLength(s.qualityChartLevels.value.length);
    expect(series.label).not.toContain('Q0');
  }
  for (const tab of ['volume', 'time']) {
    s.selectQualityChartTab(tab);
    expect(s.qualityChartLevels.value).toEqual([0, 65, 80, 93, 96, 100]);
    expect(s.activeQualityChartSeries.value[0].values).toHaveLength(6);
  }
  expect(s.dataset.value.records.some((record: any) => record.quality === 0)).toBe(true);
});
