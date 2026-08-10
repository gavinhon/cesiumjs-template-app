import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

// https://vite.dev/config/
//
// CesiumJS is not a normal npm package: alongside its JS modules it ships a
// large folder of *static* runtime assets (Web Workers that do heavy lifting
// off the main thread, .glsl-derived shaders, SVG widget icons, texture
// images, etc). Those files have to be copied into the build output and
// served from a known URL so Cesium can fetch them at runtime.
//
// `vite-plugin-cesium` does two things for us automatically:
//   1. Copies Cesium's `Build/Cesium/{Assets,ThirdParty,Workers,Widgets}`
//      folders into `public`/`dist` so they're served as static files.
//   2. Defines the global `CESIUM_BASE_URL` that Cesium's source code reads
//      at startup to know where to fetch those files from (default: "/cesium").
export default defineConfig({
  plugins: [react(), cesium()],
  resolve: {
    alias: {
      // Mirror of the `paths` mapping in tsconfig.app.json. TypeScript's
      // `paths` only teaches the *type checker* how to resolve `@/...`;
      // the bundler needs to be told separately, and the two must agree.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
