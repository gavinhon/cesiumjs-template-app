import type { ModelPlacement } from './modelTypes';
import './ModelPlacementControl.css';

interface ModelPlacementControlProps {
  placement: ModelPlacement;
  offset: number;
  reason: string | null;
  placeable: boolean;
  onChange: (placement: ModelPlacement) => void;
}

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
