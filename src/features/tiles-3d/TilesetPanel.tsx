import { Panel } from '@/ui/Panel';
import { TilesetForm } from './TilesetForm';
import { TilesetList } from './TilesetList';
import type { useTilesets } from './useTilesets';

interface TilesetPanelProps {
  /** The feature's state, from `useTilesets`. Called in `App` — see `OgcLayerPanel`. */
  tilesets: ReturnType<typeof useTilesets>;
  /** True while the Cesium viewer hasn't finished initializing yet. */
  disabled: boolean;
  /** Whether the panel is open. Controlled by the "3D Tiles" toolbar button. */
  open: boolean;
}

/**
 * The panel for connecting to 3D Tiles datasets (buildings, point clouds,
 * photogrammetry meshes, ...) by URL — the `Cesium3DTileset` counterpart
 * of <OgcLayerPanel>'s imagery layers.
 *
 * Same shape as every other feature panel: state, then a form and a list.
 * If you've read OgcLayerPanel.tsx this should look immediately familiar —
 * that sameness is the point.
 */
export function TilesetPanel({ tilesets, disabled, open }: TilesetPanelProps) {
  return (
    <Panel
      id="tiles-3d-panel"
      title="3D Tiles"
      subtitle="Load a 3D Tiles dataset from a tileset.json URL."
      open={open}
    >
      <TilesetForm onAdd={tilesets.addTileset} disabled={disabled} />
      <TilesetList
        tilesets={tilesets.tilesets}
        onRemove={tilesets.removeTileset}
        onToggleVisibility={tilesets.toggleVisibility}
        onZoomTo={tilesets.zoomToTileset}
      />
    </Panel>
  );
}
