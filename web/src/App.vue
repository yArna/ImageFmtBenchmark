<template>
  <div class="workbench-layout">
    <!-- ==================== LEFT SIDEBAR: PARAMETER SELECTION PANEL ==================== -->
    <aside class="left-sidebar">
      <div class="sidebar-brand">
        <DitherGradient from="green" to="purple" direction="down" :variant="variant" :height="66" :pixel-size="2">
          <div class="sidebar-brand-inner">
            <div class="brand-badge-row">
              <div class="brand-badge">
                <span class="hero-pulse"></span>
                <span class="brand-en">ImgFmtBenchmark</span>
              </div>
              <a
                href="https://moonvy.com"
                target="_blank"
                rel="noopener noreferrer"
                class="brand-moonvy-tag"
                title="Moonvy 月维 (https://moonvy.com)"
              >Moonvy</a>
            </div>
            <h1 class="brand-title">图片格式与编码器评测</h1>
          </div>
        </DitherGradient>
      </div>

      <div class="sidebar-scroll" v-if="dataset">
        <!-- 1. Test Image Selector + Live Preview + Prominent Size & Dimensions -->
        <section class="sidebar-section">
          <div class="sidebar-sec-head">
            <span class="sec-index">01</span>
            <span class="sec-title">测试图片</span>
            <label class="agg-toggle" :title="`勾选后图表展示全部 ${dataset.images.length} 张图片均值，对比器仍展示当前选中图片`">
              <input type="checkbox" v-model="aggregateAllImages" />
              <span>图表看全集均值</span>
            </label>
          </div>

          <select v-model="currentImageName" class="dk-select dk-select-full">
            <option v-for="img in dataset.images" :key="img.name" :value="img.name">
              {{ img.name }} ({{ img.width }}×{{ img.height }})
            </option>
          </select>

          <div class="sidebar-img-preview-card" v-if="currentImageMeta">
            <div class="sidebar-img-stage bg-checker">
              <img
                :src="buildImagePreviewUrl('source-image', currentImageMeta.name, dataset.generatedAt)"
                :srcset="`${buildImagePreviewUrl('source-image', currentImageMeta.name, dataset.generatedAt)} 2x`"
                :alt="currentImageMeta.name"
              />
              <span class="img-color-tag">
                {{ currentImageMeta.bitDepth }}bit · {{ colorTypeLabel(currentImageMeta.colorType) }}
              </span>
            </div>

            <div class="sidebar-img-highlights">
              <div class="highlight-metric-box">
                <span class="hm-label">图片尺寸</span>
                <span class="hm-value hm-value-cyan">
                  {{ currentImageMeta.width }} <small>×</small> {{ currentImageMeta.height }} <small>px</small>
                </span>
              </div>
              <div class="highlight-metric-box">
                <span class="hm-label">原始体积</span>
                <span class="hm-value hm-value-green">
                  {{ formatBytes(currentImageMeta.inputBytes) }}
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- 2. Encoders List -->
        <section class="sidebar-section">
          <div class="sidebar-sec-head">
            <span class="sec-index">02</span>
            <span class="sec-title">编码器列表</span>
            <button
              v-if="spotlightEncoder"
              type="button"
              class="reset-mini-btn"
              @click="spotlightEncoder = null"
            >
              取消高亮
            </button>
          </div>

          <div class="encoder-list-vertical">
            <div
              v-for="enc in encoderListItems"
              :key="enc.id"
              class="encoder-row-item"
              :class="{
                'is-spotlight': spotlightEncoder === enc.id,
                'is-slot-a': slotAEncoder === enc.id,
                'is-slot-b': slotBEncoder === enc.id,
              }"
              :style="{ '--enc-color': enc.color.hex, '--enc-bright': enc.color.brightHex }"
              @click="onEncoderRowClick(enc.id)"
            >
              <div class="enc-row-left">
                <DitherAvatar :name="enc.displayName" :size="28" :color="enc.color" />
                <div class="enc-row-meta">
                  <div class="enc-row-title-line">
                    <span class="enc-fmt-pill" :style="{ backgroundColor: `${enc.color.hex}22`, borderColor: `${enc.color.hex}77`, color: enc.color.brightHex }">
                      {{ enc.formatLabel }}
                    </span>
                    <span class="enc-display-name">{{ enc.displayName }}</span>
                  </div>
                  <div class="enc-row-sub-line">
                    <span class="enc-version">{{ enc.version }}</span>
                    <span class="enc-dot">·</span>
                    <span class="enc-binsize" title="编码器二进制文件体积">{{ enc.binaryLabel }}</span>
                  </div>
                </div>
              </div>

              <div class="enc-row-actions" @click.stop>
                <button
                  type="button"
                  class="slot-assign-btn"
                  :class="{ 'is-active-a': slotAEncoder === enc.id }"
                  @click="assignToSlot('A', enc.id)"
                  title="设为对比器 A 图编码器"
                >
                  A
                </button>
                <button
                  type="button"
                  class="slot-assign-btn"
                  :class="{ 'is-active-b': slotBEncoder === enc.id }"
                  @click="assignToSlot('B', enc.id)"
                  title="设为对比器 B 图编码器"
                >
                  B
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- 3. Dither-Kit Chart Style Parameters -->
        <section class="sidebar-section">
          <div class="sidebar-sec-head">
            <span class="sec-index">03</span>
            <span class="sec-title">图表样式参数</span>
          </div>

          <div class="sidebar-knobs-stack">
            <div class="sidebar-knob-row">
              <span class="control-label">填充样式</span>
              <div class="knob-pill-group">
                <button
                  v-for="v in variantOptions"
                  :key="v.key"
                  type="button"
                  class="knob-btn"
                  :class="{ 'is-active': variant === v.key }"
                  @click="variant = v.key"
                >
                  {{ v.label }}
                </button>
              </div>
            </div>

            <div class="sidebar-knob-row">
              <span class="control-label">辉光强度</span>
              <div class="knob-pill-group">
                <button
                  v-for="b in bloomOptions"
                  :key="b.key"
                  type="button"
                  class="knob-btn"
                  :class="{ 'is-active': bloom === b.key }"
                  @click="bloom = b.key"
                >
                  {{ b.label }}
                </button>
              </div>
            </div>

            <div class="sidebar-knob-row">
              <span class="control-label">像素粒度</span>
              <div class="knob-pill-group">
                <button
                  v-for="px in [2, 3, 4]"
                  :key="px"
                  type="button"
                  class="knob-btn"
                  :class="{ 'is-active': pixelSize === px }"
                  @click="pixelSize = px"
                >
                  {{ px }}px
                </button>
              </div>
            </div>

            <div class="sidebar-knob-row">
              <span class="control-label">动态特效与坐标轴</span>
              <div class="knob-pill-group">
                <button
                  type="button"
                  class="knob-btn"
                  :class="{ 'is-active': sparkles }"
                  @click="sparkles = !sparkles"
                >
                  闪烁星点
                </button>
                <button
                  type="button"
                  class="knob-btn"
                  :class="{ 'is-active': logScaleY }"
                  @click="logScaleY = !logScaleY"
                >
                  对数纵轴
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </aside>

    <!-- ==================== RIGHT MAIN WORKSPACE ==================== -->
    <main class="right-workspace">
      <div v-if="loading" class="loading-state">
        正在加载实验数据 (14,910 条记录)...
      </div>

      <template v-else-if="dataset && currentImageMeta">
        <!-- Top Navigation Tabs + Active Synchronization Status Bar -->
        <header class="workspace-top-bar">
          <nav class="view-tabs">
            <button
              v-for="tab in viewTabs"
              :key="tab.key"
              type="button"
              class="view-tab-btn"
              :class="{ 'is-active': activeTab === tab.key }"
              @click="activeTab = tab.key"
            >
              <span class="tab-idx">{{ tab.idx }}</span>
              <span>{{ tab.label }}</span>
            </button>
          </nav>

          <div class="sync-status-strip">
            <span class="sync-pill">
              当前图片: <strong>{{ currentImageMeta.name }}</strong>
              <em v-if="aggregateAllImages">(图表为{{ dataset.images.length }}张均值)</em>
            </span>
            <span class="sync-pill">
              图表参数: <strong>{{ activeTab === 'overview' ? overviewSubtitleDesc : activeTab === 'effort' ? effortQualityLabel : `Q=${syncedQuality}` }}</strong>
            </span>
            <span class="sync-pill">
              对比 A: <strong :style="{ color: getEncoderColor(slotAEncoder).brightHex }">{{ getEncoderDisplayName(slotAEncoder) }}</strong> <template v-if="slotAEncoder !== '__ORIGINAL__'">({{ formatCleanEffort(slotAEncoder, slotAEffort) }})</template>
            </span>
            <span class="sync-pill">
              对比 B: <strong :style="{ color: getEncoderColor(slotBEncoder).brightHex }">{{ getEncoderDisplayName(slotBEncoder) }}</strong> <template v-if="slotBEncoder !== '__ORIGINAL__'">({{ formatCleanEffort(slotBEncoder, slotBEffort) }})</template>
            </span>
          </div>
        </header>

        <div class="workspace-content">
          <!-- ==================== TAB 1: 概览 ==================== -->
          <template v-if="activeTab === 'overview'">
            <!-- 目标参数与客观评分共用概览图表及力度策略。 -->
            <div class="overview-control-bar">
              <div class="ov-slider-section">
                <div class="ov-slider-head">
                  <div class="chart-inner-tabs">
                    <button
                      type="button"
                      class="chart-inner-tab"
                      :class="{ 'is-active': overviewFilterMode === 'quality' }"
                      @click="overviewFilterMode = 'quality'"
                    >
                      目标质量
                    </button>
                    <button
                      type="button"
                      class="chart-inner-tab"
                      :class="{ 'is-active': overviewFilterMode === 'volume' }"
                      @click="overviewFilterMode = 'volume'"
                    >
                      目标体积
                    </button>
                    <button
                      type="button"
                      class="chart-inner-tab"
                      :class="{ 'is-active': overviewFilterMode === 'objective' }"
                      @click="overviewFilterMode = 'objective'"
                    >
                      目标客观指标
                    </button>
                  </div>

                  <span
                    v-if="overviewFilterMode === 'quality'"
                    class="ov-current-q-badge"
                    :class="{ 'is-lossless': overviewLosslessMode }"
                  >
                    {{ overviewLosslessMode ? '无损' : `Q = ${syncedQuality}` }}
                  </span>
                  <span v-else-if="overviewFilterMode === 'volume'" class="ov-current-q-badge">
                    目标 {{ targetVolumePct }}% ({{ formatBytes((targetVolumePct / 100) * activeReferenceInputBytes) }})
                  </span>
                  <span v-else class="ov-current-q-badge">SSIMULACRA2 = {{ targetSsimulacra2 }}</span>
                </div>

                <!-- Mode 1: 目标质量滑块 (含无损档位) -->
                <div class="ov-slider-track-wrap" v-if="overviewFilterMode === 'quality'">
                  <input
                    type="range"
                    class="dk-range-slider"
                    :min="0"
                    :max="overviewSliderStops.length - 1"
                    :value="overviewSliderIndex"
                    @input="onOverviewSliderInput(Number(($event.target as HTMLInputElement).value))"
                  />
                  <div class="ov-slider-ticks">
                    <button
                      v-for="(stop, sIdx) in overviewSliderStops"
                      :key="stop.label"
                      type="button"
                      class="ov-tick-btn"
                      :class="{
                        'is-active': overviewSliderIndex === sIdx,
                        'is-lossless-tick': stop.type === 'lossless',
                      }"
                      @click="onOverviewSliderInput(sIdx)"
                    >
                      {{ stop.label }}
                    </button>
                  </div>
                </div>

                <!-- Mode 2: 目标体积百分比滑块 (自动匹配各编码器最接近目标体积的最佳质量参数) -->
                <div class="ov-slider-track-wrap" v-else-if="overviewFilterMode === 'volume'">
                  <input
                    type="range"
                    class="dk-range-slider"
                    :min="1"
                    :max="100"
                    :step="1"
                    v-model.number="targetVolumePct"
                  />
                  <div class="ov-slider-ticks">
                    <button
                      v-for="pct in volumeTickPresets"
                      :key="pct"
                      type="button"
                      class="ov-tick-btn"
                      :class="{ 'is-active': targetVolumePct === pct }"
                      @click="targetVolumePct = pct"
                    >
                      {{ pct }}%
                    </button>
                  </div>

                </div>

                <!-- 与目标质量相同，滑块和刻度共用分数档位索引。 -->
                <div class="ov-slider-track-wrap" v-else>
                  <input type="range" class="dk-range-slider" aria-label="SSIMULACRA2 目标分数"
                    :min="0" :max="objectiveTickPresets.length - 1" :value="objectiveSliderIndex"
                    :aria-valuetext="`${targetSsimulacra2} 分`"
                    @input="onObjectiveSliderInput(Number(($event.target as HTMLInputElement).value))" />
                  <div class="ov-slider-ticks">
                    <button v-for="(score, index) in objectiveTickPresets" :key="score" type="button" class="ov-tick-btn"
                      :class="{ 'is-active': targetSsimulacra2 === score }" @click="onObjectiveSliderInput(index)">{{ score }}</button>
                  </div>
                  <p class="ov-score-hint">
                    先排除体积更大且评分不占优的档位，再匹配最接近的实测评分。{{ aggregateAllImages ? '全集使用每档全部图片的平均分。' : '使用当前图片评分。' }}
                  </p>
                  <p v-if="overviewMissingScoreEncoders.length" class="ov-score-hint">
                    缺少完整评分，暂不展示：{{ overviewMissingScoreEncoders.join('、') }}
                  </p>
                </div>
              </div>

              <div class="ov-effort-tabs-section">
                <span class="control-label">压缩力度</span>
                <div class="chart-inner-tabs">
                  <button
                    type="button"
                    class="chart-inner-tab"
                    :class="{ 'is-active': effortStrategy === 'fastest' }"
                    @click="effortStrategy = 'fastest'"
                  >
                    极速
                  </button>
                  <button
                    type="button"
                    class="chart-inner-tab"
                    :class="{ 'is-active': effortStrategy === 'default' }"
                    @click="effortStrategy = 'default'"
                  >
                    均衡
                  </button>
                  <button
                    type="button"
                    class="chart-inner-tab"
                    :class="{ 'is-active': effortStrategy === 'best' }"
                    @click="effortStrategy = 'best'"
                  >
                    最大
                  </button>
                </div>
              </div>
            </div>

            <!-- 3 Charts in One Row: 体积 | 编码耗时 | 解码耗时 -->
            <div class="chart-grid-3col">
              <DitherBarChart
                title="体积"
                :subtitle="`体积 - 编码器 (${overviewSubtitleDesc} · ${effortStrategyLabel})`"
                :categories="overviewBarCategories"
                :category-meta="overviewCategoryMeta"
                :series="overviewRatioBarSeries"
                stack-type="default"
                :height="325"
                :variant="variant"
                :bloom="bloom"
                :sparkles="sparkles"
                :pixel-size="pixelSize"
                y-unit="%"
                :y-base-bytes="activeReferenceInputBytes"
                :y-max="overviewMaxRatioPctAcrossEfforts"
                @select-category="onOverviewBarSelect"
              />

              <DitherBarChart
                title="编码耗时"
                :subtitle="`编码耗时 - 编码器 (${overviewSubtitleDesc} · ${effortStrategyLabel})`"
                :categories="overviewBarCategories"
                :category-meta="overviewCategoryMeta"
                :series="overviewEncodeTimeBarSeries"
                stack-type="default"
                :height="325"
                :variant="variant"
                :bloom="bloom"
                :sparkles="sparkles"
                :pixel-size="pixelSize"
                y-unit="ms"
                @select-category="onOverviewBarSelect"
              />

              <DitherBarChart
                title="解码耗时"
                :subtitle="`解码耗时 - 编码器 (${overviewSubtitleDesc} · ${effortStrategyLabel})`"
                :categories="overviewBarCategories"
                :category-meta="overviewCategoryMeta"
                :series="overviewDecodeTimeBarSeries"
                stack-type="default"
                :height="325"
                :variant="variant"
                :bloom="bloom"
                :sparkles="sparkles"
                :pixel-size="pixelSize"
                y-unit="ms"
                @select-category="onOverviewBarSelect"
              />
            </div>

            <!-- 视觉预览：每个当前图表编码器展示 180x180 窗口，默认 800% 居中放大，共享平移与缩放 -->
            <div class="overview-visual-preview">
              <div class="ov-vp-head">
                <h3 class="dk-chart-title">视觉预览</h3>
                <div class="ov-vp-controls">
                  <span class="ov-vp-zoom-tag">{{ Math.round(vpZoom * 100) }}%</span>
                  <button type="button" class="knob-btn" @click="resetVpViewport">重置</button>
                </div>
              </div>

              <div class="ov-vp-grid">
                <div
                  v-for="card in encoderSummaryCards"
                  :key="card.encoder"
                  class="ov-vp-item"
                >
                  <div
                    class="ov-vp-window bg-checker"
                    :class="{ 'is-panning': vpDragging }"
                    @wheel.prevent="onVpWheel($event)"
                    @mousedown="onVpMouseDown($event)"
                  >
                    <div class="ov-vp-inner" :style="vpTransformStyle">
                      <PreviewImage
                        v-if="card.previewUrl"
                        :src="card.previewUrl"
                        :density="2"
                        :alt="card.displayName"
                        class="ov-vp-img"
                        draggable="false"
                      />
                      <span v-else>所选参数暂无测试结果</span>
                    </div>
                  </div>

                  <div class="ov-vp-meta">
                    <div class="ov-vp-row1">
                      <span class="ov-vp-name" :style="{ color: card.color.brightHex }">{{ card.displayName }}</span>
                      <span class="ov-vp-q">{{ formatEncodingQuality(card.encoder, card.matchedQuality, undefined, card.lossless) }}</span>
                    </div>
                    <div class="ov-vp-vol">
                      {{ formatBytes(card.avgBytes) }} ({{ card.avgRatioPct.toFixed(1) }}%)
                    </div>
                    <div v-if="overviewFilterMode === 'objective'" class="ov-vp-vol">{{ formatOverviewScore(card) }}</div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- ==================== TAB 2: 质量参数 ==================== -->
          <template v-else-if="activeTab === 'quality'">
            <div class="view-control-banner">
              <div class="vcb-left">
                <span class="vcb-badge">有损与无损区分</span>
                <span class="vcb-desc">
                  <strong>{{ qualityEncoderCount }} 款编码器</strong> 具备 {{ dataset.config.qualityLevels.length }} 档质量参数 (Q{{ dataset.config.qualityLevels[0] }}..Q{{ dataset.config.qualityLevels.at(-1) }})。此视图隐藏 AVIF Q100。点击图表横轴任意质量档位，右侧参数列表与下方对比器将实时同步。
                </span>
              </div>

              <div class="vcb-right">
                <label v-if="qualityChartTab !== 'objective'" class="dk-checkbox-label">
                  <input type="checkbox" v-model="includeLosslessInQualityChart" />
                  <span>加入无损各力度参数对比</span>
                </label>

                <select
                  v-if="includeLosslessInQualityChart && qualityChartTab !== 'objective'"
                  v-model="losslessOverlayMode"
                  class="dk-select"
                >
                  <option value="balanced">无损取均衡推荐档 ({{ losslessReferenceCounts.balanced }}条参考线)</option>
                  <option value="extremes">无损取最快+最慢档 ({{ losslessReferenceCounts.extremes }}条参考线)</option>
                  <option value="all">无损加入全部 {{ losslessReferenceCounts.all }} 个力度档位</option>
                </select>

                <div class="control-field">
                  <span class="control-label">有损力度档</span>
                  <select v-model="effortStrategy" class="dk-select">
                    <option value="default">均衡推荐档</option>
                    <option value="fastest">极速档</option>
                    <option value="best">最高压缩档</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- 质量参数曲线与当前质量档位的实际参数明细共用选中态。 -->
            <div class="quality-main-split">
              <DitherAreaChart
                :subtitle="qualityChartTab === 'objective' ? `SSIMULACRA2 实测评分，越高越好 · ${aggregateAllImages ? '全部图片均分（缺少评分时留空）' : '当前图片评分'} · 点击质量档位同步对比器 (Q=${syncedQuality})` : `点击横轴质量档位同步右侧参数列表与下方对比器 (当前选中 Q=${syncedQuality}) · ${includeLosslessInQualityChart ? '虚线为独立无损档基准' : '当前展示各编码器质量档位'}`"
                :x-labels="qualityChartLevels"
                :series="activeQualityChartSeries"
                :selected-x="syncedQuality"
                v-model:spotlight-key="spotlightEncoder"
                :height="350"
                :variant="variant"
                :bloom="bloom"
                :sparkles="sparkles"
                :pixel-size="pixelSize"
                :y-unit="qualityChartTab === 'volume' ? '%' : qualityChartTab === 'time' ? 'ms' : ''"
                :y-base-bytes="qualityChartTab === 'volume' ? activeReferenceInputBytes : null"
                x-axis-prefix="Q"
                :log-scale="qualityChartTab !== 'objective' && logScaleY"
                @select-x="onSelectQualityOnChart"
              >
                <template #tabs>
                  <div class="chart-inner-tabs">
                    <button
                      type="button"
                      class="chart-inner-tab"
                      :class="{ 'is-active': qualityChartTab === 'volume' }"
                      @click="selectQualityChartTab('volume')"
                    >
                      质量 - 体积
                    </button>
                    <button
                      type="button"
                      class="chart-inner-tab"
                      :class="{ 'is-active': qualityChartTab === 'time' }"
                      @click="selectQualityChartTab('time')"
                    >
                      质量 - 耗时
                    </button>
                    <button
                      type="button"
                      class="chart-inner-tab"
                      :class="{ 'is-active': qualityChartTab === 'objective' }"
                      @click="selectQualityChartTab('objective')"
                    >
                      质量 - 客观视觉
                    </button>
                  </div>
                </template>
              </DitherAreaChart>

              <!-- Right Panel: Detailed Encoder Parameter & Result List at Selected X-Axis (syncedQuality) -->
              <div class="x-detail-panel">
                <div class="x-detail-head">
                  <div>
                    <h3 class="dk-chart-title">
                      编码器明细 — <span style="color: var(--accent-green)">Q = {{ syncedQuality }}</span>
                    </h3>
                    <p class="dk-chart-subtitle">
                      {{ aggregateAllImages ? `全部 ${dataset.images.length} 张图片均值` : currentImageMeta.name }} · 共 {{ selectedXEncoderDetails.length }} 款编码器配置
                    </p>
                  </div>
                  <div class="x-detail-quick-q">
                    <span class="control-label">切换 X 轴</span>
                    <select :value="syncedQuality" @change="syncQualitySlots(Number(($event.target as HTMLSelectElement).value))" class="dk-select">
                      <option v-for="q in qualityChartLevels" :key="q" :value="q">Q = {{ q }}</option>
                    </select>
                  </div>
                </div>

                <div class="x-detail-list">
                  <div
                    v-for="item in selectedXEncoderDetails"
                    :key="item.key"
                    class="x-detail-row"
                    :class="{
                      'is-slot-a': isSlotSelection('A', item.encoder, item.effortTag, item.quality),
                      'is-slot-b': isSlotSelection('B', item.encoder, item.effortTag, item.quality),
                    }"
                    :style="{ '--enc-color': item.color.hex }"
                    @mouseenter="spotlightEncoder = item.encoder"
                    @mouseleave="spotlightEncoder = null"
                  >
                    <div class="xdr-top">
                      <div class="xdr-id">
                        <span class="xdr-dot" :style="{ backgroundColor: item.color.hex }"></span>
                        <span class="xdr-name" :style="{ color: item.color.brightHex }">{{ item.displayName }}</span>
                        <span class="xdr-effort-tag">{{ item.effortTag }}</span>
                        <span v-if="item.lossless" class="xdr-lossless-tag">无损</span>
                      </div>
                      <div class="xdr-actions">
                        <button
                          type="button"
                          class="slot-assign-btn"
                          :class="{ 'is-active-a': isSlotSelection('A', item.encoder, item.effortTag, item.quality) }"
                          @click="assignDetailItemToSlot('A', item)"
                        >
                          设为A
                        </button>
                        <button
                          type="button"
                          class="slot-assign-btn"
                          :class="{ 'is-active-b': isSlotSelection('B', item.encoder, item.effortTag, item.quality) }"
                          @click="assignDetailItemToSlot('B', item)"
                        >
                          设为B
                        </button>
                      </div>
                    </div>

                    <!-- Full Encoder CLI Parameter String -->
                    <div class="xdr-cli-line">
                      <code>{{ item.cliCommand }}</code>
                    </div>

                    <div
                      v-if="qualityChartTab === 'objective'"
                      class="xdr-score"
                      :class="{ 'is-missing': item.ssimulacra2 === null }"
                      :title="item.ssimulacra2 === null ? 'SSIMULACRA2 暂无评分' : 'SSIMULACRA2 实测评分，越高越好'"
                    >
                      <span>SS2</span>
                      <strong :style="item.ssimulacra2 === null ? {} : { color: item.color.brightHex }">{{ item.ssimulacra2 === null ? '—' : item.ssimulacra2.toFixed(2) }}</strong>
                    </div>

                    <!-- Fused Volume Percentage + Size & Encoding Time with Horizontal Bar Lines Underneath -->
                    <div class="xdr-metrics">
                      <div class="xdr-metric-col">
                        <div class="xdr-metric-top">
                          <span class="lbl">体积</span>
                          <strong :style="{ color: item.color.brightHex }">{{ item.fusedVolume }}</strong>
                        </div>
                        <div class="xdr-bar-track">
                          <div
                            class="xdr-bar-fill"
                            :style="{
                              width: `${Math.min(100, Math.max(2, (item.ratioPct / maxXDetailRatioPct) * 100))}%`,
                              backgroundColor: item.color.hex,
                            }"
                          ></div>
                        </div>
                      </div>
                      <div class="xdr-metric-col">
                        <div class="xdr-metric-top">
                          <span class="lbl">耗时</span>
                          <strong>{{ item.encodeMs.toFixed(1) }} ms</strong>
                        </div>
                        <div class="xdr-bar-track">
                          <div
                            class="xdr-bar-fill"
                            :style="{
                              width: `${Math.min(100, Math.max(2, (item.encodeMs / maxXDetailEncodeMs) * 100))}%`,
                              backgroundColor: item.color.hex,
                            }"
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- ==================== TAB 3: 力度参数 ==================== -->
          <template v-else-if="activeTab === 'effort'">
            <div class="effort-control-panel">
              <div class="effort-ctrl-row">
                <span class="control-label effort-ctrl-label">编码器</span>
                <div class="effort-encoder-tiles">
                  <button
                    v-for="enc in dataset.config.encoders"
                    :key="enc.name"
                    type="button"
                    class="effort-enc-tile"
                    :class="{ 'is-active': effortFocusEncoder === enc.name }"
                    :style="{
                      '--tile-color': getEncoderColor(enc.name).hex,
                      '--tile-bright': getEncoderColor(enc.name).brightHex,
                    }"
                    @click="selectEffortEncoder(enc.name)"
                  >
                    <span class="tile-dot" :style="{ backgroundColor: getEncoderColor(enc.name).hex }"></span>
                    <span class="tile-name">{{ getEncoderDisplayName(enc.name) }}</span>
                    <span class="tile-count">{{ enc.efforts.length }}档</span>
                  </button>
                </div>
              </div>

              <div class="effort-ctrl-row">
                <span class="control-label effort-ctrl-label">质量</span>
                <div class="effort-quality-tiles">
                  <button
                    v-if="effortSupportsLossless"
                    type="button"
                    class="knob-btn"
                    :class="{ 'is-active': effortQualitySelection === 'lossless' }"
                    @click="selectEffortQuality('lossless')"
                  >
                    无损
                  </button>
                  <button
                    v-if="effortHasPixelLossyIndependentMode"
                    type="button"
                    class="knob-btn"
                    :class="{ 'is-active': effortQualitySelection === 'encoded-lossless' }"
                    @click="selectEffortQuality('encoded-lossless')"
                  >
                    无损模式（像素不一致）
                  </button>
                  <button
                    v-for="q in effortAvailableQualities"
                    :key="q"
                    type="button"
                    class="knob-btn"
                    :class="{ 'is-active': effortQualitySelection === q }"
                    @click="selectEffortQuality(q)"
                  >
                    {{ formatEncodingQuality(effortFocusEncoder, q) }}
                  </button>
                </div>
              </div>
            </div>

            <p v-if="!effortFocusVolumeSeries.some((series) => series.values.some((value) => value !== null))" class="dk-chart-subtitle">所选参数暂无测试结果</p>
            <div class="chart-grid-2col">
              <DitherBarChart
                title="力度 - 体积"
                :subtitle="`${getEncoderDisplayName(effortFocusEncoder)} · ${effortQualityLabel} · 点击柱体同步至下方对比器`"
                :categories="effortFocusCategories"
                :series="effortFocusVolumeSeries"
                :selected-category="currentFocusedEffortTag"
                stack-type="default"
                :height="320"
                :variant="variant"
                :bloom="bloom"
                :sparkles="sparkles"
                :pixel-size="pixelSize"
                y-unit="%"
                :y-base-bytes="activeReferenceInputBytes"
                @select-category="onSelectEffortOnChart"
              />

              <DitherBarChart
                title="力度 - 耗时"
                :subtitle="`${getEncoderDisplayName(effortFocusEncoder)} · ${effortQualityLabel} · 三阶段耗时 (准备 / 编码 / 写出)`"
                :categories="effortFocusCategories"
                :series="effortFocusTimeSeries"
                :selected-category="currentFocusedEffortTag"
                stack-type="stacked"
                :height="320"
                :variant="variant"
                :bloom="bloom"
                :sparkles="sparkles"
                :pixel-size="pixelSize"
                y-unit="ms"
                @select-category="onSelectEffortOnChart"
              />
            </div>
          </template>

          <!-- ==================== TAB 4: 参数优选 ==================== -->
          <template v-else-if="activeTab === 'optimal'">
            <!-- Top Control & Preference Weight Bar -->
            <div class="effort-control-panel">
              <div class="effort-ctrl-row">
                <span class="control-label effort-ctrl-label">优选偏好</span>
                <div class="chart-inner-tabs">
                  <button
                    type="button"
                    class="chart-inner-tab"
                    :class="{ 'is-active': optimalPreference === 'balanced' }"
                    @click="optimalPreference = 'balanced'"
                  >
                    均衡甜点 (拐点算法)
                  </button>
                  <button
                    type="button"
                    class="chart-inner-tab"
                    :class="{ 'is-active': optimalPreference === 'compact' }"
                    @click="optimalPreference = 'compact'"
                  >
                    体积优先 (高压缩)
                  </button>
                  <button
                    type="button"
                    class="chart-inner-tab"
                    :class="{ 'is-active': optimalPreference === 'fast' }"
                    @click="optimalPreference = 'fast'"
                  >
                    速度优先 (低耗时)
                  </button>
                </div>
                <span class="opt-pref-hint">
                  自动分析各编码器的「质量-体积拐点」与「力度-耗时拐点」，找出体积暴增前、耗时暴涨前的最佳参数组合
                </span>
              </div>

              <div class="effort-ctrl-row">
                <span class="control-label effort-ctrl-label">剖析编码器</span>
                <div class="effort-encoder-tiles">
                  <button
                    v-for="item in encoderOptimalRecommendations"
                    :key="item.encoder"
                    type="button"
                    class="effort-enc-tile"
                    :class="{ 'is-active': optimalFocusEncoder === item.encoder }"
                    :style="{
                      '--tile-color': item.color.hex,
                      '--tile-bright': item.color.brightHex,
                    }"
                    @click="optimalFocusEncoder = item.encoder"
                  >
                    <span class="tile-dot" :style="{ backgroundColor: item.color.hex }"></span>
                    <span class="tile-name">{{ item.displayName }}</span>
                    <span class="tile-count">
                      {{ formatEncodingQuality(item.encoder, item.bestQuality) }} · {{ formatCleanEffort(item.encoder, item.bestEffortTag) }}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Two Core Optimization Charts: Left = Optimal Quality Knee | Right = Optimal Effort Knee -->
            <div class="chart-grid-2col" v-if="currentOptimalFocusItem">
              <!-- Chart 1: Optimal Quality Parameter Analysis -->
              <DitherAreaChart
                v-if="!currentOptimalFocusItem.losslessOnly"
                :subtitle="`【${currentOptimalFocusItem.displayName}】质量曲线力度: ${formatCleanEffort(currentOptimalFocusItem.encoder, currentOptimalFocusItem.qualityEffortTag)} · 推荐质量: ${formatEncodingQuality(currentOptimalFocusItem.encoder, currentOptimalFocusItem.bestQuality)} (${currentOptimalFocusItem.qualityReason}) · 点击横轴可同步对比器`"
                :x-labels="optimalQualityXLabels"
                :series="optimalQualityChartSeries"
                :selected-x="currentOptimalFocusItem.bestQuality"
                :height="310"
                :variant="variant"
                :bloom="bloom"
                :sparkles="sparkles"
                :pixel-size="pixelSize"
                :y-unit="optimalQualityChartTab === 'curve' ? '%' : '%'"
                :y-base-bytes="optimalQualityChartTab === 'curve' ? activeReferenceInputBytes : null"
                x-axis-prefix="Q"
                @select-x="onSelectOptimalQualityOnChart"
              >
                <template #tabs>
                  <div class="chart-inner-tabs">
                    <button
                      type="button"
                      class="chart-inner-tab"
                      :class="{ 'is-active': optimalQualityChartTab === 'curve' }"
                      @click="optimalQualityChartTab = 'curve'"
                    >
                      最佳质量拐点 (质量-体积)
                    </button>
                    <button
                      type="button"
                      class="chart-inner-tab"
                      :class="{ 'is-active': optimalQualityChartTab === 'marginal' }"
                      @click="optimalQualityChartTab = 'marginal'"
                    >
                      边际体积变化 (Δ体积/ΔQ)
                    </button>
                  </div>
                </template>
              </DitherAreaChart>

              <!-- If Pure Lossless Encoder (PNG): Show Effort Volume Savings Curve on Left -->
              <DitherBarChart
                v-else
                title="最佳质量参数 — 无损压缩 (各力度体积对比)"
                :subtitle="`【${currentOptimalFocusItem.displayName}】为无损编码器，固定数学无损，推荐最佳力度为 ${currentOptimalFocusItem.bestEffortTag}`"
                :categories="optimalEffortCategories"
                :series="optimalEffortVolumeSeries"
                :selected-category="currentOptimalFocusItem.bestEffortTag"
                stack-type="default"
                :height="310"
                :variant="variant"
                :bloom="bloom"
                :sparkles="sparkles"
                :pixel-size="pixelSize"
                y-unit="%"
                :y-base-bytes="activeReferenceInputBytes"
                @select-category="onSelectOptimalEffortOnChart"
              />

              <!-- Chart 2: Optimal Effort Parameter Analysis -->
              <DitherBarChart
                :title="optimalEffortChartTab === 'score' ? '最佳力度优选得分 (体积 × 速度综合评分)' : '各力度档位编码耗时对比 (拐点剖析)'"
                :subtitle="`【${currentOptimalFocusItem.displayName}】推荐最佳力度: ${currentOptimalFocusItem.bestEffortTag} (${currentOptimalFocusItem.effortReason}) · 点击柱体同步对比器`"
                :categories="optimalEffortCategories"
                :series="optimalEffortActiveSeries"
                :selected-category="currentOptimalFocusItem.bestEffortTag"
                stack-type="default"
                :height="310"
                :variant="variant"
                :bloom="bloom"
                :sparkles="sparkles"
                :pixel-size="pixelSize"
                :y-unit="optimalEffortChartTab === 'score' ? '分' : 'ms'"
                @select-category="onSelectOptimalEffortOnChart"
              />
            </div>

            <!-- All 12 Encoders Optimal Quality & Optimal Effort Recommendation Matrix -->
            <div class="optimal-matrix-panel">
              <div class="omp-head">
                <div>
                  <h3 class="dk-chart-title">{{ encoderOptimalRecommendations.length }} 款编码器「最佳质量 + 最佳力度」参数推荐总表</h3>
                  <p class="dk-chart-subtitle">
                    基于当前{{ aggregateAllImages ? `全部 ${dataset.images.length} 张图片均值` : `图片 ${currentImageMeta.name}` }}实测数据自动计算拐点 · 点击任意卡片可切换上方剖析图表，点击 [设为A/B] 同步至底部图片对比器
                  </p>
                </div>
                <div class="chart-inner-tabs">
                  <button
                    type="button"
                    class="chart-inner-tab"
                    :class="{ 'is-active': optimalEffortChartTab === 'score' }"
                    @click="optimalEffortChartTab = 'score'"
                  >
                    右图看综合优选得分
                  </button>
                  <button
                    type="button"
                    class="chart-inner-tab"
                    :class="{ 'is-active': optimalEffortChartTab === 'time' }"
                    @click="optimalEffortChartTab = 'time'"
                  >
                    右图看力度编码耗时
                  </button>
                </div>
              </div>

              <p v-if="unavailableOptimalEncoders.length" class="dk-chart-subtitle">
                以下编码器缺少实测数据，暂无参数推荐：{{ unavailableOptimalEncoders.join('、') }}
              </p>
              <div class="optimal-cards-grid">
                <div
                  v-for="item in encoderOptimalRecommendations"
                  :key="item.encoder"
                  class="opt-rec-card"
                  :class="{ 'is-focused': optimalFocusEncoder === item.encoder }"
                  :style="{ '--enc-color': item.color.hex }"
                  @click="optimalFocusEncoder = item.encoder"
                >
                  <div class="orc-top">
                    <div class="orc-title-group">
                      <span class="orc-dot" :style="{ backgroundColor: item.color.hex }"></span>
                      <span class="orc-name" :style="{ color: item.color.brightHex }">{{ item.displayName }}</span>
                    </div>
                    <div class="orc-actions" @click.stop>
                      <button
                        type="button"
                        class="slot-assign-btn"
                        :class="{ 'is-active-a': slotAEncoder === item.encoder && slotAEffort === item.bestEffortTag && (item.bestQuality === null ? slotAQuality === -1 : slotAQuality === item.bestQuality) }"
                        @click="applyOptimalToSlot('A', item)"
                      >
                        设为A
                      </button>
                      <button
                        type="button"
                        class="slot-assign-btn"
                        :class="{ 'is-active-b': slotBEncoder === item.encoder && slotBEffort === item.bestEffortTag && (item.bestQuality === null ? slotBQuality === -1 : slotBQuality === item.bestQuality) }"
                        @click="applyOptimalToSlot('B', item)"
                      >
                        设为B
                      </button>
                    </div>
                  </div>

                  <!-- Highlighted Optimal Quality & Optimal Effort Badges -->
                  <div class="orc-badges-row">
                    <div class="orc-param-box">
                      <span class="orc-param-lbl">最佳质量参数</span>
                      <strong class="orc-param-val" :style="{ color: item.color.brightHex }">
                        {{ formatEncodingQuality(item.encoder, item.bestQuality) }}
                      </strong>
                      <span class="orc-param-sub">{{ item.qualityReason }}</span>
                    </div>

                    <div class="orc-param-box">
                      <span class="orc-param-lbl">最佳力度参数</span>
                      <strong class="orc-param-val" style="color: var(--accent-green)">
                        {{ formatCleanEffort(item.encoder, item.bestEffortTag) }}
                      </strong>
                      <span class="orc-param-sub">{{ item.effortReason }}</span>
                    </div>
                  </div>

                  <!-- Recommended CLI Command -->
                  <div class="xdr-cli-line">
                    <code>{{ item.recommendedCli }}</code>
                  </div>

                  <!-- Resulting Metrics at Optimal Parameters -->
                  <div class="orc-metrics-foot">
                    <span>体积 <strong :style="{ color: item.color.brightHex }">{{ item.fusedVolume }}</strong></span>
                    <span>编码 <strong>{{ item.encodeMs.toFixed(1) }}ms</strong></span>
                    <span>解码 <strong>{{ item.decodeMs.toFixed(1) }}ms</strong></span>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- ==================== TAB 5: 详细数据 ==================== -->
          <template v-else-if="activeTab === 'table'">
            <div class="view-control-banner">
              <div class="vcb-left">
                <span class="vcb-badge">实验明细检索 ({{ filteredTableRecords.length }} 条)</span>
                <span class="vcb-desc">点击任意行的 [设为A] 或 [设为B] 即可将该条压缩结果加载至下方图片对比器。</span>
              </div>
              <div class="vcb-right">
                <select v-model="tableEncoderFilter" class="dk-select">
                  <option value="ALL">全部 {{ dataset.config.encoders.length }} 款编码器</option>
                  <option v-for="enc in dataset.config.encoders" :key="enc.name" :value="enc.name">
                    {{ getEncoderDisplayName(enc.name) }}
                  </option>
                </select>
              </div>
            </div>

            <div class="telemetry-table-wrap" style="max-height: 350px; overflow-y: auto; margin-bottom: 16px">
              <table class="telemetry-table">
                <thead>
                  <tr>
                    <th>对比操作</th>
                    <th>格式-编码器</th>
                    <th>力度档位</th>
                    <th>质量</th>
                    <th>体积占比与大小</th>
                    <th>节省率</th>
                    <th>准备耗时</th>
                    <th>编码耗时</th>
                    <th>解码耗时</th>
                    <th>总耗时</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(rec, idx) in filteredTableRecords" :key="idx">
                    <td>
                      <button type="button" class="slot-assign-btn" @click="loadRecordIntoSlot('A', rec)">设为A</button>
                      <button type="button" class="slot-assign-btn" style="margin-left: 4px" @click="loadRecordIntoSlot('B', rec)">设为B</button>
                    </td>
                    <td :style="{ color: getEncoderColor(rec.encoder).brightHex, fontWeight: 600 }">
                      {{ getEncoderDisplayName(rec.encoder) }}
                    </td>
                    <td>{{ formatCleanEffort(rec.encoder, rec.effortTag) }}</td>
                    <td>{{ formatEncodingQuality(rec.encoder, rec.quality, rec.actualQuality, rec.lossless) }}</td>
                    <td style="color: #fff; font-weight: 600">
                      <span
                        class="ratio-bar-inline"
                        :style="{
                          width: `${Math.min(72, Math.max(3, rec.compressionRatio * 72))}px`,
                          backgroundColor: getEncoderColor(rec.encoder).hex,
                        }"
                      ></span>
                      {{ formatFusedVolume(rec.compressionRatio * 100, rec.outputBytes) }}
                    </td>
                    <td>{{ rec.spaceSavingPct.toFixed(1) }}%</td>
                    <td>{{ rec.ready_ms.toFixed(2) }}ms</td>
                    <td style="color: #fff; font-weight: 600">{{ rec.encode_ms.toFixed(2) }}ms</td>
                    <td style="color: var(--accent-green); font-weight: 600">{{ (rec.decode_ms ?? 0).toFixed(2) }}ms</td>
                    <td>{{ rec.total_ms.toFixed(2) }}ms</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>

          <!-- ==================== TAB 6: 在线编码 (WASM) ==================== -->
          <template v-else-if="activeTab === 'online'">
            <OnlineEncoder
              :benchmark-image-name="currentImageMeta.name"
              :data-version="dataset.generatedAt"
            />
          </template>

          <!-- ==================== BOTTOM: SYNCHRONIZED IMAGE SPLIT COMPARATOR ==================== -->
          <ImageSplitComparator
            v-if="activeTab !== 'online'"
            :current-image="currentImageMeta"
            :data-version="dataset.generatedAt"
            :encoders="dataset.config.encoders"
            :quality-levels="dataset.config.qualityLevels"
            :records-for-image="currentImageOnlyRecords"
            v-model:slot-a-encoder="slotAEncoder"
            v-model:slot-a-effort="slotAEffort"
            v-model:slot-a-quality="slotAQuality"
            v-model:slot-b-encoder="slotBEncoder"
            v-model:slot-b-effort="slotBEffort"
            v-model:slot-b-quality="slotBQuality"
          />

          <!-- ==================== FOOTER ==================== -->
          <footer class="workspace-footer">
            <a
              href="https://moonvy.com"
              target="_blank"
              rel="noopener noreferrer"
              class="footer-brand-link"
              title="Moonvy 月维 (https://moonvy.com)"
              aria-label="访问 Moonvy 月维官网"
            >
              <img
                :src="siteAssetUrl('moonvy_loog_full_cn_dark.svg')"
                alt="Moonvy 月维"
                class="footer-logo-img"
              />
            </a>
          </footer>
        </div>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { buildImagePreviewUrl, siteAssetUrl } from './lib/assetUrls';
import { findExactEncodingRecord, formatEncodingQuality, getActualQuality, groupEncodingModes, normalizeEncodingRecord, summarizeVolume } from '../../lib/benchmarkData';
import DitherAreaChart, { type AreaSeriesItem } from './components/dither-kit/DitherAreaChart.vue';
import DitherBarChart, { type BarSeriesItem } from './components/dither-kit/DitherBarChart.vue';
import DitherAvatar from './components/dither-kit/DitherAvatar.vue';
import DitherGradient from './components/dither-kit/DitherGradient.vue';
import OnlineEncoder from './components/OnlineEncoder.vue';
import PreviewImage from './components/PreviewImage.vue';
import ImageSplitComparator, {
  type CompImageMeta,
  type CompEncoderConfig,
  type CompRecord,
} from './components/ImageSplitComparator.vue';
import {
  type DitherVariant,
  type DitherBloom,
  type DitherPaletteEntry,
  DITHER_PALETTE,
  ENCODER_META_MAP,
  getEncoderMeta,
  getEncoderColor,
  getEncoderDisplayName,
  formatCleanEffort,
} from './components/dither-kit/ditherEngine';

interface BenchmarkDataset {
  generatedAt: string;
  totalElapsedMs: number;
  config: {
    qualityLevels: number[];
    encoders: CompEncoderConfig[];
  };
  summary: {
    totalImages: number;
    totalPlannedTasks: number;
    completedTasks: number;
  };
  images: CompImageMeta[];
  records: CompRecord[];
}

interface XDetailItem {
  key: string;
  encoder: string;
  displayName: string;
  lossless: boolean;
  effortTag: string;
  effortLabel: string;
  quality: number | null;
  cliCommand: string;
  color: DitherPaletteEntry;
  ratioPct: number;
  outputBytes: number;
  fusedVolume: string;
  /** 当前图片实测分数或完整图片集的平均分，缺失时留空。 */
  ssimulacra2: number | null;
  savingPct: number;
  readyMs: number;
  encodeMs: number;
  outputMs: number;
  totalMs: number;
}

const loading = ref(true);
const dataset = ref<BenchmarkDataset | null>(null);

const viewTabs = [
  { key: 'overview' as const, idx: '01', label: '概览' },
  { key: 'quality' as const, idx: '02', label: '质量参数' },
  { key: 'effort' as const, idx: '03', label: '力度参数' },
  { key: 'optimal' as const, idx: '04', label: '参数优选' },
  { key: 'table' as const, idx: '05', label: '详细数据' },
  { key: 'online' as const, idx: '06', label: '在线编码' },
];
const activeTab = ref<'overview' | 'quality' | 'effort' | 'optimal' | 'table' | 'online'>('overview');

const variantOptions: { key: DitherVariant; label: string }[] = [
  { key: 'gradient', label: '渐变抖动' },
  { key: 'dotted', label: '点阵' },
  { key: 'hatched', label: '斜线网格' },
  { key: 'solid', label: '实心像素' },
];

const bloomOptions: { key: DitherBloom; label: string }[] = [
  { key: 'off', label: '关闭' },
  { key: 'low', label: '弱辉光' },
  { key: 'high', label: '强辉光' },
  { key: 'aura', label: '霓虹光晕' },
];

const currentImageName = ref<string>('Apple官网.png');
const aggregateAllImages = ref<boolean>(false);
const spotlightEncoder = ref<string | null>(null);

const variant = ref<DitherVariant>('gradient');
const bloom = ref<DitherBloom>('aura');
const sparkles = ref<boolean>(true);
const pixelSize = ref<number>(2);
const logScaleY = ref<boolean>(false);

// Quality Tab State: Single Switchable Chart ('volume' | 'time')
const qualityChartTab = ref<'volume' | 'time' | 'objective'>('volume');
const includeLosslessInQualityChart = ref<boolean>(false);
const losslessOverlayMode = ref<'balanced' | 'extremes' | 'all'>('balanced');
const effortStrategy = ref<'default' | 'fastest' | 'best'>('default');
const syncedQuality = ref<number>(80);

const effortFocusEncoder = ref<string>('cjxl');
const tableEncoderFilter = ref<string>('ALL');

const slotAEncoder = ref<string>('cjxl');
const slotAEffort = ref<string>('e7');
const slotAQuality = ref<number>(80);

const slotBEncoder = ref<string>('avifenc-aom');
const slotBEffort = ref<string>('s6');
const slotBQuality = ref<number>(80);

const DEFAULT_EFFORT_TAG: Record<string, string> = {
  'png-libpng': 'l6',
  'png-libpng-zlibng': 'l6',
  'png-libspng': 'l6',
  'oxipng': 'o2',
  'cjpeg-turbo': 'e2_progressive',
  'cjpeg-mozjpeg': 'e2_default',
  'cjpegli': 'p2',
  'cjxl': 'e7',
  'cwebp': 'm4',
  'cwebp-sharp-yuv': 'm4',
  'avifenc-aom': 's6',
  'avifenc-svt': 's6',
};

const FASTEST_EFFORT_TAG: Record<string, string> = {
  'png-libpng': 'l1',
  'png-libpng-zlibng': 'l1',
  'png-libspng': 'l1',
  'oxipng': 'o0',
  'cjpeg-turbo': 'e0_baseline',
  'cjpeg-mozjpeg': 'e0_fast',
  'cjpegli': 'p0',
  'cjxl': 'e1',
  'cwebp': 'm0',
  'cwebp-sharp-yuv': 'm0',
  'avifenc-aom': 's9',
  'avifenc-svt': 's12',
};

const BEST_EFFORT_TAG: Record<string, string> = {
  'png-libpng': 'l8',
  'png-libpng-zlibng': 'l8',
  'png-libspng': 'l8',
  'oxipng': 'o5',
  'cjpeg-turbo': 'e2_progressive',
  'cjpeg-mozjpeg': 'e2_default',
  'cjpegli': 'p2',
  'cjxl': 'e7',
  'cwebp': 'm5',
  'cwebp-sharp-yuv': 'm5',
  'avifenc-aom': 's6',
  'avifenc-svt': 's5',
};

function getTargetEffortTag(
  encoder: string,
  strategy: 'default' | 'fastest' | 'best' = effortStrategy.value
): string {
  if (strategy === 'fastest') return FASTEST_EFFORT_TAG[encoder] ?? 'l1';
  if (strategy === 'best') return BEST_EFFORT_TAG[encoder] ?? 'l8';
  return DEFAULT_EFFORT_TAG[encoder] ?? 'l6';
}

function buildCliCommandString(encoder: string, effortTag: string, effortLabel: string, quality: number | null): string {
  quality = getActualQuality(encoder, quality);
  switch (encoder) {
    case 'png-libpng':
    case 'png-libpng-zlibng':
    case 'png-libspng':
      return `${encoder} ${effortLabel}`;
    case 'oxipng':
      return `oxipng ${effortLabel}`;
    case 'cjpeg-turbo':
      return `cjpeg-turbo -quality ${quality} ${effortTag === 'e0_baseline' ? '' : effortLabel}`.replace(/\s+/g, ' ').trim();
    case 'cjpeg-mozjpeg':
      return `cjpeg-mozjpeg -quality ${quality} ${effortTag === 'e2_default' ? '' : effortTag === 'e1_fastcrush' ? '-fastcrush' : '-notrellis -fastcrush'}`.replace(/\s+/g, ' ').trim();
    case 'cjpegli':
      return `cjpegli -q ${Math.max(1, quality ?? 80)} -p ${effortTag.replace('p', '')}`;
    case 'cjxl':
      return quality === null
        ? `cjxl -d 0 ${effortLabel}`
        : `cjxl -q ${quality} ${effortLabel}`;
    case 'cwebp':
    case 'cwebp-sharp-yuv':
      return quality === null
        ? `cwebp -lossless -q 100 -m ${effortTag.replace('m', '')}`
        : `cwebp -q ${quality} ${effortLabel}`;
    case 'avifenc-aom':
      return quality === null
        ? `avifenc -c aom -l -s ${effortTag.replace('s', '')} -j 4`
        : quality === 100
        ? `avifenc -c aom -s ${effortTag.replace('s', '')} -q 100 --depth 10 -y 444 -j 4`
        : `avifenc ${effortLabel} -q ${quality} -j 4`;
    case 'avifenc-svt':
      return `avifenc ${effortLabel} -q ${quality} -j 4`;
    default:
      return `${encoder} ${effortLabel} ${quality !== null ? `-q ${quality}` : ''}`.trim();
  }
}

const encoderListItems = computed(() => Object.values(ENCODER_META_MAP));

const currentImageMeta = computed<CompImageMeta | null>(() => {
  if (!dataset.value) return null;
  return (
    dataset.value.images.find((i) => i.name === currentImageName.value) ??
    dataset.value.images[0] ??
    null
  );
});

const currentImageOnlyRecords = computed<CompRecord[]>(() => {
  if (!dataset.value || !currentImageMeta.value) return [];
  const name = currentImageMeta.value.name;
  return dataset.value.records.filter((r) => r.image === name);
});

const activeChartRecords = computed<CompRecord[]>(() => {
  if (!dataset.value) return [];
  if (aggregateAllImages.value) return dataset.value.records;
  return currentImageOnlyRecords.value;
});

/** 按参数组分类，避免全集统计只保留恰好无损的图片而改变统计样本。 */
const activeEncodingGroups = computed(() => groupEncodingModes(activeChartRecords.value));
const activeLosslessRecords = computed(() => activeEncodingGroups.value.filter((group) => group.lossless).flatMap((group) => group.records));
const activeLossyRecords = computed(() => activeEncodingGroups.value.filter((group) => !group.lossless).flatMap((group) => group.records));

/** 无损比较中选用当前力度下体积最小的已验证档位，并保留真实质量参数。 */
function findLosslessGroup(encoder: string, effortTag: string) {
  return activeEncodingGroups.value.filter((group) => group.encoder === encoder && group.effortTag === effortTag && group.lossless)
    .sort((a, b) => summarizeVolume(a.records).avgBytes - summarizeVolume(b.records).avgBytes || (a.quality ?? 101) - (b.quality ?? 101))[0];
}

const activeReferenceInputBytes = computed<number>(() => {
  if (!dataset.value) return 0;
  if (aggregateAllImages.value) {
    const imgs = dataset.value.images;
    if (imgs.length === 0) return 0;
    return imgs.reduce((acc, i) => acc + i.inputBytes, 0) / imgs.length;
  }
  return currentImageMeta.value?.inputBytes ?? 0;
});

function colorTypeLabel(ct: number): string {
  switch (ct) {
    case 0:
      return '灰度';
    case 2:
      return 'RGB';
    case 3:
      return '索引色';
    case 4:
      return '灰度+透明';
    case 6:
      return 'RGBA';
    default:
      return `类型 ${ct}`;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)}\u00A0B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}\u00A0KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}\u00A0MB`;
}

/**
 * 融合百分比与体积：如 "50.2% (100.4 KB)"
 */
function formatFusedVolume(ratioPct: number, bytes: number): string {
  return `${ratioPct.toFixed(1)}%\u00A0(${formatBytes(bytes)})`;
}

function onEncoderRowClick(encId: string) {
  spotlightEncoder.value = spotlightEncoder.value === encId ? null : encId;
  selectEffortEncoder(encId);
}

/** 仅提供当前数据集中逐像素验证通过的无损配置。 */
function hasLosslessRecords(encoder: string): boolean {
  return activeEncodingGroups.value.some((group) => group.encoder === encoder && group.lossless);
}

/** 全局无损选择不改动没有无损结果的对比槽。 */
function syncLosslessSlots() {
  const a = findLosslessGroup(slotAEncoder.value, slotAEffort.value);
  const b = findLosslessGroup(slotBEncoder.value, slotBEffort.value);
  if (a) slotAQuality.value = a.quality ?? -1;
  if (b) slotBQuality.value = b.quality ?? -1;
}

function assignToSlot(slot: 'A' | 'B', encId: string) {
  const defEf = getTargetEffortTag(encId);
  const lossless = overviewLosslessMode.value ? findLosslessGroup(encId, defEf) : undefined;
  const qVal = lossless ? lossless.quality ?? -1 : syncedQuality.value;
  if (slot === 'A') {
    slotAEncoder.value = encId;
    slotAEffort.value = defEf;
    slotAQuality.value = qVal;
  } else {
    slotBEncoder.value = encId;
    slotBEffort.value = defEf;
    slotBQuality.value = qVal;
  }
}

function assignDetailItemToSlot(slot: 'A' | 'B', item: XDetailItem) {
  if (slot === 'A') {
    slotAEncoder.value = item.encoder;
    slotAEffort.value = item.effortTag;
    slotAQuality.value = item.quality ?? -1;
  } else {
    slotBEncoder.value = item.encoder;
    slotBEffort.value = item.effortTag;
    slotBQuality.value = item.quality ?? -1;
  }
}

/** 即使再次选择同一质量档，也要退出对比器之前的无损模式。 */
function syncQualitySlots(q: number) {
  syncedQuality.value = q;
  slotAQuality.value = q;
  slotBQuality.value = q;
}

function onSelectQualityOnChart(payload: { index: number; value: string | number }) {
  const q = Number(payload.value);
  if (Number.isFinite(q)) {
    syncQualitySlots(q);
  }
}

function onSelectEffortOnChart(payload: { index: number; category: string }) {
  const efTag = payload.category;
  const quality = getEffortQuality(efTag);
  if (quality === undefined || !findExactEncodingRecord(activeChartRecords.value, effortFocusEncoder.value, efTag, quality)) return;
  if (slotBEncoder.value === effortFocusEncoder.value && slotAEncoder.value !== effortFocusEncoder.value) {
    slotBEffort.value = efTag;
    slotBQuality.value = quality ?? -1;
  } else {
    slotAEncoder.value = effortFocusEncoder.value;
    slotAEffort.value = efTag;
    slotAQuality.value = quality ?? -1;
  }
}

/** 同时比较质量、力度与编码器，避免有损和无损两行同时高亮。 */
function isSlotSelection(slot: 'A' | 'B', encoder: string, effortTag: string, quality: number | null): boolean {
  const selectedEncoder = slot === 'A' ? slotAEncoder.value : slotBEncoder.value;
  const selectedEffort = slot === 'A' ? slotAEffort.value : slotBEffort.value;
  const selectedQuality = slot === 'A' ? slotAQuality.value : slotBQuality.value;
  const actualMode = getEncoderMeta(selectedEncoder).lossless || selectedQuality === -1 ? null : selectedQuality;
  return selectedEncoder === encoder && selectedEffort === effortTag && actualMode === quality;
}

const currentFocusedEffortTag = computed(() => {
  const encoder = effortFocusEncoder.value;
  const quality = getEffortQuality;
  const a = quality(slotAEffort.value), b = quality(slotBEffort.value);
  if (a !== undefined && isSlotSelection('A', encoder, slotAEffort.value, a)) return slotAEffort.value;
  if (b !== undefined && isSlotSelection('B', encoder, slotBEffort.value, b)) return slotBEffort.value;
  return null;
});

// ==================== TAB 2: SINGLE SWITCHABLE QUALITY CHART & RIGHT DETAIL PANEL ====================
function getActiveLosslessEfforts(encCfg: CompEncoderConfig, mode = losslessOverlayMode.value) {
  if (mode === 'balanced') {
    const target = getTargetEffortTag(encCfg.name, 'default');
    return encCfg.efforts.filter((e) => e.tag === target);
  }
  if (mode === 'extremes') {
    return encCfg.efforts.filter((_, index) => index === 0 || index === encCfg.efforts.length - 1);
  }
  return encCfg.efforts;
}

/** 无损模式的参考线数量只计入当前确实有数据的配置。 */
const losslessReferenceCounts = computed(() => {
  const count = (mode: 'balanced' | 'extremes' | 'all') => (dataset.value?.config.encoders ?? []).reduce((sum, cfg) =>
    sum + activeEncodingGroups.value.filter((group) => group.encoder === cfg.name && group.lossless && getActiveLosslessEfforts(cfg, mode).some((ef) => ef.tag === group.effortTag)).length, 0);
  return { balanced: count('balanced'), extremes: count('extremes'), all: count('all') };
});

/** 质量参数视图隐藏 AVIF Q100 的异常档位，原始记录仍供其他视图和对比器使用。 */
function isQualityChartRecord(record: { encoder: string; quality: number | null }): boolean {
  return !(record.quality === 100 && (record.encoder === 'avifenc-aom' || record.encoder === 'avifenc-svt'));
}
const qualityLossyRecords = computed(() => activeLossyRecords.value.filter(isQualityChartRecord));
const qualityEncodingGroups = computed(() => activeEncodingGroups.value.filter(isQualityChartRecord));

const qualityEncoderCount = computed(() => new Set(qualityLossyRecords.value.filter((record) => record.quality !== null).map((record) => record.encoder)).size);

function buildLosslessReferenceSeries(metric: 'volume' | 'time'): AreaSeriesItem[] {
  if (!dataset.value || !includeLosslessInQualityChart.value) return [];
  const qCount = dataset.value.config.qualityLevels.length;
  const losslessConfigs = dataset.value.config.encoders.filter((e) => hasLosslessRecords(e.name));
  const items: AreaSeriesItem[] = [];

  for (const encCfg of losslessConfigs) {
    const meta = getEncoderMeta(encCfg.name);
    const effortsToPlot = getActiveLosslessEfforts(encCfg);

    for (const group of qualityEncodingGroups.value.filter((group) => group.encoder === encCfg.name && group.lossless && effortsToPlot.some((ef) => ef.tag === group.effortTag))) {
      const ef = encCfg.efforts.find((ef) => ef.tag === group.effortTag)!;
      const sub = group.records;
      if (sub.length === 0) continue;
      const n = sub.length;
      const avgRatioPct = summarizeVolume(sub).ratioPct;
      const avgBytes = sub.reduce((a, b) => a + b.outputBytes, 0) / n;
      const avgEncodeMs = sub.reduce((a, b) => a + b.encode_ms, 0) / n;

      const val = metric === 'volume' ? avgRatioPct : avgEncodeMs;
      const fmtStr =
        metric === 'volume'
          ? formatFusedVolume(avgRatioPct, avgBytes)
          : `${avgEncodeMs.toFixed(1)} ms`;

      items.push({
        key: `${encCfg.name}__${ef.tag}__${group.quality}`,
        label: `${meta.displayName} (${ef.tag} · ${formatEncodingQuality(encCfg.name, group.quality, undefined, true)})`,
        legendLabel: meta.displayName,
        color: meta.color,
        values: Array(qCount).fill(val),
        formattedValues: Array(qCount).fill(fmtStr),
        dashed: true,
      });
    }
  }
  return items;
}

const qualityVolumeSeries = computed<AreaSeriesItem[]>(() => {
  if (!dataset.value) return [];
  const qLevels = dataset.value.config.qualityLevels;
  const lossyConfigs = dataset.value.config.encoders.filter((e) => qualityLossyRecords.value.some((record) => record.encoder === e.name && record.quality !== null));

  const lossySeries: AreaSeriesItem[] = lossyConfigs.map((encCfg) => {
    const targetEf = getTargetEffortTag(encCfg.name);
    const meta = getEncoderMeta(encCfg.name);
    const values: (number | null)[] = [];
    const formattedValues: (string | null)[] = [];

    for (const q of qLevels) {
      const sub = qualityLossyRecords.value.filter(
        (r) => r.encoder === encCfg.name && r.effortTag === targetEf && r.quality === q
      );
      if (sub.length === 0) {
        values.push(null);
        formattedValues.push(null);
      } else {
        const n = sub.length;
        const avgRatioPct = summarizeVolume(sub).ratioPct;
        const avgBytes = sub.reduce((a, b) => a + b.outputBytes, 0) / n;
        values.push(avgRatioPct);
        formattedValues.push(formatFusedVolume(avgRatioPct, avgBytes));
      }
    }

    return {
      key: encCfg.name,
      label: `${meta.displayName} (${targetEf})${encCfg.name === 'cjpegli' ? ' · Q0 实际 Q1' : ''}`,
      legendLabel: meta.displayName,
      color: meta.color,
      values,
      formattedValues,
    };
  });

  return [...lossySeries, ...buildLosslessReferenceSeries('volume')];
});

const qualityTimeSeries = computed<AreaSeriesItem[]>(() => {
  if (!dataset.value) return [];
  const qLevels = dataset.value.config.qualityLevels;
  const lossyConfigs = dataset.value.config.encoders.filter((e) => qualityLossyRecords.value.some((record) => record.encoder === e.name && record.quality !== null));

  const lossySeries: AreaSeriesItem[] = lossyConfigs.map((encCfg) => {
    const targetEf = getTargetEffortTag(encCfg.name);
    const meta = getEncoderMeta(encCfg.name);
    const values: (number | null)[] = [];
    const formattedValues: (string | null)[] = [];

    for (const q of qLevels) {
      const sub = qualityLossyRecords.value.filter(
        (r) => r.encoder === encCfg.name && r.effortTag === targetEf && r.quality === q
      );
      if (sub.length === 0) {
        values.push(null);
        formattedValues.push(null);
      } else {
        const avgMs = sub.reduce((a, b) => a + b.encode_ms, 0) / sub.length;
        values.push(avgMs);
        formattedValues.push(`${avgMs.toFixed(1)} ms`);
      }
    }

    return {
      key: encCfg.name,
      label: `${meta.displayName} (${targetEf})${encCfg.name === 'cjpegli' ? ' · Q0 实际 Q1' : ''}`,
      legendLabel: meta.displayName,
      color: meta.color,
      values,
      formattedValues,
    };
  });

  return [...lossySeries, ...buildLosslessReferenceSeries('time')];
});

/** 只对完整样本集求实测均分；保留零分、负分，不将缺失值当成零。 */
function summarizeQualityScore(records: CompRecord[]): number | null {
  const names = aggregateAllImages.value ? dataset.value?.images.map((image) => image.name) ?? [] : currentImageMeta.value ? [currentImageMeta.value.name] : [];
  if (!names.length || records.length !== names.length || new Set(records.map((record) => record.image)).size !== names.length || records.some((record) => !names.includes(record.image) || !Number.isFinite(record.ssimulacra2))) return null;
  return records.reduce((sum, record) => sum + record.ssimulacra2!, 0) / records.length;
}

/** 客观视觉曲线移除整个 Q0 横轴档位，其他图表保留原有档位。 */
const qualityChartLevels = computed(() => (dataset.value?.config.qualityLevels ?? []).filter((quality) => qualityChartTab.value !== 'objective' || quality !== 0));

/** 从 Q0 切入客观视觉图时同步到首个有效档位，避免明细保留已隐藏的选择。 */
function selectQualityChartTab(tab: 'volume' | 'time' | 'objective') {
  qualityChartTab.value = tab;
  if (tab === 'objective' && syncedQuality.value === 0) {
    const firstQuality = qualityChartLevels.value[0];
    if (firstQuality !== undefined) syncQualitySlots(firstQuality);
  }
}

/** 有损质量参数对应的实测视觉评分，保留评分退化，便于发现编码异常。 */
const qualityObjectiveSeries = computed<AreaSeriesItem[]>(() => {
  if (!dataset.value) return [];
  return dataset.value.config.encoders
    .filter((encoder) => qualityLossyRecords.value.some((record) => record.encoder === encoder.name && record.quality !== null))
    .map((encoder) => {
      const effortTag = getTargetEffortTag(encoder.name);
      const meta = getEncoderMeta(encoder.name);
      const values = dataset.value!.config.qualityLevels.filter((quality) => quality !== 0).map((quality) => summarizeQualityScore(qualityLossyRecords.value.filter((record) => record.encoder === encoder.name && record.effortTag === effortTag && record.quality === quality)));
      return {
        key: encoder.name,
        label: `${meta.displayName} (${effortTag})`,
        legendLabel: meta.displayName,
        color: meta.color,
        values,
        formattedValues: values.map((score) => score === null ? null : `SS2 ${score.toFixed(2)}`),
      };
    });
});

const activeQualityChartSeries = computed(() =>
  qualityChartTab.value === 'volume' ? qualityVolumeSeries.value : qualityChartTab.value === 'time' ? qualityTimeSeries.value : qualityObjectiveSeries.value
);

// Right Panel: Detailed Encoder Parameters & Results for the Selected X-Axis Quality (syncedQuality)
const selectedXEncoderDetails = computed<XDetailItem[]>(() => {
  if (!dataset.value) return [];
  const items: XDetailItem[] = [];
  const lossyConfigs = dataset.value.config.encoders.filter((e) => qualityLossyRecords.value.some((record) => record.encoder === e.name && record.quality !== null));

  for (const encCfg of lossyConfigs) {
    const targetEf = getTargetEffortTag(encCfg.name);
    const efObj = encCfg.efforts.find((e) => e.tag === targetEf) ?? encCfg.efforts[0];
    const meta = getEncoderMeta(encCfg.name);
    const sub = qualityLossyRecords.value.filter(
      (r) =>
        r.encoder === encCfg.name &&
        r.effortTag === targetEf &&
        r.quality === syncedQuality.value
    );
    if (sub.length === 0) continue;
    const n = sub.length;
    const ratioPct = summarizeVolume(sub).ratioPct;
    const outputBytes = sub.reduce((a, b) => a + b.outputBytes, 0) / n;
    const savingPct = summarizeVolume(sub).savingPct;
    const readyMs = sub.reduce((a, b) => a + b.ready_ms, 0) / n;
    const encodeMs = sub.reduce((a, b) => a + b.encode_ms, 0) / n;
    const outputMs = sub.reduce((a, b) => a + b.output_ms, 0) / n;
    const totalMs = sub.reduce((a, b) => a + b.total_ms, 0) / n;

    items.push({
      key: `${encCfg.name}__${targetEf}__q${syncedQuality.value}`,
      encoder: encCfg.name,
      displayName: meta.displayName,
      lossless: sub.every((r) => r.lossless),
      effortTag: targetEf,
      effortLabel: efObj?.label ?? targetEf,
      quality: syncedQuality.value,
      cliCommand: buildCliCommandString(encCfg.name, targetEf, efObj?.label ?? targetEf, syncedQuality.value),
      color: meta.color,
      ratioPct,
      outputBytes,
      fusedVolume: formatFusedVolume(ratioPct, outputBytes),
      ssimulacra2: summarizeQualityScore(sub),
      savingPct,
      readyMs,
      encodeMs,
      outputMs,
      totalMs,
    });
  }

  if (includeLosslessInQualityChart.value && qualityChartTab.value !== 'objective') {
    const losslessConfigs = dataset.value.config.encoders.filter((e) => hasLosslessRecords(e.name));
    for (const encCfg of losslessConfigs) {
      const meta = getEncoderMeta(encCfg.name);
      const effortsToPlot = getActiveLosslessEfforts(encCfg);
      for (const group of qualityEncodingGroups.value.filter((group) => group.encoder === encCfg.name && group.lossless && effortsToPlot.some((ef) => ef.tag === group.effortTag))) {
        const efObj = encCfg.efforts.find((ef) => ef.tag === group.effortTag)!;
        const sub = group.records;
        if (sub.length === 0) continue;
        const n = sub.length;
        const ratioPct = summarizeVolume(sub).ratioPct;
        const outputBytes = sub.reduce((a, b) => a + b.outputBytes, 0) / n;
        const savingPct = summarizeVolume(sub).savingPct;
        const readyMs = sub.reduce((a, b) => a + b.ready_ms, 0) / n;
        const encodeMs = sub.reduce((a, b) => a + b.encode_ms, 0) / n;
        const outputMs = sub.reduce((a, b) => a + b.output_ms, 0) / n;
        const totalMs = sub.reduce((a, b) => a + b.total_ms, 0) / n;

        items.push({
          key: `${encCfg.name}__${efObj.tag}__lossless__${group.quality}`,
          encoder: encCfg.name,
          displayName: meta.displayName,
          lossless: true,
          effortTag: efObj.tag,
          effortLabel: efObj.label,
          quality: group.quality,
          cliCommand: buildCliCommandString(encCfg.name, efObj.tag, efObj.label, group.quality),
          color: meta.color,
          ratioPct,
          outputBytes,
          fusedVolume: formatFusedVolume(ratioPct, outputBytes),
          ssimulacra2: summarizeQualityScore(sub),
          savingPct,
          readyMs,
          encodeMs,
          outputMs,
          totalMs,
        });
      }
    }
  }

  return items.sort((a, b) =>
    qualityChartTab.value === 'objective' ? (b.ssimulacra2 ?? -Infinity) - (a.ssimulacra2 ?? -Infinity) : qualityChartTab.value === 'volume' ? a.ratioPct - b.ratioPct : a.encodeMs - b.encodeMs
  );
});

const maxXDetailRatioPct = computed(() => {
  const list = selectedXEncoderDetails.value;
  if (list.length === 0) return 100;
  return Math.max(...list.map((d) => d.ratioPct), 1);
});

const maxXDetailEncodeMs = computed(() => {
  const list = selectedXEncoderDetails.value;
  if (list.length === 0) return 100;
  return Math.max(...list.map((d) => d.encodeMs), 0.1);
});

// ==================== TAB 3: EFFORT CHARTS ====================
const effortFocusConfig = computed(() =>
  dataset.value?.config.encoders.find((e) => e.name === effortFocusEncoder.value)
);

const effortSupportsLossless = computed<boolean>(() => hasLosslessRecords(effortFocusEncoder.value));

const effortAvailableQualities = computed<number[]>(() => {
  const name = effortFocusEncoder.value;
  return [...new Set(activeLossyRecords.value.filter((record) => record.encoder === name && record.quality !== null).map((record) => record.quality!))].sort((a, b) => a - b);
});

/** 独立无损开关可能无法还原原图像素，单独保留该实测模式供比较。 */
const effortHasPixelLossyIndependentMode = computed(() => activeLossyRecords.value.some((record) => record.encoder === effortFocusEncoder.value && record.quality === null));
type IEffortQuality = 'lossless' | 'encoded-lossless' | number;
const effortPreferredMode = ref<'lossless' | 'encoded-lossless' | null>(null);

const effortQualitySelection = computed<IEffortQuality>(() => {
  if (effortHasPixelLossyIndependentMode.value && effortPreferredMode.value === 'encoded-lossless') return 'encoded-lossless';
  if (effortSupportsLossless.value && (effortPreferredMode.value === 'lossless' || effortAvailableQualities.value.length === 0)) {
    return 'lossless';
  }
  const available = effortAvailableQualities.value;
  if (!available.length && effortHasPixelLossyIndependentMode.value) return 'encoded-lossless';
  return available.includes(syncedQuality.value) ? syncedQuality.value : available.at(-1) ?? syncedQuality.value;
});

/** 模式切换不借用其他质量产物，具体参数按当前力度查找。 */
function getEffortQuality(effortTag: string): number | null | undefined {
  const selection = effortQualitySelection.value;
  return selection === 'lossless' ? findLosslessGroup(effortFocusEncoder.value, effortTag)?.quality
    : selection === 'encoded-lossless' ? null : selection;
}

const effortQualityLabel = computed(() => {
  const selection = effortQualitySelection.value;
  return selection === 'lossless' ? '无损' : formatEncodingQuality(effortFocusEncoder.value, selection === 'encoded-lossless' ? null : selection, undefined, false);
});

function selectEffortEncoder(encName: string) {
  effortFocusEncoder.value = encName;
  effortPreferredMode.value = null;
}

function selectEffortQuality(q: IEffortQuality) {
  effortPreferredMode.value = typeof q === 'number' ? null : q;
  if (q === 'lossless') syncLosslessSlots();
  else if (typeof q === 'number') syncQualitySlots(q);
}

const effortFocusCategories = computed(() =>
  effortFocusConfig.value ? effortFocusConfig.value.efforts.map((e) => e.tag) : []
);

const effortFocusVolumeSeries = computed<BarSeriesItem[]>(() => {
  const cfg = effortFocusConfig.value;
  if (!cfg) return [];
  const meta = getEncoderMeta(cfg.name);
  const isLosslessSel = effortQualitySelection.value === 'lossless';
  const vals: (number | null)[] = [];
  const fmtVals: (string | null)[] = [];

  for (const ef of cfg.efforts) {
    const sub = (isLosslessSel ? activeLosslessRecords.value : activeLossyRecords.value).filter(
      (r) =>
        r.encoder === cfg.name &&
        r.effortTag === ef.tag &&
        r.quality === getEffortQuality(ef.tag)
    );
    if (sub.length === 0) {
      vals.push(null);
      fmtVals.push(null);
    } else {
      const n = sub.length;
      const avgRatioPct = summarizeVolume(sub).ratioPct;
      const avgBytes = sub.reduce((a, b) => a + b.outputBytes, 0) / n;
      vals.push(avgRatioPct);
      fmtVals.push(`${formatEncodingQuality(cfg.name, sub[0].quality, sub[0].actualQuality, isLosslessSel)} · ${formatFusedVolume(avgRatioPct, avgBytes)}`);
    }
  }

  return [
    {
      key: 'ratio',
      label: `${meta.displayName} 体积`,
      color: meta.color,
      values: vals,
      formattedValues: fmtVals,
    },
  ];
});

const effortFocusTimeSeries = computed<BarSeriesItem[]>(() => {
  const cfg = effortFocusConfig.value;
  if (!cfg) return [];
  const isLosslessSel = effortQualitySelection.value === 'lossless';
  const readyVals: (number | null)[] = [];
  const encodeVals: (number | null)[] = [];
  const outputVals: (number | null)[] = [];

  for (const ef of cfg.efforts) {
    const sub = (isLosslessSel ? activeLosslessRecords.value : activeLossyRecords.value).filter(
      (r) =>
        r.encoder === cfg.name &&
        r.effortTag === ef.tag &&
        r.quality === getEffortQuality(ef.tag)
    );
    if (sub.length === 0) {
      readyVals.push(null);
      encodeVals.push(null);
      outputVals.push(null);
      continue;
    }
    const n = sub.length;
    readyVals.push(sub.reduce((a, b) => a + b.ready_ms, 0) / n);
    encodeVals.push(sub.reduce((a, b) => a + b.encode_ms, 0) / n);
    outputVals.push(sub.reduce((a, b) => a + b.output_ms, 0) / n);
  }

  return [
    { key: 'ready_ms', label: '准备阶段', color: DITHER_PALETTE.cyan, values: readyVals },
    { key: 'encode_ms', label: '编码阶段', color: getEncoderColor(cfg.name), values: encodeVals },
    { key: 'output_ms', label: '写出阶段', color: DITHER_PALETTE.orange, values: outputVals },
  ];
});

// ==================== TAB 1: OVERVIEW SLIDER, EFFORT TABS & 3 CHARTS ====================
const overviewFilterMode = ref<'quality' | 'volume' | 'objective'>('quality');
const overviewLosslessMode = ref<boolean>(false);
const targetVolumePct = ref<number>(20);
const volumeTickPresets = [3, 5, 8, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100];
const targetSsimulacra2 = ref(80);
const objectiveTickPresets = [0, 10, 20, 30, 40, 50, 60, 65, 70, 75, 80, 85, 90, 93, 95, 97, 99, 100];
const objectiveSliderIndex = computed(() => objectiveTickPresets.indexOf(targetSsimulacra2.value));

/** 滑块与刻度按钮使用相同档位，保持显示分数和匹配目标一致。 */
function onObjectiveSliderInput(index: number) {
  const score = objectiveTickPresets[index];
  if (score !== undefined) targetSsimulacra2.value = score;
}

const effortStrategyLabel = computed(() => {
  if (effortStrategy.value === 'fastest') return '极速';
  if (effortStrategy.value === 'best') return '最大';
  return '均衡';
});

const overviewSubtitleDesc = computed(() => {
  if (overviewFilterMode.value === 'objective') {
    return `目标 SSIMULACRA2 ${targetSsimulacra2.value} · 最接近${aggregateAllImages.value ? '平均' : '实测'}评分`;
  }
  if (overviewFilterMode.value === 'volume') {
    return `目标体积 ${targetVolumePct.value}% 最佳匹配质量`;
  }
  return overviewLosslessMode.value ? '无损' : `Q=${syncedQuality.value}${syncedQuality.value === 0 ? '（cjpegli 实际 Q1）' : syncedQuality.value === 100 ? '（JXL 为无损）' : ''}`;
});

interface OverviewSliderStop {
  type: 'lossy' | 'lossless';
  quality: number | null;
  label: string;
}

const overviewSliderStops = computed<OverviewSliderStop[]>(() => {
  if (!dataset.value) return [];
  const stops: OverviewSliderStop[] = dataset.value.config.qualityLevels.map((q) => ({
    type: 'lossy',
    quality: q,
    label: String(q),
  }));
  stops.push({
    type: 'lossless',
    quality: null,
    label: '无损',
  });
  return stops;
});

const overviewSliderIndex = computed<number>(() => {
  const stops = overviewSliderStops.value;
  if (stops.length === 0) return 0;
  if (overviewLosslessMode.value) return stops.length - 1;
  const idx = stops.findIndex((st) => st.type === 'lossy' && st.quality === syncedQuality.value);
  return idx >= 0 ? idx : 0;
});

function onOverviewSliderInput(idx: number) {
  const stop = overviewSliderStops.value[idx];
  if (!stop) return;
  if (stop.type === 'lossless') {
    overviewLosslessMode.value = true;
    syncLosslessSlots();
  } else if (stop.quality !== null) {
    overviewLosslessMode.value = false;
    syncQualitySlots(stop.quality);
  }
}

const overviewActiveEncoders = computed(() => {
  if (!dataset.value) return [];
  if (overviewFilterMode.value === 'objective') return dataset.value.config.encoders.filter((encoder) => activeLossyRecords.value.some((record) => record.encoder === encoder.name));
  if (overviewFilterMode.value === 'volume') {
    // 目标体积模式：对比所有具备质量档位的有损编码器在最接近目标体积时的表现
    return dataset.value.config.encoders.filter((encoder) => activeLossyRecords.value.some((record) => record.encoder === encoder.name));
  }
  if (overviewLosslessMode.value) {
    // 无损模式：仅展示支持无损压缩的编码器（PNG 四款 + JXL + WebP + AVIF-aom），不展示纯有损编码器
    return dataset.value.config.encoders.filter(
      (e) => hasLosslessRecords(e.name)
    );
  }
  // 有损模式：仅展示有损编码器（JPEG / JXL / WebP / AVIF），不展示纯无损 PNG 编码器
  return dataset.value.config.encoders.filter((encoder) => activeLossyRecords.value.some((record) => record.encoder === encoder.name));
});

// Shared Pan & Zoom state for Overview 180x180 Visual Preview windows (default 800% centered)
const vpZoom = ref<number>(8);
const vpPanX = ref<number>(0);
const vpPanY = ref<number>(0);
const vpDragging = ref<boolean>(false);
const vpDragStartMouse = { x: 0, y: 0 };
const vpDragStartPan = { x: 0, y: 0 };

const vpTransformStyle = computed(() => ({
  transform: `translate3d(${vpPanX.value}px, ${vpPanY.value}px, 0) scale(${vpZoom.value})`,
}));

function resetVpViewport() {
  vpZoom.value = 8;
  vpPanX.value = 0;
  vpPanY.value = 0;
}

function onVpWheel(ev: WheelEvent) {
  const target = ev.currentTarget as HTMLElement | null;
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const cx = ev.clientX - rect.left - rect.width / 2;
  const cy = ev.clientY - rect.top - rect.height / 2;

  const oldZ = vpZoom.value;
  const factor = ev.deltaY < 0 ? 1.15 : 1 / 1.15;
  const nextZ = Math.max(0.5, Math.min(32, oldZ * factor));
  const ratio = nextZ / oldZ;

  vpPanX.value = cx - (cx - vpPanX.value) * ratio;
  vpPanY.value = cy - (cy - vpPanY.value) * ratio;
  vpZoom.value = Number(nextZ.toFixed(3));
}

function onVpMouseDown(ev: MouseEvent) {
  if (ev.button !== 0) return;
  vpDragging.value = true;
  vpDragStartMouse.x = ev.clientX;
  vpDragStartMouse.y = ev.clientY;
  vpDragStartPan.x = vpPanX.value;
  vpDragStartPan.y = vpPanY.value;

  const onMove = (moveEv: MouseEvent) => {
    if (!vpDragging.value) return;
    vpPanX.value = vpDragStartPan.x + (moveEv.clientX - vpDragStartMouse.x);
    vpPanY.value = vpDragStartPan.y + (moveEv.clientY - vpDragStartMouse.y);
  };
  const onUp = () => {
    vpDragging.value = false;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function resolvePreviewUrl(encoder: string, effortTag: string, quality: number | null): string {
  const rec = findExactEncodingRecord(currentImageOnlyRecords.value, encoder, effortTag, quality);
  return rec ? buildImagePreviewUrl('result-file', rec.outputFile, dataset.value?.generatedAt) : '';
}

interface OverviewCardItem {
  encoder: string;
  displayName: string;
  color: DitherPaletteEntry;
  effortTag: string;
  effortLabel: string;
  matchedQuality: number | null;
  lossless: boolean;
  cliCommand: string;
  avgRatioPct: number;
  avgBytes: number;
  avgEncodeMs: number;
  avgDecodeMs: number;
  previewUrl: string;
  avgSsimulacra2: number | null;
}

/** 一次索引当前数据，切换目标和力度时不再为每个编码器扫描完整数据集。 */
const overviewRecordsByEffort = computed(() => {
  const groups = new Map<string, CompRecord[]>();
  for (const record of activeChartRecords.value) {
    const key = `${record.encoder}/${record.effortTag}`;
    const records = groups.get(key) ?? [];
    records.push(record); groups.set(key, records);
  }
  return groups;
});

/** 缺少评分的编码器明确列出，避免误把缺失数据当成 0 分。 */
const overviewMissingScoreEncoders = computed(() => {
  const available = new Set(encoderSummaryCards.value.map((card) => card.encoder));
  return overviewActiveEncoders.value.filter((encoder) => !available.has(encoder.name)).map((encoder) => getEncoderDisplayName(encoder.name));
});

/** 展示实际评分与目标偏差；全集的平均分与当前图片预览使用同一套参数。 */
function formatOverviewScore(card: OverviewCardItem): string {
  if (card.avgSsimulacra2 === null) return '暂无评分';
  const diff = card.avgSsimulacra2 - targetSsimulacra2.value;
  return `SS2 ${card.avgSsimulacra2.toFixed(2)} (${diff >= 0 ? '+' : ''}${diff.toFixed(2)})`;
}

/**
 * 计算指定压缩力度策略下各编码器的概览数据卡片
 */
/** 无数据时不生成柱体，不将高质量有损产物替代无损产物。 */
function computeOverviewCardsForStrategy(
  strategy: 'default' | 'fastest' | 'best'
): OverviewCardItem[] {
  if (!dataset.value) return [];
  const qLevels = dataset.value.config.qualityLevels;

  return overviewActiveEncoders.value.flatMap((encCfg) => {
    const meta = getEncoderMeta(encCfg.name);
    const targetEf = getTargetEffortTag(encCfg.name, strategy);
    const efObj = encCfg.efforts.find((e) => e.tag === targetEf);
    if (!efObj) return [];
    const allRecords = overviewRecordsByEffort.value.get(`${encCfg.name}/${targetEf}`) ?? [];
    const isLosslessView = overviewFilterMode.value === 'quality' && overviewLosslessMode.value;
    const lossyQualities = new Set(activeEncodingGroups.value.filter((group) => group.encoder === encCfg.name && group.effortTag === targetEf && !group.lossless).map((group) => group.quality));
    const records = isLosslessView ? allRecords : allRecords.filter((record) => lossyQualities.has(record.quality));
    const losslessGroup = isLosslessView ? findLosslessGroup(encCfg.name, targetEf) : undefined;
    if (isLosslessView && !losslessGroup) return [];
    let quality: number | null = losslessGroup ? losslessGroup.quality : syncedQuality.value;

    if (overviewFilterMode.value === 'objective') {
      const imageNames = new Set(aggregateAllImages.value ? dataset.value!.images.map((image) => image.name) : [currentImageMeta.value?.name]);
      const groups = new Map<number | null, CompRecord[]>();
      for (const record of records) {
        if (!imageNames.has(record.image)) continue;
        const group = groups.get(record.quality) ?? [];
        group.push(record); groups.set(record.quality, group);
      }
      const candidates = Array.from(groups, ([q, group]) => {
        if (group.length !== imageNames.size || new Set(group.map((record) => record.image)).size !== imageNames.size || group.some((record) => !Number.isFinite(record.ssimulacra2))) return null;
        const score = group.reduce((sum, record) => sum + record.ssimulacra2!, 0) / group.length;
        return { quality: q, score, diff: Math.abs(score - targetSsimulacra2.value), bytes: summarizeVolume(group).avgBytes,
          encodeMs: group.reduce((sum, record) => sum + record.encode_ms, 0) / group.length };
      }).filter((candidate) => candidate !== null);
      // 评分可能不随 Q 单调递增。先剔除有更小体积且不低评分替代品的档位，
      // 避免低目标分数反而选中体积巨大、评分退化的产物（例如 SVT Q100）。
      const efficient = candidates.filter((candidate) => !candidates.some((other) =>
        other.bytes <= candidate.bytes && other.score >= candidate.score &&
        (other.bytes < candidate.bytes || other.score > candidate.score)
      ));
      efficient.sort((a, b) => a.diff - b.diff || a.bytes - b.bytes || a.encodeMs - b.encodeMs || (a.quality ?? 101) - (b.quality ?? 101));
      if (!efficient[0]) return [];
      quality = efficient[0].quality;
    }

    if (overviewFilterMode.value === 'volume') {
      const candidates = [...new Set(records.map((record) => record.quality))].map((q) => {
        const group = records.filter((r) => r.quality === q);
        return { quality: q, records: group, diff: Math.abs(summarizeVolume(group).ratioPct - targetVolumePct.value) };
      }).filter((candidate) => candidate.records.length > 0);
      candidates.sort((a, b) => a.diff - b.diff || (b.quality ?? 101) - (a.quality ?? 101));
      if (!candidates[0]) return [];
      quality = candidates[0].quality;
    }

    const recs = records.filter((r) => r.quality === quality);
    if (recs.length === 0) return [];
    const volume = summarizeVolume(recs);
    return [{
      encoder: encCfg.name,
      displayName: meta.displayName,
      color: meta.color,
      effortTag: targetEf,
      effortLabel: efObj.label,
      matchedQuality: quality,
      lossless: recs.every((record) => record.lossless),
      cliCommand: buildCliCommandString(encCfg.name, targetEf, efObj.label, quality),
      avgRatioPct: volume.ratioPct,
      avgBytes: volume.avgBytes,
      avgEncodeMs: recs.reduce((sum, r) => sum + r.encode_ms, 0) / recs.length,
      avgDecodeMs: recs.reduce((sum, r) => sum + (r.decode_ms ?? 0), 0) / recs.length,
      previewUrl: resolvePreviewUrl(encCfg.name, targetEf, quality),
      avgSsimulacra2: recs.every((record) => Number.isFinite(record.ssimulacra2)) ? recs.reduce((sum, record) => sum + record.ssimulacra2!, 0) / recs.length : null,
    }];
  });
}

const encoderSummaryCards = computed<OverviewCardItem[]>(() => {
  return computeOverviewCardsForStrategy(effortStrategy.value);
});

/**
 * 跨所有压缩力度（极速 / 均衡 / 最大）下所有编码器体积的最大百分比
 * 用于概览体积图表固定 Y 轴刻度，避免在切换压缩力度时刻度跳动
 */
const overviewMaxRatioPctAcrossEfforts = computed<number>(() => {
  const strategies: Array<'default' | 'fastest' | 'best'> = ['fastest', 'default', 'best'];
  let maxRatio = 0;
  for (const strat of strategies) {
    const cards = computeOverviewCardsForStrategy(strat);
    for (const c of cards) {
      if (c.avgRatioPct > maxRatio) {
        maxRatio = c.avgRatioPct;
      }
    }
  }
  return maxRatio;
});

const overviewCategoryMeta = computed(() =>
  encoderSummaryCards.value.map((c) => ({
    cli: c.cliCommand,
  }))
);

const overviewBarCategories = computed(() =>
  encoderSummaryCards.value.map((c) =>
    overviewFilterMode.value !== 'quality'
      ? `${c.displayName} (${formatEncodingQuality(c.encoder, c.matchedQuality, undefined, c.lossless)})`
      : c.displayName
  )
);

const overviewRatioBarSeries = computed<BarSeriesItem[]>(() => {
  if (!dataset.value) return [];
  return [
    {
      key: 'ratio',
      label: '体积',
      color: DITHER_PALETTE.green,
      values: encoderSummaryCards.value.map((c) => c.avgRatioPct),
      formattedValues: encoderSummaryCards.value.map((c) =>
        overviewFilterMode.value !== 'quality'
          ? `${formatEncodingQuality(c.encoder, c.matchedQuality, undefined, c.lossless)}${overviewFilterMode.value === 'objective' ? ` · ${formatOverviewScore(c)}` : ''} · ${formatFusedVolume(c.avgRatioPct, c.avgBytes)}`
          : formatFusedVolume(c.avgRatioPct, c.avgBytes)
      ),
      perBarColors: encoderSummaryCards.value.map((c) => c.color),
    },
  ];
});

const overviewEncodeTimeBarSeries = computed<BarSeriesItem[]>(() => {
  if (!dataset.value) return [];
  return [
    {
      key: 'encode_ms',
      label: '编码耗时',
      color: DITHER_PALETTE.green,
      values: encoderSummaryCards.value.map((c) => c.avgEncodeMs),
      formattedValues: encoderSummaryCards.value.map((c) =>
        overviewFilterMode.value !== 'quality'
          ? `${formatEncodingQuality(c.encoder, c.matchedQuality, undefined, c.lossless)}${overviewFilterMode.value === 'objective' ? ` · ${formatOverviewScore(c)}` : ''} · ${c.avgEncodeMs.toFixed(1)}ms`
          : `${c.avgEncodeMs.toFixed(1)}ms`
      ),
      perBarColors: encoderSummaryCards.value.map((c) => c.color),
    },
  ];
});

const overviewDecodeTimeBarSeries = computed<BarSeriesItem[]>(() => {
  if (!dataset.value) return [];
  return [
    {
      key: 'decode_ms',
      label: '解码耗时',
      color: DITHER_PALETTE.cyan,
      values: encoderSummaryCards.value.map((c) => c.avgDecodeMs),
      formattedValues: encoderSummaryCards.value.map((c) =>
        overviewFilterMode.value !== 'quality'
          ? `${formatEncodingQuality(c.encoder, c.matchedQuality, undefined, c.lossless)}${overviewFilterMode.value === 'objective' ? ` · ${formatOverviewScore(c)}` : ''} · ${c.avgDecodeMs.toFixed(1)}ms`
          : `${c.avgDecodeMs.toFixed(1)}ms`
      ),
      perBarColors: encoderSummaryCards.value.map((c) => c.color),
    },
  ];
});

function selectOverviewCard(card: OverviewCardItem) {
  slotAEncoder.value = card.encoder;
  slotAEffort.value = card.effortTag;
  if (card.matchedQuality !== null) {
    slotAQuality.value = card.matchedQuality;
  } else {
    slotAQuality.value = -1;
  }
}

function onOverviewBarSelect(payload: { index: number; category: string }) {
  const card = encoderSummaryCards.value[payload.index];
  if (card) {
    selectOverviewCard(card);
  }
}

// ==================== TAB 4: OPTIMAL QUALITY & OPTIMAL EFFORT PARAMETER FINDER ====================
const optimalPreference = ref<'balanced' | 'compact' | 'fast'>('balanced');
const optimalFocusEncoder = ref<string>('cjxl');
const optimalQualityChartTab = ref<'curve' | 'marginal'>('curve');
const optimalEffortChartTab = ref<'score' | 'time'>('score');

interface EffortEvalPoint {
  tag: string;
  label: string;
  ratioPct: number;
  bytes: number;
  encodeMs: number;
  decodeMs: number;
  score: number;
}

interface QualityEvalPoint {
  q: number;
  ratioPct: number;
  bytes: number;
  encodeMs: number;
  marginalPctPerQ: number;
}

interface EncoderOptimalRecommendation {
  encoder: string;
  displayName: string;
  color: DitherPaletteEntry;
  losslessOnly: boolean;
  bestQuality: number | null;
  qualityReason: string;
  bestEffortTag: string;
  bestEffortLabel: string;
  effortReason: string;
  recommendedCli: string;
  ratioPct: number;
  outputBytes: number;
  fusedVolume: string;
  encodeMs: number;
  decodeMs: number;
  qualityEffortTag: string;
  qualityPoints: QualityEvalPoint[];
  effortPoints: EffortEvalPoint[];
}

const encoderOptimalRecommendations = computed<EncoderOptimalRecommendation[]>(() => {
  if (!dataset.value) return [];
  const qLevels = dataset.value.config.qualityLevels;

  return dataset.value.config.encoders.flatMap((encCfg) => {
    const meta = getEncoderMeta(encCfg.name);
    const defaultEf = DEFAULT_EFFORT_TAG[encCfg.name] ?? encCfg.efforts[0]?.tag ?? '';

    // Step 1: Find Optimal Quality Parameter (for lossy encoders) using Kneedle knee-point detection on Q -> Volume curve
    let bestQuality: number | null = null;
    let qualityReason = '数学无损格式';
    const qualityPoints: QualityEvalPoint[] = [];

    const losslessOnly = !activeLossyRecords.value.some((record) => record.encoder === encCfg.name && record.quality !== null);
    if (losslessOnly) bestQuality = findLosslessGroup(encCfg.name, defaultEf)?.quality ?? null;
    if (!losslessOnly) {
      const rawQ: { q: number; ratioPct: number; bytes: number; encodeMs: number }[] = [];
      for (const q of qLevels) {
        const sub = activeLossyRecords.value.filter(
          (r) => r.encoder === encCfg.name && r.effortTag === defaultEf && r.quality === q
        );
        if (sub.length === 0) continue;
        const n = sub.length;
        rawQ.push({
          q,
          ratioPct: summarizeVolume(sub).ratioPct,
          bytes: sub.reduce((a, b) => a + b.outputBytes, 0) / n,
          encodeMs: sub.reduce((a, b) => a + b.encode_ms, 0) / n,
        });
      }

      if (rawQ.length === 0) return [];
      for (let i = 0; i < rawQ.length; i++) {
        const cur = rawQ[i];
        const prev = i > 0 ? rawQ[i - 1] : cur;
        const dq = Math.max(1, cur.q - prev.q);
        const marginal = i === 0 ? 0 : (cur.ratioPct - prev.ratioPct) / dq;
        qualityPoints.push({
          ...cur,
          marginalPctPerQ: marginal,
        });
      }

      // Candidate visual-quality window based on preference:
      // compact: [55..85], balanced: [65..93], fast: [60..88]
      const minCandQ = optimalPreference.value === 'compact' ? 55 : optimalPreference.value === 'fast' ? 60 : 65;
      const maxCandQ = optimalPreference.value === 'compact' ? 85 : optimalPreference.value === 'fast' ? 88 : 93;
      const cands = qualityPoints.filter((p) => p.q >= minCandQ && p.q <= maxCandQ);

      if (cands.length >= 2) {
        const qMin = cands[0].q;
        const qMax = cands[cands.length - 1].q;
        const rMin = Math.min(...cands.map((c) => c.ratioPct));
        const rMax = Math.max(...cands.map((c) => c.ratioPct));

        let bestKneeScore = -Infinity;
        let chosen = cands[Math.floor(cands.length / 2)];

        // Weight between quality gain and volume penalty
        const volWeight = optimalPreference.value === 'compact' ? 1.35 : optimalPreference.value === 'fast' ? 1.1 : 1.0;

        for (const c of cands) {
          const qNorm = (c.q - qMin) / Math.max(1, qMax - qMin);
          const rNorm = (c.ratioPct - rMin) / Math.max(0.5, rMax - rMin);
          const kneeScore = qNorm - volWeight * rNorm;
          if (kneeScore > bestKneeScore) {
            bestKneeScore = kneeScore;
            chosen = c;
          }
        }
        bestQuality = chosen.q;

        // Calculate how much volume jumps if going to Q96
        const q96Pt = qualityPoints.find((p) => p.q === 96) ?? qualityPoints[qualityPoints.length - 1];
        const savedVsQ96 = q96Pt && q96Pt.ratioPct > 0
          ? Math.max(0, ((q96Pt.ratioPct - chosen.ratioPct) / q96Pt.ratioPct) * 100)
          : 0;
        qualityReason = `拐点甜点，比 Q96 省 ${savedVsQ96.toFixed(0)}% 体积`;
      } else {
        bestQuality = [...rawQ].sort((a, b) => Math.abs(a.q - 80) - Math.abs(b.q - 80))[0].q;
        qualityReason = '最接近均衡质量的实测档';
      }
    }

    // Step 2: Find Optimal Effort Parameter across all efforts at bestQuality (or lossless)
    const rawEfforts: { tag: string; label: string; ratioPct: number; bytes: number; encodeMs: number; decodeMs: number }[] = [];
    for (const ef of encCfg.efforts) {
      const sub = (losslessOnly ? activeLosslessRecords.value : activeLossyRecords.value).filter(
        (r) => r.encoder === encCfg.name && r.effortTag === ef.tag && r.quality === bestQuality
      );
      if (sub.length === 0) continue;
      const n = sub.length;
      rawEfforts.push({
        tag: ef.tag,
        label: ef.label,
        ratioPct: summarizeVolume(sub).ratioPct,
        bytes: sub.reduce((a, b) => a + b.outputBytes, 0) / n,
        encodeMs: sub.reduce((a, b) => a + b.encode_ms, 0) / n,
        decodeMs: sub.reduce((a, b) => a + (b.decode_ms ?? 0), 0) / n,
      });
    }

    const minR = rawEfforts.length > 0 ? Math.min(...rawEfforts.map((e) => e.ratioPct)) : 0;
    const maxR = rawEfforts.length > 0 ? Math.max(...rawEfforts.map((e) => e.ratioPct)) : 100;
    const minLogT = rawEfforts.length > 0 ? Math.min(...rawEfforts.map((e) => Math.log10(Math.max(0.5, e.encodeMs)))) : 0;
    const maxLogT = rawEfforts.length > 0 ? Math.max(...rawEfforts.map((e) => Math.log10(Math.max(0.5, e.encodeMs)))) : 1;

    // Weights based on user preference
    const wVol = optimalPreference.value === 'compact' ? 0.78 : optimalPreference.value === 'fast' ? 0.30 : 0.58;
    const wTime = 1 - wVol;

    const effortPoints: EffortEvalPoint[] = rawEfforts.map((e) => {
      const rSpan = Math.max(0.15, maxR - minR);
      const tSpan = Math.max(0.08, maxLogT - minLogT);
      const rNorm = (e.ratioPct - minR) / rSpan; // 0 = smallest volume
      const tNorm = (Math.log10(Math.max(0.5, e.encodeMs)) - minLogT) / tSpan; // 0 = fastest

      // Distance from utopia (0, 0) converted to 0..100 score
      const penalty = Math.sqrt(wVol * rNorm * rNorm + wTime * tNorm * tNorm);
      const score = Number(Math.max(15, Math.min(99, (1 - penalty) * 100)).toFixed(1));
      return {
        ...e,
        score,
      };
    });

    // 无实测力度时停止推荐，避免生成 0B、0ms 和虚构得分。
    if (effortPoints.length === 0) return [];
    let bestEffortPt = effortPoints[0];
    for (const ep of effortPoints) {
      if (ep.score > bestEffortPt.score) {
        bestEffortPt = ep;
      }
    }

    const slowestMs = effortPoints.length > 0 ? Math.max(...effortPoints.map((e) => e.encodeMs)) : bestEffortPt.encodeMs;
    const speedup = bestEffortPt.encodeMs > 0 ? slowestMs / bestEffortPt.encodeMs : 1;
    const effortReason =
      speedup >= 1.25
        ? `综合得分 ${bestEffortPt.score} · 比最慢档快 ${speedup.toFixed(1)}x`
        : `综合得分 ${bestEffortPt.score} · 最高压缩收益档`;

    return [{
      encoder: encCfg.name,
      displayName: meta.displayName,
      color: meta.color,
      losslessOnly,
      bestQuality,
      qualityReason,
      bestEffortTag: bestEffortPt.tag,
      bestEffortLabel: bestEffortPt.label,
      effortReason,
      recommendedCli: buildCliCommandString(encCfg.name, bestEffortPt.tag, bestEffortPt.label, bestQuality),
      ratioPct: bestEffortPt.ratioPct,
      outputBytes: bestEffortPt.bytes,
      fusedVolume: formatFusedVolume(bestEffortPt.ratioPct, bestEffortPt.bytes),
      encodeMs: bestEffortPt.encodeMs,
      decodeMs: bestEffortPt.decodeMs,
      qualityEffortTag: defaultEf,
      qualityPoints,
      effortPoints,
    }];
  });
});

/** 缺少有效参数组合时明确告知，推荐卡片不填充虚构结果。 */
const unavailableOptimalEncoders = computed(() => {
  const available = new Set(encoderOptimalRecommendations.value.map((item) => item.encoder));
  return (dataset.value?.config.encoders ?? []).filter((cfg) => !available.has(cfg.name)).map((cfg) => getEncoderDisplayName(cfg.name));
});

const currentOptimalFocusItem = computed<EncoderOptimalRecommendation | null>(() => {
  const list = encoderOptimalRecommendations.value;
  if (list.length === 0) return null;
  return list.find((i) => i.encoder === optimalFocusEncoder.value) ?? null;
});

const optimalQualityXLabels = computed(() =>
  currentOptimalFocusItem.value ? currentOptimalFocusItem.value.qualityPoints.map((p) => p.q) : []
);

const optimalQualityChartSeries = computed<AreaSeriesItem[]>(() => {
  const item = currentOptimalFocusItem.value;
  if (!item || item.losslessOnly) return [];
  if (optimalQualityChartTab.value === 'curve') {
    return [
      {
        key: item.encoder,
        label: `${item.displayName} 体积曲线 (最佳拐点 Q=${item.bestQuality})`,
        color: item.color,
        values: item.qualityPoints.map((p) => p.ratioPct),
        formattedValues: item.qualityPoints.map((p) =>
          `${formatFusedVolume(p.ratioPct, p.bytes)}${p.q === item.bestQuality ? ' ★最佳质量拐点' : ''}`
        ),
        fillArea: true,
      },
    ];
  }
  return [
    {
      key: `${item.encoder}_marginal`,
      label: `每 +1Q 体积占比变化 (百分点/Q)`,
      color: DITHER_PALETTE.amber,
      values: item.qualityPoints.map((p) => p.marginalPctPerQ),
      formattedValues: item.qualityPoints.map((p) =>
        `${p.marginalPctPerQ > 0 ? '+' : ''}${p.marginalPctPerQ.toFixed(2)} 个百分点 / 1Q${p.q === item.bestQuality ? ' ★拐点临界位' : ''}`
      ),
      fillArea: true,
    },
  ];
});

const optimalEffortCategories = computed(() =>
  currentOptimalFocusItem.value ? currentOptimalFocusItem.value.effortPoints.map((e) => e.tag) : []
);

const optimalEffortVolumeSeries = computed<BarSeriesItem[]>(() => {
  const item = currentOptimalFocusItem.value;
  if (!item) return [];
  return [
    {
      key: 'vol',
      label: `${item.displayName} 体积`,
      color: item.color,
      values: item.effortPoints.map((e) => e.ratioPct),
      formattedValues: item.effortPoints.map((e) =>
        `${formatFusedVolume(e.ratioPct, e.bytes)}${e.tag === item.bestEffortTag ? ' ★最佳力度' : ''}`
      ),
    },
  ];
});

const optimalEffortActiveSeries = computed<BarSeriesItem[]>(() => {
  const item = currentOptimalFocusItem.value;
  if (!item) return [];
  if (optimalEffortChartTab.value === 'score') {
    return [
      {
        key: 'score',
        label: '力度综合优选得分 (0-100)',
        color: item.color,
        values: item.effortPoints.map((e) => e.score),
        formattedValues: item.effortPoints.map((e) =>
          `${e.score}分 · 体积 ${e.ratioPct.toFixed(1)}% · 耗时 ${e.encodeMs.toFixed(1)}ms${e.tag === item.bestEffortTag ? ' ★最佳力度' : ''}`
        ),
      },
    ];
  }
  return [
    {
      key: 'encode_ms',
      label: '编码耗时 (ms)',
      color: item.color,
      values: item.effortPoints.map((e) => e.encodeMs),
      formattedValues: item.effortPoints.map((e) =>
        `${e.encodeMs.toFixed(1)}ms (体积 ${e.ratioPct.toFixed(1)}%)${e.tag === item.bestEffortTag ? ' ★最佳力度' : ''}`
      ),
    },
  ];
});

function applyOptimalToSlot(slot: 'A' | 'B', item: EncoderOptimalRecommendation) {
  if (slot === 'A') {
    slotAEncoder.value = item.encoder;
    slotAEffort.value = item.bestEffortTag;
    slotAQuality.value = item.bestQuality !== null ? item.bestQuality : -1;
  } else {
    slotBEncoder.value = item.encoder;
    slotBEffort.value = item.bestEffortTag;
    slotBQuality.value = item.bestQuality !== null ? item.bestQuality : -1;
  }
}

function onSelectOptimalQualityOnChart(payload: { index: number; value: string | number }) {
  const item = currentOptimalFocusItem.value;
  const q = Number(payload.value);
  if (item && Number.isFinite(q) && item.qualityPoints.some((point) => point.q === q)) {
    slotAEncoder.value = item.encoder;
    slotAEffort.value = item.qualityEffortTag;
    slotAQuality.value = q;
  }
}

function onSelectOptimalEffortOnChart(payload: { index: number; category: string }) {
  const item = currentOptimalFocusItem.value;
  if (!item || !item.effortPoints.some((point) => point.tag === payload.category)) return;
  slotAEncoder.value = item.encoder;
  slotAEffort.value = payload.category;
  slotAQuality.value = item.bestQuality !== null ? item.bestQuality : -1;
}

const filteredTableRecords = computed(() => {
  return currentImageOnlyRecords.value.filter(
    (r) => tableEncoderFilter.value === 'ALL' || r.encoder === tableEncoderFilter.value
  );
});

function loadRecordIntoSlot(slot: 'A' | 'B', rec: CompRecord) {
  if (slot === 'A') {
    slotAEncoder.value = rec.encoder;
    slotAEffort.value = rec.effortTag;
    slotAQuality.value = rec.quality ?? -1;
  } else {
    slotBEncoder.value = rec.encoder;
    slotBEffort.value = rec.effortTag;
    slotBQuality.value = rec.quality ?? -1;
  }
}

onMounted(async () => {
  try {
    const res = await fetch(siteAssetUrl('benchmark-data.json'), { cache: 'no-store' });
    const raw = await res.json();
    const expanded: CompRecord[] = (raw.records as any[][]).map((row) => normalizeEncodingRecord({
      image: row[0],
      encoder: row[1],
      format: row[2],
      lossless: Boolean(row[3]),
      quality: row[4],
      actualQuality: row[18],
      pixelVerification: row[20] ?? undefined,
      encodingLossless: row[21] ?? undefined,
      ssimulacra2: typeof row[19] === 'number' ? row[19] : undefined,
      effortTag: row[5],
      effortLabel: row[6],
      inputBytes: row[7],
      outputBytes: row[8],
      compressionRatio: row[9],
      spaceSavingPct: row[10],
      bpp: row[11],
      ready_ms: row[12],
      encode_ms: row[13],
      output_ms: row[14],
      total_ms: row[15],
      outputFile: row[16],
      decode_ms: typeof row[17] === 'number' ? row[17] : 0,
    }));

    dataset.value = {
      generatedAt: raw.generatedAt,
      totalElapsedMs: raw.totalElapsedMs,
      config: raw.config,
      summary: raw.summary,
      images: raw.images,
      records: expanded,
    };
    if (raw.images.length > 0) {
      currentImageName.value = raw.images[0].name;
    }
  } finally {
    loading.value = false;
  }
});
</script>
