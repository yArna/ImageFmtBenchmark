import { readFileSync } from 'node:fs';
import ts from '../../../web/node_modules/typescript';
import { effectScope } from '../../../web/node_modules/vue';

/** 执行实际组件脚本并公开指定状态；不复制业务实现，也不依赖浏览器布局。 */
export function loadVueScript(path: string, bindings: Record<string, unknown>, names: string[]) {
  const source = readFileSync(path, 'utf8').split('<script setup lang="ts">')[1].split('</script>')[0]
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?/gm, '');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const scope = effectScope();
  const state = scope.run(() => new Function('exports', ...Object.keys(bindings), `${code}\nreturn {${names.join(',')}};`)({}, ...Object.values(bindings)));
  return { state, stop: () => scope.stop() };
}

/** 读取 Options API 组件供 Vue 自身运行其 data、computed、methods 和 watch。 */
export function loadVueOptions(path: string, defineComponent: Function, bindings: Record<string, unknown> = {}) {
  const source = readFileSync(path, 'utf8').split('<script lang="ts">')[1].split('</script>')[0]
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?/gm, '');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function('exports', 'defineComponent', ...Object.keys(bindings), `${code}\nreturn exports.default;`)({}, defineComponent, ...Object.values(bindings));
}
