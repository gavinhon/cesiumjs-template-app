/**
 * The shape the layer manager needs from whatever feature owns a layer.
 *
 * This feature is unusual: it shows layers it doesn't own. The OGC feature
 * owns imagery and WFS vectors, the 3D Tiles feature owns tilesets, and
 * neither may import the other (see docs/conventions.md). So instead of
 * importing their types, the manager declares the *minimum* it needs and
 * `App` — the composition root that already holds both hooks — maps each
 * feature's entries into it.
 *
 * The upshot: adding a new kind of layer to the manager never means editing
 * this feature. You map your entries into `LayerEntry` in `App.tsx` and the
 * manager renders them.
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
}
