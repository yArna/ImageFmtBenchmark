#!/usr/bin/env node
/**
 * 图像编码器参数全面基准测试脚本 (TypeScript)
 *
 * 功能特性：
 * 1. 22 档质量参数（含 0 与 100 极限档位；若编码器不支持 0 如 cjpegli，则使用 1）：
 *    [0, 20, 30, 40, 50, 55, 60, 62, 65, 68, 70, 72, 75, 78, 80, 82, 85, 88, 90, 93, 96, 100]
 * 2. 无损编码器（png-libpng / png-libpng-zlibng / png-libspng / oxipng）仅按各自压缩力度档位各跑一次
 * 3. oxipng 使用 0, 1, 2, 3, 4, 5 六个档位；其他编码器剔除无实用性的极端慢速最大档位
 * 4. WebP 拆分为 cwebp（无 -sharp_yuv）与 cwebp-sharp-yuv（含 -sharp_yuv），均不使用 -mt 参数
 * 5. 同时记录编码耗时（ready_ms / encode_ms / output_ms / total_ms）与解码耗时（decode_ms / decodeTiming）；
 *    编码与解码各串行采样 TIMING_SAMPLES 次，取核心阶段 encode_ms 最小的一次
 * 6. 支持断点续跑（若编码产物已存在且参数一致但缺少解码耗时，仅补跑解码计时）与有序归档
 * 7. 控制台实时输出当前进度条、百分比、执行速度 (tasks/s)、已用时间与预计剩余时间 (ETA)
 * 8. AVIF 色度采样不同：avifenc-aom 为 4:4:4，avifenc-svt 为 4:2:0（SVT-AV1 仅支持 420），两者体积与画质不能视为同配置对比
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isEncodingLosslessMode, normalizeEncodingRecord, type IPixelVerification } from './lib/benchmarkData.ts';

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const BIN_DIR = path.join(ROOT_DIR, 'encoder', 'bin');
const IMAGES_DIR = path.join(ROOT_DIR, 'images');
const RESULT_DIR = path.join(ROOT_DIR, 'result');
const RESULT_IMAGES_DIR = path.join(RESULT_DIR, 'images');
const RESULT_DATA_DIR = path.join(RESULT_DIR, 'data');
const SUMMARY_JSON_PATH = path.join(RESULT_DIR, 'results.json');
const WEB_PUBLIC_JSON_PATH = path.join(ROOT_DIR, 'web', 'public', 'benchmark-data.json');

/**
 * 1. 22 档质量参数（包含 0 与 100）
 */
export const QUALITY_LEVELS: readonly number[] = [
  0, 20, 30, 40, 50, 55,
  60, 62, 65, 68, 70,
  72, 75, 78, 80, 82,
  85, 88, 90, 93, 96, 100,
];

/** 编码与解码各自的计时采样次数。 */
export const TIMING_SAMPLES = 2;

export type ImageFormat = 'png' | 'jpeg' | 'jxl' | 'webp' | 'avif';

export interface EffortOption {
  effort: number | string;
  tag: string;
  label: string;
}

export interface EncoderSpec {
  name: string;
  format: ImageFormat;
  ext: string;
  lossless: boolean;
  supportsLossless?: boolean;
  minQuality?: number;
  binary: string;
  decoderBinary: string;
  efforts: EffortOption[];
  buildArgs: (inputPath: string, outputPath: string, effort: number | string, quality: number | null) => string[];
  buildDecodeArgs: (encodedFilePath: string) => string[];
}

/**
 * 2. 12 款编码器配置（含 cwebp 与 cwebp-sharp-yuv 拆分，均不含 -mt）
 */
export const ENCODER_SPECS: EncoderSpec[] = [
  // ================= PNG (无损，仅按压缩力度各跑一次) =================
  {
    name: 'png-libpng',
    format: 'png',
    ext: 'png',
    lossless: true,
    binary: path.join(BIN_DIR, 'png-libpng'),
    decoderBinary: path.join(BIN_DIR, 'png-libpng'),
    efforts: [1, 2, 3, 4, 5, 6, 7, 8].map((l) => ({
      effort: l,
      tag: `l${l}`,
      label: `-l ${l} -f 5`,
    })),
    buildArgs: (inp, out, effort) => [inp, out, '-l', String(effort), '-f', '5'],
    buildDecodeArgs: (encPath) => [encPath, '/dev/null', '-d'],
  },
  {
    name: 'png-libpng-zlibng',
    format: 'png',
    ext: 'png',
    lossless: true,
    binary: path.join(BIN_DIR, 'png-libpng-zlibng'),
    decoderBinary: path.join(BIN_DIR, 'png-libpng-zlibng'),
    efforts: [1, 2, 3, 4, 5, 6, 7, 8].map((l) => ({
      effort: l,
      tag: `l${l}`,
      label: `-l ${l} -f 5`,
    })),
    buildArgs: (inp, out, effort) => [inp, out, '-l', String(effort), '-f', '5'],
    buildDecodeArgs: (encPath) => [encPath, '/dev/null', '-d'],
  },
  {
    name: 'png-libspng',
    format: 'png',
    ext: 'png',
    lossless: true,
    binary: path.join(BIN_DIR, 'png-libspng'),
    decoderBinary: path.join(BIN_DIR, 'png-libspng'),
    efforts: [1, 2, 3, 4, 5, 6, 7, 8].map((l) => ({
      effort: l,
      tag: `l${l}`,
      label: `-l ${l} -f 5`,
    })),
    buildArgs: (inp, out, effort) => [inp, out, '-l', String(effort), '-f', '5'],
    buildDecodeArgs: (encPath) => [encPath, '/dev/null', '-d'],
  },
  {
    name: 'oxipng',
    format: 'png',
    ext: 'png',
    lossless: true,
    binary: path.join(BIN_DIR, 'oxipng'),
    decoderBinary: path.join(BIN_DIR, 'png-libpng-zlibng'),
    efforts: [0, 1, 2, 3, 4, 5].map((o) => ({
      effort: o,
      tag: `o${o}`,
      label: `-o ${o} --strip safe`,
    })),
    buildArgs: (inp, out, effort) => ['-o', String(effort), '--strip', 'safe', '--force', inp, '--out', out, '-q'],
    buildDecodeArgs: (encPath) => [encPath, '/dev/null', '-d'],
  },

  // ================= JPEG (有损，22 档质量 × 压缩力度) =================
  {
    name: 'cjpeg-turbo',
    format: 'jpeg',
    ext: 'jpg',
    lossless: false,
    minQuality: 0,
    binary: path.join(BIN_DIR, 'cjpeg-turbo'),
    decoderBinary: path.join(BIN_DIR, 'djpeg-turbo'),
    efforts: [
      { effort: 0, tag: 'e0_baseline', label: 'baseline' },
      { effort: 1, tag: 'e1_optimize', label: '-optimize' },
      { effort: 2, tag: 'e2_progressive', label: '-progressive -optimize' },
    ],
    buildArgs: (inp, out, effort, q) => {
      const actualQ = Math.max(0, q ?? 80);
      const args = ['-quality', String(actualQ)];
      if (effort === 1) args.push('-optimize');
      if (effort === 2) args.push('-progressive', '-optimize');
      args.push('-outfile', out, inp);
      return args;
    },
    buildDecodeArgs: (encPath) => ['-ppm', '-outfile', '/dev/null', encPath],
  },
  {
    name: 'cjpeg-mozjpeg',
    format: 'jpeg',
    ext: 'jpg',
    lossless: false,
    minQuality: 0,
    binary: path.join(BIN_DIR, 'cjpeg-mozjpeg'),
    decoderBinary: path.join(BIN_DIR, 'djpeg-mozjpeg'),
    efforts: [
      { effort: 0, tag: 'e0_fast', label: '-notrellis -fastcrush' },
      { effort: 1, tag: 'e1_fastcrush', label: '-fastcrush (trellis on)' },
      { effort: 2, tag: 'e2_default', label: 'default (trellis + scan-opt)' },
    ],
    buildArgs: (inp, out, effort, q) => {
      const actualQ = Math.max(0, q ?? 80);
      const args = ['-quality', String(actualQ)];
      if (effort === 0) args.push('-notrellis', '-fastcrush');
      if (effort === 1) args.push('-fastcrush');
      args.push('-outfile', out, inp);
      return args;
    },
    buildDecodeArgs: (encPath) => ['-ppm', '-outfile', '/dev/null', encPath],
  },
  {
    name: 'cjpegli',
    format: 'jpeg',
    ext: 'jpg',
    lossless: false,
    minQuality: 1, // cjpegli 不支持 q=0，最低档位自动使用 q=1
    binary: path.join(BIN_DIR, 'cjpegli'),
    decoderBinary: path.join(BIN_DIR, 'djpegli'),
    efforts: [
      { effort: 0, tag: 'p0', label: '-p 0 (sequential)' },
      { effort: 1, tag: 'p1', label: '-p 1 (progressive lv1)' },
      { effort: 2, tag: 'p2', label: '-p 2 (progressive lv2)' },
    ],
    buildArgs: (inp, out, effort, q) => {
      const actualQ = Math.max(1, q ?? 80);
      return [inp, out, '-q', String(actualQ), '-p', String(effort), '--quiet'];
    },
    buildDecodeArgs: (encPath) => [encPath, '--disable_output'],
  },

  // ================= JPEG XL (有损，22 档质量 × 力度 1..9) =================
  {
    name: 'cjxl',
    format: 'jxl',
    ext: 'jxl',
    lossless: false,
    supportsLossless: true,
    minQuality: 0,
    binary: path.join(BIN_DIR, 'cjxl'),
    decoderBinary: path.join(BIN_DIR, 'djxl'),
    efforts: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((e) => ({
      effort: e,
      tag: `e${e}`,
      label: `-e ${e}`,
    })),
    buildArgs: (inp, out, effort, q) =>
      q === null
        ? [inp, out, '-d', '0', '-e', String(effort), '--quiet']
        : [inp, out, '-q', String(Math.max(0, q)), '-e', String(effort), '--quiet'],
    buildDecodeArgs: (encPath) => [encPath, '--disable_output', '--quiet'],
  },

  // ================= WebP (拆分为 cwebp 与 cwebp-sharp-yuv，均去掉 -mt) =================
  {
    name: 'cwebp',
    format: 'webp',
    ext: 'webp',
    lossless: false,
    supportsLossless: true,
    minQuality: 0,
    binary: path.join(BIN_DIR, 'cwebp'),
    decoderBinary: path.join(BIN_DIR, 'dwebp'),
    efforts: [0, 1, 2, 3, 4, 5].map((m) => ({
      effort: m,
      tag: `m${m}`,
      label: `-m ${m}`,
    })),
    buildArgs: (inp, out, effort, q) =>
      q === null
        ? ['-lossless', '-q', '100', '-m', String(effort), inp, '-o', out, '-quiet']
        : ['-q', String(Math.max(0, q)), '-m', String(effort), inp, '-o', out, '-quiet'],
    buildDecodeArgs: (encPath) => [encPath, '-quiet'],
  },
  {
    name: 'cwebp-sharp-yuv',
    format: 'webp',
    ext: 'webp',
    lossless: false,
    supportsLossless: false,
    minQuality: 0,
    binary: path.join(BIN_DIR, 'cwebp'),
    decoderBinary: path.join(BIN_DIR, 'dwebp'),
    efforts: [0, 1, 2, 3, 4, 5].map((m) => ({
      effort: m,
      tag: `m${m}`,
      label: `-m ${m} -sharp_yuv`,
    })),
    buildArgs: (inp, out, effort, q) =>
      q === null
        ? ['-lossless', '-q', '100', '-m', String(effort), inp, '-o', out, '-quiet']
        : ['-q', String(Math.max(0, q)), '-m', String(effort), '-sharp_yuv', inp, '-o', out, '-quiet'],
    buildDecodeArgs: (encPath) => [encPath, '-quiet'],
  },

  // ================= AVIF (有损，22 档质量 × 实用速度档位) =================
  // 色度采样：aom 显式 4:4:4；svt 只能 4:2:0（SVT-AV1 enc_settings.c 限制 "Only support 420"）。
  {
    name: 'avifenc-aom',
    format: 'avif',
    ext: 'avif',
    lossless: false,
    supportsLossless: true,
    minQuality: 0,
    binary: path.join(BIN_DIR, 'avifenc'),
    decoderBinary: path.join(BIN_DIR, 'avifdec'),
    efforts: [6, 7, 8, 9].map((s) => ({
      effort: s,
      tag: `s${s}`,
      label: `-c aom -s ${s} --depth 10 -y 444 -a tune=iq`,
    })),
    buildArgs: (inp, out, effort, q) =>
      q === null
        ? ['-c', 'aom', '-l', '-s', String(effort), '-j', '4', inp, out]
        : q === 100
        ? [
            '-c',
            'aom',
            '-s',
            String(effort),
            '-q',
            '100',
            '--depth',
            '10',
            '-y',
            '444',
            '-j',
            '4',
            inp,
            out,
          ]
        : [
            '-c',
            'aom',
            '-s',
            String(effort),
            '-q',
            String(Math.max(0, q)),
            '--depth',
            '10',
            '-y',
            '444',
            '-a',
            'tune=iq',
            '-j',
            '4',
            inp,
            out,
          ],
    buildDecodeArgs: (encPath) => ['-c', 'dav1d', '-i', '--index', '0', encPath],
  },
  {
    name: 'avifenc-svt',
    format: 'avif',
    // SVT-AV1 不支持 444，只能 4:2:0，与 avifenc-aom 的 4:4:4 色度采样不同；因此也没有像素无损模式。
    ext: 'avif',
    lossless: false,
    minQuality: 0,
    binary: path.join(BIN_DIR, 'avifenc'),
    decoderBinary: path.join(BIN_DIR, 'avifdec'),
    efforts: [5, 6, 7, 8, 9, 10, 11, 12].map((s) => ({
      effort: s,
      tag: `s${s}`,
      label: `-c svt -s ${s} --depth 10 -y 420 -a tune=3`,
    })),
    buildArgs: (inp, out, effort, q) => [
      '-c',
      'svt',
      '-s',
      String(effort),
      '-q',
      String(Math.max(0, q ?? 80)),
      '--depth',
      '10',
      '-y',
      '420',
      '-a',
      'tune=3',
      '-j',
      '4',
      inp,
      out,
    ],
    buildDecodeArgs: (encPath) => ['-c', 'dav1d', '-i', '--index', '0', encPath],
  },
];

export interface ImageInfo {
  name: string;
  stem: string;
  filePath: string;
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  inputBytes: number;
}

export interface BenchTiming {
  ready_ms: number;
  encode_ms: number;
  output_ms: number;
  total_ms: number;
}

export interface BenchmarkRecord {
  id: string;
  image: string;
  imageWidth: number;
  imageHeight: number;
  format: ImageFormat;
  encoder: string;
  lossless: boolean;
  quality: number | null;
  actualQuality?: number | null;
  /** 编码器的无损开关与对原图的像素无损性分别保存。 */
  encodingLossless?: boolean;
  pixelVerification?: IPixelVerification;
  /** 独立补算的全分辨率视觉评分；重新编码后不继承旧评分。 */
  ssimulacra2?: number;
  /** 绑定原图、产物和评分工具的内容指纹。 */
  ssimulacra2Key?: string;
  effort: number | string;
  effortTag: string;
  effortLabel: string;
  args: string[];
  inputBytes: number;
  outputBytes: number;
  compressionRatio: number;
  spaceSavingPct: number;
  bpp: number;
  timing: BenchTiming;
  /** 编码与解码各自的采样次数；与 TIMING_SAMPLES 不一致的旧记录会重新跑。 */
  timingSamples?: number;
  decode_ms: number;
  decodeTiming: BenchTiming;
  outputFile: string;
  timestamp: string;
}

export interface ImageDataFile {
  image: ImageInfo;
  updatedAt: string;
  totalTasks: number;
  completedTasks: number;
  records: Record<string, BenchmarkRecord>;
}

interface TaskItem {
  id: string;
  imageInfo: ImageInfo;
  spec: EncoderSpec;
  effortOpt: EffortOption;
  quality: number | null;
  outputAbsPath: string;
  outputRelPath: string;
  decodeOnly: boolean;
  existingRecord?: BenchmarkRecord;
}

/**
 * 解析 PNG IHDR 头部获取宽高、位深与色彩类型
 */
function parsePngHeader(filePath: string): ImageInfo {
  const stat = fs.statSync(filePath);
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(32);
  fs.readSync(fd, buf, 0, 32, 0);
  fs.closeSync(fd);

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf.readUInt8(24);
  const colorType = buf.readUInt8(25);
  const name = path.basename(filePath);
  const stem = path.basename(filePath, path.extname(filePath));

  return {
    name,
    stem,
    filePath,
    width,
    height,
    bitDepth,
    colorType,
    inputBytes: stat.size,
  };
}

/**
 * 运行单次编码或解码子进程并解析 [BENCH_TIMING] JSON
 */
function runTimedProcess(binary: string, args: string[]): Promise<{ timing: BenchTiming; outputBytes: number }> {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const proc = spawn(binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      reject(err);
    });

    proc.on('close', (code) => {
      const fallbackTotal = Number((performance.now() - t0).toFixed(3));
      if (code !== 0) {
        reject(new Error(`Process ${path.basename(binary)} exited with code ${code}: ${stderr || stdout}`));
        return;
      }
      const combined = `${stdout}\n${stderr}`;
      const lines = combined.split('\n');
      let parsedTiming: BenchTiming | null = null;
      let reportedOutBytes = 0;

      for (const line of lines) {
        const idx = line.indexOf('[BENCH_TIMING]');
        if (idx !== -1) {
          const jsonStr = line.slice(idx + '[BENCH_TIMING]'.length).trim();
          try {
            const obj = JSON.parse(jsonStr);
            parsedTiming = {
              ready_ms: Number(Number(obj.ready_ms ?? 0).toFixed(3)),
              encode_ms: Number(Number(obj.encode_ms ?? 0).toFixed(3)),
              output_ms: Number(Number(obj.output_ms ?? 0).toFixed(3)),
              total_ms: Number(Number(obj.total_ms ?? fallbackTotal).toFixed(3)),
            };
            if (typeof obj.output_bytes === 'number') {
              reportedOutBytes = obj.output_bytes;
            }
          } catch {
            // ignore malformed line
          }
        }
      }

      if (!parsedTiming) {
        parsedTiming = {
          ready_ms: 0,
          encode_ms: fallbackTotal,
          output_ms: 0,
          total_ms: fallbackTotal,
        };
      }

      resolve({ timing: parsedTiming, outputBytes: reportedOutBytes });
    });
  });
}

/**
 * 重复运行同一命令，取核心阶段 encode_ms 最小的一次。
 * 干扰只会让耗时变长，最小值最接近编码器本身的速度；各阶段取自同一次运行，保持 total_ms 自洽。
 */
async function runSampledProcess(binary: string, args: string[]): Promise<BenchTiming> {
  let best: BenchTiming | null = null;
  for (let i = 0; i < TIMING_SAMPLES; i++) {
    const { timing } = await runTimedProcess(binary, args);
    if (!best || timing.encode_ms < best.encode_ms) best = timing;
  }
  return best!;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const s = Math.round(seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  const argv = process.argv.slice(2);
  let imageFilter: string | null = null;
  let encoderFilter: string | null = null;
  let forceRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--image' && i + 1 < argv.length) {
      imageFilter = argv[++i];
    } else if (arg === '--encoder' && i + 1 < argv.length) {
      encoderFilter = argv[++i];
    } else if (arg === '--force') {
      forceRun = true;
    }
  }

  fs.mkdirSync(RESULT_IMAGES_DIR, { recursive: true });
  fs.mkdirSync(RESULT_DATA_DIR, { recursive: true });

  const allImageFiles = fs
    .readdirSync(IMAGES_DIR)
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));

  const selectedImageFiles = imageFilter
    ? allImageFiles.filter((f) => f.includes(imageFilter!))
    : allImageFiles;

  const selectedSpecs = encoderFilter
    ? ENCODER_SPECS.filter((s) => s.name.includes(encoderFilter!))
    : ENCODER_SPECS;

  if (selectedImageFiles.length === 0) {
    console.error(`未找到匹配的测试图片 (filter=${imageFilter})`);
    process.exit(1);
  }
  if (selectedSpecs.length === 0) {
    console.error(`未找到匹配的编码器 (filter=${encoderFilter})`);
    process.exit(1);
  }

  const images: ImageInfo[] = selectedImageFiles.map((f) =>
    parsePngHeader(path.join(IMAGES_DIR, f))
  );

  const validEncoderNames = new Set(ENCODER_SPECS.map((s) => s.name));
  const imageDataMap = new Map<string, ImageDataFile>();
  const pendingTasks: TaskItem[] = [];
  let totalPlannedTasks = 0;
  let skippedCompletedTasks = 0;

  for (const img of images) {
    const perImageJsonPath = path.join(RESULT_DATA_DIR, `${img.stem}.json`);
    let existingRecords: Record<string, BenchmarkRecord> = {};

    if (!forceRun && fs.existsSync(perImageJsonPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(perImageJsonPath, 'utf8')) as ImageDataFile;
        if (parsed && parsed.records) {
          for (const [k, rec] of Object.entries(parsed.records)) {
            if (validEncoderNames.has(rec.encoder)) {
              existingRecords[k] = normalizeEncodingRecord(rec);
            }
          }
        }
      } catch {
        existingRecords = {};
      }
    }

    let imgTaskCount = 0;
    for (const spec of selectedSpecs) {
      const qualities: (number | null)[] = spec.lossless
        ? [null]
        : spec.supportsLossless
        ? [...QUALITY_LEVELS, null]
        : [...QUALITY_LEVELS];
      for (const effortOpt of spec.efforts) {
        for (const q of qualities) {
          imgTaskCount++;
          totalPlannedTasks++;

          const qSuffix = q !== null ? `_q${q}` : spec.lossless ? '' : '_lossless';
          const fileName = `${spec.name}_${effortOpt.tag}${qSuffix}.${spec.ext}`;
          const outputRelPath = path.join('images', img.stem, spec.name, fileName);
          const outputAbsPath = path.join(RESULT_DIR, outputRelPath);
          const taskId = `${img.stem}__${spec.name}__${effortOpt.tag}${qSuffix}`;

          const expectedArgs = spec.buildArgs(img.filePath, outputAbsPath, effortOpt.effort, q);
          const existing = existingRecords[taskId];

          const hasValidEncode =
            !forceRun &&
            existing &&
            existing.outputBytes > 0 &&
            existing.timing &&
            existing.timing.total_ms > 0 &&
            existing.timingSamples === TIMING_SAMPLES &&
            Array.isArray(existing.args) &&
            existing.args.join(' ') === expectedArgs.join(' ') &&
            fs.existsSync(outputAbsPath) &&
            fs.statSync(outputAbsPath).size > 0;

          const hasValidDecode =
            hasValidEncode &&
            typeof existing.decode_ms === 'number' &&
            existing.decode_ms > 0 &&
            existing.decodeTiming &&
            existing.decodeTiming.total_ms > 0;

          if (hasValidDecode) {
            skippedCompletedTasks++;
            continue;
          }

          pendingTasks.push({
            id: taskId,
            imageInfo: img,
            spec,
            effortOpt,
            quality: q,
            outputAbsPath,
            outputRelPath,
            decodeOnly: Boolean(hasValidEncode),
            existingRecord: hasValidEncode ? existing : undefined,
          });
        }
      }
    }

    imageDataMap.set(img.stem, {
      image: img,
      updatedAt: new Date().toISOString(),
      totalTasks: imgTaskCount,
      completedTasks: Object.keys(existingRecords).length,
      records: existingRecords,
    });
  }

  pendingTasks.sort((a, b) => {
    if (a.decodeOnly !== b.decodeOnly) return a.decodeOnly ? -1 : 1;
    return 0;
  });
  const decodeOnlyCount = pendingTasks.filter((t) => t.decodeOnly).length;
  const fullEncodeCount = pendingTasks.length - decodeOnlyCount;

  console.log('================================================================================');
  console.log('  图像编码器参数基准测试 (22档质量含0/100 + 无损力度 + 编解码双计时)');
  console.log('================================================================================');
  console.log(`- 测试图片数量: ${images.length} 张`);
  console.log(`- 编码器数量  : ${selectedSpecs.length} 款 (${selectedSpecs.map((s) => s.name).join(', ')})`);
  console.log(`- 有损质量档位: 22 档 [${QUALITY_LEVELS.join(', ')}] (cjpegli 最低档为 1)`);
  console.log(`- 计划总任务数: ${totalPlannedTasks}`);
  console.log(`- 已完成跳过  : ${skippedCompletedTasks}`);
  console.log(`- 待执行任务  : ${pendingTasks.length} (其中全量编解码: ${fullEncodeCount}, 仅补测解码: ${decodeOnlyCount}, 串行执行)`);
  console.log('================================================================================');

  const dirtyStems = new Set<string>();

  const flushImageCheckpoints = (forceAll = false) => {
    const stemsToFlush = forceAll ? Array.from(imageDataMap.keys()) : Array.from(dirtyStems);
    for (const stem of stemsToFlush) {
      const data = imageDataMap.get(stem);
      if (!data) continue;
      data.updatedAt = new Date().toISOString();
      data.completedTasks = Object.keys(data.records).length;
      const perImageJsonPath = path.join(RESULT_DATA_DIR, `${stem}.json`);
      const tmpPath = `${perImageJsonPath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmpPath, perImageJsonPath);
    }
    dirtyStems.clear();
  };

  const writeGlobalSummary = (elapsedMs: number) => {
    const allRecords: BenchmarkRecord[] = [];
    for (const img of images) {
      const data = imageDataMap.get(img.stem);
      if (!data) continue;
      const sortedValues = Object.values(data.records)
        .filter((r) => validEncoderNames.has(r.encoder))
        .sort((a, b) => a.id.localeCompare(b.id));
      allRecords.push(...sortedValues);
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      totalElapsedMs: Number(elapsedMs.toFixed(1)),
      config: {
        qualityLevels: QUALITY_LEVELS,
        timingSamples: TIMING_SAMPLES,
        encoders: selectedSpecs.map((s) => ({
          name: s.name,
          format: s.format,
          lossless: s.lossless,
          supportsLossless: Boolean(s.lossless || s.supportsLossless),
          minQuality: s.minQuality ?? null,
          efforts: s.efforts,
        })),
      },
      summary: {
        totalImages: images.length,
        totalPlannedTasks,
        completedTasks: allRecords.length,
      },
      images,
      records: allRecords,
    };

    const tmpSummary = `${SUMMARY_JSON_PATH}.tmp`;
    fs.writeFileSync(tmpSummary, JSON.stringify(summary, null, 2), 'utf8');
    fs.renameSync(tmpSummary, SUMMARY_JSON_PATH);

    // 同步导出前端紧凑数据集 web/public/benchmark-data.json
    if (fs.existsSync(path.dirname(WEB_PUBLIC_JSON_PATH))) {
      const compactRecords = allRecords.map((r) => [
        r.image,
        r.encoder,
        r.format,
        r.lossless ? 1 : 0,
        r.quality,
        r.effortTag,
        r.effortLabel,
        r.inputBytes,
        r.outputBytes,
        r.compressionRatio,
        r.spaceSavingPct,
        r.bpp,
        r.timing.ready_ms,
        r.timing.encode_ms,
        r.timing.output_ms,
        r.timing.total_ms,
        r.outputFile,
        r.decode_ms,
        r.actualQuality,
        r.ssimulacra2 ?? null,
        r.pixelVerification ?? null,
        r.encodingLossless ?? null,
      ]);

      const webPayload = {
        generatedAt: summary.generatedAt,
        totalElapsedMs: summary.totalElapsedMs,
        config: summary.config,
        summary: summary.summary,
        images: summary.images.map((i) => ({
          name: i.name,
          stem: i.stem,
          width: i.width,
          height: i.height,
          bitDepth: i.bitDepth,
          colorType: i.colorType,
          inputBytes: i.inputBytes,
        })),
        records: compactRecords,
      };
      const tmpWeb = `${WEB_PUBLIC_JSON_PATH}.tmp`;
      fs.writeFileSync(tmpWeb, JSON.stringify(webPayload), 'utf8');
      fs.renameSync(tmpWeb, WEB_PUBLIC_JSON_PATH);
    }
  };

  if (pendingTasks.length === 0) {
    flushImageCheckpoints(true);
    writeGlobalSummary(0);
    console.log('所有测试任务均已完成，汇总数据已更新至 result/results.json 与 web/public/benchmark-data.json。');
    return;
  }

  const startTime = performance.now();
  let executedCount = 0;
  let failedCount = 0;
  let taskCursor = 0;
  let lastFlushTime = performance.now();
  let lastLogLineTime = 0;
  const isTTY = Boolean(process.stdout.isTTY);

  const renderProgress = (lastRecord?: BenchmarkRecord, forceNewline = false) => {
    const now = performance.now();
    const elapsedSec = (now - startTime) / 1000;
    const totalDone = skippedCompletedTasks + executedCount;
    const pct = ((totalDone / totalPlannedTasks) * 100).toFixed(2);
    const speed = elapsedSec > 0 ? executedCount / elapsedSec : 0;
    const remainingTasks = pendingTasks.length - executedCount;
    const etaSec = speed > 0 ? remainingTasks / speed : Infinity;

    const barWidth = 22;
    const filled = Math.min(barWidth, Math.round((totalDone / totalPlannedTasks) * barWidth));
    const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);

    let detail = '';
    if (lastRecord) {
      const qStr = lastRecord.quality !== null ? ` q=${lastRecord.quality}` : ' lossless';
      detail = ` | ${lastRecord.image} [${lastRecord.encoder} ${lastRecord.effortTag}${qStr}] -> ${formatBytes(lastRecord.outputBytes)} (enc:${lastRecord.timing.encode_ms.toFixed(1)}ms dec:${lastRecord.decode_ms.toFixed(1)}ms)`;
    }

    const line = `[${bar}] ${pct}% (${totalDone}/${totalPlannedTasks}) | 速度: ${speed.toFixed(2)} 项/s | 已用: ${formatDuration(elapsedSec)} | 剩余: ${formatDuration(etaSec)}${detail}`;

    if (isTTY && !forceNewline) {
      process.stdout.write(`\r\x1b[2K${line}`);
    } else if (forceNewline || now - lastLogLineTime >= 2000 || totalDone === totalPlannedTasks) {
      lastLogLineTime = now;
      console.log(line);
    }
  };

  const handleSignal = () => {
    if (isTTY) process.stdout.write('\n');
    console.log('\n收到中断信号，正在保存当前断点数据...');
    flushImageCheckpoints(true);
    writeGlobalSummary(performance.now() - startTime);
    console.log('断点已安全保存，下次运行将自动续跑。');
    process.exit(130);
  };
  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  const worker = async () => {
    while (true) {
      const idx = taskCursor++;
      if (idx >= pendingTasks.length) break;

      const task = pendingTasks[idx];
      fs.mkdirSync(path.dirname(task.outputAbsPath), { recursive: true });

      const args = task.spec.buildArgs(
        task.imageInfo.filePath,
        task.outputAbsPath,
        task.effortOpt.effort,
        task.quality
      );

      try {
        let timing: BenchTiming;
        let outputBytes: number;

        if (task.decodeOnly && task.existingRecord) {
          timing = task.existingRecord.timing;
          outputBytes = task.existingRecord.outputBytes;
        } else {
          timing = await runSampledProcess(task.spec.binary, args);
          const outStat = fs.statSync(task.outputAbsPath);
          outputBytes = outStat.size;
        }

        const decArgs = task.spec.buildDecodeArgs(task.outputAbsPath);
        const decodeTiming = await runSampledProcess(task.spec.decoderBinary, decArgs);
        const decode_ms = decodeTiming.encode_ms > 0 ? decodeTiming.encode_ms : decodeTiming.total_ms;

        const inputBytes = task.imageInfo.inputBytes;
        const pixels = task.imageInfo.width * task.imageInfo.height;
        const actualQuality =
          task.quality === null
            ? null
            : Math.max(task.spec.minQuality ?? 0, task.quality);

        const record: BenchmarkRecord = {
          id: task.id,
          image: task.imageInfo.name,
          imageWidth: task.imageInfo.width,
          imageHeight: task.imageInfo.height,
          format: task.spec.format,
          encoder: task.spec.name,
          lossless: task.decodeOnly ? task.existingRecord?.lossless ?? false : false,
          encodingLossless: isEncodingLosslessMode(task.spec.name, task.quality),
          pixelVerification: task.decodeOnly ? task.existingRecord?.pixelVerification : undefined,
          quality: task.quality,
          actualQuality,
          ...(task.decodeOnly && task.existingRecord ? {
            ssimulacra2: task.existingRecord.ssimulacra2,
            ssimulacra2Key: task.existingRecord.ssimulacra2Key,
          } : {}),
          effort: task.effortOpt.effort,
          effortTag: task.effortOpt.tag,
          effortLabel: task.effortOpt.label,
          args,
          inputBytes,
          outputBytes,
          compressionRatio: Number((outputBytes / inputBytes).toFixed(4)),
          spaceSavingPct: Number(((1 - outputBytes / inputBytes) * 100).toFixed(2)),
          bpp: Number(((outputBytes * 8) / pixels).toFixed(4)),
          timing,
          timingSamples: TIMING_SAMPLES,
          decode_ms: Number(decode_ms.toFixed(3)),
          decodeTiming,
          outputFile: task.outputRelPath,
          timestamp: new Date().toISOString(),
        };

        const imgData = imageDataMap.get(task.imageInfo.stem)!;
        imgData.records[task.id] = record;
        dirtyStems.add(task.imageInfo.stem);

        executedCount++;
        renderProgress(record);

        const now = performance.now();
        if (now - lastFlushTime >= 10000) {
          lastFlushTime = now;
          flushImageCheckpoints(false);
          writeGlobalSummary(now - startTime);
        }
      } catch (err) {
        failedCount++;
        executedCount++;
        if (isTTY) process.stdout.write('\n');
        console.error(`[ERROR] 任务失败 (${task.id}): ${(err as Error).message}`);
      }
    }
  };

  // 串行执行，避免多线程编码器之间争抢 CPU 与内存带宽而污染计时。
  await worker();

  if (isTTY) process.stdout.write('\n');
  const totalElapsedMs = performance.now() - startTime;
  flushImageCheckpoints(true);
  writeGlobalSummary(totalElapsedMs);

  console.log('================================================================================');
  console.log(`测试完成！总耗时: ${formatDuration(totalElapsedMs / 1000)} | 成功执行: ${executedCount - failedCount} 项 | 断点跳过: ${skippedCompletedTasks} 项 | 失败: ${failedCount} 项`);
  console.log(`- 汇总实验数据: ${SUMMARY_JSON_PATH}`);
  console.log(`- 前端数据文件: ${WEB_PUBLIC_JSON_PATH}`);
  console.log(`- 分图断点数据: ${RESULT_DATA_DIR}/<图片名>.json`);
  console.log(`- 压缩输出图片: ${RESULT_IMAGES_DIR}/<图片名>/<编码器>/`);
  console.log('- 像素无损验证: bun run verify:pixels（新产物验证前不标记为无损）');
  console.log('================================================================================');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
