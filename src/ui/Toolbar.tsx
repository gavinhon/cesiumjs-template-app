import './Toolbar.css';

/** Identifies one side panel. Add a member when you add a panel. */
export type PanelId = 'ogc-layers' | 'tiles-3d';

/**
 * The panels the toolbar can open, in display order.
 *
 * This is the registry adding a new feature panel goes through: add an
 * entry here, add its id to `PanelId`, and render your panel in `App.tsx`
 * with `open={openPanel === 'your-id'}`. `controls` must match the `id`
 * you pass to `<Panel>`, so `aria-controls` points at a real element.
 */
const PANELS: { id: PanelId; label: string; controls: string }[] = [
  { id: 'ogc-layers', label: 'OGC Layers', controls: 'ogc-layers-panel' },
  { id: 'tiles-3d', label: '3D Tiles', controls: 'tiles-3d-panel' },
];

interface ToolbarProps {
  openPanel: PanelId | null;
  onTogglePanel: (panel: PanelId) => void;
}

/**
 * Top-left toolbar: a search box, followed by one button per side panel.
 * This and the drawing toolbar are the app's only chrome besides the map
 * itself and whichever panel is open.
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
              ? 'control control-button toolbar__button toolbar__button--active'
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
