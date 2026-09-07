import type { ReactNode } from 'react';
import './Panel.css';

interface PanelProps {
  /**
   * DOM id, so the toolbar button that opens this panel can point at it
   * with `aria-controls`. Must match the `controls` value in the `PANELS`
   * registry in `src/ui/Toolbar.tsx`.
   */
  id: string;
  /** Panel title, rendered in the monospace "technical label" style. */
  title: string;
  /** One line under the title saying what this panel is for. */
  subtitle: string;
  /** Whether the panel is open. Controlled by its toolbar button. */
  open: boolean;
  /**
   * Which edge the panel docks to, matching the button that opens it.
   * Defaults to `'left'` (the panels opened from the top-left toolbar); the
   * layer manager uses `'right'` because its button lives in the right rail.
   */
  side?: 'left' | 'right';
  children: ReactNode;
}

/**
 * The floating side panel every feature's UI lives in — the OGC layers
 * panel and the 3D Tiles panel are both this component with different
 * children, which is what keeps them visually identical instead of
 * drifting apart as each grows.
 *
 * Two behaviours worth knowing before you add a third panel:
 *
 *  - It floats *over* the full-screen Cesium canvas rather than pushing it
 *    aside, so the map still covers the whole viewport. These are overlays,
 *    not layout columns.
 *  - It stays mounted while closed — only CSS (transform/visibility)
 *    changes. Unmounting on close would reset any in-progress form input
 *    and the feature's list of added resources, which is a surprising way
 *    to lose work. That means your feature's state hook keeps running
 *    while the panel is hidden; that is intentional.
 */
export function Panel({ id, title, subtitle, open, side = 'left', children }: PanelProps) {
  const className = ['panel', `panel--${side}`, open ? null : 'panel--collapsed']
    .filter(Boolean)
    .join(' ');

  return (
    <aside id={id} className={className} aria-hidden={!open}>
      <header className="panel__header">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </header>
      {children}
    </aside>
  );
}
