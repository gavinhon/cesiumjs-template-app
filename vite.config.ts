import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
// With its `.ts` extension: Vite plans to load this config natively in
// Node, which (like scripts/writeRuntimeConfig.ts) resolves only the file
// name as written. tsconfig.node.json allows the extension for this.
import { liveTrafficFeed } from './vite-plugins/liveTrafficFeed.ts';
import { publicDatasetCatalog } from './vite-plugins/publicDatasetCatalog.ts';

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
//
// `publicDatasetCatalog` is this app's own plugin: it scans `public/` for
// 3D Tiles, terrain, tile pyramids and GeoJSON, so the panels can offer
// whatever datasets you've dropped in there. See the plugin file for why
// that has to happen at build time rather than in the browser.
//
// `liveTrafficFeed` reads LTA DataMall's live congestion and incidents in
// `npm run dev`, when `.env` has an `LTA_ACCOUNT_KEY` — read here with
// `loadEnv` (all variables, not only `VITE_` ones, which Vite would
// otherwise inline into the bundle) and handed to the plugin, which must
// not import `vite` itself (the Docker image runs it as-is). No key, no
// live traffic: the app is as it is on GitHub Pages.
export default defineConfig(({ mode }) => ({
  // A *relative* base, so the build works wherever it's served from: at a
  // domain root, or under a sub-path like GitHub Pages'
  // `https://<user>.github.io/<repo>/` — whatever the repo is called, so
  // forks deploy without editing this.
  //
  // An absolute sub-path (`base: '/<repo>/'`) is the usual Vite advice, but
  // it breaks Cesium: `vite-plugin-cesium` adds the base to the folder it
  // copies Cesium's runtime files *into* as well as to the URL it loads
  // them *from*, so they land in `dist/<repo>/cesium/` while the app asks
  // for what is really `dist/cesium/` — every web worker 404s and the
  // globe never draws. With './' both resolve to `dist/cesium/`.
  base: './',
  plugins: [
    react(),
    cesium(),
    publicDatasetCatalog(),
    liveTrafficFeed({ accountKey: loadEnv(mode, process.cwd(), '').LTA_ACCOUNT_KEY }),
  ],
  resolve: {
    alias: {
      // Mirror of the `paths` mapping in tsconfig.app.json. TypeScript's
      // `paths` only teaches the *type checker* how to resolve `@/...`;
      // the bundler needs to be told separately, and the two must agree.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}));
