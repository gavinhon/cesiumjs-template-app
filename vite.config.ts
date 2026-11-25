import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import { liveTrafficFeed } from './vite-plugins/liveTrafficFeed.ts';
import { publicDatasetCatalog } from './vite-plugins/publicDatasetCatalog.ts';

export default defineConfig(({ mode }) => ({
  // An absolute base breaks vite-plugin-cesium asset paths.
  base: './',
  plugins: [
    react(),
    cesium(),
    publicDatasetCatalog(),
    liveTrafficFeed({ accountKey: loadEnv(mode, process.cwd(), '').LTA_ACCOUNT_KEY }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}));
