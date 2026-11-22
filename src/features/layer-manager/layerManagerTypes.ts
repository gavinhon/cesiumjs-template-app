import type { ReactNode } from 'react';
import type { LegendContent } from '@/lib/legendTypes';

/**
 * The shape the layer manager needs from whatever feature owns a layer.
 *
 * This feature is unusual: it shows layers it doesn't own. The map-services feature
 * owns imagery and WFS vectors, the 3D Tiles feature owns tilesets, and
 * neither may import the other (see docs/coding-conventions.md). So instead of
 * importing their types, the manager declares the *minimum* it needs and
 * `App` — the composition root that already holds both hooks — maps each
 * feature's entries into it.
 *
 * The upshot: adding a new kind of layer to the manager never means editing
 * this feature. You map your entries into `LayerEntry` in `App.tsx` and the
 * manager renders them.
 *
 * The manager is the *one* place a loaded layer is managed — the panels
 * that add layers don't list them again — so everything you can do to a
 * layer is here, as optional capabilities a feature supplies or doesn't.
 */
export interface LayerEntry {
  id: string;
  /** User-facing label. */
  name: string;
  /** Short badge, e.g. "OSM", "WMS", "3D TILES". */
  kind: string;
  visible: boolean;
  onToggleVisibility: () => void;
  onZoomTo: () => void;
  /**
   * Moves this layer through the draw order. Only supplied for imagery
   * layers — see the note in `LayerManagerPanel` on why 3D Tiles and
   * vector data don't get reorder controls.
   */
  onMove?: (direction: 'up' | 'down') => void;
  /** Takes the layer off the map. Absent for the basemap, which is swapped, not removed. */
  onRemove?: () => void;
  /** Imagery only: a texture on the globe has one opacity; vector features and models don't. */
  opacity?: { value: number; onChange: (value: number) => void };
  /**
   * A control only this kind of layer has, shown on its second row — a 3D
   * model's "On terrain" switch. Rendered by `App` from the owning feature,
   * so the manager stays unaware of what it is.
   */
  detail?: ReactNode;
  /**
   * Loads what the layer's symbols mean. A loader rather than the legend
   * itself, so a service is only asked when the manager shows it; resolves
   * to `null` when the service has none to give.
   */
  legend?: () => Promise<LegendContent | null>;
}

/**
 * The basemap picker's view of whatever feature owns the imagery stack —
 * a single choice, like terrain, since there's one map at the bottom.
 */
export interface BasemapChoice {
  /** `thumbnail` is a preview image for the switcher; see `BasemapSwitcher`. */
  options: { id: string; name: string; thumbnail?: { url: string; grayscale?: boolean } }[];
  selectedId: string;
  onSelect: (id: string) => void;
}

/**
 * The terrain picker's view of whatever feature owns terrain — same idea
 * as `LayerEntry`, for the one thing on the map that isn't a list.
 *
 * Terrain is a single slot (the globe has one surface), so instead of rows
 * with toggles this is a choice between options, where `null` means the
 * bare WGS84 ellipsoid.
 */
export interface TerrainChoice {
  options: { id: string; name: string; attribution?: string }[];
  selectedId: string | null;
  loading: boolean;
  /** Why the last selection failed, if it did. */
  error: string | null;
  onSelect: (id: string | null) => void;
  onZoomTo: () => void;
}
