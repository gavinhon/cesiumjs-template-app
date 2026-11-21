import { publicDatasetsOfKind } from '@/lib/publicDatasets';
import { Panel } from '@/ui/Panel';
import { PublicDatasetList } from '@/ui/PublicDatasetList';
import { AddTilesetForm } from './AddTilesetForm';
import { TilesetList } from './TilesetList';
import type { useTilesets } from './useTilesets';

/** Tilesets found under `public/` at build time — fixed for the life of the page. */
const PUBLIC_TILESETS = publicDatasetsOfKind('3d-tiles');

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
      {/* A public dataset is added under its catalog id rather than a fresh
          one, which is how the list knows it's already on the map. */}
      <PublicDatasetList
        datasets={PUBLIC_TILESETS}
        badgeFor={() => '3D TILES'}
        isAdded={(dataset) => tilesets.tilesets.some((entry) => entry.config.id === dataset.id)}
        onAdd={(dataset) =>
          tilesets.addTileset({ id: dataset.id, name: dataset.name, url: dataset.url })
        }
        disabled={disabled}
      />
      <AddTilesetForm onAdd={tilesets.addTileset} disabled={disabled} />
      <TilesetList
        tilesets={tilesets.tilesets.map((entry) => ({
          ...entry,
          placeable: entry.footprint !== null,
        }))}
        onRemove={tilesets.removeTileset}
        onToggleVisibility={tilesets.toggleVisibility}
        onZoomTo={tilesets.zoomToTileset}
        onPlacementChange={(id, placement) => void tilesets.setPlacement(id, placement)}
      />
    </Panel>
  );
}
