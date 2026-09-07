import './LayerManager.css';

interface LayerManagerButtonProps {
  /** True while the layer manager panel is open. */
  active: boolean;
  onClick: () => void;
}

/**
 * Opens the layer manager. Lives at the top of the right rail, above the
 * drawing tools, because the panel it opens docks to the right — a button
 * on the left opening a panel on the right reads as two unrelated things.
 *
 * Uses the same `.control control-button` primitives as every other
 * floating control, so it inherits the shared glass look and hover state.
 */
export function LayerManagerButton({ active, onClick }: LayerManagerButtonProps) {
  return (
    <button
      type="button"
      className={
        active
          ? 'control control-button layer-manager__button control-button--active'
          : 'control control-button layer-manager__button'
      }
      onClick={onClick}
      aria-pressed={active}
      aria-controls="layer-manager-panel"
      title="Layer manager"
    >
      {/* Three stacked sheets — the conventional "layers" glyph. Hand-drawn
          rather than pulling in an icon library, matching DrawingToolbar. */}
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      >
        <polygon points="12,3 21,8 12,13 3,8" />
        <polyline points="3,12 12,17 21,12" />
        <polyline points="3,16 12,21 21,16" />
      </svg>
    </button>
  );
}
