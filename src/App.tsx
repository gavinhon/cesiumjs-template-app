import { useEffect, useMemo, useRef, useState } from 'react';
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
import { LayerManagerPanel } from '@/features/layer-manager/LayerManagerPanel';
import type {
  BasemapChoice,
  LayerEntry,
  TerrainChoice,
} from '@/features/layer-manager/layerManagerTypes';
import { MapStatusBar } from '@/features/map-status/MapStatusBar';
import { NavigationControls } from '@/features/navigation/NavigationControls';
import { FeatureInfoCard } from '@/features/ogc-layers/FeatureInfoCard';
import { AddOgcLayerForm } from '@/features/ogc-layers/AddOgcLayerForm';
import { legendLoaderFor } from '@/features/ogc-layers/layerLegend';
import { OGC_QUICK_ADD } from '@/features/ogc-layers/ogcQuickAdd';
import { useFeatureInspector } from '@/features/ogc-layers/useFeatureInspector';
import { useOgcLayers } from '@/features/ogc-layers/useOgcLayers';
import { SearchBox } from '@/features/search/SearchBox';
import { ShareLinkButton } from '@/features/share-link/ShareLinkButton';
import { useMapUrlState } from '@/features/share-link/useMapUrlState';
import type { SearchableDataset } from '@/features/search/searchTypes';
import { AddTilesetForm } from '@/features/tiles-3d/AddTilesetForm';
import { TILESET_QUICK_ADD } from '@/features/tiles-3d/tilesetQuickAdd';
import { TilesetPlacementControl } from '@/features/tiles-3d/TilesetPlacementControl';
import { useTilesets } from '@/features/tiles-3d/useTilesets';
import { useTerrain } from '@/features/terrain/useTerrain';
import { AppToolbar } from '@/ui/AppToolbar';
import { PANEL_SIDE, type PanelId } from '@/ui/panelIds';
import { useWidthAsCssVariable } from '@/ui/useWidthAsCssVariable';

/**
 * Every dataset a shared link can name: the Add data one-click
 * catalogues. Layers connected by typing a URL aren't in it, so they're
 * not put in links (see src/features/share-link/mapUrlState.ts).
 */
const CATALOGUE_IDS = new Set(
  [...OGC_QUICK_ADD, ...TILESET_QUICK_ADD].map((entry) => entry.item.id),
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

  // Which panel is open on each side. One per side, so two panels never
  // stack in the same corner — but Layers (left) and Add data (right) can be
  // open together: add a dataset on the right, see it arrive on the left.
  // On a screen too narrow for both, opening one closes the other.
  const [openPanels, setOpenPanels] = useState<Record<'left' | 'right', PanelId | null>>({
    left: null,
    right: null,
  });
  const showPanel = (panel: PanelId, show = true) => {
    const side = PANEL_SIDE[panel];
    // Opening a panel where there's no room for two closes the other side;
    // closing one leaves the other alone.
    const closeOther = show && window.matchMedia('(max-width: 800px)').matches;
    setOpenPanels((current) => ({
      left: side === 'left' ? (show ? panel : null) : closeOther ? null : current.left,
      right: side === 'right' ? (show ? panel : null) : closeOther ? null : current.right,
    }));
  };
  const togglePanel = (panel: PanelId) => showPanel(panel, openPanels[PANEL_SIDE[panel]] !== panel);
  const isOpen = (panel: PanelId) => openPanels[PANEL_SIDE[panel]] === panel;
  // After adding data, show where it went: the Layers panel is where it's
  // managed, and the Add data panel doesn't list it again.
  const showLayers = () => showPanel('layers');

  // These two hooks live here rather than inside their own panels because
  // the layer manager shows the same layers those panels manage. A hook
  // called in two components would be two independent copies of the state,
  // both mutating one Cesium collection — so shared feature state moves up
  // to the composition root.
  const ogcLayers = useOgcLayers(viewer);
  const tilesets = useTilesets(viewer);
  const terrain = useTerrain(viewer);

  // The right rail wraps into extra columns on short screens; the right
  // panel reads its measured width to stay clear of it. See Panel.css.
  const rightRailRef = useRef<HTMLDivElement>(null);
  useWidthAsCssVariable(rightRailRef, '--right-rail-width');

  const drawing = useDrawingTools(viewer);
  const { activeTool, setActiveTool, clearAll } = drawing;
  const { is2D, toggle: toggleSceneMode } = useSceneMode(viewer);

  // Clicking a WFS / ArcGIS / GeoJSON feature shows its attributes — but
  // only with no drawing tool armed, when a click isn't drawing something.
  const featureInspector = useFeatureInspector(viewer, ogcLayers.vectors, activeTool === 'none');

  // Clicking a shape on the globe should show you its attributes, not just
  // highlight it — otherwise selection looks like it did nothing whenever
  // the panel happens to be closed.
  const selectedDrawingId = drawing.selectedId;
  useEffect(() => {
    if (selectedDrawingId) {
      setOpenPanels((current) => ({ ...current, left: 'drawings' }));
    }
  }, [selectedDrawingId]);

  // Adapt each feature's own entries into the neutral shape the layer
  // manager renders. Doing it here is what keeps that feature from
  // importing the others — see src/features/layer-manager/layerManagerTypes.ts.
  const imageryEntries = useMemo<LayerEntry[]>(
    () =>
      ogcLayers.imagery.map((layer) => ({
        id: layer.id,
        name: layer.name,
        kind: layer.kind,
        visible: layer.visible,
        onToggleVisibility: () => ogcLayers.toggleVisibility(layer.id),
        onZoomTo: () => ogcLayers.zoomToLayer(layer.id),
        onMove: (direction: 'up' | 'down') => ogcLayers.moveImagery(layer.id, direction),
        // The basemap is swapped with the picker, never removed.
        onRemove: layer.removable ? () => ogcLayers.removeLayer(layer.id) : undefined,
        opacity: {
          value: layer.alpha,
          onChange: (alpha: number) => ogcLayers.setAlpha(layer.id, alpha),
        },
        legend: layer.config ? legendLoaderFor(layer.config) : undefined,
      })),
    [ogcLayers],
  );

  // 3D Tiles and WFS vectors share a section: neither is part of the
  // imagery draw order, so neither gets reorder controls (no `onMove`).
  const sceneEntries = useMemo<LayerEntry[]>(
    () => [
      ...tilesets.tilesets.map((entry) => ({
        id: entry.config.id,
        name: entry.config.name,
        kind: entry.config.format === 'i3s' ? 'I3S' : '3D TILES',
        visible: entry.visible,
        onToggleVisibility: () => tilesets.toggleVisibility(entry.config.id),
        onZoomTo: () => tilesets.zoomToTileset(entry.config.id),
        onRemove: () => tilesets.removeTileset(entry.config.id),
        detail: (
          <TilesetPlacementControl
            format={entry.config.format}
            placement={entry.placement}
            offset={entry.offset}
            reason={entry.reason}
            placeable={entry.footprint !== null}
            onChange={(placement) => void tilesets.setPlacement(entry.config.id, placement)}
          />
        ),
      })),
      ...ogcLayers.vectors.map((layer) => ({
        id: layer.id,
        name: layer.name,
        kind: layer.kind,
        visible: layer.visible,
        onToggleVisibility: () => ogcLayers.toggleVisibility(layer.id),
        onZoomTo: () => ogcLayers.zoomToLayer(layer.id),
        onRemove: () => ogcLayers.removeLayer(layer.id),
        // Drawn in the app's own style, whatever the server's renderer, so
        // the legend is that style for the geometry types actually loaded.
        legend: () => Promise.resolve(vectorLegend(layer.dataSource)),
      })),
    ],
    [tilesets, ogcLayers],
  );

  // Every ready-made dataset, from both features that offer some, with how
  // to tell it's on the map and how to add it. One list feeds the Add data
  // catalogue, the search box and shared links, so the three always agree.
  // Cheap enough (a dozen-odd entries) to rebuild per render.
  const catalogue: CatalogueEntry[] = [
    ...OGC_QUICK_ADD.map(({ item, config }) => ({
      item,
      isAdded:
        ogcLayers.imagery.some((entry) => entry.id === item.id) ||
        ogcLayers.vectors.some((entry) => entry.id === item.id),
      add: (options?: { flyTo?: boolean }) => ogcLayers.addLayer(config, options),
    })),
    ...TILESET_QUICK_ADD.map(({ item, config }) => ({
      item,
      isAdded: tilesets.tilesets.some((entry) => entry.config.id === item.id),
      add: (options?: { flyTo?: boolean }) => tilesets.addTileset(config, options),
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
    ogcLayers.imagery.length > 0,
    {
      basemapId: ogcLayers.basemapId,
      terrainId: terrain.selectedId,
      is2D,
      layerIds: [
        ...ogcLayers.imagery.map((entry) => entry.id),
        ...ogcLayers.vectors.map((entry) => entry.id),
        ...tilesets.tilesets.map((entry) => entry.config.id),
      ].filter((id) => CATALOGUE_IDS.has(id)),
    },
    {
      setBasemap: ogcLayers.setBasemap,
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
      options: ogcLayers.basemaps.map(({ id, name, thumbnail }) => ({ id, name, thumbnail })),
      selectedId: ogcLayers.basemapId,
      onSelect: ogcLayers.setBasemap,
    }),
    [ogcLayers],
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

      <LayerManagerPanel
        open={isOpen('layers')}
        onClose={() => showPanel('layers', false)}
        onAddData={() => showPanel('add-data')}
        imagery={imageryEntries}
        sceneData={sceneEntries}
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
              <AddOgcLayerForm
                disabled={!viewer}
                onAdd={async (config) => {
                  await ogcLayers.addLayer(config);
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
              <AddTilesetForm
                disabled={!viewer}
                onAdd={async (config) => {
                  await tilesets.addTileset(config);
                  showLayers();
                }}
              />
            ),
          },
        ]}
      />
      <DrawingPanel
        drawing={drawing}
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
