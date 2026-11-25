import { Children, type ReactNode } from 'react';
import './ResourceList.css';

interface ResourceListProps {
  emptyMessage: string;
  children: ReactNode;
}

export function ResourceList({ emptyMessage, children }: ResourceListProps) {
  if (Children.count(children) === 0) {
    return <p className="resource-list__empty">{emptyMessage}</p>;
  }
  return <ul className="resource-list">{children}</ul>;
}

interface ResourceRowProps {
  name: string;
  visible: boolean;
  onToggleVisibility: () => void;
  onRemove?: () => void;
  onZoomTo: () => void;
  zoomHint: string;
  selected?: boolean;
  onSelect?: () => void;
  children?: ReactNode;
}

export function ResourceRow({
  name,
  visible,
  onToggleVisibility,
  onRemove,
  onZoomTo,
  zoomHint,
  selected = false,
  onSelect,
  children,
}: ResourceRowProps) {
  return (
    <li
      className={
        selected ? 'resource-list__item resource-list__item--selected' : 'resource-list__item'
      }
    >
      <div className="resource-list__row">
        <span className="resource-list__name">
          <input
            type="checkbox"
            checked={visible}
            onChange={onToggleVisibility}
            aria-label={`Show ${name}`}
          />
          <span
            className="resource-list__name-text"
            onClick={onSelect}
            onDoubleClick={onZoomTo}
            title={zoomHint}
          >
            {name}
          </span>
        </span>
        <span className="resource-list__actions">
          {onRemove && (
            <button
              type="button"
              className="resource-list__remove"
              onClick={onRemove}
              aria-label={`Remove ${name}`}
            >
              ×
            </button>
          )}
        </span>
      </div>
      {children && <div className="resource-list__row">{children}</div>}
    </li>
  );
}
