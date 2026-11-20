# Coding conventions

Prettier and Oxlint enforce the mechanical parts. This file covers the
judgement calls they can't.

Run `npm run check` before pushing — it runs the typechecker, the linter,
and the formatter check together.

## Formatting

Prettier owns it. Don't argue with it, don't hand-format, don't add
`prettier-ignore` without a reason worth writing down. The settings live in
`.prettierrc.json`: single quotes, semicolons, trailing commas, 100 columns.

`npm run format` fixes everything.

## File and folder naming

A filename is the first piece of documentation anyone reads, and often the
only one. These rules exist so a name identifies its file on its own — in an
editor tab, a search result, a stack trace, or a review diff — without
needing the directory it came from as context.

Where a longer name is clearer than a shorter one, take the longer name.
`drawnFeaturePresentation.ts` costs nothing to read and says exactly what is
inside; `presentation.ts` makes you open the file to find out.

### The patterns

| Kind of file                 | Pattern                     | Example                    |
| ---------------------------- | --------------------------- | -------------------------- |
| React component              | `PascalCase.tsx`            | `OgcLayerPanel.tsx`        |
| Stylesheet for a component   | same name as the component  | `OgcLayerPanel.css`        |
| React hook                   | `useSubject.ts`             | `useOgcLayers.ts`          |
| Module with one main export  | named after that export     | `createImageryProvider.ts` |
| Module grouping related code | named for the group         | `capabilitiesXml.ts`       |
| Type-only module             | `<subject>Types.ts`         | `ogcLayerTypes.ts`         |
| Feature folder               | `kebab-case`                | `src/features/ogc-layers/` |
| Vite plugin                  | named after its export      | `publicDatasetCatalog.ts`  |
| Python script                | `snake_case.py`, verb-first | `build_terrain_tiles.py`   |
| Documentation                | `kebab-case.md`             | `docs/adding-a-feature.md` |

Python follows Python's own convention rather than this repo's TypeScript
one, because that's what anyone opening a `.py` file expects. Scripts are
named for what running them does, verb first, so `scripts/` reads as a list
of actions.

Inside the files: `PascalCase` for types, interfaces and components,
`camelCase` for functions and variables, `SCREAMING_SNAKE_CASE` for
module-level constants (`INITIAL_VIEW`, `MAP_COLORS`, `PANELS`).

### One exported component per file, named after the file

`OgcLayerPanel.tsx` exports `OgcLayerPanel`, and its props interface is
`OgcLayerPanelProps` declared directly above it. Named exports everywhere
except `App.tsx`, which uses a default export because that is Vite's entry
convention.

Rename the file and the component together. A file called `FeatureEditor.tsx`
that exports `DrawnFeatureEditor` is worse than either name on its own.

### Name a module after its principal export

When a module exists to provide one thing, the filename _is_ that thing:

| File                       | Export                    |
| -------------------------- | ------------------------- |
| `createId.ts`              | `createId()`              |
| `createImageryProvider.ts` | `createImageryProvider()` |
| `createWfsDataSource.ts`   | `createWfsDataSource()`   |
| `cancelCameraInertia.ts`   | `cancelCameraInertia()`   |
| `fetchWmsLayers.ts`        | `fetchWmsLayers()`        |
| `initialView.ts`           | `INITIAL_VIEW`            |

You can then read an import list without opening anything, and "where is
`fetchWmsLayers` defined?" has an answer you can guess instead of search for.
That module used to be `wmsCapabilities.ts`, which named the _input_ rather
than what you get out of it.

Modules that genuinely group several related exports are named for the group
instead — `capabilitiesXml.ts`, `drawnFeaturePresentation.ts`,
`mapLabels.ts` — but the group name still has to be specific. `xml.ts` was
one of these, and told you nothing about _which_ XML.

### Every filename is unique across the repo

A folder does not disambiguate a file once the file is open. Four modules
called `types.ts` produce four identical editor tabs, four ambiguous search
hits, and four `./types` imports that each mean something different.

So a type module carries its subject:

| Instead of                        | We use                                        |
| --------------------------------- | --------------------------------------------- |
| `features/drawing/types.ts`       | `features/drawing/drawingTypes.ts`            |
| `features/ogc-layers/types.ts`    | `features/ogc-layers/ogcLayerTypes.ts`        |
| `features/tiles-3d/types.ts`      | `features/tiles-3d/tilesetTypes.ts`           |
| `features/layer-manager/types.ts` | `features/layer-manager/layerManagerTypes.ts` |

The same rule caught `ui/Toolbar.tsx` sitting alongside
`features/drawing/DrawingToolbar.tsx`: reading `<Toolbar>` in `App.tsx` right
next to `<DrawingToolbar>` gave no clue which was which. It is now
`ui/AppToolbar.tsx`, exporting `AppToolbar`.

It also caught `ui/panels.ts` next to `ui/Panel.tsx` — two names differing
only by capitalisation and a plural, which is a typo waiting to happen and,
on a case-insensitive filesystem, a git collision waiting to confuse someone.
It is now `ui/panelIds.ts`, named for the `PanelId` union it exports.

### Name for the domain, not for the framework or the position

Name things for what they _are_, not for where they sit. `Sidebar.tsx`
became `OgcLayerPanel.tsx` for this reason: once a second panel existed,
"sidebar" described a position two files shared and told you nothing about
either.

`features/drawing/FeatureEditor.tsx` had the opposite problem — it used
"feature" in the GIS sense while every other occurrence of the word in this
repo means "a folder under `src/features/`". It is now
`DrawnFeatureEditor.tsx`, matching the `DrawnFeature` type it edits, and its
presentation helpers live in `drawnFeaturePresentation.ts`.

`cesium/theme.ts` overclaimed in the other direction: "theme" implies fonts,
spacing and radii, when the module holds only the handful of colours Cesium
needs as `Cesium.Color` values. It is now `cesium/mapColors.ts`, which is
both what it is and all it should ever grow into.

### Parallel features use parallel names

Two features that do the same job should read the same way. The "add a
thing, then manage the things you added" features share one set of roles:

| Role                | OGC layers            | 3D Tiles             |
| ------------------- | --------------------- | -------------------- |
| Panel shell         | `OgcLayerPanel.tsx`   | `TilesetPanel.tsx`   |
| Form to add one     | `AddOgcLayerForm.tsx` | `AddTilesetForm.tsx` |
| List of added ones  | `OgcLayerList.tsx`    | `TilesetList.tsx`    |
| State + Cesium sync | `useOgcLayers.ts`     | `useTilesets.ts`     |
| Data model          | `ogcLayerTypes.ts`    | `tilesetTypes.ts`    |

Before this pass those columns read `AddLayerForm` / `TilesetForm` and
`LayerList` / `TilesetList` — same job, three different naming ideas.
Copy the shape above for a new feature; [adding-a-feature.md](adding-a-feature.md)
walks through it step by step.

### Stylesheets

A stylesheet is named after the component that imports it and sits beside it
(`Panel.tsx` / `Panel.css`), and only that component imports it.

There are two deliberate exceptions, both feature-internal.
`layer-manager/LayerManager.css` holds a single `.layer-manager` block shared
by `LayerManagerPanel` and `LayerManagerButton`, so it is named for the block
rather than for either component. `DrawingPanel.css` also carries the
`.drawn-feature-editor` block, because that editor only ever renders inside
that panel.

The BEM block name is the component name in kebab-case: `AppToolbar` →
`.app-toolbar`, `DrawnFeatureEditor` → `.drawn-feature-editor`. Rename them
together, or searching for a class stops leading you to the component.

## Imports

- Cross-directory imports use the `@/` alias: `import { Panel } from '@/ui/Panel'`.
- Imports _within_ a feature folder stay relative: `import { useTilesets } from './useTilesets'`.
- Never reach into another feature. Shared code moves to `src/ui/` or `src/lib/`.
- Use `import type` for type-only imports — `verbatimModuleSyntax` is on, so
  the compiler will tell you when you've got it wrong.
- Import Cesium as `import * as Cesium from 'cesium'`, or
  `import type * as Cesium from 'cesium'` when you only need its types
  (which keeps the runtime import out of the bundle for that module).

Import order, loosely: React, then third-party, then `@/`, then relative,
then CSS last.

The one exception is `src/main.tsx`, where `@/styles/global.css` must be
imported **before** `@/App` — see the CSS section below for why.

## TypeScript

`strict` is on. Some specifics:

- **No `any`.** Use `unknown` and narrow if you genuinely don't know.
- **Avoid `!`.** It's a promise to the compiler you can't keep. The
  exception is the `getElementById('root')!` in `main.tsx`, where the
  element is in `index.html`.
- **Prefer discriminated unions over optional-field soup.** `OgcLayerConfig`
  and the `{ status: 'idle' | 'loading' | 'error' | 'success' }` form state
  are the models to copy. They make impossible states unrepresentable.
- **Add an exhaustiveness check** when switching on a union tag:

  ```ts
  default: {
    const exhaustive: never = config;
    throw new Error(`Unsupported layer type: ${JSON.stringify(exhaustive)}`);
  }
  ```

  Now adding a union member without handling it is a compile error, not a
  runtime surprise.

- **Props go in an `interface FooProps`** directly above the component, with
  doc comments on anything non-obvious.

## React

- Function components only.
- A hook per feature owns that feature's state — see
  [architecture.md](architecture.md).
- `useCallback` on anything passed down as a prop, with honest dependencies.
- Refs for data Cesium reads per frame; state for data React renders.
- `useId()` for form field ids, never hardcoded strings — two panels can be
  mounted at once and DOM ids must be unique per document.

## CSS

Plain CSS, no preprocessor, no CSS-in-JS.

- **Always use a design token** from `src/styles/designTokens.css`. Raw hex values
  in a component stylesheet are a bug. Need a colour that isn't there? Add a
  token.
- **BEM-ish naming**: `.block`, `.block__element`, `.block--modifier`, where
  the block is the owning component's name in kebab-case.
- **Size controls from the tokens, never per-component.** Every button,
  input and select is `var(--control-height)`; compact grid rows use
  `--control-height-sm`. Five near-identical heights scattered across
  stylesheets (44/40/38/36/32) is what this replaced, and it read as
  accidental rather than designed. The font scale is likewise a fixed
  ladder — 15/13/12/11/10px, with 15 reserved for panel titles and 10 for
  badges and code. If a new size feels necessary, it's usually the layout
  that needs changing, not the ladder.
- **Compose the `.control` primitives** for anything that floats over the
  map: `className="control control-button app-toolbar__button"`. You get the
  glass background, border, shadow, and hover state for free.
- **A stylesheet sits next to the component that imports it**, is named
  after it, and is imported by nothing else — see
  [Stylesheets](#stylesheets) under the naming rules. Shared styling belongs
  to a shared component in `src/ui/`.
- **The global stylesheet must load first.** `.control-button` and a
  component's `.foo__button` are both single-class selectors, so they have
  equal specificity and **source order decides the winner**. Component
  styles are meant to override the `.control` primitives they compose with,
  which only works if `global.css` is emitted first — hence the import
  order in `src/main.tsx`.

  This has bitten us once already: importing `App` before `global.css`
  inverted the order, so `.control-button`'s horizontal padding beat
  `.drawing-toolbar__button { padding: 0 }` and the icon buttons' content
  box collapsed to 2px — the SVG icons vanished. The submit buttons
  silently lost their accent fill at the same time. If a component's
  override of padding, background, or border-radius mysteriously does
  nothing, check stylesheet order before anything else.

- Cesium draws with WebGL and can't read CSS variables. The colours that
  must exist on both sides are mirrored in exactly one file,
  `src/cesium/mapColors.ts` — change both together, and don't add a second
  mirror. Fonts aren't mirrored at all: map text is an HTML overlay
  (`src/cesium/mapLabels.ts`), so it uses these tokens directly.

## Comments

This codebase is unusually heavily commented, on purpose. It's a template
people learn Cesium from, and Cesium has a lot of sharp edges that look like
arbitrary choices until someone explains them.

**Comment the _why_, never the _what_.**

```ts
// Bad — restates the code
// Set the alpha to the given value
layer.alpha = alpha;

// Good — explains a decision the reader couldn't infer
// `duration === 0` is the only morph path that preserves the current
// camera; any positive duration hard-codes a whole-globe fly-out.
viewer.scene.morphTo2D(0);
```

Worth a comment: Cesium API surprises, workarounds and the bug they dodge,
`@ts-expect-error` (always explain), performance-driven choices, and
anything you had to read Cesium's source to figure out.

Not worth a comment: what a well-named function does, standard React
patterns, or restating a type.

Doc comments (`/** ... */`) go on every exported function, component, hook,
and non-obvious prop.

## Dependencies

Prefer not adding one. The drawing toolbar hand-draws six SVG icons rather
than pulling in an icon library, and `createId()` wraps
`crypto.randomUUID()` rather than depending on `uuid`. For a template people
fork, a small dependency tree is a feature.

If you do add one, say why in the PR.

## Things this project deliberately does not have

Knowing what's _intentionally_ missing saves you from "fixing" it:

- **No Cesium ion token** — see [architecture.md](architecture.md).
- **No persistence.** Layers, tilesets, and drawings all vanish on reload.
- **No global state library, context, or router.** The app is one screen.
- **No test suite.** If you add one, Vitest is the natural fit; put tests
  next to what they test and wire them into `npm run check`.
