import { defineConfig } from 'vitest/config';

/** 独立运行编码数据回归测试，避免扫描 monorepo 内其他应用。 */
export default defineConfig({
  cacheDir: './node_modules/.vite',
  test: {
    globals: true,
    environment: 'node',
    include: ['lib/test/**/*.test.ts'],
  },
});
