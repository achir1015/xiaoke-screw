import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  // 相對路徑：本機、GitHub Pages、Electron 自訂協定、手機 App 都能用
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  worker: { format: 'es' },
  // 線上版的「檢查更新」讀這個檔
  plugins: [{ name: 'xk-version', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version }) }); } }],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { testTimeout: 120_000 },
});
