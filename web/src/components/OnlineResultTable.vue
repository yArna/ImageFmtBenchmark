<template>
  <div class="OnlineResultTable">
    <div class="head">
      <span class="title">编码结果</span>
      <span class="count">{{ results.length }} 个结果 · 对比中 {{ selectedIds.length }}/{{ maxCompare }}</span>
      <div class="actions">
        <button type="button" class="knob-btn" :disabled="!results.length" @click="$emit('select-latest')">勾选最近 {{ maxCompare }} 个</button>
        <button type="button" class="knob-btn" :disabled="!selectedIds.length" @click="$emit('clear-selection')">取消勾选</button>
        <button type="button" class="knob-btn is-danger" :disabled="!results.length" @click="$emit('clear')">清空结果</button>
      </div>
    </div>

    <div v-if="!results.length" class="empty">
      还没有编码结果。在左侧选择编码器与参数后点击「编码并添加结果」，可以用不同编码器、不同参数生成多个结果进行对比。
    </div>

    <div v-else class="table-box">
      <table>
        <thead>
          <tr>
            <th class="col-check">对比</th>
            <th v-for="col in COLUMNS" :key="col.key" :class="[`col-${col.key}`, { 'is-sortable': col.sortable, 'is-sorted': sortKey === col.key }]" @click="col.sortable && toggleSort(col.key as ISortKey)">
              {{ col.label }}
              <span v-if="sortKey === col.key" class="sort-arrow">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
            </th>
            <th class="col-ops">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in sortedResults"
            :key="r.id"
            :class="{ 'is-selected': selectedIds.includes(r.id) }"
            :style="{ '--row-accent': r.color }"
            @click="$emit('toggle', r.id)"
          >
            <td class="col-check">
              <span class="check" :class="{ 'is-on': selectedIds.includes(r.id), 'is-locked': !selectedIds.includes(r.id) && selectedIds.length >= maxCompare }"></span>
            </td>
            <td class="col-id">
              <span class="dot"></span>
              #{{ r.id }}
            </td>
            <td class="col-encoder">
              <span class="fmt">{{ r.format }}</span>
              <span class="name">{{ r.encoderName }}</span>
            </td>
            <td class="col-params" :title="r.cli">{{ r.paramSummary || '默认' }}</td>
            <td class="col-bytes" :class="{ 'is-best': r.id === best.bytes }">
              <strong>{{ formatBytes(r.bytes) }}</strong>
              <span class="bar"><span :style="{ width: `${(r.bytes / maxBytes) * 100}%` }"></span></span>
            </td>
            <td class="col-ratio">
              {{ ratioLabel(r) }}
            </td>
            <td class="col-bpp">{{ bppLabel(r) }}</td>
            <td class="col-encodeMs" :class="{ 'is-best': r.id === best.encodeMs }">{{ r.encodeMs.toFixed(1) }} ms</td>
            <td class="col-throughput">{{ throughputLabel(r) }}</td>
            <td class="col-psnr" :class="{ 'is-best': r.id === best.psnr }">{{ psnrLabel(r) }}</td>
            <td class="col-ssim" :class="{ 'is-best': r.id === best.ssim }">{{ ssimLabel(r) }}</td>
            <td class="col-ops" @click.stop>
              <button type="button" class="knob-btn" title="下载该结果" @click="$emit('download', r.id)">↓ .{{ r.ext }}</button>
              <button type="button" class="knob-btn is-danger" title="删除该结果" @click="$emit('remove', r.id)">✕</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="results.length" class="note">
      点击行勾选/取消对比（最多 {{ maxCompare }} 个）。绿色为该列最优值。PSNR 基于预乘 Alpha 的 RGBA，SSIM 为亮度通道 8×8 窗口均值；bpp = 每像素比特数。
    </p>
  </div>
</template>

<style>
.OnlineResultTable {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;

    .title {
      font-size: 12.5px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .count {
      font-family: var(--font-mono);
      font-size: 10.5px;
      color: var(--text-muted);
    }

    .actions {
      margin-left: auto;
      display: flex;
      gap: 6px;
    }
  }

  .knob-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .knob-btn.is-danger:hover:not(:disabled) {
    color: #f87171;
    border-color: #f87171;
  }

  .empty {
    padding: 18px 12px;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--text-muted);
    text-align: center;
    border: 1px dashed var(--border-subtle);
  }

  .table-box {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11.5px;
  }

  th,
  td {
    padding: 6px 8px;
    text-align: left;
    white-space: nowrap;
    border-bottom: 1px solid var(--border-subtle);
  }

  th {
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    background: var(--bg-elevated);

    &.is-sortable {
      cursor: pointer;

      &:hover {
        color: var(--text-primary);
      }
    }

    &.is-sorted {
      color: var(--accent-cyan);
    }
  }

  td {
    font-family: var(--font-mono);
    color: var(--text-secondary);
  }

  tbody tr {
    cursor: pointer;
    transition: background 0.12s;

    &:hover {
      background: var(--bg-hover);
    }

    &.is-selected {
      background: color-mix(in srgb, var(--row-accent) 8%, transparent);
      box-shadow: inset 2px 0 var(--row-accent);
    }
  }

  .col-bytes,
  .col-ratio,
  .col-bpp,
  .col-encodeMs,
  .col-throughput,
  .col-psnr,
  .col-ssim {
    text-align: right;
  }

  .check {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 1px solid var(--border-strong);
    vertical-align: middle;

    &.is-on {
      border-color: var(--row-accent);
      background: var(--row-accent);
      box-shadow: inset 0 0 0 2px var(--bg-card);
    }

    &.is-locked {
      opacity: 0.35;
    }
  }

  .col-id {
    color: var(--text-primary);

    .dot {
      display: inline-block;
      width: 7px;
      height: 7px;
      margin-right: 4px;
      background: var(--row-accent);
    }
  }

  .col-encoder {
    font-family: inherit;

    .fmt {
      margin-right: 6px;
      font-family: var(--font-mono);
      font-size: 9px;
      letter-spacing: 0.06em;
      color: var(--accent-cyan);
    }

    .name {
      color: var(--text-primary);
    }
  }

  .col-params {
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 10.5px;
  }

  .col-bytes {
    strong {
      color: var(--text-primary);
      font-weight: 500;
    }

    .bar {
      display: block;
      height: 2px;
      margin-top: 3px;
      background: var(--border-subtle);

      span {
        display: block;
        height: 100%;
        margin-left: auto;
        background: var(--row-accent);
      }
    }
  }

  td.is-best,
  td.is-best strong {
    color: var(--accent-green);
    font-weight: 600;
  }

  .col-ops {
    text-align: right;

    .knob-btn + .knob-btn {
      margin-left: 4px;
    }
  }

  .sort-arrow {
    margin-left: 2px;
  }

  .note {
    margin: 0;
    font-size: 10px;
    line-height: 1.5;
    color: var(--text-muted);
  }
}
</style>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import { formatBytes } from '../wasm/codecWasm';
import type { IOnlineResult } from '../lib/onlineResult';

/** 可排序的列 */
type ISortKey = 'id' | 'bytes' | 'bpp' | 'encodeMs' | 'psnr' | 'ssim';

const COLUMNS: { key: string; label: string; sortable: boolean }[] = [
  { key: 'id', label: '#', sortable: true },
  { key: 'encoder', label: '编码器', sortable: false },
  { key: 'params', label: '参数', sortable: false },
  { key: 'bytes', label: '体积', sortable: true },
  { key: 'ratio', label: '占原图', sortable: false },
  { key: 'bpp', label: 'bpp', sortable: true },
  { key: 'encodeMs', label: '编码耗时', sortable: true },
  { key: 'throughput', label: '吞吐', sortable: false },
  { key: 'psnr', label: 'PSNR', sortable: true },
  { key: 'ssim', label: 'SSIM', sortable: true },
];

/** 在线编码多结果对比表格：比较体积、编码时间与质量指标，并负责勾选参与宫格对比的结果 */
export default defineComponent({
  props: {
    /** 全部编码结果 */
    results: { type: Array as PropType<IOnlineResult[]>, required: true },
    /** 参与对比的结果序号 */
    selectedIds: { type: Array as PropType<number[]>, required: true },
    /** 原图文件字节数 */
    sourceBytes: { type: Number, required: true },
    /** 原图像素宽度 */
    sourceWidth: { type: Number, required: true },
    /** 原图像素高度 */
    sourceHeight: { type: Number, required: true },
    /** 最多可同时对比的结果数 */
    maxCompare: { type: Number, required: true },
  },
  emits: ['toggle', 'remove', 'download', 'clear', 'select-latest', 'clear-selection'],
  data() {
    return { COLUMNS, sortKey: 'id' as ISortKey, sortDir: 'asc' as 'asc' | 'desc' };
  },
  methods: {
    formatBytes,
    /** 体积、耗时默认升序（越小越好），质量指标默认降序（越大越好） */
    toggleSort(key: ISortKey) {
      if (this.sortKey === key) {
        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
        return;
      }
      this.sortKey = key;
      this.sortDir = key === 'psnr' || key === 'ssim' ? 'desc' : 'asc';
    },
    sortValue(r: IOnlineResult, key: ISortKey): number {
      switch (key) {
        case 'bytes':
        case 'bpp':
          return r.bytes;
        case 'encodeMs':
          return r.encodeMs;
        case 'psnr':
          return r.psnr ?? -1;
        case 'ssim':
          return r.ssim ?? -1;
        default:
          return r.id;
      }
    },
    ratioLabel(r: IOnlineResult): string {
      if (!this.sourceBytes) return '—';
      return `${((r.bytes / this.sourceBytes) * 100).toFixed(1)}%`;
    },
    bppLabel(r: IOnlineResult): string {
      const pixels = this.sourceWidth * this.sourceHeight;
      return pixels ? ((r.bytes * 8) / pixels).toFixed(3) : '—';
    },
    throughputLabel(r: IOnlineResult): string {
      if (!r.encodeMs) return '—';
      const mp = (this.sourceWidth * this.sourceHeight) / 1e6;
      return `${(mp / (r.encodeMs / 1000)).toFixed(2)} MP/s`;
    },
    psnrLabel(r: IOnlineResult): string {
      if (r.metricState === 'pending') return '计算中…';
      if (r.psnr === null) return '—';
      return Number.isFinite(r.psnr) ? `${r.psnr.toFixed(2)} dB` : '∞ 无损';
    },
    ssimLabel(r: IOnlineResult): string {
      if (r.metricState === 'pending') return '计算中…';
      return r.ssim === null ? '—' : r.ssim.toFixed(5);
    },
  },
  computed: {
    sortedResults(): IOnlineResult[] {
      const dir = this.sortDir === 'asc' ? 1 : -1;
      return [...this.results].sort((a, b) => (this.sortValue(a, this.sortKey) - this.sortValue(b, this.sortKey)) * dir || a.id - b.id);
    },
    maxBytes(): number {
      return Math.max(1, ...this.results.map((r) => r.bytes));
    },
    /** 各列最优结果的序号；只有一个结果时不标记，避免满屏绿色 */
    best(): Record<'bytes' | 'encodeMs' | 'psnr' | 'ssim', number> {
      const pick = (value: (r: IOnlineResult) => number | null, prefer: 'min' | 'max'): number => {
        let bestId = -1;
        let bestValue = 0;
        for (const r of this.results) {
          const v = value(r);
          if (v === null) continue;
          if (bestId < 0 || (prefer === 'min' ? v < bestValue : v > bestValue)) {
            bestId = r.id;
            bestValue = v;
          }
        }
        return bestId;
      };
      if (this.results.length < 2) return { bytes: -1, encodeMs: -1, psnr: -1, ssim: -1 };
      return {
        bytes: pick((r) => r.bytes, 'min'),
        encodeMs: pick((r) => r.encodeMs, 'min'),
        psnr: pick((r) => r.psnr, 'max'),
        ssim: pick((r) => r.ssim, 'max'),
      };
    },
  },
});
</script>
