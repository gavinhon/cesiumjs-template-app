# Conventions

Prettier and Oxlint enforce the mechanical parts. This file covers the
judgement calls they can't.

Run `npm run check` before pushing — it runs the typechecker, the linter,
and the formatter check together.

## Formatting

Prettier owns it. Don't argue with it, don't hand-format, don't add
`prettier-ignore` without a reason worth writing down. The settings live in
`.prettierrc.json`: single quotes, semicolons, trailing commas, 100 columns.

`npm run format` fixes everything.

## Files and naming

| Thing                | Convention             | Example                   |
| -------------------- | ---------------------- | ------------------------- |
| Component file       | `PascalCase.tsx`       | `TilesetPanel.tsx`        |
| Hook file            | `useThing.ts`          | `useOgcLayers.ts`         |
| Other module         | `camelCase.ts`         | `wmsCapabilities.ts`      |
| Feature folder       | `kebab-case`           | `features/tiles-3d/`      |
| Component stylesheet | matches its component  | `Panel.tsx` / `Panel.css` |
| Type / interface     | `PascalCase`           | `OgcLayerConfig`          |
| Constant             | `SCREAMING_SNAKE_CASE` | `INITIAL_VIEW`            |

One exported component per file, named the same as the file. Named exports
everywhere except `App.tsx` (Vite's entry convention).

Name things for what they _are_, not where they sit. `Sidebar.tsx` was
renamed to `OgcLayerPanel.tsx` for exactly this reason: once a second panel
existed, "sidebar" told you nothing.

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

- **Always use a design token** from `src/styles/tokens.css`. Raw hex values
  in a component stylesheet are a bug. Need a colour that isn't there? Add a
  token.
- **BEM-ish naming**: `.block`, `.block__element`, `.block--modifier`.
- **Compose the `.control` primitives** for anything that floats over the
  map: `className="control control-button toolbar__button"`. You get the
  glass background, border, shadow, and hover state for free.
- **A stylesheet sits next to the component that imports it**, and only that
  component's file imports it. Shared styling belongs to a shared component
  in `src/ui/`.
- **The global stylesheet must load first.** `.control-button` and a
  component's `.foo__button` are both single-class selectors, so they have
  equal specificity and **source order decides the winner**. Component
  styles are meant to override the `.control` primitives they compose with,
  which only works if `global.css` is emitted first — hence the import
  order in `src/main.tsx`.

  This has bitten us once already: importing `App` before `global.css`
  inverted the order, `.control-button { padding: 0 18px }` beat
  `.drawing-toolbar__button { padding: 0 }`, and the icon buttons' 40px
  content box collapsed to 2px — the SVG icons vanished. The submit buttons
  silently lost their accent fill at the same time. If a component's
  override of padding, background, or border-radius mysteriously does
  nothing, check stylesheet order before anything else.

- Cesium draws with WebGL and can't read CSS variables. The few colours that
  must exist on both sides are mirrored in `useDrawingTools.ts` — change
  both together.

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
