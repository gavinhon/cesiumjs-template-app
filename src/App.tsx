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
import { FeatureInfoCard } from '@/features/map-services/FeatureInfoCard';
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
import { ModelPlacementControl } from '@/features/models-3d/ModelPlacementControl';
import { useModels } from '@/features/models-3d/useModels';
import { useTerrain } from '@/features/terrain/useTerrain';
import { AppToolbar } from '@/ui/AppToolbar';
import { SINGLE_PANEL_QUERY } from '@/ui/compactLayoutQuery';
import type { PanelId } from '@/ui/panelIds';
import { useWidthAsCssVariable } from '@/ui/useWidthAsCssVariable';

/**
 * Every dataset a shared link can name: the Add data one-click
 * catalogues. Layers connected by typing a URL aren't in it, so they're
 * not put in links (see src/features/share-link/mapUrlState.ts).
 */
const CATALOGUE_IDS = new Set(
  [...MAP_SERVICE_QUICK_ADD, ...MODEL_QUICK_ADD].map((entry) => entry.item.id),
);

/**
 * The app shell. It owns the Cesium viewer, decides which panel is open,
 * and holds the feature hooks whose state more than one panel needs.
 *
 * It contains no map logic of its own — that lives in `src/features/*`.
 */
function App() {
  // The Cesium Viewer instance is created imperatively inside <CesiumMap>
  // (Cesium owns its own render loop and isn't a React component itself).
  // We lift the created instance up into React state so every feature can
  // act on the same viewer. It is `null` until the viewer has mounted,
  // which is why every feature hook takes `Viewer | null`.
  const [viewer, setViewer] = useState<Cesium.Viewer | null>(null);

  // Which side panel is open (left), and whether the layer list (right)
  // is expanded — on a phone, whether its sheet is up. Add data on one
  // side, watch it arrive in the list on the other. Where the two don't
  // both fit (SINGLE_PANEL_QUERY, which includes every phone), opening one
  // closes the other.
  const [openPanel, setOpenPanel] = useState<PanelId | null>(null);
  // Starts open where there's room, so a shared link's layers are in view;
  // on a phone a sheet over half the map at startup would be in the way.
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
  // After adding data, show where it went: the layer list is where it's
  // managed, and the Add data panel doesn't list it again.
  const showLayers = () => showLayerList(true);

  // These two hooks live here rather than inside their own panels because
  // the layer manager shows the same layers those panels manage. A hook
  // called in two components would be two independent copies of the state,
  // both mutating one Cesium collection — so shared feature state moves up
  // to the composition root.
  const mapServices = useMapServices(viewer);
  const models = useModels(viewer);
  const terrain = useTerrain(viewer);

  // The right rail wraps into extra columns on short screens; the layer
  // list and the phone toolbar read its measured width to stay clear of it.
  const rightRailRef = useRef<HTMLDivElement>(null);
  useWidthAsCssVariable(rightRailRef, '--right-rail-width');

  const drawing = useDrawingTools(viewer);
  const { activeTool, setActiveTool, clearAll } = drawing;
  const { is2D, toggle: toggleSceneMode } = useSceneMode(viewer);

  // Clicking a WFS / ArcGIS / GeoJSON feature shows its attributes — but
  // only with no drawing tool armed, when a click isn't drawing something.
  const featureInspector = useFeatureInspector(viewer, mapServices.vectors, activeTool === 'none');

  // Clicking a shape on the globe should show you its attributes, not just
  // highlight it — otherwise selection looks like it did nothing whenever
  // the panel happens to be closed.
  //
  // Done while rendering, when the selection is seen to change, rather than
  // in an effect: an effect would commit one frame with the panel still
  // shut, then re-render to open it. React's "adjust state when a value
  // changes" pattern — remember the last value seen, compare, update — gets
  // it into the same render. Only App's own state is set, and the second
  // pass finds nothing changed, so it can't loop.
  const selectedDrawingId = drawing.selectedId;
  const [seenDrawingId, setSeenDrawingId] = useState(selectedDrawingId);
  if (selectedDrawingId !== seenDrawingId) {
    setSeenDrawingId(selectedDrawingId);
    if (selectedDrawingId) showPanel('drawings');
  }

  // Adapt each feature's own entries into the neutral shape the layer
  // manager renders. Doing it here is what keeps that feature from
  // importing the others — see src/features/layer-manager/layerManagerTypes.ts.
  //
  // The basemap gets a row of its own (`basemapEntry`): listed, shown or
  // hidden and faded like the rest, but swapped rather than removed, and
  // never dragged — moveImagery never puts anything under it.
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

  // 3D Tiles and WFS vectors share a section: neither is part of the
  // imagery draw order, so neither can be dragged.
  const sceneEntries = useMemo<LayerEntry[]>(
    () => [
      ...models.models.map((entry) => ({
        id: entry.config.id,
        name: entry.config.name,
        kind: entry.config.format === 'i3s' ? 'I3S' : '3D TILES',
        visible: entry.visible,
        onToggleVisibility: () => models.toggleVisibility(entry.config.id),
        onZoomTo: () => models.zoomToModel(entry.config.id),
        onRemove: () => models.removeModel(entry.config.id),
        detail: (
          <ModelPlacementControl
            format={entry.config.format}
            placement={entry.placement}
            offset={entry.offset}
            reason={entry.reason}
            placeable={entry.footprint !== null}
            onChange={(placement) => void models.setPlacement(entry.config.id, placement)}
          />
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
        // Drawn in the app's own style, whatever the server's renderer, so
        // the legend is that style for the geometry types actually loaded.
        legend: () => Promise.resolve(vectorLegend(layer.dataSource)),
      })),
    ],
    [models, mapServices],
  );

  // Every ready-made dataset, from both features that offer some, with how
  // to tell it's on the map and how to add it. One list feeds the Add data
  // catalogue, the search box and shared links, so the three always agree.
  // Cheap enough (a dozen-odd entries) to rebuild per render.
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

  // The view in the address bar, and back from it on load: camera,
  // basemap, terrain, 2D/3D and the catalogue datasets on the map, in draw
  // order (imagery bottom-to-top first).
  const getShareUrl = useMapUrlState(
    viewer,
    // The basemap switch needs the imagery stack adopted first — see the hook.
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
        feature={featureInspector.inspected}
        onClose={featureInspector.close}
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

/** A ready-made dataset, whichever feature offers it — see `catalogue` in App. */
interface CatalogueEntry {
  item: QuickAddItem;
  isAdded: boolean;
  add: (options?: { flyTo?: boolean }) => Promise<void>;
}

/** The geometry types in a loaded vector layer, as a legend in the app's vector style. */
function vectorLegend(dataSource: Cesium.DataSource): LegendContent | null {
  const geometries = new Set<VectorGeometry>();
  for (const entity of dataSource.entities.values) {
    // GeoJSON points can arrive as billboards (Cesium's default marker).
    if (entity.point || entity.billboard) geometries.add('point');
    if (entity.polyline) geometries.add('line');
    if (entity.polygon) geometries.add('polygon');
  }
  return geometries.size > 0 ? { kind: 'vector', geometries: [...geometries] } : null;
}

export default App;
