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
  Models are set on the terrain automatically — BIM and city models are
  usually authored for flat ground at height 0, which real terrain rarely
  is — except underground ones (anything lying entirely below the
  surface), which keep their authored depth. Each has an "On terrain"
  switch; a dataset can also declare
  `"extras": { "placement": "as-authored" }` in its `tileset.json`.
- **Drawing tools**: place points (each shows its elevation), draw lines
  and polygons, drop text labels — plus a 2D/3D toggle, since the tools
  work in both. Live previews throughout: a marker showing where the next
  click lands, rubber-band edges to the cursor, a dot on each placed vertex,
  Backspace to undo one, Esc to abandon. Nothing is persisted; a reload
  clears it.
- **3D measurement and analysis**, in a second group on the right rail.
  Every click lands on whatever is under the cursor — terrain or a 3D Tiles
  rooftop — so measurements are genuinely 3D:
  - **Distance** along a path, in true 3D length. Where the path climbs
    noticeably — up a hill, or street to roof — the readout adds the
    horizontal distance a flat map would give ("52.3 m · 41.0 m horizontal").
  - **Height** between two points: how far up or down, and how far across
    ("10.2 m up · 4.1 m horizontal"), drawn as a right triangle. Click a
    roof, then the street, and you've measured the building.
  - **Line of sight**: can someone standing at one point see another? The
    sight line is cyan where clear and red past the first obstruction —
    terrain or building.
  - **Viewshed**: everything visible from a point within a radius, draped
    on the terrain — cyan where visible, shaded where hidden.
- **Datasets in `public/` show up on their own.** A build-time scan finds
  3D Tiles, terrain, image tile pyramids and GeoJSON files under `public/`
  and lists them in the panel that loads each one — one click to add, no
  URL to type. Drop a folder in while the dev server runs and the page
  reloads with it listed.
- **Local terrain, still without ion.** A script turns an elevation GeoTIFF
  (a DTM or DSM) into a static terrain tileset under `public/terrain/`;
  the app loads it at startup and the layer manager switches between it
  and the flat ellipsoid. See [Using your own data](#using-your-own-data).
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

| Command             | What it does                                                 |
| ------------------- | ------------------------------------------------------------ |
| `npm run dev`       | Vite dev server with hot reload                              |
| `npm run build`     | Typecheck, then produce a production build in `dist/`        |
| `npm run preview`   | Serve the production build locally                           |
| `npm run typecheck` | TypeScript only, no bundling                                 |
| `npm run lint`      | Oxlint                                                       |
| `npm run format`    | Rewrite files with Prettier                                  |
| `npm test`          | Run the unit tests once (`test:watch` to keep going)         |
| `npm run check`     | Typecheck + lint + format check + tests — run before pushing |

## Project structure

```
src/
├── main.tsx              entry point; mounts <App>
├── App.tsx               app shell: owns the Viewer, decides which panel is open
├── cesium/               the Cesium Viewer itself, and scene-wide concerns
│   ├── CesiumMap.tsx           creates/destroys the Viewer; the React↔Cesium bridge
│   ├── initialView.ts          where the camera starts — usually your first edit
│   ├── mapColors.ts            the few design tokens mirrored as Cesium.Color
│   ├── mapLabels.ts            HTML labels anchored to world positions
│   ├── cancelCameraInertia.ts  stops the globe gliding after a custom drag
│   └── useSceneMode.ts         the 2D/3D toggle
├── features/             one folder per feature; each owns its own state + UI
│   ├── ogc-layers/         WMS / WMTS / XYZ imagery; WFS and GeoJSON vectors
│   ├── tiles-3d/           3D Tiles datasets
│   ├── terrain/            which elevation surface the globe uses
│   ├── layer-manager/      one list of everything on the map, with draw order
│   └── drawing/            point/line/polygon/measure/label tools
├── ui/                   shared, feature-agnostic building blocks
│   ├── Panel.tsx           the floating side-panel shell every feature uses
│   ├── Field.tsx           labeled input/select rows
│   ├── ResourceList.tsx    the "things added to the map" list
│   ├── PublicDatasetList.tsx  the "already in public/" one-click list
│   ├── AppToolbar.tsx      top-left toolbar + its panel registry
│   └── panelIds.ts         PanelId — every panel the app can open
├── lib/                  small shared helpers with no UI or Cesium ties
│   └── publicDatasets.ts   PUBLIC_DATASETS — what the scan of public/ found
└── styles/               designTokens.css — palette, type scale, control sizing
                          global.css      — reset + the .control primitives

vite-plugins/
└── publicDatasetCatalog.ts  scans public/ at build time (browsers can't list folders)
scripts/
└── build_terrain_tiles.py   elevation GeoTIFF → static Cesium terrain tiles
public/                   static files served as-is, including datasets to offer
```

The rule of thumb: **feature code goes in `src/features/<name>/`, and
everything in there — data model, state hook, panel, form, list — stays
together.** `src/ui/` holds only what two or more features share, and a
feature never imports from another feature.

### Inside a feature folder

Every feature has the same shape, so once you can read one you can read all
of them:

```
src/features/ogc-layers/
├── ogcLayerTypes.ts          the data model: what the *user* configured
├── useOgcLayers.ts           state + Cesium sync — the heart of the feature
├── OgcLayerPanel.tsx         entry point; composes the form and the list
├── AddOgcLayerForm.tsx       add a new layer
├── OgcLayerList.tsx          manage the layers already added
├── createImageryProvider.ts  turns a WMS/WMTS/XYZ config into imagery
├── createWfsDataSource.ts    turns a WFS config into vector features
├── fetchWmsLayers.ts         ask a WMS server what layers it serves
├── fetchWfsFeatureTypes.ts   ask a WFS server what feature types it serves
└── capabilitiesXml.ts        XML parsing helpers those two lookups share
```

Filenames are unique across the whole repo and say what is inside them, so a
name in an editor tab or a search result identifies its file without the
directory around it. `AddTilesetForm.tsx` and `tilesetTypes.ts` are the 3D
Tiles feature's equivalents of the two above. The full standard is in
[docs/coding-conventions.md](docs/coding-conventions.md#file-and-folder-naming);
[docs/adding-a-feature.md](docs/adding-a-feature.md) is the recipe for
building a new one.

## Using your own data

Anything you put under `public/` is served by the app at the same path,
same-origin — so none of the CORS trouble remote services cause. On top of
that, the app scans `public/` when the dev server starts (and on every
build) and offers what it recognises in the right panel:

| Put this under `public/`                           | Recognised as | Offered in              |
| -------------------------------------------------- | ------------- | ----------------------- |
| a folder containing `tileset.json`                 | 3D Tiles      | 3D Tiles panel          |
| a folder containing a terrain `layer.json`         | terrain       | layer manager → Terrain |
| a folder of image tiles laid out `{z}/{x}/{y}.png` | XYZ imagery   | OGC Layers panel        |
| a `.geojson` file                                  | vector data   | OGC Layers panel        |

The folder layout under `public/` is up to you — `public/tilesets/...` and
`public/terrain/...` are just tidy conventions. A recognised folder isn't
looked inside, so a tile pyramid of any size costs nothing to scan.

**Datasets are not committed.** `.gitignore` excludes every folder under
`public/` and every `.geojson` file in it. Datasets are large, often
thousands of files, and can be regenerated from their sources. A fresh
clone therefore starts with nothing to offer in these lists until you add
your own. Loose files at the top of `public/`, such as a favicon, are still
tracked.

### Elevation: from GeoTIFF to terrain

Cesium can't read a GeoTIFF as terrain. It streams terrain as a pyramid of
small tiles, the same way it streams imagery, so a raster has to be cut
into that pyramid once, ahead of time. That's not tied to Cesium ion: the
result is a plain folder that any static host — including this app's
`public/` — can serve.

```bash
pip install rasterio numpy scipy pyproj pydelatin
```

```bash
python scripts/build_terrain_tiles.py path/to/dtm.tif public/terrain/my-dtm --name "My DTM" --attribution "Elevation: whoever made it"
```

It writes Cesium's recommended terrain format, **quantized-mesh** — the
same one Cesium ion serves: each tile is a simplified triangle mesh (flat
ground becomes a few large triangles, hillsides keep their detail) carrying
per-vertex normals, which the app uses to hillshade the terrain so relief is
visible from above. Along the way the script:

- picks the tile depth from the data's resolution;
- converts heights from mean sea level to the WGS84 ellipsoid Cesium
  measures from (pass `--vertical-datum ellipsoid` if your data already is);
- fills gaps in the data — the sea is set to sea level, and lakes and
  reservoirs to a flat surface at their shoreline height, rather than
  leaving them as deep pits.

Its header comment explains the format in detail. The first terrain found
is loaded at startup; pick another, or none, under **Terrain** in the layer
manager.

Generated tiles are build output, not source: a 15 m DTM of Singapore is
about 3,400 files and 23 MB. They're ignored by git with the rest of
`public/`'s datasets; regenerate them from the GeoTIFF with the command
above.

## Documentation

- **[docs/architecture.md](docs/architecture.md)** — how React and Cesium
  are bridged, how state flows, and the invariants that keep them in sync.
  Read this first.
- **[docs/adding-a-feature.md](docs/adding-a-feature.md)** — a step-by-step
  recipe for adding a new feature panel, following the existing patterns.
- **[docs/coding-conventions.md](docs/coding-conventions.md)** — the file
  naming standard, plus imports, TypeScript, React, CSS, and commenting
  rules.
- **[CLAUDE.md](CLAUDE.md)** — the same rules condensed for coding agents,
  with the invariants that cause real bugs when broken.

[docs/README.md](docs/README.md) indexes all four and says which to read
when.

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
  registry in [src/ui/AppToolbar.tsx](src/ui/AppToolbar.tsx) and its element in
  `App.tsx`. Nothing else references it.
- Drop your own 3D Tiles, terrain, tile pyramids or GeoJSON into `public/` —
  see [Using your own data](#using-your-own-data).
- Retheme by editing
  [src/styles/designTokens.css](src/styles/designTokens.css), the values
  mirrored for Cesium in [src/cesium/mapColors.ts](src/cesium/mapColors.ts),
  and the font `<link>` in `index.html`.
- Wire in Cesium ion (`Cesium.Ion.defaultAccessToken = "..."`) if you decide
  you want ion-hosted terrain, imagery, or 3D Tiles after all.

## Tooling

Built with [Vite](https://vite.dev/), linted with [Oxlint](https://oxc.rs),
formatted with [Prettier](https://prettier.io).
