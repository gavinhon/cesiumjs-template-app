import { useMemo, useRef, useState } from 'react';
import type { QuickAddItem } from '@/ui/QuickAddList';
import type * as Cesium from 'cesium';
import type { LegendContent, VectorGeometry } from '@/lib/legendTypes';
import { CesiumMap } from '@/cesium/CesiumMap';
import { useSceneMode } from '@/cesium/useSceneMode';
import { AddDataPanel } from '@/features/add-data/AddDataPanel';
import { useDrawingTools } from '@/features/drawing/useDrawingTools';
import { DrawingToolbar } from '@/features/drawing/DrawingToolbar';
import { DrawingHint } from '@/features/drawing/DrawingHint';
import { DrawingPanel } from '@/features/drawing/DrawingPanel';
import { BasemapSwitcher } from '@/features/layer-manager/BasemapSwitcher';
import { LayerList } from '@/features/layer-manager/LayerList';
import { LayerListButton } from '@/features/layer-manager/LayerListButton';
import type {
  BasemapChoice,
  LayerEntry,
  TerrainChoice,
} from '@/features/layer-manager/layerManagerTypes';
import { MapStatusBar } from '@/features/map-status/MapStatusBar';
import { NavigationControls } from '@/features/navigation/NavigationControls';
import { FeatureInfoCard } from '@/cesium/FeatureInfoCard';
import { AddMapServiceForm } from '@/features/map-services/AddMapServiceForm';
import { legendLoaderFor } from '@/features/map-services/layerLegend';
import { MAP_SERVICE_QUICK_ADD } from '@/features/map-services/mapServiceQuickAdd';
import { useFeatureInspector } from '@/features/map-services/useFeatureInspector';
import { useMapServices } from '@/features/map-services/useMapServices';
import { SearchBox } from '@/features/search/SearchBox';
import { ShareLinkButton } from '@/features/share-link/ShareLinkButton';
import { useMapUrlState } from '@/features/share-link/useMapUrlState';
import type { SearchableDataset } from '@/features/search/searchTypes';
import { AddModelForm } from '@/features/models-3d/AddModelForm';
import { MODEL_QUICK_ADD } from '@/features/models-3d/modelQuickAdd';
import { ModelFilterControl } from '@/features/models-3d/ModelFilterControl';
import { ModelPlacementControl } from '@/features/models-3d/ModelPlacementControl';
import { useModelFilters } from '@/features/models-3d/useModelFilters';
import { useModelPartInspector } from '@/features/models-3d/useModelPartInspector';
import { useModels } from '@/features/models-3d/useModels';
import { LIVE_TRAFFIC_QUICK_ADD } from '@/features/live-traffic/liveTrafficQuickAdd';
import { LiveTrafficStatus } from '@/features/live-traffic/LiveTrafficStatus';
import { congestionLegend, incidentLegend } from '@/features/live-traffic/trafficPresentation';
import { useLiveTraffic } from '@/features/live-traffic/useLiveTraffic';
import { useLiveTrafficInspector } from '@/features/live-traffic/useLiveTrafficInspector';
import { useTerrain } from '@/features/terrain/useTerrain';
import { AppToolbar } from '@/ui/AppToolbar';
import { SINGLE_PANEL_QUERY } from '@/ui/compactLayoutQuery';
import type { PanelId } from '@/ui/panelIds';
import { useWidthAsCssVariable } from '@/ui/useWidthAsCssVariable';

const CATALOGUE_IDS = new Set(
  [...MAP_SERVICE_QUICK_ADD, ...MODEL_QUICK_ADD, ...LIVE_TRAFFIC_QUICK_ADD].map(
    (entry) => entry.item.id,
  ),
);

function App() {
  const [viewer, setViewer] = useState<Cesium.Viewer | null>(null);

  const [openPanel, setOpenPanel] = useState<PanelId | null>(null);
  const [layerListOpen, setLayerListOpen] = useState(
    () => !window.matchMedia(SINGLE_PANEL_QUERY).matches,
  );
  const crowded = () => window.matchMedia(SINGLE_PANEL_QUERY).matches;
  const showPanel = (panel: PanelId, show = true) => {
    setOpenPanel(show ? panel : null);
    if (show && crowded()) setLayerListOpen(false);
  };
  const togglePanel = (panel: PanelId) => showPanel(panel, openPanel !== panel);
  const isOpen = (panel: PanelId) => openPanel === panel;
  const showLayerList = (show: boolean) => {
    setLayerListOpen(show);
    if (show && crowded()) setOpenPanel(null);
  };
  const showLayers = () => showLayerList(true);

  const mapServices = useMapServices(viewer);
  const models = useModels(viewer);
  const terrain = useTerrain(viewer);
  const liveTraffic = useLiveTraffic(viewer);

  const rightRailRef = useRef<HTMLDivElement>(null);
  useWidthAsCssVariable(rightRailRef, '--right-rail-width');

  const drawing = useDrawingTools(viewer);
  const { activeTool, setActiveTool, clearAll } = drawing;
  const { is2D, toggle: toggleSceneMode } = useSceneMode(viewer);

  const featureInspector = useFeatureInspector(viewer, mapServices.vectors, activeTool === 'none');
  const partInspector = useModelPartInspector(viewer, models.models, activeTool === 'none');
  const trafficInspector = useLiveTrafficInspector(viewer, liveTraffic, activeTool === 'none');
  const modelFilters = useModelFilters(models.models);

  const selectedDrawingId = drawing.selectedId;
  const [seenDrawingId, setSeenDrawingId] = useState(selectedDrawingId);
  if (selectedDrawingId !== seenDrawingId) {
    setSeenDrawingId(selectedDrawingId);
    if (selectedDrawingId) showPanel('drawings');
  }

  const imageryEntries = useMemo<LayerEntry[]>(
    () =>
      mapServices.imagery
        .filter((layer) => layer.removable)
        .map((layer) => ({
          id: layer.id,
          name: layer.name,
          kind: layer.kind,
          visible: layer.visible,
          onToggleVisibility: () => mapServices.toggleVisibility(layer.id),
          onZoomTo: () => mapServices.zoomToLayer(layer.id),
          onRemove: () => mapServices.removeLayer(layer.id),
          opacity: {
            value: layer.alpha,
            onChange: (alpha: number) => mapServices.setAlpha(layer.id, alpha),
          },
          legend: layer.config ? legendLoaderFor(layer.config) : undefined,
        })),
    [mapServices],
  );

  const baseImagery = mapServices.imagery.find((layer) => !layer.removable);
  const basemapEntry: LayerEntry | null = baseImagery
    ? {
        id: baseImagery.id,
        name: baseImagery.name,
        kind: baseImagery.kind,
        visible: baseImagery.visible,
        onToggleVisibility: () => mapServices.toggleVisibility(baseImagery.id),
        opacity: {
          value: baseImagery.alpha,
          onChange: (alpha: number) => mapServices.setAlpha(baseImagery.id, alpha),
        },
      }
    : null;

  const sceneEntries = useMemo<LayerEntry[]>(
    () => [
      ...liveTraffic.layers.map((entry) => ({
        id: entry.id,
        name: entry.name,
        kind: 'LTA LIVE',
        visible: entry.visible,
        onToggleVisibility: () => liveTraffic.toggleVisibility(entry.layer),
        onZoomTo: liveTraffic.zoomTo,
        onRemove: () => liveTraffic.remove(entry.layer),
        detail: (
          <LiveTrafficStatus
            layer={entry}
            roadDetail={
              entry.layer === 'congestion'
                ? { value: liveTraffic.roadDetail, onChange: liveTraffic.setRoadDetail }
                : undefined
            }
          />
        ),
        legend: () =>
          Promise.resolve(entry.layer === 'congestion' ? congestionLegend() : incidentLegend()),
      })),
      ...models.models.map((entry) => ({
        id: entry.config.id,
        name: entry.config.name,
        kind: entry.config.format === 'i3s' ? 'I3S' : '3D TILES',
        visible: entry.visible,
        onToggleVisibility: () => models.toggleVisibility(entry.config.id),
        onZoomTo: () => models.zoomToModel(entry.config.id),
        onRemove: () => models.removeModel(entry.config.id),
        detail: (
          <>
            <ModelPlacementControl
              placement={entry.placement}
              offset={entry.offset}
              reason={entry.reason}
              placeable={entry.footprint !== null}
              onChange={(placement) => void models.setPlacement(entry.config.id, placement)}
            />
            <ModelFilterControl
              attributes={modelFilters.attributesOf(entry.config.id)}
              filter={modelFilters.filterOf(entry.config.id)}
              onChange={(change) => modelFilters.setFilter(entry.config.id, change)}
              sectionRange={entry.sectionRange}
            />
          </>
        ),
      })),
      ...mapServices.vectors.map((layer) => ({
        id: layer.id,
        name: layer.name,
        kind: layer.kind,
        visible: layer.visible,
        onToggleVisibility: () => mapServices.toggleVisibility(layer.id),
        onZoomTo: () => mapServices.zoomToLayer(layer.id),
        onRemove: () => mapServices.removeLayer(layer.id),
        legend: () => Promise.resolve(vectorLegend(layer.dataSource)),
      })),
    ],
    [models, mapServices, modelFilters, liveTraffic],
  );

  const catalogue: CatalogueEntry[] = [
    ...MAP_SERVICE_QUICK_ADD.map(({ item, config }) => ({
      item,
      isAdded:
        mapServices.imagery.some((entry) => entry.id === item.id) ||
        mapServices.vectors.some((entry) => entry.id === item.id),
      add: (options?: { flyTo?: boolean }) => mapServices.addLayer(config, options),
    })),
    ...MODEL_QUICK_ADD.map(({ item, config }) => ({
      item,
      isAdded: models.models.some((entry) => entry.config.id === item.id),
      add: (options?: { flyTo?: boolean }) => models.addModel(config, options),
    })),
    ...LIVE_TRAFFIC_QUICK_ADD.map(({ item, layer }) => ({
      item,
      isAdded: liveTraffic.layers.some((entry) => entry.layer === layer),
      add: () => liveTraffic.add(layer),
    })),
  ];
  const addFromCatalogue = async (id: string) => {
    const entry = catalogue.find((candidate) => candidate.item.id === id);
    if (!entry) return;
    await entry.add();
    showLayers();
  };

  const searchableDatasets: SearchableDataset[] = catalogue.map(({ item, isAdded }) => ({
    id: item.id,
    name: item.name,
    badge: item.badge,
    group: item.group,
    isAdded,
    add: () => addFromCatalogue(item.id),
  }));

  const getShareUrl = useMapUrlState(
    viewer,
    mapServices.imagery.length > 0,
    {
      basemapId: mapServices.basemapId,
      terrainId: terrain.selectedId,
      defaultTerrainId: terrain.defaultId,
      is2D,
      layerIds: [
        ...mapServices.imagery.map((entry) => entry.id),
        ...mapServices.vectors.map((entry) => entry.id),
        ...models.models.map((entry) => entry.config.id),
        ...liveTraffic.layers.map((entry) => entry.id),
      ].filter((id) => CATALOGUE_IDS.has(id)),
    },
    {
      setBasemap: mapServices.setBasemap,
      setTerrain: (id) => void terrain.selectTerrain(id, { flyToIfOffscreen: false }),
      addLayer: async (id) => {
        const entry = catalogue.find((candidate) => candidate.item.id === id);
        if (!entry) return false;
        await entry.add({ flyTo: false });
        return true;
      },
    },
  );

  const basemapChoice = useMemo<BasemapChoice>(
    () => ({
      options: mapServices.basemaps.map(({ id, name, thumbnail }) => ({ id, name, thumbnail })),
      selectedId: mapServices.basemapId,
      onSelect: mapServices.setBasemap,
    }),
    [mapServices],
  );

  const terrainChoice = useMemo<TerrainChoice>(
    () => ({
      options: terrain.options.map(({ id, name, attribution }) => ({ id, name, attribution })),
      selectedId: terrain.selectedId,
      loading: terrain.loading,
      error: terrain.error,
      onSelect: (id) => void terrain.selectTerrain(id),
      onZoomTo: terrain.zoomToSelected,
    }),
    [terrain],
  );

  return (
    <div className="app">
      <CesiumMap onViewerReady={setViewer} />

      <AppToolbar
        isOpen={isOpen}
        onTogglePanel={togglePanel}
        search={<SearchBox viewer={viewer} datasets={searchableDatasets} />}
      />

      <LayerList
        open={layerListOpen}
        onToggle={() => showLayerList(!layerListOpen)}
        imagery={imageryEntries}
        onMoveImagery={(id, toId) =>
          mapServices.moveImagery(
            id,
            mapServices.imagery.findIndex((layer) => layer.id === toId),
          )
        }
        sceneData={sceneEntries}
        basemapLayer={basemapEntry}
        basemap={basemapChoice}
        terrain={terrainChoice}
      />
      <AddDataPanel
        open={isOpen('add-data')}
        onClose={() => showPanel('add-data', false)}
        disabled={!viewer}
        catalogue={catalogue.map((entry) => entry.item)}
        isAdded={(id) => catalogue.some((entry) => entry.item.id === id && entry.isAdded)}
        onAdd={(item: QuickAddItem) => addFromCatalogue(item.id)}
        connect={[
          {
            id: 'map-service',
            label: 'Map service',
            formats: 'OGC WMS, WMTS or WFS, ArcGIS MapServer or FeatureServer, or an XYZ tile URL.',
            form: (
              <AddMapServiceForm
                disabled={!viewer}
                onAdd={async (config) => {
                  await mapServices.addLayer(config);
                  showLayers();
                }}
              />
            ),
          },
          {
            id: '3d-service',
            label: '3D service',
            formats: '3D Tiles (a tileset.json URL) or I3S (an ArcGIS SceneServer layer).',
            form: (
              <AddModelForm
                disabled={!viewer}
                onAdd={async (config) => {
                  await models.addModel(config);
                  showLayers();
                }}
              />
            ),
          },
        ]}
      />
      <DrawingPanel
        drawing={drawing}
        viewer={viewer}
        open={isOpen('drawings')}
        onClose={() => showPanel('drawings', false)}
      />

      <DrawingHint
        activeTool={activeTool}
        onFinish={drawing.finishInProgress}
        onUndo={drawing.undoInProgress}
      />
      <FeatureInfoCard
        viewer={viewer}
        feature={
          featureInspector.inspected ?? partInspector.inspected ?? trafficInspector.inspected
        }
        onClose={() => {
          featureInspector.close();
          partInspector.close();
          trafficInspector.close();
        }}
      />

      <div ref={rightRailRef} className="app__right-rail">
        <LayerListButton open={layerListOpen} onToggle={() => showLayerList(!layerListOpen)} />
        <DrawingToolbar activeTool={activeTool} onSelectTool={setActiveTool} onClear={clearAll} />
      </div>

      <NavigationControls viewer={viewer} is2D={is2D} onToggleSceneMode={toggleSceneMode}>
        <ShareLinkButton getUrl={getShareUrl} disabled={!viewer} />
      </NavigationControls>
      <MapStatusBar viewer={viewer} />
      <BasemapSwitcher basemap={basemapChoice} />
    </div>
  );
}

interface CatalogueEntry {
  item: QuickAddItem;
  isAdded: boolean;
  add: (options?: { flyTo?: boolean }) => Promise<void>;
}

function vectorLegend(dataSource: Cesium.DataSource): LegendContent | null {
  const geometries = new Set<VectorGeometry>();
  for (const entity of dataSource.entities.values) {
    if (entity.point || entity.billboard) geometries.add('point');
    if (entity.polyline) geometries.add('line');
    if (entity.polygon) geometries.add('polygon');
  }
  return geometries.size > 0 ? { kind: 'vector', geometries: [...geometries] } : null;
}

export default App;
