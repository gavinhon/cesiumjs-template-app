import type { ReactNode } from 'react';
import type { PanelSlot } from './panelIds';
import { useBottomSheet } from './useBottomSheet';
import './Panel.css';

interface PanelProps {
  /**
   * DOM id, so the toolbar button that opens this panel can point at it
   * with `aria-controls`. Must match the `controls` value in the `PANELS`
   * registry in `src/ui/AppToolbar.tsx`.
   */
  id: string;
  /** Panel title, rendered in the monospace "technical label" style. */
  title: string;
  /** One line under the title saying what this panel is for. */
  subtitle: string;
  /** Whether the panel is open. Controlled by its toolbar button. */
  open: boolean;
  /**
   * Where the panel docks — see `PanelSlot`. Defaults to `'left'`; Add
   * data is `'beside'`, so it opens next to the Layers panel.
   */
  side?: PanelSlot;
  /**
   * Closes the panel from its own header. On a desktop the toolbar button
   * does the same, but on a phone the panel is a bottom sheet over most of
   * the screen and that button is folded into a menu — the sheet has to
   * be dismissible from where the user is looking.
   */
  onClose: () => void;
  children: ReactNode;
}

/**
 * The floating side panel every feature's UI lives in — Layers, Add data
 * and Drawings are all this component with different children, which is what keeps them visually identical instead of
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
export function Panel({ id, title, subtitle, open, side = 'left', onClose, children }: PanelProps) {
  // On a phone the panel is a bottom sheet that can be dragged between
  // three heights; on a wider screen the grabber is hidden and the
  // `panel--sheet-*` class has no rules, so none of this applies.
  const { sheetRef, detent, grabberProps } = useBottomSheet<HTMLElement>('half');
  const className = [
    'panel',
    `panel--${side}`,
    `panel--sheet-${detent}`,
    open ? null : 'panel--collapsed',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <aside ref={sheetRef} id={id} className={className} aria-hidden={!open}>
      <button type="button" className="panel__grabber" {...grabberProps} />
      <header className="panel__header">
        <div className="panel__title-row">
          <h1>{title}</h1>
          <button
            type="button"
            className="panel__close"
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            ×
          </button>
        </div>
        <p>{subtitle}</p>
      </header>
      {children}
    </aside>
  );
}
