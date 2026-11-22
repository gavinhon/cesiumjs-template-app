import type { ModelFormat, ModelPlacement } from './modelTypes';
import './ModelPlacementControl.css';

interface ModelPlacementControlProps {
  format: ModelFormat;
  placement: ModelPlacement;
  /** Metres moved up (negative: down) to stand on the terrain. */
  offset: number;
  /** Why the placement was chosen automatically, if it was. */
  reason: string | null;
  /** False when the tileset can't be moved: no usable bounds, or too large. */
  placeable: boolean;
  onChange: (placement: ModelPlacement) => void;
}

/** "Raised 12.9 m", "Lowered 3.0 m", or the reason a model was left where it was. */
function placementNote({
  placement,
  offset,
  reason,
}: Pick<ModelPlacementControlProps, 'placement' | 'offset' | 'reason'>): string {
  if (placement === 'as-authored') return reason ?? 'Authored height';
  if (Math.abs(offset) < 0.05) return 'Already on terrain';
  return `${offset > 0 ? 'Raised' : 'Lowered'} ${Math.abs(offset).toFixed(1)} m`;
}

/**
 * Where a loaded 3D model sits vertically: on the terrain (the default) or
 * at its authored height — for underground models, or data already
 * georeferenced to the ground you want. See `placeTilesetOnTerrain.ts` for
 * how the choice is made and applied.
 *
 * Shown on the model's row in the layer manager, which `App` composes it
 * into — the layer manager itself knows nothing about 3D placement.
 */
export function ModelPlacementControl(props: ModelPlacementControlProps) {
  const { format, placement, placeable, onChange } = props;
  return (
    <span className="model-placement-control">
      {/* No switch for I3S: a scene layer is never moved (see
          useModels), so the note alone says where it is. */}
      {format === '3d-tiles' && (
        <label className="model-placement-control__switch">
          <input
            type="checkbox"
            checked={placement === 'on-terrain'}
            disabled={!placeable}
            onChange={(event) => onChange(event.target.checked ? 'on-terrain' : 'as-authored')}
          />
          On terrain
        </label>
      )}
      <span className="model-placement-control__note">{placementNote(props)}</span>
    </span>
  );
}
