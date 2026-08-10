import type * as Cesium from 'cesium';
import { Panel } from '@/ui/Panel';
import { useOgcLayers } from './useOgcLayers';
import { AddLayerForm } from './AddLayerForm';
import { LayerList } from './LayerList';

interface OgcLayerPanelProps {
  viewer: Cesium.Viewer | null;
  /** Whether the panel is open. Controlled by the "OGC Layers" toolbar button. */
  open: boolean;
}

/**
 * The panel for connecting to OGC map services (WMS, WMTS, or a generic
 * XYZ tile template) and managing the imagery layers that come from them —
 * no Cesium ion account required.
 *
 * This is the feature's entry point, and the shape every feature panel in
 * this app follows: call the feature's state hook, then hand its state and
 * actions to a form (add something) and a list (manage what's been added).
 * See `docs/adding-a-feature.md`.
 *
 * The viewer is created asynchronously by <CesiumMap>, so this component
 * has to tolerate `viewer` being `null` on the very first render(s).
 */
export function OgcLayerPanel({ viewer, open }: OgcLayerPanelProps) {
  const { layers, addLayer, removeLayer, toggleVisibility, setAlpha, zoomToLayer } =
    useOgcLayers(viewer);

  return (
    <Panel
      id="ogc-layers-panel"
      title="OGC Layers"
      subtitle="Connect to WMS, WMTS, or XYZ tile services."
      open={open}
    >
      <AddLayerForm onAdd={addLayer} disabled={!viewer} />
      <LayerList
        layers={layers}
        onRemove={removeLayer}
        onToggleVisibility={toggleVisibility}
        onAlphaChange={setAlpha}
        onZoomToLayer={zoomToLayer}
      />
    </Panel>
  );
}
