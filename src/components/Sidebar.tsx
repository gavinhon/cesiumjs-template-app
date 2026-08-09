import * as Cesium from 'cesium';
import { useOgcLayers } from '../ogc/useOgcLayers';
import { AddLayerForm } from './AddLayerForm';
import { LayerList } from './LayerList';
import './Sidebar.css';

interface SidebarProps {
  viewer: Cesium.Viewer | null;
  /** Whether the panel is open. Controlled by the "OGC Layers" toolbar button. */
  open: boolean;
}

/**
 * The panel for connecting to OGC map services (WMS, WMTS, or a generic
 * XYZ tile template) and managing the layers that come from them — no
 * Cesium ion account required.
 *
 * The viewer is created asynchronously by <CesiumMap>, so this component
 * has to tolerate `viewer` being `null` on the very first render(s).
 *
 * The panel stays mounted even while closed — only its CSS (transform/
 * visibility) changes. Unmounting it on close would reset the add-layer
 * form's in-progress input and the connected layer list, which would be a
 * surprising way to lose work.
 */
export function Sidebar({ viewer, open }: SidebarProps) {
  const { layers, addLayer, removeLayer, toggleVisibility, setAlpha } =
    useOgcLayers(viewer);

  return (
    <aside
      id="ogc-sidebar"
      className={open ? 'sidebar' : 'sidebar sidebar--collapsed'}
      aria-hidden={!open}
    >
      <header className="sidebar__header">
        <h1>OGC Layers</h1>
        <p>Connect to WMS, WMTS, or XYZ tile services.</p>
      </header>

      <AddLayerForm onAdd={addLayer} disabled={!viewer} />

      <LayerList
        layers={layers}
        onRemove={removeLayer}
        onToggleVisibility={toggleVisibility}
        onAlphaChange={setAlpha}
      />
    </aside>
  );
}
