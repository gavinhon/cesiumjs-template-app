# Adding a feature

Most features in this app are the same shape: _a panel that lets the user
add some kind of thing to the map, and manage the things they've added._
OGC layers and 3D Tiles are both exactly that. Follow this recipe and your
feature will look and behave like the existing ones for free.

Read [architecture.md](architecture.md) first if you haven't — particularly
the rule that a feature's hook must update React state and Cesium together.

We'll use a hypothetical **GeoJSON** feature as the running example. (The
real app already loads `.geojson` files found in `public/`, through the
map-services feature — the example stays because it's the simplest possible "add a
thing by URL" feature, not because GeoJSON is missing.)

## 1. Create the folder

```
src/features/geojson/
├── geoJsonTypes.ts     the data model — named for the feature, never `types.ts`
├── useGeoJson.ts       state + Cesium sync (the heart of the feature)
├── GeoJsonPanel.tsx    entry point: quick-add list + form
└── AddGeoJsonForm.tsx  add a new one
```

There's no list of added sources in the folder: once something is on the
map it's managed in the layer manager, the one place every loaded layer is
shown, hidden, reordered and removed (step 5).

Everything the feature needs lives here. A feature never imports from
another feature — if two need the same thing, it moves to `src/ui/` or
`src/lib/`.

## 2. Define the data model (`geoJsonTypes.ts`)

Describe what the _user_ configured, not what Cesium produced. Configs
should be plain, serialisable objects — that's what makes saving a workspace
to localStorage or a backend possible later without rework.

```ts
/** A GeoJSON file the user has added to the map. */
export interface GeoJsonConfig {
  /** Locally-generated unique id, used as the React list key. */
  id: string;
  /** User-facing label shown in the panel's list. */
  name: string;
  /** URL of the .geojson file. */
  url: string;
}
```

If your feature supports several variants, use a discriminated union with a
`type` tag, the way `MapServiceConfig` does. It gives you exhaustiveness
checking in the factory that consumes it.

## 3. Write the state hook (`useGeoJson.ts`)

This is where the real work is. The hook takes `Cesium.Viewer | null`,
holds an array pairing each config with its live Cesium object, and exposes
one function per user action.

```ts
import { useCallback, useState } from 'react';
import * as Cesium from 'cesium';
import type { GeoJsonConfig } from './geoJsonTypes';

interface ManagedGeoJson {
  config: GeoJsonConfig;
  visible: boolean;
  dataSource: Cesium.GeoJsonDataSource; // the live Cesium object
}

export function useGeoJson(viewer: Cesium.Viewer | null) {
  const [sources, setSources] = useState<ManagedGeoJson[]>([]);

  const add = useCallback(
    async (config: GeoJsonConfig) => {
      if (!viewer) return; // the viewer is null until <CesiumMap> mounts

      const dataSource = await Cesium.GeoJsonDataSource.load(config.url);
      await viewer.dataSources.add(dataSource); // Cesium side...
      setSources((prev) => [...prev, { config, visible: true, dataSource }]); // ...and React side

      viewer.flyTo(dataSource).catch(() => {
        // A rejected flyTo (e.g. removed before it finished loading) isn't
        // worth surfacing to the user.
      });
    },
    [viewer],
  );

  const remove = useCallback(
    (id: string) => {
      if (!viewer) return;
      setSources((prev) => {
        const target = prev.find((s) => s.config.id === id);
        if (target) viewer.dataSources.remove(target.dataSource, true);
        return prev.filter((s) => s.config.id !== id);
      });
    },
    [viewer],
  );

  const toggleVisibility = useCallback((id: string) => {
    setSources((prev) =>
      prev.map((s) => {
        if (s.config.id !== id) return s;
        const visible = !s.visible;
        s.dataSource.show = visible;
        return { ...s, visible };
      }),
    );
  }, []);

  return { sources, add, remove, toggleVisibility };
}
```

Checklist for this file:

- [ ] Bails out early when `viewer` is `null`.
- [ ] Every action touches Cesium **and** React state in the same function.
- [ ] Any Cesium call inside a `setState` updater is idempotent. If it isn't
      (reordering, appending, incrementing), compute from current state and
      call Cesium outside the updater — StrictMode runs updaters twice.
- [ ] Cleanup destroys Cesium resources (`remove(x, true)` where the API
      offers it) rather than just dropping the reference.
- [ ] `useCallback` with the right deps, so the panel doesn't re-render
      needlessly.
- [ ] Rejected `flyTo` promises are swallowed with a comment saying why.

## 4. Build the UI from the shared pieces

**Don't hand-roll panel, field, or list markup.** Compose `src/ui/`:

`GeoJsonPanel.tsx` — the entry point:

```tsx
import { Panel } from '@/ui/Panel';
import { AddGeoJsonForm } from './AddGeoJsonForm';
import type { useGeoJson } from './useGeoJson';

interface GeoJsonPanelProps {
  /** The feature's state — the hook is called in App, see step 5. */
  geoJson: ReturnType<typeof useGeoJson>;
  disabled: boolean;
  open: boolean;
  /** Lets App show the new source in the layer manager. */
  onAdded: () => void;
}

export function GeoJsonPanel({ geoJson, disabled, open, onAdded }: GeoJsonPanelProps) {
  return (
    <Panel
      id="geojson-panel"
      title="GeoJSON"
      subtitle="Load GeoJSON features from a URL."
      open={open}
    >
      <AddGeoJsonForm
        onAdd={async (config) => {
          await geoJson.add(config);
          onAdded();
        }}
        disabled={disabled}
      />
    </Panel>
  );
}
```

Ready-made datasets go in a `<QuickAddList>` above the form, one click
each — see `mapServiceQuickAdd.ts` for one fed by the `public/` scan and a
list of example services, and `AddDataPanel.tsx` for where it is shown.

`AddGeoJsonForm.tsx` — use `<Field>` / `<SelectField>` from `@/ui/Field`, wrap
in `<form className="panel-form">`, and give the submit button
`className="control control-button panel-form__submit"`. If adding is async
and can fail (like loading a tileset), hold a
`{ state: 'idle' | 'loading' | 'error' }` union and render the message in a
`panel-form__status panel-form__status--error` paragraph.

If your loaded items need a control nothing else has, don't build a list
for it: pass it to the layer manager as `LayerEntry.detail` (step 5), the
way a 3D model's "On terrain" switch (`ModelPlacementControl`) gets
there.

## 5. Register the panel

Two small edits, both mechanical.

Add the id to `PanelId` in [`src/ui/panelIds.ts`](../src/ui/panelIds.ts), and
say which edge it docks to in `PANEL_SIDE`:

```ts
export type PanelId = 'map-services' | 'models-3d' | 'layers' | 'drawings' | 'geojson';
// …and in PANEL_SIDE:
  geojson: 'left',
```

Then add an entry to `PANELS` in
[`src/ui/AppToolbar.tsx`](../src/ui/AppToolbar.tsx). The `controls` value must
match the `id` you gave `<Panel>`:

```ts
const PANELS: { id: PanelId; label: string; controls: string }[] = [
  { id: 'layers', label: 'Layers', controls: 'layer-manager-panel' },
  { id: 'add-data', label: 'Add data', controls: 'add-data-panel' },
  { id: 'drawings', label: 'Drawings', controls: 'drawings-panel' },
  { id: 'geojson', label: 'GeoJSON', controls: 'geojson-panel' },
];
```

> **Adding a data source? You may not need a panel.** Map services and 3D
> models both plug into the one Add data panel: export your one-click
> datasets as a quick-add list (like `MAP_SERVICE_QUICK_ADD`, grouped by
> `CATALOGUE_GROUPS`) and/or pass your connect form to `AddDataPanel` as a
> `ConnectTab` in `App.tsx`. A panel of its own is for a feature that does
> something other than add data — like Drawings.

In [`src/App.tsx`](../src/App.tsx), call the hook and render the panel:

```tsx
const geoJson = useGeoJson(viewer);
// …
<GeoJsonPanel geoJson={geoJson} disabled={!viewer} open={isOpen('geojson')} onAdded={showLayers} />;
```

That's the whole integration. Note that you _added_ to each file and
changed nothing existing — that's the property the structure is designed
for.

### Show what you added in the layer manager

The hook is called in `App.tsx` rather than in your panel because the
layer manager needs its state too — the way `useMapServices` and
`useModels` are. Calling the same hook in two components creates two
React states fighting over one Cesium collection.

Map your entries to `LayerEntry` in `App.tsx` (see
`src/features/layer-manager/layerManagerTypes.ts`): visibility and zoom,
plus `onRemove`, and `opacity`/`onMove` only if your layers live in
`viewer.imageryLayers` and therefore have one opacity and a real draw
order.

## 6. Verify

```bash
npm run check
```

That includes the test suite. If your feature has logic that doesn't need
the globe — parsing a response, building a request URL, a calculation —
split it into a plain function and give it a `.test.ts` beside it; see
[testing.md](testing.md).

Then run the app and confirm: the button opens the panel, adding works, the
camera flies to the new resource, toggling visibility and removing both take
effect on the globe, and other features still work.

If a layer or dataset silently doesn't appear, check the network tab for
CORS errors before assuming your code is wrong — see the end of
[architecture.md](architecture.md).

## Offering datasets from `public/`

If your feature loads something that could sit in `public/`, let the
build-time scan find it rather than asking the user to type its URL:

1. Add a member to `PublicDataset` in `src/lib/publicDatasetTypes.ts`, with
   a new `kind`.
2. Teach `vite-plugins/publicDatasetCatalog.ts` to recognise it — a check in
   `classifyFolder` for a folder-shaped dataset, or the file loop in `scan`
   for a single file.
3. In your panel, turn `publicDatasetsOfKind('your-kind')` into
   `<QuickAddList>` items above the form, adding each dataset through the
   same `add…` function the form uses, with the dataset's `id` as the config
   id. That id is how the list knows a dataset is already on the map.

`TilesetPanel.tsx` is the shortest example to copy.

## Features that aren't panels

Not everything fits the panel shape. The drawing tools are a hook plus a
floating toolbar, with no form and no list; terrain is a hook whose only UI
is a picker in the layer manager. That's fine — the parts that
still apply are: **one folder under `src/features/`, one hook that owns all
the Cesium interaction, and shared `.control` classes for the buttons.**
Skip the rest.
