# CLAUDE.md

Guidance for coding agents working in this repository.

## What this is

A CesiumJS + React 19 + Vite + TypeScript template app: a full-screen 3D
globe with panels for connecting to OGC map services and 3D Tiles datasets,
plus drawing/measurement tools. It deliberately uses **no Cesium ion
account** — OpenStreetMap raster imagery and the plain WGS84 ellipsoid.

It is a template other people will fork and learn from, so clarity and
consistency matter more here than they would in an app shipped once.

## Commands

```bash
npm run dev        # Vite dev server (prefer the preview tooling over raw shell)
npm run check      # typecheck + lint + format check + tests — run this before finishing
npm test           # Vitest unit tests only
npm run format     # apply Prettier
npm run build      # tsc -b && vite build
npm run test:terrain-script   # Python tests for scripts/build_terrain_tiles.py
```

Unit tests cover the logic (geometry, parsers, the `public/` scan, the
terrain encoder); map interactions are verified by running the app — see
[docs/testing.md](docs/testing.md) for both, including the manual checklist.
Put a test beside its module as `<module>.test.ts`; split logic from I/O to
make it testable (`parseWmsLayers` vs `fetchWmsLayers`).

## Layout

```
src/
  main.tsx, App.tsx    entry + shell (App owns the Viewer and which panel is open)
  cesium/              Viewer creation, initial camera, 2D/3D toggle, mapColors.ts mirror
  features/<name>/     one per feature: <name>Types + use<Name> + Panel + Add…Form + List
  ui/                  shared: Panel, Field, ResourceList, AppToolbar, panelIds.ts (PanelId)
  lib/                 shared helpers with no UI or Cesium ties; publicDatasets.ts
  styles/              designTokens.css (tokens) + global.css (reset, .control)
vite-plugins/          publicDatasetCatalog.ts — scans public/ at build time
scripts/               build_terrain_tiles.py — GeoTIFF → static Cesium terrain
public/                static files + datasets the scan offers in the panels
docs/                  README (index), architecture, adding-a-feature, coding-conventions
```

Filenames are unique across the repo and describe their contents, so a name
identifies its file without its directory. There is no `types.ts` or
`utils.ts` anywhere — see "File naming" below.

## Before you write code

Read [docs/architecture.md](docs/architecture.md). It explains the one thing
that drives every design decision here: Cesium owns its own imperative
render loop, so React state and Cesium state are kept in deliberate sync
rather than one deriving the other.

For a new feature, follow [docs/adding-a-feature.md](docs/adding-a-feature.md)
step by step. For style questions, [docs/coding-conventions.md](docs/coding-conventions.md).

## Invariants — breaking these causes real bugs

1. **`viewer` is `Cesium.Viewer | null`.** It's null until `<CesiumMap>`
   mounts. Every hook and component that takes it must bail early on null.
2. **A feature action mutates Cesium _and_ updates React state in the same
   function.** Doing only one makes the panel and the globe disagree.
   **But** if the Cesium call is not idempotent, it must happen _outside_
   the `setState` updater: StrictMode double-invokes updaters in dev, so
   `imageryLayers.raise()` inside one moves the layer two positions. Setting
   `.show`/`.alpha` or removing survives being run twice; reordering does
   not. See `moveImagery` in `useOgcLayers.ts`.
3. **The Viewer is created exactly once**, in a `useEffect` in
   `CesiumMap.tsx`, guarded against StrictMode's double-invoke. Don't add
   changing dependencies to that effect.
4. **Per-frame data goes in refs, not state.** Anything a Cesium
   `CallbackProperty` reads is evaluated ~60×/sec; state would re-render
   React that often. The same applies to the HTML label overlay, which
   repositions from `scene.postRender` — it writes to the DOM directly and
   never through React.
5. **Panels stay mounted while closed.** Only CSS changes. Unmounting
   discards in-progress form input and the feature's resource list.
6. **UI floats over the map**, absolutely positioned with a `z-index`.
   Never lay out beside the canvas — resizing it forces Cesium to rebuild
   its render buffer and re-pick LOD tiles.
7. **A feature hook is called in exactly one place.** Two `useOgcLayers()`
   calls would be two React states mutating one Cesium collection. When
   more than one component needs a feature's state (the layer manager needs
   the OGC panel's), the hook moves up to `App.tsx` and the state is passed
   down as props.
8. **Only the discard button removes finished drawings.** Switching tools
   _commits_ the shape in progress (if it has enough vertices to be one)
   rather than discarding it — reaching for another tool is not a request to
   delete work. Escape is the one explicit "throw this away"; pressed with
   nothing in progress, it exits the tool instead.
9. **Only imagery has a draw order.** `viewer.imageryLayers` is a real
   painter's-algorithm stack, so raise/lower genuinely uncovers layers. 3D
   Tiles and vector data are depth-sorted geometry — reordering them changes
   nothing on screen, so don't offer controls that claim otherwise.
10. **`src/main.tsx` imports `@/styles/global.css` before `@/App`.** Don't
    "fix" this to put the CSS import last. `.control-button` and a
    component's `.foo__button` have equal specificity, so source order
    decides; component styles can only override the shared `.control`
    primitives if the global sheet loads first. Getting this backwards
    collapsed the drawing toolbar's icon buttons to a 2px content box and
    stripped the accent styling off every submit button.

## Conventions in brief

- **Feature code stays in its folder.** A feature never imports from another
  feature; shared code moves to `src/ui/` or `src/lib/`.
- **Compose, don't copy.** Use `<Panel>`, `<Field>`/`<SelectField>`,
  `<ResourceList>`/`<ResourceRow>`, and the `.control` CSS classes rather
  than re-creating their markup. If you're about to duplicate UI structure
  from another feature, extract it into `src/ui/` instead.
- **File naming.** A module with one main export is named after it
  (`createImageryProvider.ts`, `fetchWmsLayers.ts`, `cancelCameraInertia.ts`);
  a module grouping several is named for the group, specifically enough to
  be unique repo-wide (`ogcLayerTypes.ts`, `capabilitiesXml.ts`,
  `drawnFeaturePresentation.ts`). Components are `PascalCase.tsx` exporting
  the identically-named component, with `FooProps` above it and `Foo.css`
  beside it whose BEM block is `.foo`. Parallel features use parallel names:
  `<Subject>Panel` / `Add<Subject>Form` / `<Subject>List` / `use<Subjects>` /
  `<subject>Types`. Never add a `types.ts`, `utils.ts`, `helpers.ts`, or
  `index.ts` — they make every search result ambiguous. Full standard and
  rationale: [docs/coding-conventions.md](docs/coding-conventions.md#file-and-folder-naming).
- **Imports:** `@/` alias across directories, relative within a feature,
  `import type` for types, CSS import last — _except_ in `src/main.tsx`,
  where `@/styles/global.css` must come before `@/App` (see invariant 10).
- **Colours come from `src/styles/designTokens.css`.** Raw hex in a component
  stylesheet is a bug. The few colours Cesium needs as `Cesium.Color` are
  mirrored in exactly one file, `src/cesium/mapColors.ts`. Change both together.
  Fonts are _not_ mirrored: nothing draws text through Cesium. On the map,
  colour says what a mark _is_: drawings `--accent` orange, measurements
  `--measure` near-white with a dark `--bg` casing (so they read on light
  streets), analyses `--sight` cyan, blocked sight lines `--danger`, WFS
  data `--vector` blue.
- **The UI is minimal and dark; orange is a signal, not a surface.** An
  active toggle, the primary button and a selected row are an orange label
  or edge over a faint `--accent-soft` tint — never a solid orange fill,
  never a glow. Hover is neutral (`--surface-hover`), so pointing at a
  button can't be mistaken for turning it on. The bright thing on screen
  should be the map.
- **Every interactive control is `var(--control-height)` tall.** Inputs,
  selects, buttons and the square icon buttons in both rails all share one
  height so the UI reads on a single rhythm; `--control-height-sm` is the
  one exception, for compact grid rows. Don't reintroduce a per-component
  height. The toolbar offset in `Panel.css` is `calc()`d from the same
  token, so changing it moves the panels to match.
- **The right rail wraps; it never scrolls or overflows.** On a screen too
  short for one column, `.app__right-rail` wraps into more columns
  (`flex-wrap: wrap-reverse`, so the first column stays at the edge). Each
  button group must therefore be a _direct_ child of the rail — that's why
  `DrawingToolbar` returns a fragment — and the right panel's offset comes
  from the rail's measured width (`--right-rail-width`, published by
  `useWidthAsCssVariable` in `App.tsx`), never from a fixed number.
- **Text on the map is HTML, not `Entity.label`.** Use
  `createMapLabelLayer` from `src/cesium/mapLabels.ts`.
- **A finished drawing is a `DrawnFeature`**, not a loose entity — see
  `src/features/drawing/drawingTypes.ts`. It carries a name, free-form key/value
  attributes, and a `labelSource` saying which of them the map label shows.
  Presentation (colour, selected look, label anchor/text, geometry rewrite)
  lives in `drawnFeaturePresentation.ts` as pure functions of that record.
  A feature made of several entities tags each with the part it plays
  (`tagPart(entity, 'clear')`, `'vertical'`, `'overlay'`…) so styling and
  vertex-dragging know which is which without relying on array order.
  Measurements and analyses (height, line of sight, viewshed) are
  `DrawnFeature`s too — their result is the `measurement` string.
- **Clicks become positions through `pickSurface`** (`src/cesium/pickSurface.ts`),
  never `pickEllipsoid` or `globe.pick` alone — it's what makes clicks land
  on terrain _and_ 3D Tiles rooftops, which is what makes the measurements 3D.
- **Arming a tool is the mode switch.** With a tool armed a map click draws;
  with none armed it selects, and the selected shape gets draggable vertex
  handles. That is what lets one click mean two things without a modifier.
- **TypeScript is strict.** No `any`, avoid `!`, prefer discriminated
  unions, add `never` exhaustiveness checks on union switches.
- **Registering a panel** means adding to `PanelId` in `src/ui/panelIds.ts`,
  an entry in `PANELS` in `src/ui/AppToolbar.tsx` (unless the button lives
  elsewhere, as the layer manager's does), and one element in `App.tsx` —
  additive, never editing existing entries.
- **Datasets in `public/` come from a build-time scan.** A browser can't
  list a server folder, so `vite-plugins/publicDatasetCatalog.ts` scans
  `public/` and exposes `virtual:public-datasets`; read it via
  `PUBLIC_DATASETS` / `publicDatasetsOfKind()` from `src/lib/publicDatasets.ts`.
  It's a constant, not state. A scanned dataset is added under its catalog
  id (`public:<path>`) — that's how `<PublicDatasetList>` knows it's added.
  `src/lib/publicDatasetTypes.ts` is shared with the Node-side plugin, so it
  must stay types-only: no Cesium, DOM, or Node imports.
- **Terrain is a single slot.** `useTerrain` holds a selection, not a list;
  `null` means `EllipsoidTerrainProvider`. It's applied with
  `scene.setTerrain(new Cesium.Terrain(...))` — Cesium's current API, which
  cancels a superseded load — and turns on `enableHillshade` while real
  terrain is loaded. The first terrain in `public/` loads at startup. Anything placed on the ground must pick or clamp to the
  rendered surface (`globe.pick`, `clampToGround`), never the bare ellipsoid.
- **OGC services split two ways.** WMS/WMTS/XYZ produce an
  `ImageryProvider` for `viewer.imageryLayers`; WFS returns vector features
  and produces a `GeoJsonDataSource` for `viewer.dataSources`, as do static
  GeoJSON files (`GeoJsonFileConfig`, which only the `public/` scan creates).
  The config union is split accordingly (`OgcImageryConfig` vs
  `OgcVectorConfig`) so `createImageryProvider` can't be handed something it
  can't render.

## Commenting

This codebase is heavily commented on purpose — it teaches Cesium, and
Cesium's sharp edges look arbitrary without explanation. Match that density.

**Explain _why_, never _what_.** Comment Cesium API surprises, workarounds
and the bug they avoid, every `@ts-expect-error`, performance-driven
choices, and anything that required reading Cesium's source. Don't narrate
code that already reads clearly, and don't restate types.

Keep doc comments on every exported function, component, hook, and
non-obvious prop.

## Common gotchas

- **A layer that silently doesn't appear is usually CORS**, not a code bug.
  WMS capabilities lookups, imagery tiles, and 3D Tiles all require
  permissive `Access-Control-Allow-Origin` headers. Check the network tab
  first. Datasets under `public/` are same-origin and unaffected.
- **`morphTo2D`/`morphTo3D` with any duration > 0** hard-codes a fly-out to
  a whole-globe view. Only `0` preserves the current camera.
- **Cesium's `LEFT_DOUBLE_CLICK` only fires within 5 pixels** (its private
  `_clickPixelTolerance`), which real hands miss constantly. When it doesn't
  fire, both clicks still arrive as `LEFT_CLICK` — so a drawing tool relying
  on it silently never finishes the path, the next shape merges into it, and
  switching tools throws the lot away. `useDrawingTools` therefore detects
  the gesture itself with a 12px / 400ms tolerance and doesn't subscribe to
  `LEFT_DOUBLE_CLICK` at all.
- **The Viewer binds double-click to "track the entity under the cursor"**,
  which dives the camera to ground level and locks on. `CesiumMap.tsx`
  removes that input action — don't restore it. The drawing tools finish a
  path on double-click and place a vertex marker exactly where that click
  lands, so the default fires almost every time a shape is completed.
- **Disabling `enableInputs` doesn't stop the camera gliding afterwards.**
  Cesium's `CameraEventAggregator` still _records_ a left-drag it was told
  to ignore, and replays it as spin inertia the moment inputs come back — so
  releasing a dragged vertex sends the globe sliding. Call
  `cancelCameraInertia` (`src/cesium/cancelCameraInertia.ts`) when a drag you
  handled yourself ends.
- **`Entity.label` text looks noisy at UI sizes.** Cesium rasterises it
  into a signed-distance-field atlas; the fringing that produces cannot be
  styled away. That's why map text goes through the HTML overlay in
  `src/cesium/mapLabels.ts` instead. Reach for `Entity.label` only if you
  ever need hundreds of labels moving every frame.
- **A `PolygonHierarchy` needs three vertices before it renders anything.**
  A polygon-in-progress therefore shows nothing between the first and second
  click unless you also stroke a polyline; `useDrawingTools` draws both. That
  polyline is also the finished outline, because `polygon.outline` ignores
  `outlineWidth` on platforms that cap hardware line width at 1px.
- **Cesium can't read a GeoTIFF as terrain.** It streams terrain as a tile
  pyramid (`layer.json` + `{z}/{x}/{y}.terrain`), the same way it streams
  imagery. That's not an ion requirement — `CesiumTerrainProvider.fromUrl`
  reads any static folder. `scripts/build_terrain_tiles.py` converts to
  quantized-mesh with vertex normals, Cesium's recommended format. If you
  touch its encoder: a broken tile doesn't error in the browser, it just
  silently stops the terrain refining — which is why the script checks its
  own index encoding at build time.
- **A line drawn in 3D disappears behind whatever's in front of it.** A
  measurement from a roof to the street runs through the building's walls;
  a sight line runs through the hill blocking it. Give such polylines a
  `depthFailMaterial` (see `hiddenLineMaterial`) so the hidden stretch draws
  faintly instead of not at all. Draped (`clampToGround`) lines don't
  support it and don't need it.
- **3D Tiles draw over terrain even when they're under it.**
  `depthTestAgainstTerrain` is off by default, so a tileset sitting below
  the terrain surface is fully visible — but `globe.pick` finds the terrain
  above it, not the roof you clicked. `pickSurface` handles this; anything
  else that picks must too.
- **`scene.pickPosition` caches per frame by `position.toString()`.** Pass
  a real `Cartesian2`. A plain `{ x, y }` stringifies to `[object Object]`,
  so every call in a frame returns the first answer — easy to hit when
  testing from the console, baffling when you do.
- **Terrain heights are ellipsoidal; most DTMs aren't.** Cesium measures
  from the WGS84 ellipsoid, national DTMs usually from mean sea level. The
  geoid is ~8 m above the ellipsoid around Singapore, so unconverted terrain
  sits 8 m low. The terrain script converts via EGM2008 by default.
- **3D Tiles keep their own heights unless moved.** A model authored for
  flat ground (BIM exports, the 1965 tilesets in `public/`) sits below real
  terrain. `useTilesets` moves each one onto the terrain with
  `tileset.modelMatrix` (see `placeTilesetOnTerrain.ts`) and re-seats them
  on `scene.terrainProviderChanged`. Never set `modelMatrix` anywhere else.
  The base height comes from `tileset.json`'s bounding volume, read
  directly because Cesium's bounding-volume classes are private API — so a
  tileset whose bounds are padded beyond its geometry (the 1965 aerial's
  region is ±60 m around a flat sheet) is placed that far off. Models
  entirely below the surface are left as authored (underground); the list
  has a per-model switch, and `"extras": { "placement": "as-authored" }` in
  tileset.json sets it from the data.
- **Cesium is not a normal npm package** — `vite-plugin-cesium` copies its
  static assets (workers, shaders, widget images) and defines
  `CESIUM_BASE_URL`. Don't hand-roll that.
- **`public/` holds static data**, including any 3D Tiles datasets dropped
  in for testing. It's excluded from Prettier; don't reformat it. Dataset
  folders and `.geojson` files in it are gitignored — never commit data.
