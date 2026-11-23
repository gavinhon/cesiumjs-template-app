import { useEffect, useState, type ReactNode } from 'react';
import type { DrawingTool } from './useDrawingTools';
import './DrawingToolbar.css';

interface DrawingToolbarProps {
  activeTool: DrawingTool;
  onSelectTool: (tool: DrawingTool) => void;
  onClear: () => void;
}

// Small line-art icons, drawn by hand instead of pulling in an icon library
// for nine glyphs. `stroke="currentColor"` makes each one pick up whatever
// color the surrounding button/CSS sets, so hover/active states apply for free.
const icons: Record<Exclude<DrawingTool, 'none'> | 'clear' | 'draw', ReactNode> = {
  // The Draw menu's own icon, shown while none of its tools is armed.
  draw: (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 20 L5 15 L15.5 4.5 a2.1 2.1 0 0 1 3 3 L8 18 Z" />
      <line x1="13.5" y1="6.5" x2="16.5" y2="9.5" />
    </svg>
  ),
  point: (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <circle cx="12" cy="12" r="5" fill="currentColor" />
    </svg>
  ),
  line: (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="5" y1="19" x2="19" y2="5" />
      <circle cx="5" cy="19" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="19" cy="5" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  ),
  polygon: (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <polygon points="12,4 20,10 17,20 7,20 4,10" />
    </svg>
  ),
  measure: (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="4" y1="20" x2="20" y2="4" />
      <line x1="7.5" y1="16.5" x2="9.5" y2="14.5" />
      <line x1="11.5" y1="12.5" x2="13.5" y2="10.5" />
      <line x1="15.5" y1="8.5" x2="17.5" y2="6.5" />
    </svg>
  ),
  height: (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="5" y1="19" x2="19" y2="5" />
      <line x1="19" y1="5" x2="19" y2="19" strokeDasharray="2 3" />
      <line x1="5" y1="19" x2="19" y2="19" strokeDasharray="2 3" />
    </svg>
  ),
  'line-of-sight': (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12c1.6-2.7 3.3-4 5-4s3.4 1.3 5 4c-1.6 2.7-3.3 4-5 4s-3.4-1.3-5-4z" />
      <circle cx="7" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <line x1="14" y1="12" x2="19" y2="12" strokeDasharray="2 2.5" />
      <circle cx="21" cy="12" r="1.8" fill="currentColor" stroke="none" />
    </svg>
  ),
  label: (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h13l5 6-5 6H3z" />
      <line x1="8" y1="10" x2="14" y2="10" />
      <line x1="8" y1="14" x2="12" y2="14" />
    </svg>
  ),
  clear: (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  ),
};

type ToolEntry = {
  tool: Exclude<DrawingTool, 'none'>;
  /** Short name, shown in the menu. */
  name: string;
  /** One line under the name: what it does, or how to use it. */
  hint: string;
};

/**
 * Two menus, because they answer different questions: the first puts
 * something on the map, the second asks the map something.
 */
const TOOL_GROUPS: {
  id: 'draw' | 'analyse';
  name: string;
  icon: ReactNode;
  tools: ToolEntry[];
}[] = [
  {
    id: 'draw',
    name: 'Draw',
    icon: icons.draw,
    tools: [
      { tool: 'point', name: 'Point', hint: 'Shows its elevation' },
      { tool: 'line', name: 'Line', hint: 'Click points, double-click to finish' },
      { tool: 'polygon', name: 'Polygon', hint: 'Click corners, double-click to finish' },
      { tool: 'label', name: 'Label', hint: 'Text pinned to a place' },
    ],
  },
  {
    id: 'analyse',
    name: 'Measure and analyse',
    icon: icons.measure,
    tools: [
      { tool: 'measure', name: 'Distance', hint: 'In 3D and over the ground' },
      { tool: 'height', name: 'Height', hint: 'Difference between two points' },
      { tool: 'line-of-sight', name: 'Line of sight', hint: 'Can one point see another?' },
    ],
  },
];

/**
 * The drawing, measurement and analysis tools, for the right rail: a
 * **Draw** button and a **Measure and analyse** button, each opening a
 * labelled menu of its four tools, then the discard button.
 *
 * This used to be eight icon buttons in two boxes. Icons alone made people
 * hover each one to learn what it was, and the strip was the tallest thing
 * on screen. Two menu buttons keep the rail short (it no longer needs to
 * wrap on a laptop) and put a name and a one-line hint beside every tool.
 * The group button shows the armed tool's icon, lit, so what's armed is
 * still visible with the menu closed.
 *
 * Returns a fragment rather than its own wrapper: each menu and the
 * discard button are separate items of `.app__right-rail`, which is what
 * lets the rail wrap them into a second column on short screens. Inside a
 * wrapper they'd be one tall item, and a flex item can't be split across
 * columns.
 *
 * Tools behave like radio buttons: picking one disarms whichever was armed
 * (`useDrawingTools` only ever tracks one `activeTool`). Picking the armed
 * tool again disarms it, handing map clicks back to the camera.
 */
export function DrawingToolbar({ activeTool, onSelectTool, onClear }: DrawingToolbarProps) {
  const [openMenu, setOpenMenu] = useState<'draw' | 'analyse' | null>(null);

  // Close on a click anywhere else, or on Escape — the usual menu manners.
  // Escape is caught before useDrawingTools sees it: with a menu open,
  // closing the menu is all the user meant, not disarming the tool too.
  useEffect(() => {
    if (!openMenu) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('.drawing-toolbar__menu-wrap')) setOpenMenu(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      setOpenMenu(null);
    }
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [openMenu]);

  return (
    <>
      {TOOL_GROUPS.map((group) => {
        const armed = group.tools.find((entry) => entry.tool === activeTool);
        const open = openMenu === group.id;
        const menuId = `drawing-menu-${group.id}`;
        return (
          <div key={group.id} className="drawing-toolbar__menu-wrap">
            <button
              type="button"
              className={
                armed || open
                  ? 'control control-button drawing-toolbar__button drawing-toolbar__menu-button control-button--active'
                  : 'control control-button drawing-toolbar__button drawing-toolbar__menu-button'
              }
              onClick={() => setOpenMenu(open ? null : group.id)}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls={menuId}
              aria-label={armed ? `${group.name}: ${armed.name} armed` : group.name}
              title={armed ? `${group.name} — ${armed.name}` : group.name}
            >
              {armed ? icons[armed.tool] : group.icon}
            </button>
            {open && (
              <div
                id={menuId}
                className="control drawing-toolbar__menu"
                role="menu"
                aria-label={group.name}
              >
                <p className="drawing-toolbar__menu-heading">{group.name}</p>
                {group.tools.map(({ tool, name, hint }) => (
                  <button
                    key={tool}
                    type="button"
                    role="menuitemradio"
                    aria-checked={activeTool === tool}
                    className={
                      activeTool === tool
                        ? 'drawing-toolbar__item drawing-toolbar__item--active'
                        : 'drawing-toolbar__item'
                    }
                    onClick={() => {
                      onSelectTool(activeTool === tool ? 'none' : tool);
                      setOpenMenu(null);
                    }}
                  >
                    <span className="drawing-toolbar__item-icon">{icons[tool]}</span>
                    <span className="drawing-toolbar__item-text">
                      <span className="drawing-toolbar__item-name">{name}</span>
                      <span className="drawing-toolbar__item-hint">{hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        className="control control-button drawing-toolbar__button"
        onClick={onClear}
        aria-label="Clear all drawings"
        title="Clear all drawings"
      >
        {icons.clear}
      </button>
    </>
  );
}
