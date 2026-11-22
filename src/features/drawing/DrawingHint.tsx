import { isPathTool, isTwoPointTool, type DrawingTool } from './useDrawingTools';
import './DrawingHint.css';

interface DrawingHintProps {
  activeTool: DrawingTool;
  /** Finishes the path in progress — the touch stand-in for Enter. */
  onFinish: () => void;
  /** Removes the last vertex — the touch stand-in for Backspace. */
  onUndo: () => void;
}

/** What a click does, per tool. */
const ACTION_HINT: Record<Exclude<DrawingTool, 'none'>, string> = {
  point: 'Click to place a point',
  label: 'Click to place a label',
  line: 'Click to add points',
  polygon: 'Click to add corners',
  measure: 'Click to add points — distance is measured in 3D',
  height: 'Click a start point, then an end point',
  'line-of-sight': 'Click where the observer stands, then the target',
  viewshed: 'Click where the observer stands, then the edge of the area',
};

/**
 * A caption that appears while a drawing tool is armed, saying what a click
 * will do and which keys are live.
 *
 * Drawing has three conventions a first-time user cannot guess — double-click
 * ends a path, Backspace removes the last point, Escape abandons it (and,
 * pressed again, exits the tool) — and an
 * icon-only toolbar has nowhere to put that. Rather than leave them
 * undiscoverable, they're stated while they're relevant and gone the rest of
 * the time.
 *
 * Rendered as a sibling of the map rather than inside the toolbar: it belongs
 * near where the user is looking (the cursor, over the map), not pinned to the
 * button that started the tool.
 */
export function DrawingHint({ activeTool, onFinish, onUndo }: DrawingHintProps) {
  if (activeTool === 'none') return null;

  return (
    <div className="control drawing-hint" role="status">
      <span>{ACTION_HINT[activeTool]}</span>
      {/* Keyboard conventions for a mouse; DrawingHint.css swaps in the
          touch alternative below on a coarse pointer, where there are no
          keys to press and a double-tap is easy to miss. */}
      <span className="drawing-hint__keys">
        {isPathTool(activeTool) &&
          'Double-click or Enter to finish · Backspace to undo · Esc to discard, again to exit'}
        {isTwoPointTool(activeTool) &&
          'Clicks land on terrain or buildings · Esc to cancel, again to exit'}
        {!isPathTool(activeTool) && !isTwoPointTool(activeTool) && 'Esc to exit'}
      </span>
      <span className="drawing-hint__touch">
        {isPathTool(activeTool) ? (
          <>
            <button type="button" className="control control-button" onClick={onUndo}>
              Undo
            </button>
            <button
              type="button"
              className="control control-button control-button--primary"
              onClick={onFinish}
            >
              Finish
            </button>
          </>
        ) : (
          'Tap the tool again to exit'
        )}
      </span>
    </div>
  );
}
