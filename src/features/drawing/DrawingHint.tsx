import { isPathTool, type DrawingTool } from './useDrawingTools';
import './DrawingHint.css';

interface DrawingHintProps {
  activeTool: DrawingTool;
}

/** What a click does, per tool. */
const ACTION_HINT: Record<Exclude<DrawingTool, 'none'>, string> = {
  point: 'Click to place a point',
  label: 'Click to place a label',
  line: 'Click to add points',
  polygon: 'Click to add corners',
  measure: 'Click to add points',
};

/**
 * A caption that appears while a drawing tool is armed, saying what a click
 * will do and which keys are live.
 *
 * Drawing has three conventions a first-time user cannot guess — double-click
 * ends a path, Backspace removes the last point, Escape abandons it — and an
 * icon-only toolbar has nowhere to put that. Rather than leave them
 * undiscoverable, they're stated while they're relevant and gone the rest of
 * the time.
 *
 * Rendered as a sibling of the map rather than inside the toolbar: it belongs
 * near where the user is looking (the cursor, over the map), not pinned to the
 * button that started the tool.
 */
export function DrawingHint({ activeTool }: DrawingHintProps) {
  if (activeTool === 'none') return null;

  return (
    <div className="control drawing-hint" role="status">
      <span>{ACTION_HINT[activeTool]}</span>
      {isPathTool(activeTool) && (
        <span className="drawing-hint__keys">
          Double-click or Enter to finish · Backspace to undo · Esc to discard
        </span>
      )}
    </div>
  );
}
