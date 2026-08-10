import type * as Cesium from 'cesium';
import { Panel } from '@/ui/Panel';
import { useTilesets } from './useTilesets';
import { TilesetForm } from './TilesetForm';
import { TilesetList } from './TilesetList';

interface TilesetPanelProps {
  viewer: Cesium.Viewer | null;
  /** Whether the panel is open. Controlled by the "3D Tiles" toolbar button. */
  open: boolean;
}

/**
 * The panel for connecting to 3D Tiles datasets (buildings, point clouds,
 * photogrammetry meshes, ...) by URL — the `Cesium3DTileset` counterpart
 * of <OgcLayerPanel>'s imagery layers.
 *
 * Same shape as every other feature panel: state hook, then a form and a
 * list. If you've read OgcLayerPanel.tsx this should look immediately
 * familiar — that sameness is the point.
 */
export function TilesetPanel({ viewer, open }: TilesetPanelProps) {
  const { tilesets, addTileset, removeTileset, toggleVisibility, zoomToTileset } =
    useTilesets(viewer);

  return (
    <Panel
      id="tiles-3d-panel"
      title="3D Tiles"
      subtitle="Load a 3D Tiles dataset from a tileset.json URL."
      open={open}
    >
      <TilesetForm onAdd={addTileset} disabled={!viewer} />
      <TilesetList
        tilesets={tilesets}
        onRemove={removeTileset}
        onToggleVisibility={toggleVisibility}
        onZoomTo={zoomToTileset}
      />
    </Panel>
  );
}
