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
  /**
   * Omit to hide the remove button — for resources the user didn't add and
   * so shouldn't be able to delete, like the app's base map.
   */
  onRemove?: () => void;
  onZoomTo: () => void;
  /** Tooltip for the name, e.g. "Double-click to zoom to this layer". */
  zoomHint: string;
  /**
   * Marks this row as the current selection. Supply `onSelect` too — a row
   * that can look selected but can't be selected is a dead control.
   */
  selected?: boolean;
  /** Single-click on the name. Omit for lists where rows aren't selectable. */
  onSelect?: () => void;
  /**
   * Extra controls on the first row, before the remove button — used by the
   * layer manager for its reorder buttons.
   */
  actions?: ReactNode;
  /**
   * A full-width block under the rows — a layer's legend. Rendered only
   * when provided.
   */
  footer?: ReactNode;
  /**
   * Optional second row of per-resource controls (e.g. a type badge and an
   * opacity slider). Rendered only when provided.
   */
  children?: ReactNode;
}

/**
 * One resource in a `<ResourceList>`: a visibility checkbox, a name you can
 * double-click to fly the camera to it, and a remove button — plus optional
 * extra actions, and an optional second row for controls specific to the
 * kind of resource.
 */
export function ResourceRow({
  name,
  visible,
  onToggleVisibility,
  onRemove,
  onZoomTo,
  zoomHint,
  selected = false,
  onSelect,
  actions,
  footer,
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
          {/* A separate element, not the checkbox's own <label>: a
              double-click on a label forwards two clicks to its input, which
              would toggle visibility twice while trying to zoom. */}
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
          {actions}
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
      {footer}
    </li>
  );
}
