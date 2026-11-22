import { useId } from 'react';
import { SelectField } from '@/ui/Field';
import type { TerrainChoice } from './layerManagerTypes';
import './TerrainField.css';

interface TerrainFieldProps {
  terrain: TerrainChoice;
}

/** `<select>` values must be strings; this one stands for "no terrain". */
const ELLIPSOID = '';

/**
 * Which surface the globe is drawn on: a terrain tileset, or the bare
 * ellipsoid. A choice, not a row with a toggle — terrain is one slot.
 *
 * Shown in two places, one per layout: the basemap tile's menu on a wide
 * screen, and the phone's layer sheet, where that tile is hidden. One
 * component, so the two can't drift apart.
 *
 * Always shown, even with nothing to choose, so the hint can say where
 * terrain would come from.
 */
export function TerrainField({ terrain }: TerrainFieldProps) {
  const formId = useId();
  const selected = terrain.options.find((option) => option.id === terrain.selectedId);

  let hint: string;
  if (terrain.error) hint = `Couldn't load terrain: ${terrain.error}`;
  else if (terrain.loading) hint = 'Loading terrain…';
  else if (terrain.options.length === 0)
    hint = 'Add a terrain tileset under public/ — see scripts/build_terrain_tiles.py.';
  else if (selected) hint = selected.attribution || 'Elevation from a local terrain tileset.';
  else hint = 'Flat WGS84 ellipsoid — no elevation.';

  return (
    <div className="terrain-field">
      <SelectField
        formId={formId}
        fieldId="terrain"
        label="Terrain"
        value={terrain.selectedId ?? ELLIPSOID}
        onChange={(event) => terrain.onSelect(event.target.value || null)}
        disabled={terrain.options.length === 0}
        hint={<span className={terrain.error ? 'terrain-field__error' : undefined}>{hint}</span>}
      >
        <option value={ELLIPSOID}>None (WGS84 ellipsoid)</option>
        {terrain.options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </SelectField>
      {selected && (
        <button
          type="button"
          className="control control-button terrain-field__zoom"
          onClick={terrain.onZoomTo}
        >
          Zoom to extent
        </button>
      )}
    </div>
  );
}
