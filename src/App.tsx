import { useState } from 'react'
import * as Cesium from 'cesium'
import { CesiumMap } from './cesium/CesiumMap'
import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import './App.css'

function App() {
  // The Cesium Viewer instance is created imperatively inside <CesiumMap>
  // (Cesium owns its own render loop and isn't a React component itself).
  // We lift the created instance up into React state so <Sidebar>, a
  // sibling component, can add/remove imagery layers on the same viewer.
  const [viewer, setViewer] = useState<Cesium.Viewer | null>(null)

  // Whether the OGC layers panel is open. Lives here, not inside <Sidebar>,
  // because the button that toggles it lives in the sibling <Toolbar>.
  const [layersPanelOpen, setLayersPanelOpen] = useState(false)

  return (
    <div className="app">
      <CesiumMap onViewerReady={setViewer} />
      <Toolbar
        layersPanelOpen={layersPanelOpen}
        onToggleLayersPanel={() => setLayersPanelOpen((open) => !open)}
      />
      <Sidebar viewer={viewer} open={layersPanelOpen} />
    </div>
  )
}

export default App
