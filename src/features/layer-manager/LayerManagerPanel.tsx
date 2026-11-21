import { useId } from 'react';
import { SelectField } from '@/ui/Field';
import { Panel } from '@/ui/Panel';
import { ResourceList, ResourceRow } from '@/ui/ResourceList';
import type { BasemapChoice, LayerEntry, TerrainChoice } from './layerManagerTypes';
import './LayerManager.css';

interface LayerManagerPanelProps {
  open: boolean;
  /**
   * The imagery stack in Cesium's own order: **index 0 is the bottom**,
   * drawn first and covered by everything above it. The list renders this
   * reversed, because a layer panel that shows the topmost layer at the
   * bottom would be baffling.
   */
  imagery: LayerEntry[];
  /** 3D Tiles and vector data — present in the scene, but not part of the imagery stack. */
  sceneData: LayerEntry[];
  /** Which map is at the bottom of the imagery stack. */
  basemap: BasemapChoice;
  /** The globe surface everything else is draped on or sits above. */
  terrain: TerrainChoice;
}

/**
 * The basemap picker, under the imagery list — beside the row it changes,
 * which is always the last one, since the basemap is the bottom of the stack.
 */
function BasemapPicker({ basemap }: { basemap: BasemapChoice }) {
  const formId = useId();
  return (
    <div className="layer-manager__basemap">
      <SelectField
        formId={formId}
        fieldId="basemap"
        label="Basemap"
        value={basemap.selectedId}
        onChange={(event) => basemap.onSelect(event.target.value)}
      >
        {basemap.options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </SelectField>
    </div>
  );
}

/** `<select>` values must be strings; this one stands for "no terrain". */
const ELLIPSOID = '';

/**
 * The bottom of the stack: which surface the globe is drawn on.
 *
 * Listed last because the panel reads topmost-first and terrain is under
 * everything — imagery is draped over it, and tilesets and drawings sit on
 * it. Always shown, even with nothing to choose, so the hint can say where
 * terrain would come from.
 */
function TerrainSection({ terrain }: { terrain: TerrainChoice }) {
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
    <section className="layer-manager__section">
      <h2 className="layer-manager__heading">Terrain</h2>
      <SelectField
        formId={formId}
        fieldId="terrain"
        label="Surface"
        value={terrain.selectedId ?? ELLIPSOID}
        onChange={(event) => terrain.onSelect(event.target.value || null)}
        disabled={terrain.options.length === 0}
        hint={<span className={terrain.error ? 'layer-manager__error' : undefined}>{hint}</span>}
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
          className="control control-button layer-manager__zoom"
          onClick={terrain.onZoomTo}
        >
          Zoom to extent
        </button>
      )}
    </section>
  );
}

/** A reorder button. Disabled at the ends of the stack rather than hidden, so rows don't jump. */
function MoveButton({
  direction,
  name,
  disabled,
  onMove,
}: {
  direction: 'up' | 'down';
  name: string;
  disabled: boolean;
  onMove: (direction: 'up' | 'down') => void;
}) {
  return (
    <button
      type="button"
      className="layer-manager__move"
      onClick={() => onMove(direction)}
      disabled={disabled}
      aria-label={`Move ${name} ${direction}`}
      title={direction === 'up' ? 'Move up (draw on top)' : 'Move down (draw underneath)'}
    >
      {direction === 'up' ? '▲' : '▼'}
    </button>
  );
}

/**
 * A single view of everything currently on the map, whichever feature put
 * it there — the app's base map, OGC imagery, WFS vector data, and 3D
 * Tiles — with visibility toggles, double-click-to-zoom, and draw-order
 * controls.
 *
 * **Why only imagery can be reordered.** Raster imagery is painted onto the
 * globe surface in a fixed sequence, so "above" and "below" are real: a
 * layer higher in `viewer.imageryLayers` genuinely hides the ones under it,
 * and moving it is how you uncover something. 3D Tiles and WFS features are
 * geometry positioned in space, drawn with a depth buffer — what appears in
 * front is decided by where the camera is, not by list position. Offering
 * up/down arrows on those would be a control that visibly does nothing, so
 * they're listed in their own section without them.
 */
export function LayerManagerPanel({
  open,
  imagery,
  sceneData,
  basemap,
  terrain,
}: LayerManagerPanelProps) {
  // Cesium's collection is bottom-first; a layer list reads top-down.
  const topDownImagery = [...imagery].reverse();

  return (
    <Panel
      id="layer-manager-panel"
      side="right"
      title="Layers"
      subtitle="Everything currently in view, topmost first."
      open={open}
    >
      <section className="layer-manager__section">
        <h2 className="layer-manager__heading">Imagery</h2>
        <ResourceList emptyMessage="No imagery layers.">
          {topDownImagery.map((entry, index) => (
            <ResourceRow
              key={entry.id}
              name={entry.name}
              visible={entry.visible}
              onToggleVisibility={entry.onToggleVisibility}
              onZoomTo={entry.onZoomTo}
              zoomHint="Double-click to zoom to this layer"
              actions={
                entry.onMove && (
                  <>
                    <MoveButton
                      direction="up"
                      name={entry.name}
                      disabled={index === 0}
                      onMove={entry.onMove}
                    />
                    <MoveButton
                      direction="down"
                      name={entry.name}
                      disabled={index === topDownImagery.length - 1}
                      onMove={entry.onMove}
                    />
                  </>
                )
              }
            >
              <span className="resource-list__badge">{entry.kind}</span>
            </ResourceRow>
          ))}
        </ResourceList>
        <BasemapPicker basemap={basemap} />
      </section>

      <section className="layer-manager__section">
        <h2 className="layer-manager__heading">Scene data</h2>
        <p className="layer-manager__note">
          3D Tiles and vector features are drawn by depth, not stacked like imagery, so they have no
          draw order to change.
        </p>
        <ResourceList emptyMessage="No 3D Tiles or vector data loaded.">
          {sceneData.map((entry) => (
            <ResourceRow
              key={entry.id}
              name={entry.name}
              visible={entry.visible}
              onToggleVisibility={entry.onToggleVisibility}
              onZoomTo={entry.onZoomTo}
              zoomHint="Double-click to zoom to this layer"
            >
              <span className="resource-list__badge">{entry.kind}</span>
            </ResourceRow>
          ))}
        </ResourceList>
      </section>

      <TerrainSection terrain={terrain} />
    </Panel>
  );
}
