import { Children, type ReactNode } from 'react';
import './ResourceList.css';

interface ResourceListProps {
  /** Shown instead of the list when nothing has been added yet. */
  emptyMessage: string;
  /** `<ResourceRow>` elements — typically `items.map(...)`. */
  children: ReactNode;
}

/**
 * The list of map resources a feature panel has added — imagery layers,
 * 3D Tiles datasets, and whatever you add next.
 *
 * Every such list is the same shape (a row per resource, an empty state
 * when there are none), so features share this component rather than each
 * growing a near-duplicate of the same markup and CSS.
 */
export function ResourceList({ emptyMessage, children }: ResourceListProps) {
  if (Children.count(children) === 0) {
    return <p className="resource-list__empty">{emptyMessage}</p>;
  }
  return <ul className="resource-list">{children}</ul>;
}

interface ResourceRowProps {
  /** User-facing label for this resource. */
  name: string;
  visible: boolean;
  onToggleVisibility: () => void;
  onRemove: () => void;
  onZoomTo: () => void;
  /** Tooltip for the name, e.g. "Double-click to zoom to this layer". */
  zoomHint: string;
  /**
   * Optional second row of per-resource controls (e.g. a type badge and an
   * opacity slider). Rendered only when provided.
   */
  children?: ReactNode;
}

/**
 * One resource in a `<ResourceList>`: a visibility checkbox, a name you can
 * double-click to fly the camera to it, and a remove button — plus an
 * optional second row for controls specific to the kind of resource.
 */
export function ResourceRow({
  name,
  visible,
  onToggleVisibility,
  onRemove,
  onZoomTo,
  zoomHint,
  children,
}: ResourceRowProps) {
  return (
    <li className="resource-list__item">
      <div className="resource-list__row">
        <span className="resource-list__name">
          <input
            type="checkbox"
            checked={visible}
            onChange={onToggleVisibility}
            aria-label={`Show ${name}`}
          />
          {/* A separate element, not the checkbox's own <label>: a
              double-click on a label forwards two clicks to its input, which
              would toggle visibility twice while trying to zoom. */}
          <span className="resource-list__name-text" onDoubleClick={onZoomTo} title={zoomHint}>
            {name}
          </span>
        </span>
        <button
          type="button"
          className="resource-list__remove"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
        >
          ×
        </button>
      </div>
      {children && <div className="resource-list__row">{children}</div>}
    </li>
  );
}
