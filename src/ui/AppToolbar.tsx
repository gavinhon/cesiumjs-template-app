import { useState, type ReactNode } from 'react';
import type { PanelId } from './panelIds';
import './AppToolbar.css';

/**
 * The panels this toolbar can open, in display order.
 *
 * This is the registry adding a new feature panel goes through: add an
 * entry here, add its id to `PanelId` in ./panelIds.ts, and render your panel
 * in `App.tsx` with `open={openPanel === 'your-id'}`. `controls` must match
 * the `id` you pass to `<Panel>`, so `aria-controls` points at a real
 * element.
 *
 * Labels name what the panel holds in plain words, not a protocol: "Add
 * data" covers map services, files and 3D models alike, where the old
 * "Map Services" and "3D Tiles" buttons made people guess which held what
 * (and "3D Tiles" also loaded I3S).
 */
const PANELS: { id: PanelId; label: string; controls: string }[] = [
  { id: 'layers', label: 'Layers', controls: 'layer-manager-panel' },
  { id: 'add-data', label: 'Add data', controls: 'add-data-panel' },
  { id: 'drawings', label: 'Drawings', controls: 'drawings-panel' },
];

interface AppToolbarProps {
  /** Whether a panel is open — on either side, since Add data docks right. */
  isOpen: (panel: PanelId) => boolean;
  onTogglePanel: (panel: PanelId) => void;
  /**
   * The search box, rendered first. A slot rather than an import: search is
   * a feature, and shared UI in src/ui never imports from a feature.
   */
  search: ReactNode;
}

/**
 * Top-left toolbar: a search box, followed by one button per registered
 * side panel. This and the right rail are the app's only chrome besides
 * the map itself and whichever panel is open.
 *
 * Layers and Drawings dock left, one at a time; Add data docks right, so it
 * can stay open beside Layers (see PANEL_SIDE).
 */
export function AppToolbar({ isOpen, onTogglePanel, search }: AppToolbarProps) {
  // Only meaningful in the compact layout, where the panel buttons don't
  // fit beside the search field and fold into a menu. On a wide screen the
  // menu button is hidden and the buttons always show, whatever this says.
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app-toolbar">
      <div className="app-toolbar__search">{search}</div>

      <button
        type="button"
        className={
          menuOpen
            ? 'control control-button app-toolbar__button app-toolbar__menu control-button--active'
            : 'control control-button app-toolbar__button app-toolbar__menu'
        }
        onClick={() => setMenuOpen((open) => !open)}
        aria-expanded={menuOpen}
        aria-controls="app-toolbar-panels"
      >
        Menu
      </button>

      <div
        id="app-toolbar-panels"
        className={
          menuOpen ? 'app-toolbar__panels app-toolbar__panels--open' : 'app-toolbar__panels'
        }
      >
        {PANELS.map(({ id, label, controls }) => (
          <button
            key={id}
            type="button"
            className={
              isOpen(id)
                ? 'control control-button app-toolbar__button control-button--active'
                : 'control control-button app-toolbar__button'
            }
            onClick={() => {
              onTogglePanel(id);
              // Picking a panel is what the menu was opened for; leaving it
              // open would cover the top of the sheet that just appeared.
              setMenuOpen(false);
            }}
            aria-pressed={isOpen(id)}
            aria-controls={controls}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
