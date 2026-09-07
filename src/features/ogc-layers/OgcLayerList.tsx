import { ResourceList, ResourceRow } from '@/ui/ResourceList';
import type { ManagedImageryLayer, ManagedVectorLayer } from './types';

interface LayerListProps {
  imagery: ManagedImageryLayer[];
  vectors: ManagedVectorLayer[];
  onRemove: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onAlphaChange: (id: string, alpha: number) => void;
  onZoomToLayer: (id: string) => void;
}

/**
 * The layers added from this panel, raster and vector together.
 *
 * The app's base map is filtered out (`removable === false`): `useOgcLayers`
 * tracks it so the layer manager can reorder the full stack, but this panel
 * is about what *you* connected, and offering to delete the basemap here
 * would be a surprising thing to find next to your own layers.
 */
export function LayerList({
  imagery,
  vectors,
  onRemove,
  onToggleVisibility,
  onAlphaChange,
  onZoomToLayer,
}: LayerListProps) {
  return (
    <ResourceList emptyMessage="No layers added yet.">
      {imagery
        .filter((layer) => layer.removable)
        .map((layer) => (
          <ResourceRow
            key={layer.id}
            name={layer.name}
            visible={layer.visible}
            onToggleVisibility={() => onToggleVisibility(layer.id)}
            onRemove={() => onRemove(layer.id)}
            onZoomTo={() => onZoomToLayer(layer.id)}
            zoomHint="Double-click to zoom to this layer"
          >
            <span className="resource-list__badge">{layer.kind}</span>
            {/* Alpha (opacity) is set directly on the Cesium ImageryLayer,
                letting you blend a new layer over the base map instead of
                only ever fully replacing it. */}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={layer.alpha}
              onChange={(e) => onAlphaChange(layer.id, Number(e.target.value))}
              aria-label={`${layer.name} opacity`}
            />
          </ResourceRow>
        ))}

      {/* No opacity slider for vector layers: they're entities, not a
          texture on the globe, so there's no single `alpha` to turn down —
          transparency would mean restyling every feature. */}
      {vectors.map((layer) => (
        <ResourceRow
          key={layer.id}
          name={layer.name}
          visible={layer.visible}
          onToggleVisibility={() => onToggleVisibility(layer.id)}
          onRemove={() => onRemove(layer.id)}
          onZoomTo={() => onZoomToLayer(layer.id)}
          zoomHint="Double-click to zoom to this layer"
        >
          <span className="resource-list__badge">{layer.kind}</span>
        </ResourceRow>
      ))}
    </ResourceList>
  );
}
