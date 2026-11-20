import type { ReactNode } from 'react';
import type { DrawingTool } from './useDrawingTools';
import './DrawingToolbar.css';

interface DrawingToolbarProps {
  activeTool: DrawingTool;
  onSelectTool: (tool: DrawingTool) => void;
  onClear: () => void;
  is2D: boolean;
  onToggleSceneMode: () => void;
}

// Small line-art icons, drawn by hand instead of pulling in an icon library
// for nine glyphs. `stroke="currentColor"` makes each one pick up whatever
// color the surrounding button/CSS sets, so hover/active states apply for free.
const icons: Record<Exclude<DrawingTool, 'none'> | 'clear', ReactNode> = {
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
  viewshed: (
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
      <circle cx="12" cy="12" r="9" strokeDasharray="2 3" />
      <path d="M12 12 L18.4 5.6 A9 9 0 0 1 21 12 Z" fill="currentColor" stroke="none" />
      <path d="M12 12 L5.6 18.4 A9 9 0 0 1 3 12 Z" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
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

type ToolEntry = { tool: Exclude<DrawingTool, 'none'>; label: string };

/**
 * Two groups, because they answer different questions: the first puts
 * something on the map, the second asks the map something. Grouped, an
 * eight-button strip reads as two short lists instead of one long one.
 */
const TOOL_GROUPS: { name: string; tools: ToolEntry[] }[] = [
  {
    name: 'Draw',
    tools: [
      { tool: 'point', label: 'Place a point (shows its elevation)' },
      { tool: 'line', label: 'Draw a line' },
      { tool: 'polygon', label: 'Draw a polygon' },
      { tool: 'label', label: 'Add a text label' },
    ],
  },
  {
    name: 'Measure and analyse',
    tools: [
      { tool: 'measure', label: 'Measure distance — 3D and over the ground' },
      { tool: 'height', label: 'Measure height difference between two points' },
      { tool: 'line-of-sight', label: 'Line of sight — can one point see another?' },
      { tool: 'viewshed', label: 'Viewshed — what can be seen from a point' },
    ],
  },
];

/**
 * The drawing, measurement and analysis tools, as buttons for the right
 * rail.
 *
 * Returns a fragment rather than its own wrapper: the 2D/3D toggle, each
 * tool group, and the discard button become separate items of
 * `.app__right-rail`, which is what lets the rail wrap them into a second
 * column on short screens. Inside a wrapper they'd be one tall item, and a
 * flex item can't be split across columns.
 *
 * A small vertical strip of icon buttons on the right edge of the screen —
 * the drawing/measurement equivalent of the OGC layers button on the left.
 *
 * Tool buttons behave like a set of radio buttons: picking one deselects
 * whichever was active before (see `useDrawingTools`, which only ever
 * tracks one `activeTool`). Clicking the already-active tool turns
 * drawing off entirely, handing control of map clicks back to the camera.
 */
export function DrawingToolbar({
  activeTool,
  onSelectTool,
  onClear,
  is2D,
  onToggleSceneMode,
}: DrawingToolbarProps) {
  return (
    <>
      <button
        type="button"
        className="control control-button drawing-toolbar__button drawing-toolbar__mode"
        onClick={onToggleSceneMode}
        title={is2D ? 'Switch to 3D globe' : 'Switch to 2D map'}
      >
        {is2D ? '3D' : '2D'}
      </button>

      {TOOL_GROUPS.map((group) => (
        <div
          key={group.name}
          className="drawing-toolbar__group"
          role="group"
          aria-label={group.name}
        >
          {group.tools.map(({ tool, label }) => (
            <button
              key={tool}
              type="button"
              className={
                activeTool === tool
                  ? 'control control-button drawing-toolbar__button control-button--active'
                  : 'control control-button drawing-toolbar__button'
              }
              onClick={() => onSelectTool(activeTool === tool ? 'none' : tool)}
              aria-pressed={activeTool === tool}
              aria-label={label}
              title={label}
            >
              {icons[tool]}
            </button>
          ))}
        </div>
      ))}

      <button
        type="button"
        className="control control-button drawing-toolbar__button"
        onClick={onClear}
        title="Clear all drawings"
      >
        {icons.clear}
      </button>
    </>
  );
}
