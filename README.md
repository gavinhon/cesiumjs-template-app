# CesiumJS + Vite + React Template

A starter app for building CesiumJS map apps: React 19, Vite, TypeScript, and
CesiumJS, wired up **without** a Cesium ion account.

## What you get

- **A full-screen 3D globe**, camera pre-aimed at Singapore, with none of
  Cesium's built-in widgets (no toolbar, timeline, or search box) — the map
  itself is the UI.
- **No Cesium ion dependency.** Base imagery is plain OpenStreetMap tiles;
  terrain is the default WGS84 ellipsoid. No token, no account, no signup.
- **An OGC layers panel** for connecting to WMS, WMTS and XYZ raster
  services, plus WFS vector features — including looking up a server's real
  layer names, feature types and extents from its capabilities document.
- **A layer manager** listing everything currently on the map (the base map
  included), with visibility toggles, double-click-to-zoom, and draw-order
  controls that reorder Cesium's real imagery stack so you can uncover a
  layer hidden underneath another.
- **A 3D Tiles panel** for loading tilesets (buildings, point clouds,
  photogrammetry) from a `tileset.json` URL: a remote service, an
  S3/CloudFront bucket, or a dataset dropped under this app's `public/`.
- **Drawing and measurement tools**: place points, draw lines and polygons,
  measure point-to-point distance, drop text labels — plus a 2D/3D toggle,
  since the tools work in both. Live previews throughout: a marker showing
  where the next click lands, rubber-band edges to the cursor, a dot on each
  placed vertex, Backspace to undo one, Esc to abandon. Nothing is
  persisted; a reload clears it.
- **Editable drawings.** Click a shape to select it, then name it, record
  free-form key/value attributes against it, choose which one its on-map
  label shows, and drag its vertices to reshape it — all from the Drawings
  panel.
- **A coherent dark "ops dashboard" UI** built from a small set of shared
  design tokens and shared components, so new features look like the
  existing ones without extra effort.

## Getting started

```bash
npm install
```

```bash
npm run dev
```

Open the printed local URL; you should see the globe centered on Singapore.

## Commands

| Command             | What it does                                          |
| ------------------- | ----------------------------------------------------- |
| `npm run dev`       | Vite dev server with hot reload                       |
| `npm run build`     | Typecheck, then produce a production build in `dist/` |
| `npm run preview`   | Serve the production build locally                    |
| `npm run typecheck` | TypeScript only, no bundling                          |
| `npm run lint`      | Oxlint                                                |
| `npm run format`    | Rewrite files with Prettier                           |
| `npm run check`     | Typecheck + lint + format check — run before pushing  |

## Project structure

```
src/
├── main.tsx              entry point; mounts <App>
├── App.tsx               app shell: owns the Viewer, decides which panel is open
├── cesium/               the Cesium Viewer itself, and scene-wide concerns
│   ├── CesiumMap.tsx       creates/destroys the Viewer; the React↔Cesium bridge
│   ├── initialView.ts      where the camera starts — usually your first edit
│   ├── theme.ts            the few design tokens mirrored as Cesium.Color
│   ├── mapLabels.ts        HTML labels anchored to world positions
│   ├── cancelCameraInertia.ts  stops the globe gliding after a custom drag
│   └── useSceneMode.ts     the 2D/3D toggle
├── features/             one folder per feature; each owns its own state + UI
│   ├── ogc-layers/         WMS / WMTS / XYZ imagery, and WFS vector features
│   ├── tiles-3d/           3D Tiles datasets
│   ├── layer-manager/      one list of everything on the map, with draw order
│   └── drawing/            point/line/polygon/measure/label tools
├── ui/                   shared, feature-agnostic building blocks
│   ├── Panel.tsx           the floating side-panel shell every feature uses
│   ├── Field.tsx           labeled input/select rows
│   ├── ResourceList.tsx    the "things added to the map" list
│   ├── Toolbar.tsx         top-left toolbar + its panel registry
│   └── panels.ts           PanelId — every panel the app can open
├── lib/                  small shared helpers with no UI or Cesium ties
└── styles/               design tokens + the global reset
```

The rule of thumb: **feature code goes in `src/features/<name>/`, and
everything in there — types, state hook, panel, form, list — stays
together.** `src/ui/` holds only things two or more features share. See
[docs/adding-a-feature.md](docs/adding-a-feature.md) for the recipe.

## Documentation

- **[docs/architecture.md](docs/architecture.md)** — how React and Cesium
  are bridged, how state flows, and the invariants that keep them in sync.
  Read this first.
- **[docs/adding-a-feature.md](docs/adding-a-feature.md)** — a step-by-step
  recipe for adding a new feature panel, following the existing patterns.
- **[docs/conventions.md](docs/conventions.md)** — code style, naming, CSS,
  and commenting rules.
- **[CLAUDE.md](CLAUDE.md)** — the same rules condensed for coding agents.

Source files are commented to explain _why_, not just _what_ —
[src/cesium/CesiumMap.tsx](src/cesium/CesiumMap.tsx) and
[src/features/ogc-layers/](src/features/ogc-layers) are the best places to
start reading.

## Branching into your own app

This is a starting point, not a framework. Common first moves:

- Change the starting camera in
  [src/cesium/initialView.ts](src/cesium/initialView.ts).
- Swap the base imagery in
  [src/cesium/CesiumMap.tsx](src/cesium/CesiumMap.tsx) for your own basemap.
- Delete a feature folder you don't need, plus its entry in the `PANELS`
  registry in [src/ui/Toolbar.tsx](src/ui/Toolbar.tsx) and its element in
  `App.tsx`. Nothing else references it.
- Retheme by editing [src/styles/tokens.css](src/styles/tokens.css), the
  values mirrored for Cesium in [src/cesium/theme.ts](src/cesium/theme.ts),
  and the font `<link>` in `index.html`.
- Wire in Cesium ion (`Cesium.Ion.defaultAccessToken = "..."`) if you decide
  you want ion-hosted terrain, imagery, or 3D Tiles after all.

## Tooling

Built with [Vite](https://vite.dev/), linted with [Oxlint](https://oxc.rs),
formatted with [Prettier](https://prettier.io).
