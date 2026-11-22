import type * as Cesium from 'cesium';
import { Panel } from '@/ui/Panel';
import { ResourceList, ResourceRow } from '@/ui/ResourceList';
import { DrawnFeatureEditor } from './DrawnFeatureEditor';
import { ElevationProfile } from './ElevationProfile';
import type { useDrawingTools } from './useDrawingTools';
import './DrawingPanel.css';

interface DrawingPanelProps {
  /** The drawing feature's state, from `useDrawingTools` — called in `App`. */
  drawing: ReturnType<typeof useDrawingTools>;
  /** For the elevation profile, which samples the viewer's terrain. */
  viewer: Cesium.Viewer | null;
  open: boolean;
  /** Closes the panel from its own header (see `Panel`). */
  onClose: () => void;
}

/** Badge text per kind, so a glance at the list says what each row is. */
const KIND_LABEL = {
  point: 'POINT',
  line: 'LINE',
  polygon: 'POLYGON',
  measure: 'MEASURE',
  height: 'HEIGHT',
  'line-of-sight': 'SIGHT',
  viewshed: 'VIEWSHED',
  label: 'LABEL',
} as const;

/**
 * The list of everything drawn, and an editor for whichever shape is
 * selected.
 *
 * Selection is shared with the map: clicking a shape on the globe highlights
 * its row here and opens this panel, and clicking a row highlights the shape.
 * One selection, two views of it — anything else would leave the two
 * disagreeing about what the user is working on.
 */
export function DrawingPanel({ drawing, viewer, open, onClose }: DrawingPanelProps) {
  const { features, selectedId, selectedFeature } = drawing;

  return (
    <Panel
      id="drawings-panel"
      title="Drawings"
      subtitle="Select a shape to name it, add attributes, or drag its vertices."
      open={open}
      onClose={onClose}
    >
      <ResourceList emptyMessage="Nothing drawn yet. Pick a tool from the right-hand rail.">
        {features.map((feature) => (
          <ResourceRow
            key={feature.id}
            name={feature.name}
            visible={feature.visible}
            selected={feature.id === selectedId}
            onSelect={() => drawing.selectFeature(feature.id)}
            onToggleVisibility={() => drawing.toggleFeatureVisibility(feature.id)}
            onRemove={() => drawing.removeFeature(feature.id)}
            onZoomTo={() => drawing.zoomToFeature(feature.id)}
            zoomHint="Click to select · double-click to zoom to it"
          >
            <span className="resource-list__badge">{KIND_LABEL[feature.kind]}</span>
            {feature.measurement && (
              <span className="drawing-panel__measurement">{feature.measurement}</span>
            )}
          </ResourceRow>
        ))}
      </ResourceList>

      {selectedFeature && (
        <DrawnFeatureEditor
          // Remounting per feature is deliberate: without it, switching
          // selection would leave the previous shape's text sitting in the
          // inputs until React reconciled each one.
          key={selectedFeature.id}
          feature={selectedFeature}
          onRename={(name) => drawing.renameFeature(selectedFeature.id, name)}
          onSetLabelSource={(source) => drawing.setLabelSource(selectedFeature.id, source)}
          onAddAttribute={() => drawing.addAttribute(selectedFeature.id)}
          onUpdateAttribute={(attributeId, patch) =>
            drawing.updateAttribute(selectedFeature.id, attributeId, patch)
          }
          onRemoveAttribute={(attributeId) =>
            drawing.removeAttribute(selectedFeature.id, attributeId)
          }
        />
      )}

      {/* Lines and distance measurements get a ground profile: they're the
          two kinds that trace a route across the land. */}
      {viewer &&
        selectedFeature &&
        (selectedFeature.kind === 'line' || selectedFeature.kind === 'measure') &&
        selectedFeature.positions.length >= 2 && (
          <ElevationProfile
            key={selectedFeature.id}
            viewer={viewer}
            positions={selectedFeature.positions}
          />
        )}
    </Panel>
  );
}
