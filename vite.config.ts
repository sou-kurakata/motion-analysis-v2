/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// vitest の設定も同ファイルに集約する
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.{test,spec}.ts'],
  },
  worker: {
    // module worker にする(Vite dev は classic worker 内の import をバンドルできないため)。
    // MediaPipe の wasm ローダは module 版グルー(vision_wasm_module_internal.js)を
    // 明示指定することで module worker でも self.ModuleFactory が正しく設定される。
    format: 'es',
  },
});
