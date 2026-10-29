import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureJxlPreview } from '../jxlPreview';

/** 相同文件名、相同长度、相同修改时间也必须识别内容更新。 */
test('JXL 缓存按源文件内容失效，并复用内容未变的解码结果', () => {
  const root = mkdtempSync(join(tmpdir(), 'imagefmt-cache-test-'));
  try {
    const source = join(root, 'same.jxl'); const cache = join(root, 'cache'); let decodes = 0;
    const decode = (input: string, output: string) => { decodes++; writeFileSync(output, readFileSync(input)); };
    writeFileSync(source, 'first'); utimesSync(source, 100, 100);
    const first = ensureJxlPreview(source, cache, decode);
    expect(ensureJxlPreview(source, cache, decode)).toBe(first); expect(decodes).toBe(1);
    writeFileSync(source, 'other'); utimesSync(source, 100, 100);
    const second = ensureJxlPreview(source, cache, decode);
    expect(second).not.toBe(first); expect(readFileSync(second, 'utf8')).toBe('other'); expect(decodes).toBe(2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('解码失败的半成品不被后续请求当成有效缓存', () => {
  const root = mkdtempSync(join(tmpdir(), 'imagefmt-cache-test-'));
  try {
    const source = join(root, 'bad.jxl'); const cache = join(root, 'cache'); writeFileSync(source, 'data');
    expect(() => ensureJxlPreview(source, cache, (_, output) => { writeFileSync(output, 'partial'); throw new Error('failed'); })).toThrow('failed');
    expect(readdirSync(cache)).toEqual([]);
    const result = ensureJxlPreview(source, cache, (_, output) => { writeFileSync(output, 'complete'); });
    expect(readFileSync(result, 'utf8')).toBe('complete');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
