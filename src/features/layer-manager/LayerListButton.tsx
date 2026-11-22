import './LayerListButton.css';

interface LayerListButtonProps {
  open: boolean;
  onToggle: () => void;
}

/**
 * The phone's way into the layer list: a button at the top of the right
 * rail that raises the layer sheet. On a wide screen the list's own chip is
 * always in view, so CSS hides this.
 *
 * A direct child of the rail, as every rail group must be — the rail wraps
 * between its children (see `.app__right-rail` in global.css).
 */
export function LayerListButton({ open, onToggle }: LayerListButtonProps) {
  return (
    <button
      type="button"
      className={
        open
          ? 'control control-button layer-list-button control-button--active'
          : 'control control-button layer-list-button'
      }
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="layer-list"
      aria-label="Layers"
      title="Layers"
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3 L21 8 L12 13 L3 8 Z" />
        <path d="M3 12.5 L12 17.5 L21 12.5" />
        <path d="M3 17 L12 22 L21 17" />
      </svg>
    </button>
  );
}
