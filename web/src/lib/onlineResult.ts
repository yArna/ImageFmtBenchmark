/**
 * 在线编码的多结果记录。
 *
 * 用户可以用不同编码器、不同参数反复编码同一张源图，每次编码都会追加一条结果，
 * 供多宫格对比器与结果表格共同使用。
 */
import type { WasmEncoderDef, WasmFormat, WasmParamValue } from '../wasm/codecWasm';

/** 多宫格对比器最多同时展示的结果数（3×3） */
export const MAX_COMPARE = 9;

/** 结果标识色：同一编码器多次编码也要能区分，所以按结果序号而不是编码器取色 */
const RESULT_COLORS = ['#22c55e', '#06b6d4', '#f97316', '#a855f7', '#ec4899', '#eab308', '#3b82f6', '#ef4444', '#14b8a6', '#84cc16'];

/** 编码参数快照，null 表示该参数不指定 */
export type IParamValues = Record<string, WasmParamValue>;

/** 质量指标的计算状态 */
export type IMetricState = 'pending' | 'done' | 'error';

/** 一次在线编码产生的结果 */
export interface IOnlineResult {
  /** 从 1 递增的结果序号，也用作展示编号 */
  id: number;
  encoderId: string;
  encoderName: string;
  format: WasmFormat;
  ext: string;
  /** 结果标识色 */
  color: string;
  /** 编码时的参数快照 */
  params: IParamValues;
  /** 参数简写，用于标签与表格 */
  paramSummary: string;
  /** 等价命令行 */
  cli: string;
  /** 产物字节数 */
  bytes: number;
  /** 编码调用耗时（不含 WASM 加载） */
  encodeMs: number;
  /** 预览图地址（blob:） */
  url: string;
  /** 原始产物，下载时使用 */
  blob: Blob;
  metricState: IMetricState;
  /** PSNR（dB），无损为 Infinity，未算出为 null */
  psnr: number | null;
  /** SSIM（0~1），未算出为 null */
  ssim: number | null;
}

/** 按结果序号取标识色 */
export function getResultColor(id: number): string {
  return RESULT_COLORS[(id - 1) % RESULT_COLORS.length];
}

/** 把参数快照压缩成一行简写：不指定的参数不列出，开关只在开启时列出，无损模式下省略无效的质量参数 */
export function summarizeParams(def: WasmEncoderDef, values: IParamValues): string {
  const lossless = !!values['lossless'];
  const parts: string[] = [];
  for (const p of def.params) {
    const v = p.key in values ? values[p.key] : p.default;
    if (v === null) continue;
    if (p.type === 'toggle') {
      if (v) parts.push(p.key);
      continue;
    }
    if (lossless && p.key === 'q' && def.id !== 'cwebp') continue;
    if (p.type === 'select') {
      const hit = p.options?.find((o) => String(o.value) === String(v));
      // 下拉项标签可能带说明文字，只取第一个词
      const label = hit ? hit.label.split(/[（\s]/)[0] : String(v);
      parts.push(`${p.key}=${label}`);
      continue;
    }
    parts.push(`${p.key}=${v}`);
  }
  return parts.join(' ');
}
