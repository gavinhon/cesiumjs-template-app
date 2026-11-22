# Architecture

Read this before writing code. Almost every non-obvious decision in this
codebase follows from one fact: **Cesium is not a React library.**

## The core problem: two rendering models

`Cesium.Viewer` is a class, not a component. You hand it a DOM element and
it takes over: it creates a WebGL context, runs its own render loop at
~60fps, and holds mutable collections of things to draw
(`viewer.imageryLayers`, `viewer.scene.primitives`, `viewer.entities`).

React is the opposite: declarative, immutable-ish state, re-render on
change. There is no way to "render" a Cesium layer as JSX.

So this app doesn't try. Instead it keeps two parallel worlds in
deliberate, explicit sync.

```
┌──────────────────────────────── App.tsx ────────────────────────────────┐
│  useState<Viewer | null>  ◄────── onViewerReady ────── <CesiumMap>      │
│         │                                                    │          │
│         │  viewer passed down                                │ owns     │
│         ▼                                                    ▼          │
│  ┌─────────────────┐  ┌─────────────────┐          ┌──────────────────┐ │
│  │ useMapServices    │  │ useModels     │   ...    │ Cesium.Viewer    │ │
│  │  React list ────┼──┼─► mutates ──────┼──────────┤  imageryLayers   │ │
│  │  of layers      │  │  Cesium         │          │  scene.primitives│ │
│  └────────┬────────┘  └────────┬────────┘          │  entities        │ │
│           │ renders            │ renders           └──────────────────┘ │
│           ▼                    ▼                                        │
│    <LayerManagerPanel>  <AddDataPanel>  (via App)                       │
└─────────────────────────────────────────────────────────────────────────┘
```

## The four rules that follow from this

### 1. The Viewer is created once, imperatively, and lifted into state

[`src/cesium/CesiumMap.tsx`](../src/cesium/CesiumMap.tsx) creates the Viewer
inside a `useEffect` (targeting a `useRef`'d `<div>`) and destroys it in the
effect's cleanup. It then calls `onViewerReady(viewer)`, which is `App`'s
`setViewer`, so every sibling can reach the same instance.

Two consequences you must respect:

- **`viewer` is `null` on the first render(s).** Every hook and component
  that touches it takes `Cesium.Viewer | null` and bails early on `null`.
  Don't assume it exists.
- **The Viewer must be created exactly once.** React StrictMode
  double-invokes effects in development; `CesiumMap` guards against that
  with a ref. Don't add dependencies to that effect that change over time.

### 2. Every feature owns its Cesium objects through one hook

A feature that puts things on the map has a hook — `useMapServices`,
`useModels`, `useDrawingTools` — and that hook is the _only_ place that
touches the corresponding Cesium collection.

The hook holds a React state array whose entries pair the user's config
with the live Cesium object:

```ts
interface ManagedLayer {
  config: MapServiceConfig; // what the user asked for (serialisable)
  cesiumLayer: Cesium.ImageryLayer; // the live object (not serialisable)
  visible: boolean;
  alpha: number;
}
```

**Invariant: every action performs the Cesium side effect _and_ updates the
React array, in the same function.** If you only do one, the panel and the
globe disagree, and that class of bug is miserable to track down. Look at
`removeLayer` in [`useMapServices.ts`](../src/features/map-services/useMapServices.ts):
it removes from `viewer.imageryLayers` and filters the state array together.

#### The exception: non-idempotent Cesium calls

Several actions here run their Cesium call _inside_ the `setState` updater,
which is convenient because the updater already has the current array. That
is only safe because those calls are idempotent — assigning `show = true`
twice, or removing an already-removed layer, changes nothing the second
time.

React StrictMode deliberately **double-invokes state updater functions** in
development to flush out impure ones. So an updater containing
`imageryLayers.raise(layer)` would move the layer _two_ positions while the
array recorded one, silently desynchronising them. `moveImagery` therefore
computes from the current state and calls Cesium outside the updater.

The rule: **side effects in an updater must be idempotent, or they belong
outside it.**

#### When two components need the same feature state

A feature hook must be called in exactly one place. Two `useMapServices()`
calls means two independent React states mutating one Cesium collection,
and neither would see the other's changes.

The layer manager shows the same layers the Add data panel adds, so
`useMapServices` and `useModels` are called in `App.tsx` and their state is
passed down. A feature only used by its own panel keeps its hook inside
that panel — don't lift pre-emptively.

### 3. Per-frame data lives in refs, not state

`useDrawingTools` keeps in-progress vertices, the cursor position, and the
preview entity in `useRef`, not `useState`. That data feeds a Cesium
`CallbackProperty` evaluated on every rendered frame — putting it in state
would trigger a React re-render 60 times a second for something React
doesn't draw.

Rule: **if Cesium reads it every frame, it's a ref. If React renders it,
it's state.** `activeTool` is deliberately both — state for the toolbar's
highlight, a mirrored ref for the event handlers.

There is a related trap documented at length in
[`useDrawingTools.ts`](../src/features/drawing/useDrawingTools.ts): a
`CallbackProperty` is fine for geometry (it just refills a vertex buffer)
but must not drive `label.text`, which re-rasterises a glyph texture on
every change.

### 4. UI floats over the map; it never lays out beside it

The Cesium canvas is `position: absolute; inset: 0` and fills the viewport.
Every panel and toolbar is absolutely positioned on top of it with a
`z-index`. Nothing uses flex/grid to split the screen, because shrinking
Cesium's canvas means it resizes its render buffer and re-picks
level-of-detail tiles.

Panels also **stay mounted while closed** — only CSS changes. Unmounting
would throw away in-progress form input and the feature's list of added
resources.

## State ownership, in one table

| State                        | Lives in                    | Why there                                              |
| ---------------------------- | --------------------------- | ------------------------------------------------------ |
| The `Viewer` instance        | `App.tsx` (`useState`)      | Every feature needs it; created by a child             |
| Which panel is open          | `App.tsx` (`useState`)      | Toolbar toggles it, panels read it; only one at a time |
| OGC layers, 3D tilesets      | `App.tsx` (feature hooks)   | The layer manager shows them too, so one owner only    |
| Selected terrain             | `useTerrain`, in `App`      | One slot, not a list; the layer manager picks it       |
| Datasets found in `public/`  | `PUBLIC_DATASETS` constant  | Baked in at build time; can't change without a reload  |
| Drawing tools                | `useDrawingTools`, in `App` | Only the drawing toolbar uses it                       |
| In-progress drawing vertices | `useDrawingTools` refs      | Read per frame by Cesium, never rendered by React      |
| Form input                   | that form's component       | Local until submitted                                  |

There is no global store, no context, and no router. If you find yourself
wanting one, that's a real signal — but reach for it deliberately, and
write down why.

## Imagery has a draw order; the rest of the scene doesn't

`viewer.imageryLayers` is an ordered collection painted onto the globe
surface in sequence, so "above" and "below" are literal: index 0 is drawn
first and everything after covers it. Raising a layer is genuinely how you
uncover one that's hidden, which is what the layer manager's reorder
controls do (`imageryLayers.raise`/`lower`).

3D Tiles and vector data are different in kind. They're geometry positioned
in space and rasterised through the depth buffer — what ends up in front is
decided by where the camera is, not by position in a list. `scene.primitives`
and `viewer.dataSources` have an order, but changing it doesn't reliably
change what you see.

So the layer manager offers reordering for imagery only, and says why in
its own UI. Don't add up/down arrows to the scene-data section: they'd be
controls that visibly do nothing.

## Datasets in `public/`: discovered at build time

A browser can't list a folder on a web server — HTTP has no "what's under
/tilesets/?" request — so the app can't discover datasets by itself.
Something that can read the disk has to look ahead of time.

That something is `vite-plugins/publicDatasetCatalog.ts`. Vite already
reads `public/` to serve and copy it, so the plugin scans it at the same
moment — when the dev server starts, and on every build — and exposes the
result as a generated module, `virtual:public-datasets`. The app reads it
through `src/lib/publicDatasets.ts` as an ordinary constant:

```
public/  ──scan──▶  vite-plugins/publicDatasetCatalog.ts
                           │  (build time, Node)
                           ▼
                   virtual:public-datasets      plain JSON, baked into the bundle
                           │
                           ▼
                   src/lib/publicDatasets.ts    PUBLIC_DATASETS, publicDatasetsOfKind()
                           │
          ┌────────────────┼──────────────────┐
          ▼                ▼                  ▼
   modelQuickAdd    mapServiceQuickAdd       useTerrain
   ('3d-tiles')       ('xyz','geojson') ('terrain')
          └──── Add data catalogue ───┘
```

Each panel filters by kind and passes the result to the shared
`<QuickAddList>`, which adds a dataset through the feature's existing
`add…` function. Nothing about loading is new: a scanned 3D Tiles folder is
added exactly as if you'd typed its URL into the form. The only difference
is the id — a scanned dataset is added under its catalog id (`public:<path>`)
rather than a fresh one, which is how the list knows it's already on the map.

Because the catalog is data baked into the bundle, it's a constant rather
than state. In dev, the plugin watches `public/` and reloads the page when a
dataset appears or disappears, so the constant is never stale for long.

The Docker image is the exception that proves the rule: its datasets are a
host folder mounted in after the image was built, so the scan can't run at
build time. The container runs the same `scanPublicFolder` when it starts
(`scripts/writeRuntimeConfig.ts`) and writes `datasets.json`;
`app-config.json` tells the app to fetch that instead of using the baked-in
list. `publicDatasets.ts` does the fetch with a top-level `await`, so the
result is still a constant by the time any feature reads it. The same
`app-config.json` carries the deployment's one offline switch — see
[deployment-docker.md](deployment-docker.md#how-it-works).

## Terrain is one slot, not a layer

The globe has exactly one surface, so the terrain provider is a single
value — there's no stack to add to and nothing to reorder. `useTerrain`
therefore holds a _selection_, and the layer manager shows a picker rather
than rows with checkboxes. "None" means `EllipsoidTerrainProvider`: the
smooth WGS84 ellipsoid the app uses when there's no elevation data.

It's applied the way Cesium currently recommends — `scene.setTerrain(new
Cesium.Terrain(CesiumTerrainProvider.fromUrl(url, { requestVertexNormals:
true })))` — rather than awaiting a provider and assigning it.
`setTerrain` cancels a still-loading terrain when another is chosen, so a
slow first choice can't land after a fast second one. The vertex normals
feed a hillshade that's on whenever real terrain is: without it, terrain
changes the globe's shape but not its colour, and from overhead you can't
see it at all. The light it uses (`src/cesium/hillshadeLight.ts`) replaces
Cesium's real-time sun for the life of the viewer, pinned to a fixed angle
relative to the camera, so 3D models aren't black whenever it's night where
they are.

Terrain changes things that sit on it:

- **Drawing picks the rendered surface**, not the ellipsoid, so vertices
  land on the hillside — or the rooftop — under the cursor. Picking the
  ellipsoid would put them tens of metres underground, which looks right
  from directly above and slides away from the click as soon as the camera
  tilts. `src/cesium/pickSurface.ts` combines `globe.pick` (exact, terrain
  only) with `scene.pickPosition` (sees buildings, depth-buffer precision);
  read its comment before changing how clicks become positions.
- **Vector data is clamped** (`clampToGround`), so GeoJSON and WFS drape
  over the terrain instead of floating at height zero inside it.
- **3D Tiles are set on the terrain** (`src/features/models-3d/placeTilesetOnTerrain.ts`).
  A tileset carries its own heights, and most BIM exports and CityGML
  conversions are authored for flat ground at 0 — while the real ground
  here is 10–20 m above the ellipsoid. Left alone they sit sunk into it
  (still visible, since Cesium draws 3D Tiles over terrain by default, but
  misregistered against the imagery and unclickable at roof level). So
  each tileset is moved vertically, via `modelMatrix`, until its lowest
  point meets the lowest ground beneath it — and moved again whenever the
  terrain changes. A model entirely below the surface is taken to be
  underground and left as authored; the 3D Tiles list has a per-model
  switch, and a tileset can declare `"extras": { "placement": "as-authored" }`.
  It's one rigid shift per tileset: a city spread over hills can't drop
  each building onto its own ground — that still needs the model's own
  georeferencing.

## Measurement and analysis are drawings too

The measure, height, line-of-sight and viewshed tools produce
`DrawnFeature`s like any other shape, so they get everything drawings get
for free: they're listed in the Drawings panel, can be named, attributed,
selected and reshaped by dragging their vertices, and the discard button
clears them. Their computed result is the feature's `measurement`, which is
what the map label shows by default.

**CesiumJS has no line-of-sight or viewshed API.** It has the pieces —
terrain sampling (`sampleTerrainMostDetailed`), scene sampling
(`scene.sampleHeightMostDetailed`) — and `lineOfSight.ts` and `viewshed.ts`
build the analyses from them, using public APIs only so they survive Cesium
upgrades. The trade-off worth knowing:

|                               | Line of sight              | Viewshed                         |
| ----------------------------- | -------------------------- | -------------------------------- |
| Blocked by terrain            | yes                        | yes                              |
| Blocked by 3D Tiles buildings | yes (scene height samples) | no — terrain only                |
| Cost                          | a few hundred samples      | ~100,000 samples, about a second |

A building-aware viewshed needs GPU shadow mapping, which in CesiumJS means
private `ShadowMap` internals and a custom shader. That's a reasonable
extension, but it breaks across Cesium releases, so it's not in a template.

Analyses are async. A feature shows "Analysing…" until its result arrives,
and dragging one of its vertices re-runs it; each run is numbered so only
the newest result for a feature is ever applied.

## Why no Cesium ion

Cesium's convenience APIs (`createWorldImagery`, world terrain, the
geocoder, the base-layer picker) all call Cesium ion and need an access
token. This template targets people connecting to their _own_ OGC services,
so its basemaps are public keyless services (`src/cesium/basemaps.ts`)
and its default surface is the plain WGS84 ellipsoid,
and explicitly clears `Cesium.Ion.defaultAccessToken` so any accidental ion
call fails loudly rather than silently riding on Cesium's shared public demo
token.

If you want ion, set the token in `CesiumMap.tsx` and the convenience APIs
become available — nothing else in the codebase assumes its absence.

Terrain doesn't need ion either. `CesiumTerrainProvider` — despite the name
— reads any static folder with a `layer.json`; ion is just one server that
speaks that format. `scripts/build_terrain_tiles.py` writes one from a
GeoTIFF, and the app loads it from `public/`.

## CORS, the thing that will actually bite you

Browsers block cross-origin requests without permissive
`Access-Control-Allow-Origin` headers, and WebGL additionally refuses to
texture from a cross-origin image without CORS. This affects:

- WMS GetCapabilities lookups (`fetch`)
- imagery tiles from any WMS/WMTS/XYZ server
- `tileset.json` and every tile a 3D Tiles dataset pulls

A layer failing to appear is far more often a CORS problem than a bug in
this code. Check the browser's network tab first. Datasets served from this
app's own `public/` folder are same-origin and sidestep the issue entirely.
