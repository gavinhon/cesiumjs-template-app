import { Panel } from '@/ui/Panel';
import { ResourceList, ResourceRow } from '@/ui/ResourceList';
import type { LayerEntry } from './types';
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
export function LayerManagerPanel({ open, imagery, sceneData }: LayerManagerPanelProps) {
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
    </Panel>
  );
}
