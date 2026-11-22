import { useState } from 'react';
import { shortSource } from '@/lib/shortSource';
import './QuickAddList.css';

/** One ready-made dataset, a click away from the map. */
export interface QuickAddItem {
  /**
   * Stable id, which the panel also adds the layer under — that's how the
   * list knows it's on the map, and frees the button again once it's removed.
   */
  id: string;
  name: string;
  /** Short format tag, e.g. "I3S", "ARCGIS". */
  badge: string;
  /** Where it comes from — a `public/` path or a service URL — shown small. */
  source: string;
  /** Heading it's listed under, e.g. "In this app's public/ folder". */
  group: string;
}

interface QuickAddListProps {
  items: readonly QuickAddItem[];
  /** Whether this item is already on the map; its button then reads "Added". */
  isAdded: (id: string) => boolean;
  /** Puts it on the map. A rejection is shown on its row rather than swallowed. */
  onAdd: (item: QuickAddItem) => void | Promise<void>;
  /** True while the Cesium viewer hasn't finished initializing yet. */
  disabled: boolean;
}

type RowStatus = { state: 'loading' } | { state: 'error'; message: string };

/**
 * The top of a data panel: everything ready to load without typing a URL —
 * datasets the build-time scan found in `public/`, and the example
 * services — each one click from the map, grouped under headings that say
 * what kind of data it is.
 *
 * A list rather than a dropdown so the choices are visible without opening
 * anything, and one click rather than "pick, then press Add". Renders
 * nothing when there's nothing to offer.
 */
export function QuickAddList({ items, isAdded, onAdd, disabled }: QuickAddListProps) {
  const [status, setStatus] = useState<Record<string, RowStatus>>({});

  if (items.length === 0) return null;
  const groups = [...new Set(items.map((item) => item.group))];

  async function add(item: QuickAddItem) {
    setStatus((prev) => ({ ...prev, [item.id]: { state: 'loading' } }));
    try {
      await onAdd(item);
      setStatus((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus((prev) => ({ ...prev, [item.id]: { state: 'error', message } }));
    }
  }

  return (
    <div className="quick-add-list">
      {groups.map((group) => (
        <section key={group} className="quick-add-list__group">
          <h2 className="quick-add-list__heading">{group}</h2>
          <ul className="quick-add-list__items">
            {items
              .filter((item) => item.group === group)
              .map((item) => {
                const added = isAdded(item.id);
                const rowStatus = status[item.id];
                const loading = rowStatus?.state === 'loading';
                return (
                  <li key={item.id} className="quick-add-list__item">
                    <div className="quick-add-list__text">
                      <span className="quick-add-list__name" title={item.name}>
                        {item.name}
                      </span>
                      <span className="quick-add-list__source" title={item.source}>
                        <span className="resource-list__badge">{item.badge}</span>
                        {shortSource(item.source)}
                      </span>
                      {rowStatus?.state === 'error' && (
                        <span className="quick-add-list__error">{rowStatus.message}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="control control-button quick-add-list__add"
                      onClick={() => void add(item)}
                      disabled={disabled || added || loading}
                      aria-label={added ? `${item.name} is on the map` : `Add ${item.name}`}
                    >
                      {added ? 'Added' : loading ? 'Adding…' : 'Add'}
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
