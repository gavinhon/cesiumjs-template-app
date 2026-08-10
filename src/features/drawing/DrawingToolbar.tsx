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
// for six glyphs. `stroke="currentColor"` makes each one pick up whatever
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

const TOOLS: { tool: Exclude<DrawingTool, 'none'>; label: string }[] = [
  { tool: 'point', label: 'Place a point' },
  { tool: 'line', label: 'Draw a line' },
  { tool: 'polygon', label: 'Draw a polygon' },
  { tool: 'measure', label: 'Measure distance' },
  { tool: 'label', label: 'Add a text label' },
];

/**
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
    <div className="drawing-toolbar">
      <button
        type="button"
        className="control control-button drawing-toolbar__button drawing-toolbar__mode"
        onClick={onToggleSceneMode}
        title={is2D ? 'Switch to 3D globe' : 'Switch to 2D map'}
      >
        {is2D ? '3D' : '2D'}
      </button>

      <div className="drawing-toolbar__group">
        {TOOLS.map(({ tool, label }) => (
          <button
            key={tool}
            type="button"
            className={
              activeTool === tool
                ? 'control control-button drawing-toolbar__button drawing-toolbar__button--active'
                : 'control control-button drawing-toolbar__button'
            }
            onClick={() => onSelectTool(activeTool === tool ? 'none' : tool)}
            aria-pressed={activeTool === tool}
            title={label}
          >
            {icons[tool]}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="control control-button drawing-toolbar__button"
        onClick={onClear}
        title="Clear all drawings"
      >
        {icons.clear}
      </button>
    </div>
  );
}
