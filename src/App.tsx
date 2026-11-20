import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Cesium from 'cesium';
import { CesiumMap } from '@/cesium/CesiumMap';
import { useSceneMode } from '@/cesium/useSceneMode';
import { useDrawingTools } from '@/features/drawing/useDrawingTools';
import { DrawingToolbar } from '@/features/drawing/DrawingToolbar';
import { DrawingHint } from '@/features/drawing/DrawingHint';
import { DrawingPanel } from '@/features/drawing/DrawingPanel';
import { LayerManagerButton } from '@/features/layer-manager/LayerManagerButton';
import { LayerManagerPanel } from '@/features/layer-manager/LayerManagerPanel';
import type { LayerEntry, TerrainChoice } from '@/features/layer-manager/layerManagerTypes';
import { OgcLayerPanel } from '@/features/ogc-layers/OgcLayerPanel';
import { useOgcLayers } from '@/features/ogc-layers/useOgcLayers';
import { TilesetPanel } from '@/features/tiles-3d/TilesetPanel';
import { useTilesets } from '@/features/tiles-3d/useTilesets';
import { useTerrain } from '@/features/terrain/useTerrain';
import { AppToolbar } from '@/ui/AppToolbar';
import type { PanelId } from '@/ui/panelIds';
import { useWidthAsCssVariable } from '@/ui/useWidthAsCssVariable';

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

  // Which side panel (if any) is open. Lives here because the buttons that
  // toggle them live in sibling components, and only one should be open.
  const [openPanel, setOpenPanel] = useState<PanelId | null>(null);
  const togglePanel = (panel: PanelId) => {
    setOpenPanel((current) => (current === panel ? null : panel));
  };

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

  // Clicking a shape on the globe should show you its attributes, not just
  // highlight it — otherwise selection looks like it did nothing whenever
  // the panel happens to be closed.
  const selectedDrawingId = drawing.selectedId;
  useEffect(() => {
    if (selectedDrawingId) setOpenPanel('drawings');
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
        kind: '3D TILES',
        visible: entry.visible,
        onToggleVisibility: () => tilesets.toggleVisibility(entry.config.id),
        onZoomTo: () => tilesets.zoomToTileset(entry.config.id),
      })),
      ...ogcLayers.vectors.map((layer) => ({
        id: layer.id,
        name: layer.name,
        kind: layer.kind,
        visible: layer.visible,
        onToggleVisibility: () => ogcLayers.toggleVisibility(layer.id),
        onZoomTo: () => ogcLayers.zoomToLayer(layer.id),
      })),
    ],
    [tilesets, ogcLayers],
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

      <AppToolbar openPanel={openPanel} onTogglePanel={togglePanel} />

      <OgcLayerPanel layers={ogcLayers} disabled={!viewer} open={openPanel === 'ogc-layers'} />
      <TilesetPanel tilesets={tilesets} disabled={!viewer} open={openPanel === 'tiles-3d'} />
      <LayerManagerPanel
        open={openPanel === 'layers'}
        imagery={imageryEntries}
        sceneData={sceneEntries}
        terrain={terrainChoice}
      />
      <DrawingPanel drawing={drawing} open={openPanel === 'drawings'} />

      <DrawingHint activeTool={activeTool} />

      <div ref={rightRailRef} className="app__right-rail">
        <LayerManagerButton active={openPanel === 'layers'} onClick={() => togglePanel('layers')} />
        <DrawingToolbar
          activeTool={activeTool}
          onSelectTool={setActiveTool}
          onClear={clearAll}
          is2D={is2D}
          onToggleSceneMode={toggleSceneMode}
        />
      </div>
    </div>
  );
}

export default App;
