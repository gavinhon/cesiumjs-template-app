import { useState } from 'react';

interface ShareLinkButtonProps {
  /** Returns the link to the current view, from `useMapUrlState`. */
  getUrl: () => string;
  disabled: boolean;
}

type CopyState = 'idle' | 'copied' | 'failed';

const LABEL: Record<CopyState, string> = {
  idle: 'Copy a link to this view (layers added by URL are not included)',
  copied: 'Link copied',
  failed: 'Could not copy — the link is in the address bar',
};

/**
 * Copies a link to the current view. The address bar always holds the same
 * link (see `useMapUrlState`), but a button is where people look for it —
 * and on a phone the address bar is hard to get at.
 *
 * Styled by the row it sits in (`NavigationControls` renders it as a
 * child), so it matches the other square buttons there.
 */
export function ShareLinkButton({ getUrl, disabled }: ShareLinkButtonProps) {
  const [state, setState] = useState<CopyState>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(getUrl());
      setState('copied');
    } catch {
      // Refused clipboard access (permissions, an insecure origin).
      setState('failed');
    }
    window.setTimeout(() => setState('idle'), 1600);
  }

  return (
    <button
      type="button"
      className={
        state === 'copied'
          ? 'control control-button map-nav__button control-button--active'
          : 'control control-button map-nav__button'
      }
      onClick={() => void copy()}
      disabled={disabled}
      aria-label={LABEL[state]}
      title={LABEL[state]}
    >
      {state === 'copied' ? (
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12.5 L10 17 L19 7" />
        </svg>
      ) : (
        // Two chain links — the conventional "link" glyph, drawn in the
        // app's own 24px / 2px-stroke style like the drawing tools' icons.
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10 14 a4 4 0 0 0 5.7 0 l3-3 a4 4 0 0 0 -5.7 -5.7 l-1 1" />
          <path d="M14 10 a4 4 0 0 0 -5.7 0 l-3 3 a4 4 0 0 0 5.7 5.7 l1 -1" />
        </svg>
      )}
    </button>
  );
}
