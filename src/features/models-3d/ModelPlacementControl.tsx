import type { ModelPlacement } from './modelTypes';
import './ModelPlacementControl.css';

interface ModelPlacementControlProps {
  placement: ModelPlacement;
  /** Metres moved up (negative: down) to stand on the terrain. */
  offset: number;
  /** Why the placement was chosen automatically, if it was. */
  reason: string | null;
  /**
   * True when the model can be moved as one piece (a 3D Tiles model with
   * usable bounds, smaller than a city). Otherwise "on terrain" drapes it,
   * standing each building on the ground beneath it.
   */
  placeable: boolean;
  onChange: (placement: ModelPlacement) => void;
}

/** "Raised 12.9 m", "Each building on the ground", or why a model was left where it was. */
function placementNote({
  placement,
  offset,
  reason,
}: Pick<ModelPlacementControlProps, 'placement' | 'offset' | 'reason'>): string {
  switch (placement) {
    case 'as-authored':
      return reason ?? 'Authored height';
    case 'draped':
      return reason ?? 'Each building on the ground';
    case 'on-terrain':
      if (Math.abs(offset) < 0.05) return 'Already on terrain';
      return `${offset > 0 ? 'Raised' : 'Lowered'} ${Math.abs(offset).toFixed(1)} m`;
    default: {
      const unreachable: never = placement;
      return unreachable;
    }
  }
}

/**
 * Whether a loaded 3D model stands on the terrain (the default for most)
 * or at its authored height — for underground models, or data already
 * georeferenced to the ground you want. One switch for every model; how
 * it stands one on the ground depends on the model: a building or a site
 * is moved as one piece (`placeTilesetOnTerrain.ts`), a city layer too
 * large for that — any I3S scene, a worldwide tileset — has each building
 * draped on the terrain (`terrainDrape.ts`).
 *
 * Shown on the model's row in the layer manager, which `App` composes it
 * into — the layer manager itself knows nothing about 3D placement.
 */
export function ModelPlacementControl(props: ModelPlacementControlProps) {
  const { placement, placeable, onChange } = props;
  return (
    <span className="model-placement-control">
      <label className="control-check model-placement-control__switch">
        <input
          type="checkbox"
          checked={placement !== 'as-authored'}
          onChange={(event) =>
            onChange(event.target.checked ? (placeable ? 'on-terrain' : 'draped') : 'as-authored')
          }
        />
        On terrain
      </label>
      <span className="model-placement-control__note">{placementNote(props)}</span>
    </span>
  );
}
