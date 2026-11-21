import { publicDatasetsOfKind } from '@/lib/publicDatasets';
import type { PublicGeoJsonDataset, PublicTilePyramidDataset } from '@/lib/publicDatasetTypes';
import { Panel } from '@/ui/Panel';
import { PublicDatasetList } from '@/ui/PublicDatasetList';
import { AddOgcLayerForm } from './AddOgcLayerForm';
import type { OgcLayerConfig } from './ogcLayerTypes';
import { OgcLayerList } from './OgcLayerList';
import type { useOgcLayers } from './useOgcLayers';

type OgcPublicDataset = PublicTilePyramidDataset | PublicGeoJsonDataset;

/** Tile pyramids and GeoJSON files found under `public/` at build time. */
const PUBLIC_OGC_DATASETS: OgcPublicDataset[] = [
  ...publicDatasetsOfKind('xyz'),
  ...publicDatasetsOfKind('geojson'),
];

/**
 * Translates a scanned dataset into the config this feature already knows
 * how to load. Uses the dataset's catalog id as the layer id, which is how
 * the list tells that it's already on the map.
 */
function configFor(dataset: OgcPublicDataset): OgcLayerConfig {
  switch (dataset.kind) {
    case 'xyz':
      return {
        type: 'xyz',
        id: dataset.id,
        name: dataset.name,
        url: dataset.urlTemplate,
        maximumLevel: dataset.maximumLevel,
      };
    case 'geojson':
      return { type: 'geojson', id: dataset.id, name: dataset.name, url: dataset.url };
    default: {
      const exhaustive: never = dataset;
      throw new Error(`Unsupported dataset: ${JSON.stringify(exhaustive)}`);
    }
  }
}

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
      <PublicDatasetList
        datasets={PUBLIC_OGC_DATASETS}
        badgeFor={(dataset) => (dataset.kind === 'xyz' ? 'XYZ' : 'GEOJSON')}
        isAdded={(dataset) =>
          layers.imagery.some((entry) => entry.id === dataset.id) ||
          layers.vectors.some((entry) => entry.id === dataset.id)
        }
        onAdd={(dataset) => layers.addLayer(configFor(dataset))}
        disabled={disabled}
      />
      <AddOgcLayerForm onAdd={layers.addLayer} disabled={disabled} />
      <OgcLayerList
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
