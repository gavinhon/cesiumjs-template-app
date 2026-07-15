# CesiumJS + Vite + React Template

A starter app for building CesiumJS map apps: React 19, Vite, TypeScript, and
CesiumJS, wired up **without** a Cesium ion account.

- Full-screen 3D globe, camera pre-aimed at Singapore.
- No Cesium ion dependency: base imagery is plain OpenStreetMap tiles, terrain
  is the default WGS84 ellipsoid.
- No default Cesium widgets (toolbar, timeline, search box, ...) — the map is
  the whole UI.
- A left sidebar for connecting to WMS, WMTS, or generic XYZ tile services.

Source files are commented to explain *why*, not just *what* — read through
[src/cesium/CesiumMap.tsx](src/cesium/CesiumMap.tsx) and
[src/ogc/](src/ogc) to learn how the pieces fit together.

## Getting started

```bash
npm install
npm run dev
```

Open the printed local URL; you should see the globe centered on Singapore.

## Project structure

- `src/cesium/` — the Cesium `Viewer` setup (`CesiumMap.tsx`) and the
  Singapore camera constants.
- `src/ogc/` — the OGC layer data model (`types.ts`), the factory that turns
  a layer config into a Cesium `ImageryProvider` (`createImageryProvider.ts`),
  and the hook that keeps React state and the Cesium viewer's imagery layers
  in sync (`useOgcLayers.ts`).
- `src/components/` — the sidebar UI (`Sidebar.tsx`, `AddLayerForm.tsx`,
  `LayerList.tsx`).

## Branching into your own app

This is meant to be a starting point: strip out the sidebar if you don't need
OGC layer management, swap the base imagery for your own basemap, or wire in
Cesium ion (`Cesium.Ion.defaultAccessToken = "..."`) if you decide you want
ion-hosted terrain/imagery/3D Tiles after all.

## Tooling

Built with [Vite](https://vite.dev/), linted with [Oxlint](https://oxc.rs).
