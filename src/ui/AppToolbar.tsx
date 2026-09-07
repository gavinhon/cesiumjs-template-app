import type { PanelId } from './panels';
import './Toolbar.css';

/**
 * The panels this toolbar can open, in display order.
 *
 * This is the registry adding a new feature panel goes through: add an
 * entry here, add its id to `PanelId` in ./panels.ts, and render your panel
 * in `App.tsx` with `open={openPanel === 'your-id'}`. `controls` must match
 * the `id` you pass to `<Panel>`, so `aria-controls` points at a real
 * element.
 *
 * Not every panel is listed here — the layer manager is opened from the
 * right rail instead. See ./panels.ts.
 */
const PANELS: { id: PanelId; label: string; controls: string }[] = [
  { id: 'ogc-layers', label: 'OGC Layers', controls: 'ogc-layers-panel' },
  { id: 'tiles-3d', label: '3D Tiles', controls: 'tiles-3d-panel' },
  { id: 'drawings', label: 'Drawings', controls: 'drawings-panel' },
];

interface ToolbarProps {
  openPanel: PanelId | null;
  onTogglePanel: (panel: PanelId) => void;
}

/**
 * Top-left toolbar: a search box, followed by one button per registered
 * side panel. This and the right rail are the app's only chrome besides
 * the map itself and whichever panel is open.
 *
 * Only one panel is open at a time (see `openPanel`'s type — a single
 * value, not one boolean per panel), so opening one closes the other
 * instead of the two stacking on top of each other in the same corner.
 */
export function Toolbar({ openPanel, onTogglePanel }: ToolbarProps) {
  return (
    <div className="toolbar">
      {/* Not wired up to anything yet — a placeholder for wherever you plug
          in a location search (e.g. Cesium's Geocoder, or your own API). */}
      <input
        type="search"
        className="control control-input toolbar__search"
        placeholder="Search"
        aria-label="Search"
      />

      {PANELS.map(({ id, label, controls }) => (
        <button
          key={id}
          type="button"
          className={
            openPanel === id
              ? 'control control-button toolbar__button control-button--active'
              : 'control control-button toolbar__button'
          }
          onClick={() => onTogglePanel(id)}
          aria-pressed={openPanel === id}
          aria-controls={controls}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
