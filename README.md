# CesiumJS template app

A full-screen 3D globe (CesiumJS + React 19 + Vite + TypeScript), focused on
Singapore, with no Cesium ion account or API keys required.

- Keyless basemaps, local terrain (`public/terrain/`), 3D Tiles and I3S models
- Add data: WMS, WMTS, XYZ, WFS, ArcGIS, GeoJSON, plus datasets dropped into `public/`
- Drawing, 3D measurement, line of sight, ground profiles
- BIM model filtering and height cuts
- Live LTA traffic congestion, incidents and MRT/LRT crowding (needs `LTA_ACCOUNT_KEY` in `.env`)
- Search (coordinates, SVY21, places), shareable map links, phone layout

## Run

```bash
npm install
npm run dev
```

`npm run check` (typecheck, lint, format, tests) must pass: it gates the
pre-commit hook and the GitHub Pages deploy. Run `npm run format` first.

`npm run test:e2e` builds the app and runs the Playwright browser tests in
`e2e/` (desktop and phone, with axe accessibility scans). Pages runs them too.
First time: `npx playwright install chromium`.

## Deploy

- **GitHub Pages:** pushes to `main` deploy via `.github/workflows/deploy-pages.yml`.
- **Docker** (incl. offline): copy `.env.example` to `.env`, then `docker compose up -d`.

## Data

Datasets in `public/` are gitignored except `public/terrain/singapore-gem15-dtm`
and `public/af1-gpt61sol`. `scripts/build_terrain_tiles.py` converts a GeoTIFF
DTM to Cesium terrain.
