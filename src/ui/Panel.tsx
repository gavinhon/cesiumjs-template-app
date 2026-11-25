import type { ReactNode } from 'react';
import { useBottomSheet } from './useBottomSheet';
import './Panel.css';

interface PanelProps {
  id: string;
  title: string;
  subtitle: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Panel({ id, title, subtitle, open, onClose, children }: PanelProps) {
  const { sheetRef, detent, grabberProps } = useBottomSheet<HTMLElement>('half');
  const className = ['panel', `panel--sheet-${detent}`, open ? null : 'panel--collapsed']
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
