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
│  │ useOgcLayers    │  │ useTilesets     │   ...    │ Cesium.Viewer    │ │
│  │  React list ────┼──┼─► mutates ──────┼──────────┤  imageryLayers   │ │
│  │  of layers      │  │  Cesium         │          │  scene.primitives│ │
│  └────────┬────────┘  └────────┬────────┘          │  entities        │ │
│           │ renders            │ renders           └──────────────────┘ │
│           ▼                    ▼                                        │
│    <OgcLayerPanel>      <TilesetPanel>                                  │
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

A feature that puts things on the map has a hook — `useOgcLayers`,
`useTilesets`, `useDrawingTools` — and that hook is the _only_ place that
touches the corresponding Cesium collection.

The hook holds a React state array whose entries pair the user's config
with the live Cesium object:

```ts
interface ManagedLayer {
  config: OgcLayerConfig; // what the user asked for (serialisable)
  cesiumLayer: Cesium.ImageryLayer; // the live object (not serialisable)
  visible: boolean;
  alpha: number;
}
```

**Invariant: every action performs the Cesium side effect _and_ updates the
React array, in the same function.** If you only do one, the panel and the
globe disagree, and that class of bug is miserable to track down. Look at
`removeLayer` in [`useOgcLayers.ts`](../src/features/ogc-layers/useOgcLayers.ts):
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

A feature hook must be called in exactly one place. Two `useOgcLayers()`
calls means two independent React states mutating one Cesium collection,
and neither would see the other's changes.

The layer manager needs the same layers the OGC panel manages, so
`useOgcLayers` and `useTilesets` are called in `App.tsx` and their state is
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

## Why no Cesium ion

Cesium's convenience APIs (`createWorldImagery`, world terrain, the
geocoder, the base-layer picker) all call Cesium ion and need an access
token. This template targets people connecting to their _own_ OGC services,
so it uses OpenStreetMap raster tiles and the plain WGS84 ellipsoid instead,
and explicitly clears `Cesium.Ion.defaultAccessToken` so any accidental ion
call fails loudly rather than silently riding on Cesium's shared public demo
token.

If you want ion, set the token in `CesiumMap.tsx` and the convenience APIs
become available — nothing else in the codebase assumes its absence.

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
