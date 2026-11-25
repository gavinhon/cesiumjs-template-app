import { isPathTool, isTwoPointTool, type DrawingTool } from './useDrawingTools';
import './DrawingHint.css';

interface DrawingHintProps {
  activeTool: DrawingTool;
  onFinish: () => void;
  onUndo: () => void;
}

const ACTION_HINT: Record<Exclude<DrawingTool, 'none'>, string> = {
  point: 'Click to place a point',
  label: 'Click to place a label',
  line: 'Click to add points',
  polygon: 'Click to add corners',
  measure: 'Click to add points — distance is measured in 3D',
  height: 'Click a start point, then an end point',
  'line-of-sight': 'Click the point to look from, then the target',
};

export function DrawingHint({ activeTool, onFinish, onUndo }: DrawingHintProps) {
  if (activeTool === 'none') return null;

  return (
    <div className="control drawing-hint" role="status">
      <span>{ACTION_HINT[activeTool]}</span>
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
