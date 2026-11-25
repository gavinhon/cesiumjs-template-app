import { useState, type ReactNode } from 'react';
import type { PanelId } from './panelIds';
import './AppToolbar.css';

const PANELS: { id: PanelId; label: string; controls: string }[] = [
  { id: 'add-data', label: 'Add data', controls: 'add-data-panel' },
  { id: 'drawings', label: 'Drawings', controls: 'drawings-panel' },
];

interface AppToolbarProps {
  isOpen: (panel: PanelId) => boolean;
  onTogglePanel: (panel: PanelId) => void;
  search: ReactNode;
}

export function AppToolbar({ isOpen, onTogglePanel, search }: AppToolbarProps) {
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
