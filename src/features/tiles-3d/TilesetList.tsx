import { ResourceList, ResourceRow } from '@/ui/ResourceList';
import type { TilesetConfig } from './tilesetTypes';

interface ActiveTilesetView {
  config: TilesetConfig;
  visible: boolean;
}

interface TilesetListProps {
  tilesets: ActiveTilesetView[];
  onRemove: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onZoomTo: (id: string) => void;
}

/**
 * Renders the 3D Tiles datasets currently added to the scene.
 *
 * No second row of controls here, unlike the OGC layer list: a
 * `Cesium3DTileset` has no simple opacity dial equivalent to an imagery
 * layer's `alpha` (changing how a tileset renders means going through
 * `Cesium3DTileStyle`), so there's nothing to put there yet.
 */
export function TilesetList({
  tilesets,
  onRemove,
  onToggleVisibility,
  onZoomTo,
}: TilesetListProps) {
  return (
    <ResourceList emptyMessage="No 3D Tiles loaded yet.">
      {tilesets.map(({ config, visible }) => (
        <ResourceRow
          key={config.id}
          name={config.name}
          visible={visible}
          onToggleVisibility={() => onToggleVisibility(config.id)}
          onRemove={() => onRemove(config.id)}
          onZoomTo={() => onZoomTo(config.id)}
          zoomHint="Double-click to zoom to this tileset"
        />
      ))}
    </ResourceList>
  );
}
