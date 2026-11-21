import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts on purpose: the tests exercise plain logic —
// geometry, parsers, the public/ scan — so they need none of the app's
// plugins. `vite-plugin-cesium` in particular copies Cesium's static assets
// around, which is pointless work on every test run.
//
// Tests run in Node by default; Cesium's maths, entities and providers all
// work there. A test that needs browser APIs (the capabilities parsers use
// `DOMParser`) opts into happy-dom with a `@vitest-environment` comment.
export default defineConfig({
  resolve: {
    alias: {
      // Same mapping as vite.config.ts and tsconfig.app.json.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'vite-plugins/**/*.test.ts'],
  },
});
