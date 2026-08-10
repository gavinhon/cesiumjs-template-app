# Adding a feature

Most features in this app are the same shape: _a panel that lets the user
add some kind of thing to the map, and manage the things they've added._
OGC layers and 3D Tiles are both exactly that. Follow this recipe and your
feature will look and behave like the existing ones for free.

Read [architecture.md](architecture.md) first if you haven't — particularly
the rule that a feature's hook must update React state and Cesium together.

We'll use a hypothetical **GeoJSON** feature as the running example.

## 1. Create the folder

```
src/features/geojson/
├── types.ts          the data model
├── useGeoJson.ts     state + Cesium sync (the heart of the feature)
├── GeoJsonPanel.tsx  entry point: hook + form + list
├── GeoJsonForm.tsx   add a new one
└── GeoJsonList.tsx   manage the added ones
```

Everything the feature needs lives here. A feature never imports from
another feature — if two need the same thing, it moves to `src/ui/` or
`src/lib/`.

## 2. Define the data model (`types.ts`)

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
`type` tag, the way `OgcLayerConfig` does. It gives you exhaustiveness
checking in the factory that consumes it.

## 3. Write the state hook (`useGeoJson.ts`)

This is where the real work is. The hook takes `Cesium.Viewer | null`,
holds an array pairing each config with its live Cesium object, and exposes
one function per user action.

```ts
import { useCallback, useState } from 'react';
import * as Cesium from 'cesium';
import type { GeoJsonConfig } from './types';

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
- [ ] Cleanup destroys Cesium resources (`remove(x, true)` where the API
      offers it) rather than just dropping the reference.
- [ ] `useCallback` with the right deps, so the panel doesn't re-render
      needlessly.
- [ ] Rejected `flyTo` promises are swallowed with a comment saying why.

## 4. Build the UI from the shared pieces

**Don't hand-roll panel, field, or list markup.** Compose `src/ui/`:

`GeoJsonPanel.tsx` — the entry point:

```tsx
import type * as Cesium from 'cesium';
import { Panel } from '@/ui/Panel';
import { useGeoJson } from './useGeoJson';
import { GeoJsonForm } from './GeoJsonForm';
import { GeoJsonList } from './GeoJsonList';

interface GeoJsonPanelProps {
  viewer: Cesium.Viewer | null;
  open: boolean;
}

export function GeoJsonPanel({ viewer, open }: GeoJsonPanelProps) {
  const { sources, add, remove, toggleVisibility } = useGeoJson(viewer);

  return (
    <Panel
      id="geojson-panel"
      title="GeoJSON"
      subtitle="Load GeoJSON features from a URL."
      open={open}
    >
      <GeoJsonForm onAdd={add} disabled={!viewer} />
      <GeoJsonList sources={sources} onRemove={remove} onToggleVisibility={toggleVisibility} />
    </Panel>
  );
}
```

`GeoJsonForm.tsx` — use `<Field>` / `<SelectField>` from `@/ui/Field`, wrap
in `<form className="panel-form">`, and give the submit button
`className="control control-button panel-form__submit"`. If adding is async
and can fail (like loading a tileset), hold a
`{ state: 'idle' | 'loading' | 'error' }` union and render the message in a
`panel-form__status panel-form__status--error` paragraph.

`GeoJsonList.tsx` — use `<ResourceList>` and `<ResourceRow>` from
`@/ui/ResourceList`. Pass extra per-item controls as `children`; they render
as a second row.

## 5. Register the panel

Two small edits, both mechanical.

In [`src/ui/Toolbar.tsx`](../src/ui/Toolbar.tsx), add the id to `PanelId`
and an entry to `PANELS`. The `controls` value must match the `id` you gave
`<Panel>`:

```ts
export type PanelId = 'ogc-layers' | 'tiles-3d' | 'geojson';

const PANELS: { id: PanelId; label: string; controls: string }[] = [
  { id: 'ogc-layers', label: 'OGC Layers', controls: 'ogc-layers-panel' },
  { id: 'tiles-3d', label: '3D Tiles', controls: 'tiles-3d-panel' },
  { id: 'geojson', label: 'GeoJSON', controls: 'geojson-panel' },
];
```

In [`src/App.tsx`](../src/App.tsx), render it:

```tsx
<GeoJsonPanel viewer={viewer} open={openPanel === 'geojson'} />
```

That's the whole integration. Note that you _added_ to both files and
changed nothing existing — that's the property the structure is designed
for.

## 6. Verify

```bash
npm run check
```

Then run the app and confirm: the button opens the panel, adding works, the
camera flies to the new resource, toggling visibility and removing both take
effect on the globe, and other features still work.

If a layer or dataset silently doesn't appear, check the network tab for
CORS errors before assuming your code is wrong — see the end of
[architecture.md](architecture.md).

## Features that aren't panels

Not everything fits the panel shape. The drawing tools are a hook plus a
floating toolbar, with no form and no list. That's fine — the parts that
still apply are: **one folder under `src/features/`, one hook that owns all
the Cesium interaction, and shared `.control` classes for the buttons.**
Skip the rest.
