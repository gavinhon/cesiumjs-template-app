# CesiumJS + Vite + React Template

A starter app for building CesiumJS map apps: React 19, Vite, TypeScript, and
CesiumJS, wired up **without** a Cesium ion account.

## What you get

- **A full-screen 3D globe**, camera pre-aimed at Singapore, with none of
  Cesium's built-in widgets (no toolbar, timeline, or search box) — the map
  itself is the UI.
- **No Cesium ion dependency.** The base imagery is Esri World Imagery,
  from Esri's keyless public service; terrain is a DTM you drop into
  `public/`, or the plain WGS84 ellipsoid. No token, no account, no signup.
- **A map services panel** for connecting to OGC WMS, WMTS and XYZ raster
  services and WFS vector features, and to Esri ArcGIS REST services
  (ArcGIS Server, Enterprise and Online): MapServer imagery, cached or
  dynamic, and FeatureServer or MapServer layers as vector data, with an
  optional token for secured services. It can look up a server's real layer
  names, feature types and extents. Free public Singapore services on
  ArcGIS Online are listed at the top, one click each, so you can try them
  without finding endpoints first.
- **A layer list** (top-right) of everything you've added, with
  visibility toggles, opacity, legends, double-click-to-zoom, and
  drag-to-reorder for imagery that reorders Cesium's real imagery stack, so
  you can uncover a layer hidden underneath another.
- **Five basemaps** needing no key, switched from the basemap tile (bottom-left) or the layer list:
  OpenStreetMap from openstreetmap.org's own tile servers, the same map in
  grey, Sentinel-2 cloudless satellite imagery over WMS from
  [EOX](https://s2maps.eu) (10 m pixels, non-commercial use only), and
  Esri's World Imagery (sub-metre in cities; the default) and Dark Gray
  Canvas. Esri's
  public basemaps need no key, but check Esri's terms of use before using
  them commercially. Each provider's credit is shown on the
  map, as their terms require; add your own basemaps in
  `src/cesium/basemaps.ts`.
- **3D buildings and models** — 3D Tiles and Esri I3S — from the **Add data**
  panel: one-click from its catalogue, or by URL under its "3D service" tab.
  3D Tiles load from a `tileset.json` URL: a remote service, an
  S3/CloudFront bucket, or a dataset dropped under this app's `public/`.
  Models are set on the terrain automatically — BIM and city models are
  usually authored for flat ground at height 0, which real terrain rarely
  is — except underground ones (anything lying entirely below the
  surface), which keep their authored depth. Each has an "On terrain"
  switch; a dataset can also declare
  `"extras": { "placement": "as-authored" }` in its `tileset.json`.
  **I3S scene layers** (ArcGIS `SceneServer`
  meshes, 3D objects and building layers), corrected from sea-level to
  ellipsoid heights with Esri's public EGM2008 geoid service and left at
  their georeferenced position. A tileset wider than a city (a worldwide
  buildings layer) is left where it's authored, and the camera stays put.
  City layers built on flat ground — HDB LoD2, and Esri's OSM buildings,
  which say they're ground-relative — are **draped**: a shader stands
  each building on the terrain beneath it, since no single shift fits a
  hilly island. The same "On terrain" switch drapes any I3S layer, or a
  tileset too large to move as one piece. The terrain hides whatever is
  below its surface, so nothing shows through the ground.
  Click any part of a 3D Tiles model — a wall, slab or beam of a BIM
  model, a building in a city model — to highlight it and see its
  attributes: for an IFC conversion, its name, IFC class, GlobalId and
  property sets.
  The catalogue offers public Singapore datasets, badged by format:
  HDB blocks, building shells and a single development as I3S, and
  worldwide OSM buildings two ways:
  [Re:Earth Buildings](https://buildings.reearth.land/) as 3D Tiles (click
  and filter them) and Esri's OpenStreetMap 3D Buildings as I3S (roof
  shapes where OSM tags them).
- **Drawing tools**, from the **Draw** menu on the right rail: place points
  (each shows its elevation), draw lines and polygons, drop text labels.
  Selecting a line shows its **ground profile** along the terrain. Live previews throughout: a marker showing where the next
  click lands, rubber-band edges to the cursor, a dot on each placed vertex,
  Backspace to undo one, Esc to abandon. Nothing is persisted; a reload
  clears it.
- **3D measurement and analysis**, from the **Measure and analyse** menu.
  Every click lands on whatever is under the cursor — terrain or a 3D Tiles
  rooftop — so measurements are genuinely 3D:
  - **Distance** along a path, in true 3D length. Where the path climbs
    noticeably — up a hill, or street to roof — the readout adds the
    horizontal distance a flat map would give ("52.3 m · 41.0 m horizontal").
  - **Height** between two points: the straight-line distance on the map.
    Click the line and, where it runs on a slant, it opens into a right
    triangle with how far up or down and how far across ("7.4 m down",
    "10.5 m horizontal"). Click a roof, then the street, and you've
    measured the building.
- **Filter a BIM model.** A model's "…" in the layer list offers its
  parts' own attributes — IFC class, material, a floor or level where the
  model has one — so you can show only the walls, or one storey. A height
  cut slices the model so you can look into a floor from above, even when
  the model doesn't say which floor a part is on.
  - **Line of sight**: is one point visible from another — a window from
    the street, a rooftop from a hill? It runs from exactly the point you
    pick. The
    sight line is cyan where clear and red past the first obstruction —
    terrain or building.
- **Datasets in `public/` show up on their own.** A build-time scan finds
  3D Tiles, terrain, image tile pyramids and GeoJSON files under `public/`
  and lists them in the panel that loads each one — one click to add, no
  URL to type. Drop a folder in while the dev server runs and the page
  reloads with it listed.
- **Local terrain, still without ion.** A script turns an elevation GeoTIFF
  (a DTM or DSM) into a static terrain tileset under `public/terrain/`;
  the app loads it at startup and the layer list's terrain row switches between it
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

## Deploying to GitHub Pages

`.github/workflows/deploy-pages.yml` builds the app and publishes it on
every push to `main`. One-time setup: in the repository's **Settings →
Pages**, set **Source** to **GitHub Actions**. The site then appears at
`https://<user>.github.io/<repo>/`.

Pages can't serve the repository directly — `index.html` points at
`/src/main.tsx`, which only Vite's dev server understands, so an unbuilt
deploy is a blank page. The build uses a relative base (`base: './'` in
`vite.config.ts`), so it works under any repository name with no
configuration; `vite.config.ts` explains why an absolute sub-path would
break Cesium's web workers.

Datasets in `public/` are gitignored, so the deployed site only has the
ones you've committed — which is the Singapore terrain
(`public/terrain/singapore-gem15-dtm`, 29 MB), tracked deliberately so the
site opens on real elevation, and a small BIM model
(`public/af1-gpt61sol`, 384 KB) to click and filter. Large datasets are better hosted elsewhere —
any CORS-enabled static host — and loaded by URL.

## Deploying offline with Docker

For a network with no internet access, the app runs as a Docker image
(nginx serving the build) with its datasets in a host folder mounted
read-only — scanned when the container starts, so adding data needs a
restart, not a rebuild. `APP_OFFLINE=true` swaps the online basemaps for
local tile pyramids and hides everything else that needs the internet;
place search can use your own Nominatim server. A second image runs the
terrain script with its geoid grid built in.
[docs/deployment-docker.md](docs/deployment-docker.md) covers building,
`docker save`/`load`, and running on Windows.

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
│   ├── add-data/           Add data: the catalogue and the connect-by-URL tabs
│   ├── map-services/         map services: OGC, ArcGIS, XYZ and GeoJSON layers
│   ├── models-3d/           3D Tiles datasets and I3S scene layers
│   ├── terrain/            which elevation surface the globe uses
│   ├── layer-manager/      one list of everything on the map, with draw order
│   └── drawing/            point/line/polygon/measure/label tools
├── ui/                   shared, feature-agnostic building blocks
│   ├── Panel.tsx           the floating side-panel shell every feature uses
│   ├── Field.tsx           labeled input/select rows
│   ├── ResourceList.tsx    list rows: the drawings'
│   ├── QuickAddList.tsx    the one-click "ready to add" list atop a data panel
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
src/features/map-services/
├── mapServiceTypes.ts          the data model: what the *user* configured
├── useMapServices.ts           state + Cesium sync — the heart of the feature
├── mapServiceQuickAdd.ts    its one-click entries in the Add data catalogue
├── AddMapServiceForm.tsx       add a new layer
├── createImageryProvider.ts  turns a WMS/WMTS/XYZ/ArcGIS config into imagery
├── createVectorDataSource.ts turns a WFS/ArcGIS/GeoJSON config into features
├── fetchWmsLayers.ts         ask a WMS server what layers it serves
├── fetchWfsFeatureTypes.ts   ask a WFS server what feature types it serves
├── capabilitiesXml.ts        XML parsing helpers those two lookups share
├── arcGisRest.ts             ArcGIS REST URLs and responses, as pure functions
└── …                         one small file per remaining step
```

Filenames are unique across the whole repo and say what is inside them, so a
name in an editor tab or a search result identifies its file without the
directory around it. `AddModelForm.tsx` and `modelTypes.ts` are the 3D
Tiles feature's equivalents of the two above. The full standard is in
[docs/coding-conventions.md](docs/coding-conventions.md#file-and-folder-naming);
[docs/adding-a-feature.md](docs/adding-a-feature.md) is the recipe for
building a new one.

## Using your own data

Anything you put under `public/` is served by the app at the same path,
same-origin — so none of the CORS trouble remote services cause. On top of
that, the app scans `public/` when the dev server starts (and on every
build) and offers what it recognises in the right place:

| Put this under `public/`                           | Recognised as | Offered in           |
| -------------------------------------------------- | ------------- | -------------------- |
| a folder containing `tileset.json`                 | 3D Tiles      | Add data catalogue   |
| a folder containing a terrain `layer.json`         | terrain       | layer list → Terrain |
| a folder of image tiles laid out `{z}/{x}/{y}.png` | XYZ imagery   | Add data catalogue   |
| a `.geojson` file                                  | vector data   | Add data catalogue   |

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
[src/features/map-services/](src/features/map-services) are the best places to
start reading.

## Branching into your own app

This is a starting point, not a framework. Common first moves:

- Change the starting camera in
  [src/cesium/initialView.ts](src/cesium/initialView.ts).
- Add or replace basemaps in
  [src/cesium/basemaps.ts](src/cesium/basemaps.ts); the first is the one
  the app starts with.
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
