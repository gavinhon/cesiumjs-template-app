import { useState } from 'react';
import type * as Cesium from 'cesium';
import { CesiumMap } from '@/cesium/CesiumMap';
import { useSceneMode } from '@/cesium/useSceneMode';
import { useDrawingTools } from '@/features/drawing/useDrawingTools';
import { DrawingToolbar } from '@/features/drawing/DrawingToolbar';
import { OgcLayerPanel } from '@/features/ogc-layers/OgcLayerPanel';
import { TilesetPanel } from '@/features/tiles-3d/TilesetPanel';
import { Toolbar, type PanelId } from '@/ui/Toolbar';

/**
 * The app shell: it owns the Cesium viewer and decides which panel is
 * open, then hands the viewer to each feature. It contains no map logic of
 * its own — that lives in `src/features/*` — so adding a feature means
 * adding a hook call or a component here, not editing anything existing.
 */
function App() {
  // The Cesium Viewer instance is created imperatively inside <CesiumMap>
  // (Cesium owns its own render loop and isn't a React component itself).
  // We lift the created instance up into React state so every feature can
  // act on the same viewer. It is `null` until the viewer has mounted,
  // which is why every feature hook takes `Viewer | null`.
  const [viewer, setViewer] = useState<Cesium.Viewer | null>(null);

  // Which side panel (if any) is open. Lives here, not inside a panel,
  // because the buttons that toggle them live in the sibling <Toolbar>,
  // and only one panel should be open at a time.
  const [openPanel, setOpenPanel] = useState<PanelId | null>(null);
  const togglePanel = (panel: PanelId) => {
    setOpenPanel((current) => (current === panel ? null : panel));
  };

  const { activeTool, setActiveTool, clearAll } = useDrawingTools(viewer);
  const { is2D, toggle: toggleSceneMode } = useSceneMode(viewer);

  return (
    <div className="app">
      <CesiumMap onViewerReady={setViewer} />
      <Toolbar openPanel={openPanel} onTogglePanel={togglePanel} />
      <OgcLayerPanel viewer={viewer} open={openPanel === 'ogc-layers'} />
      <TilesetPanel viewer={viewer} open={openPanel === 'tiles-3d'} />
      <DrawingToolbar
        activeTool={activeTool}
        onSelectTool={setActiveTool}
        onClear={clearAll}
        is2D={is2D}
        onToggleSceneMode={toggleSceneMode}
      />
    </div>
  );
}

export default App;
