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
npm run check      # typecheck + lint + format check — run this before finishing
npm run format     # apply Prettier
npm run build      # tsc -b && vite build
```

There is no test suite. Verify changes by running the app.

## Layout

```
src/
  main.tsx, App.tsx    entry + shell (App owns the Viewer and which panel is open)
  cesium/              Viewer creation, initial camera, 2D/3D toggle
  features/<name>/     one folder per feature: types + hook + panel + form + list
  ui/                  shared: Panel, Field, ResourceList, Toolbar
  lib/                 shared helpers with no UI or Cesium ties
  styles/              tokens.css (design tokens) + global.css (reset, .control)
docs/                  architecture, adding-a-feature, conventions
```

## Before you write code

Read [docs/architecture.md](docs/architecture.md). It explains the one thing
that drives every design decision here: Cesium owns its own imperative
render loop, so React state and Cesium state are kept in deliberate sync
rather than one deriving the other.

For a new feature, follow [docs/adding-a-feature.md](docs/adding-a-feature.md)
step by step. For style questions, [docs/conventions.md](docs/conventions.md).

## Invariants — breaking these causes real bugs

1. **`viewer` is `Cesium.Viewer | null`.** It's null until `<CesiumMap>`
   mounts. Every hook and component that takes it must bail early on null.
2. **A feature action mutates Cesium _and_ updates React state in the same
   function.** Doing only one makes the panel and the globe disagree.
3. **The Viewer is created exactly once**, in a `useEffect` in
   `CesiumMap.tsx`, guarded against StrictMode's double-invoke. Don't add
   changing dependencies to that effect.
4. **Per-frame data goes in refs, not state.** Anything a Cesium
   `CallbackProperty` reads is evaluated ~60×/sec; state would re-render
   React that often. Never drive `label.text` from a `CallbackProperty` —
   it re-rasterises a glyph texture and visibly corrupts the render.
5. **Panels stay mounted while closed.** Only CSS changes. Unmounting
   discards in-progress form input and the feature's resource list.
6. **UI floats over the map**, absolutely positioned with a `z-index`.
   Never lay out beside the canvas — resizing it forces Cesium to rebuild
   its render buffer and re-pick LOD tiles.
7. **`src/main.tsx` imports `@/styles/global.css` before `@/App`.** Don't
   "fix" this to put the CSS import last. `.control-button` and a
   component's `.foo__button` have equal specificity, so source order
   decides; component styles can only override the shared `.control`
   primitives if the global sheet loads first. Getting this backwards
   collapsed the drawing toolbar's icon buttons to a 2px content box and
   stripped the accent fill off every submit button.

## Conventions in brief

- **Feature code stays in its folder.** A feature never imports from another
  feature; shared code moves to `src/ui/` or `src/lib/`.
- **Compose, don't copy.** Use `<Panel>`, `<Field>`/`<SelectField>`,
  `<ResourceList>`/`<ResourceRow>`, and the `.control` CSS classes rather
  than re-creating their markup. If you're about to duplicate UI structure
  from another feature, extract it into `src/ui/` instead.
- **Imports:** `@/` alias across directories, relative within a feature,
  `import type` for types, CSS import last — _except_ in `src/main.tsx`,
  where `@/styles/global.css` must come before `@/App` (see invariant 7).
- **Colours come from `src/styles/tokens.css`.** Raw hex in a component
  stylesheet is a bug. The few colours Cesium needs in JS are mirrored in
  `useDrawingTools.ts` — change both together.
- **TypeScript is strict.** No `any`, avoid `!`, prefer discriminated
  unions, add `never` exhaustiveness checks on union switches.
- **Registering a panel** means adding to `PanelId` and `PANELS` in
  `src/ui/Toolbar.tsx` and one element in `App.tsx` — additive, never
  editing existing entries.

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
- **Cesium is not a normal npm package** — `vite-plugin-cesium` copies its
  static assets (workers, shaders, widget images) and defines
  `CESIUM_BASE_URL`. Don't hand-roll that.
- **`public/` holds static data**, including any 3D Tiles datasets dropped
  in for testing. It's excluded from Prettier; don't reformat it.
