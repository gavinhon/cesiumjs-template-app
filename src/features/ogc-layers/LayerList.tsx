import { ResourceList, ResourceRow } from '@/ui/ResourceList';
import type { ActiveLayer } from './types';

interface LayerListProps {
  layers: ActiveLayer[];
  onRemove: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onAlphaChange: (id: string, alpha: number) => void;
  onZoomToLayer: (id: string) => void;
}

/** Renders the imagery layers currently added to the map, with per-layer controls. */
export function LayerList({
  layers,
  onRemove,
  onToggleVisibility,
  onAlphaChange,
  onZoomToLayer,
}: LayerListProps) {
  return (
    <ResourceList emptyMessage="No layers added yet.">
      {layers.map(({ config, visible, alpha }) => (
        <ResourceRow
          key={config.id}
          name={config.name}
          visible={visible}
          onToggleVisibility={() => onToggleVisibility(config.id)}
          onRemove={() => onRemove(config.id)}
          onZoomTo={() => onZoomToLayer(config.id)}
          zoomHint="Double-click to zoom to this layer"
        >
          <span className="resource-list__badge">{config.type.toUpperCase()}</span>
          {/* Alpha (opacity) is set directly on the Cesium ImageryLayer,
              letting you blend a new layer over the base map instead of
              only ever fully replacing it. */}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={alpha}
            onChange={(e) => onAlphaChange(config.id, Number(e.target.value))}
            aria-label={`${config.name} opacity`}
          />
        </ResourceRow>
      ))}
    </ResourceList>
  );
}
