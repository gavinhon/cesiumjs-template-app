import { ResourceList, ResourceRow } from '@/ui/ResourceList';
import type { TilesetConfig, TilesetPlacement } from './tilesetTypes';
import './TilesetList.css';

interface ActiveTilesetView {
  config: TilesetConfig;
  visible: boolean;
  placement: TilesetPlacement;
  /** Metres moved up (negative: down) to stand on the terrain. */
  offset: number;
  /** Why the placement was chosen automatically, if it was. */
  reason: string | null;
  /** False when the tileset declares no bounds, so it can't be placed. */
  placeable: boolean;
}

interface TilesetListProps {
  tilesets: ActiveTilesetView[];
  onRemove: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onZoomTo: (id: string) => void;
  onPlacementChange: (id: string, placement: TilesetPlacement) => void;
}

/** "Raised 12.9 m", "Lowered 3.0 m", or the reason a model was left where it was. */
function placementNote({ placement, offset, reason }: ActiveTilesetView): string {
  if (placement === 'as-authored') return reason ?? 'Authored height';
  if (Math.abs(offset) < 0.05) return 'Already on terrain';
  return `${offset > 0 ? 'Raised' : 'Lowered'} ${Math.abs(offset).toFixed(1)} m`;
}

/**
 * Renders the 3D Tiles datasets currently added to the scene.
 *
 * The second row is where the model sits vertically: on the terrain (the
 * default) or at its authored height (for underground models, or data
 * already georeferenced to the ground you want). See
 * `placeTilesetOnTerrain.ts` for how the choice is made and applied.
 */
export function TilesetList({
  tilesets,
  onRemove,
  onToggleVisibility,
  onZoomTo,
  onPlacementChange,
}: TilesetListProps) {
  return (
    <ResourceList emptyMessage="No 3D Tiles loaded yet.">
      {tilesets.map((view) => (
        <ResourceRow
          key={view.config.id}
          name={view.config.name}
          visible={view.visible}
          onToggleVisibility={() => onToggleVisibility(view.config.id)}
          onRemove={() => onRemove(view.config.id)}
          onZoomTo={() => onZoomTo(view.config.id)}
          zoomHint="Double-click to zoom to this tileset"
        >
          <label className="tileset-list__placement">
            <input
              type="checkbox"
              checked={view.placement === 'on-terrain'}
              disabled={!view.placeable}
              onChange={(event) =>
                onPlacementChange(
                  view.config.id,
                  event.target.checked ? 'on-terrain' : 'as-authored',
                )
              }
            />
            On terrain
          </label>
          <span className="tileset-list__note">{placementNote(view)}</span>
        </ResourceRow>
      ))}
    </ResourceList>
  );
}
