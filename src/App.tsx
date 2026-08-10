import { useState } from 'react'
import * as Cesium from 'cesium'
import { CesiumMap } from './cesium/CesiumMap'
import { useSceneMode } from './cesium/useSceneMode'
import { useDrawingTools } from './drawing/useDrawingTools'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { DrawingToolbar } from './components/DrawingToolbar'
import './App.css'

function App() {
  // The Cesium Viewer instance is created imperatively inside <CesiumMap>
  // (Cesium owns its own render loop and isn't a React component itself).
  // We lift the created instance up into React state so sibling components
  // (Sidebar, DrawingToolbar) can act on the same viewer.
  const [viewer, setViewer] = useState<Cesium.Viewer | null>(null)

  // Whether the OGC layers panel is open. Lives here, not inside <Sidebar>,
  // because the button that toggles it lives in the sibling <Toolbar>.
  const [layersPanelOpen, setLayersPanelOpen] = useState(false)

  const { activeTool, setActiveTool, clearAll } = useDrawingTools(viewer)
  const { is2D, toggle: toggleSceneMode } = useSceneMode(viewer)

  return (
    <div className="app">
      <CesiumMap onViewerReady={setViewer} />
      <Toolbar
        layersPanelOpen={layersPanelOpen}
        onToggleLayersPanel={() => setLayersPanelOpen((open) => !open)}
      />
      <Sidebar viewer={viewer} open={layersPanelOpen} />
      <DrawingToolbar
        activeTool={activeTool}
        onSelectTool={setActiveTool}
        onClear={clearAll}
        is2D={is2D}
        onToggleSceneMode={toggleSceneMode}
      />
    </div>
  )
}

export default App
