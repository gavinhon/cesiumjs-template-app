import { Panel } from '@/ui/Panel';
import { AddLayerForm } from './AddLayerForm';
import { LayerList } from './LayerList';
import type { useOgcLayers } from './useOgcLayers';

interface OgcLayerPanelProps {
  /**
   * The feature's state, from `useOgcLayers`.
   *
   * The hook is called in `App` rather than here because the layer manager
   * needs the same layers — two `useOgcLayers()` calls would be two
   * independent states fighting over one Cesium collection. When a feature's
   * state is needed in more than one place, it moves up to the composition
   * root; see docs/architecture.md.
   */
  layers: ReturnType<typeof useOgcLayers>;
  /** True while the Cesium viewer hasn't finished initializing yet. */
  disabled: boolean;
  /** Whether the panel is open. Controlled by the "OGC Layers" toolbar button. */
  open: boolean;
}

/**
 * The panel for connecting to OGC map services — WMS, WMTS and XYZ raster
 * imagery, plus WFS vector features — with no Cesium ion account required.
 *
 * This is the shape every feature panel in this app follows: take the
 * feature's state, then hand it to a form (add something) and a list
 * (manage what's been added). See `docs/adding-a-feature.md`.
 */
export function OgcLayerPanel({ layers, disabled, open }: OgcLayerPanelProps) {
  return (
    <Panel
      id="ogc-layers-panel"
      title="OGC Layers"
      subtitle="Connect to WMS, WMTS, WFS, or XYZ tile services."
      open={open}
    >
      <AddLayerForm onAdd={layers.addLayer} disabled={disabled} />
      <LayerList
        imagery={layers.imagery}
        vectors={layers.vectors}
        onRemove={layers.removeLayer}
        onToggleVisibility={layers.toggleVisibility}
        onAlphaChange={layers.setAlpha}
        onZoomToLayer={layers.zoomToLayer}
      />
    </Panel>
  );
}
