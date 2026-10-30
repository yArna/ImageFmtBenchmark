import { defineConfig } from '@rsbuild/core';
import { pluginVue } from '@rsbuild/plugin-vue';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { ensureJxlPreview } from '../lib/jxlPreview';
import { createHash } from 'node:crypto';

const CURRENT_DIR = import.meta.dirname || process.cwd();
const ROOT_DIR = path.resolve(CURRENT_DIR, '..');
const RESULT_DIR = path.join(ROOT_DIR, 'result');
const SOURCE_IMAGES_DIR = path.join(ROOT_DIR, 'images');
const DJXL_BIN = path.join(ROOT_DIR, 'encoder', 'bin', 'djxl');
const JXL_CACHE_DIR = path.join(os.tmpdir(), 'imagefmt_jxl_preview_cache');

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.avif':
      return 'image/avif';
    case '.jxl':
      return 'image/jxl';
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

export default defineConfig(({ command }) => {
  const isDev = command === 'dev';
  const snapshotPath = path.join(CURRENT_DIR, 'github-assets.json');
  const snapshot = fs.existsSync(snapshotPath) ? JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) : null;
  if (!isDev && !snapshot) throw new Error('请先运行 bun run assets:publish，上传图片并生成 github-assets.json。');
  if (!isDev && snapshot.datasetSha256 !== createHash('sha256').update(fs.readFileSync(path.join(CURRENT_DIR, 'public/benchmark-data.json'))).digest('hex')) {
    throw new Error('数据集已更新，请重新运行 bun run assets:publish，确保图片与数据一致。');
  }
  const siteBase = isDev ? '/' : (process.env.IFB_SITE_BASE || '/ImageFmtBenchmark/');
  if (!siteBase.startsWith('/') || !siteBase.endsWith('/')) throw new Error('IFB_SITE_BASE 必须以 / 开头和结尾。');

  return {
    plugins: [pluginVue()],
    source: {
      define: {
        __IFB_SITE_BASE__: JSON.stringify(siteBase),
        __IFB_RAW_BASE__: JSON.stringify(isDev ? '' : `https://raw.githubusercontent.com/${snapshot.repository}/${snapshot.ref}/`),
      },
    },
    html: {
      title: 'ImgFmtBenchmark - 图片格式与编码器评测',
      favicon: './public/favicon.svg',
      meta: {
        description: 'ImgFmtBenchmark - 图片格式与编码器评测 (Moonvy)',
      },
    },
    output: {
      // GitHub Pages 从仓库根目录的 docs 发布官网。
      distPath: {
        root: path.join(ROOT_DIR, 'docs'),
      },
      cleanDistPath: true,
      overrideBrowserslist: ['chrome >= 100', 'safari >= 16', 'firefox >= 100'],
    },
    server: {
      base: siteBase,
      port: 3210,
    },
    dev: {
      setupMiddlewares: [
        (middlewares) => {
          middlewares.unshift((req, res, next) => {
            if (!req.url) return next();
            const cleanUrl = decodeURIComponent(req.url.split('?')[0]);
            // 数据与同名产物可能被基准任务更新，不沿用先前响应。
            if (cleanUrl === '/benchmark-data.json') res.setHeader('Cache-Control', 'no-store');

            if (cleanUrl.startsWith('/result-file/')) {
              const rel = cleanUrl.slice('/result-file/'.length);
              const target = path.resolve(RESULT_DIR, rel);
              if (target.startsWith(RESULT_DIR) && fs.existsSync(target) && fs.statSync(target).isFile()) {
                const ext = path.extname(target).toLowerCase();
                const accept = String(req.headers['accept'] || '');
                // If browser does not natively advertise image/jxl support, decode .jxl to cached .png via djxl
                if (ext === '.jxl' && !accept.includes('image/jxl') && fs.existsSync(DJXL_BIN)) {
                  try {
                    const cachedPng = ensureJxlPreview(target, JXL_CACHE_DIR, (input, output) => {
                      execFileSync(DJXL_BIN, [input, output, '--quiet']);
                    });
                    res.setHeader('Content-Type', 'image/png');
                    res.setHeader('Cache-Control', 'no-store');
                    fs.createReadStream(cachedPng).pipe(res);
                    return;
                  } catch {
                    res.statusCode = 500;
                    res.setHeader('Cache-Control', 'no-store');
                    res.end('JXL preview decoding failed');
                    return;
                  }
                }

                res.setHeader('Content-Type', getMimeType(target));
                res.setHeader('Cache-Control', 'no-store');
                fs.createReadStream(target).pipe(res);
                return;
              }
            }

            if (cleanUrl.startsWith('/source-image/')) {
              const rel = cleanUrl.slice('/source-image/'.length);
              const target = path.resolve(SOURCE_IMAGES_DIR, rel);
              if (target.startsWith(SOURCE_IMAGES_DIR) && fs.existsSync(target) && fs.statSync(target).isFile()) {
                res.setHeader('Content-Type', getMimeType(target));
                res.setHeader('Cache-Control', 'no-store');
                fs.createReadStream(target).pipe(res);
                return;
              }
            }

            next();
          });
        },
      ],
    },
  };
});
