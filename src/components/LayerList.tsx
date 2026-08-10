import type { ActiveLayer } from '../ogc/types';

interface LayerListProps {
  layers: ActiveLayer[];
  onRemove: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onAlphaChange: (id: string, alpha: number) => void;
  onZoomToLayer: (id: string) => void;
}

/** Renders the layers currently added to the map, with per-layer controls. */
export function LayerList({
  layers,
  onRemove,
  onToggleVisibility,
  onAlphaChange,
  onZoomToLayer,
}: LayerListProps) {
  if (layers.length === 0) {
    return <p className="layer-list__empty">No layers added yet.</p>;
  }

  return (
    <ul className="layer-list">
      {layers.map(({ config, visible, alpha }) => (
        <li key={config.id} className="layer-list__item">
          <div className="layer-list__row">
            <span className="layer-list__name">
              <input
                type="checkbox"
                checked={visible}
                onChange={() => onToggleVisibility(config.id)}
                aria-label={`Show ${config.name}`}
              />
              {/* A separate element (not the checkbox's own <label>) so a
                  double-click here doesn't also fire two toggle clicks on
                  the checkbox via label-forwarding. */}
              <span
                className="layer-list__name-text"
                onDoubleClick={() => onZoomToLayer(config.id)}
                title="Double-click to zoom to this layer"
              >
                {config.name}
              </span>
            </span>
            <button
              type="button"
              className="layer-list__remove"
              onClick={() => onRemove(config.id)}
              aria-label={`Remove ${config.name}`}
            >
              ×
            </button>
          </div>
          <div className="layer-list__row">
            <span className="layer-list__type">{config.type.toUpperCase()}</span>
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
          </div>
        </li>
      ))}
    </ul>
  );
}
