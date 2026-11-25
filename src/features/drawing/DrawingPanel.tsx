import type * as Cesium from 'cesium';
import { Panel } from '@/ui/Panel';
import { ResourceList, ResourceRow } from '@/ui/ResourceList';
import { DrawnFeatureEditor } from './DrawnFeatureEditor';
import { ElevationProfile } from './ElevationProfile';
import type { useDrawingTools } from './useDrawingTools';
import './DrawingPanel.css';

interface DrawingPanelProps {
  drawing: ReturnType<typeof useDrawingTools>;
  viewer: Cesium.Viewer | null;
  open: boolean;
  onClose: () => void;
}

const KIND_LABEL = {
  point: 'POINT',
  line: 'LINE',
  polygon: 'POLYGON',
  measure: 'MEASURE',
  height: 'HEIGHT',
  'line-of-sight': 'SIGHT',
  label: 'LABEL',
} as const;

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

      {viewer &&
        selectedFeature &&
        (selectedFeature.kind === 'line' || selectedFeature.kind === 'measure') &&
        selectedFeature.positions.length >= 2 && (
          <ElevationProfile
            key={`${selectedFeature.id}:profile`}
            viewer={viewer}
            positions={selectedFeature.positions}
          />
        )}
    </Panel>
  );
}
