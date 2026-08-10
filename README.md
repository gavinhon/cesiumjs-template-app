# CesiumJS + Vite + React Template

A starter app for building CesiumJS map apps: React 19, Vite, TypeScript, and
CesiumJS, wired up **without** a Cesium ion account.

- Full-screen 3D globe, camera pre-aimed at Singapore.
- No Cesium ion dependency: base imagery is plain OpenStreetMap tiles, terrain
  is the default WGS84 ellipsoid.
- No default Cesium widgets (toolbar, timeline, search box, ...) — a small
  custom toolbar (search box + "OGC Layers" button) is the app's only chrome.
- A panel, opened from the toolbar, for connecting to WMS, WMTS, or generic
  XYZ tile services — including looking up a WMS server's real layer names
  and extents from its capabilities document.
- A drawing/measurement toolbar on the right: place points, draw lines and
  polygons, measure point-to-point distance, and drop text labels — plus a
  2D/3D toggle, since the drawing tools work in both. Nothing here is saved;
  reloading the page clears it, by design.
- Dark "ops dashboard" UI (near-black glass panels, one tactical-green
  accent, monospace labels) built from a small set of shared design tokens.

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

- `src/cesium/` — the Cesium `Viewer` setup (`CesiumMap.tsx`), the Singapore
  camera constants, and the 2D/3D toggle (`useSceneMode.ts`).
- `src/ogc/` — the OGC layer data model (`types.ts`), the factory that turns
  a layer config into a Cesium `ImageryProvider` (`createImageryProvider.ts`),
  the hook that keeps React state and the Cesium viewer's imagery layers in
  sync (`useOgcLayers.ts`), and the WMS GetCapabilities lookup
  (`wmsCapabilities.ts`).
- `src/drawing/` — `useDrawingTools.ts`, the hook driving point/line/polygon/
  measure/label drawing via Cesium's `Entity` API.
- `src/components/` — the toolbar (`Toolbar.tsx`) and the layers panel it
  opens (`Sidebar.tsx`, `AddLayerForm.tsx`, `LayerList.tsx`), plus the
  drawing toolbar (`DrawingToolbar.tsx`).

## Branching into your own app

This is meant to be a starting point: strip out the sidebar if you don't need
OGC layer management, swap the base imagery for your own basemap, or wire in
Cesium ion (`Cesium.Ion.defaultAccessToken = "..."`) if you decide you want
ion-hosted terrain/imagery/3D Tiles after all.

## Tooling

Built with [Vite](https://vite.dev/), linted with [Oxlint](https://oxc.rs).
