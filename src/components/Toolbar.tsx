import './Toolbar.css';

interface ToolbarProps {
  layersPanelOpen: boolean;
  onToggleLayersPanel: () => void;
}

/**
 * Top-left toolbar: a search box, followed by a button that opens/closes
 * the OGC layers panel. This is the app's only chrome besides the map
 * itself and the panel the button opens.
 */
export function Toolbar({ layersPanelOpen, onToggleLayersPanel }: ToolbarProps) {
  return (
    <div className="toolbar">
      {/* Not wired up to anything yet — a placeholder for wherever you plug
          in a location search (e.g. Cesium's Geocoder, or your own API). */}
      <input type="search" className="toolbar__search" placeholder="Search" aria-label="Search" />

      <button
        type="button"
        className={
          layersPanelOpen ? 'toolbar__button toolbar__button--active' : 'toolbar__button'
        }
        onClick={onToggleLayersPanel}
        aria-pressed={layersPanelOpen}
        aria-controls="ogc-sidebar"
      >
        OGC Layers
      </button>
    </div>
  );
}
