import { useState } from 'react';
import type { PublicDataset } from '@/lib/publicDatasetTypes';
import './PublicDatasetList.css';

interface PublicDatasetListProps<T extends PublicDataset> {
  /** The datasets this panel can load — usually `publicDatasetsOfKind(...)`. */
  datasets: readonly T[];
  /** Short badge per dataset, e.g. "3D TILES". */
  badgeFor: (dataset: T) => string;
  /**
   * Whether this dataset is already on the map. Its button then reads
   * "Added" and is disabled, so one click can't load it twice.
   */
  isAdded: (dataset: T) => boolean;
  /**
   * Puts the dataset on the map. May be async; a rejection is shown on the
   * row it came from rather than swallowed.
   */
  onAdd: (dataset: T) => void | Promise<void>;
  /** True while the Cesium viewer hasn't finished initializing yet. */
  disabled: boolean;
}

type RowStatus = { state: 'loading' } | { state: 'error'; message: string };

/**
 * The "already in this app" shortcut at the top of a panel: every dataset
 * of the panel's kind that the build-time scan found under `public/`, each
 * one click from being on the map.
 *
 * Renders nothing when there are none, so a panel can include it
 * unconditionally and a fresh clone with an empty `public/` simply doesn't
 * show the section.
 */
export function PublicDatasetList<T extends PublicDataset>({
  datasets,
  badgeFor,
  isAdded,
  onAdd,
  disabled,
}: PublicDatasetListProps<T>) {
  const [status, setStatus] = useState<Record<string, RowStatus>>({});

  if (datasets.length === 0) return null;

  async function add(dataset: T) {
    setStatus((prev) => ({ ...prev, [dataset.id]: { state: 'loading' } }));
    try {
      await onAdd(dataset);
      setStatus((prev) => {
        const next = { ...prev };
        delete next[dataset.id];
        return next;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus((prev) => ({ ...prev, [dataset.id]: { state: 'error', message } }));
    }
  }

  return (
    <section className="public-dataset-list">
      <h2 className="public-dataset-list__heading">In this app's public/ folder</h2>
      <ul className="public-dataset-list__items">
        {datasets.map((dataset) => {
          const added = isAdded(dataset);
          const rowStatus = status[dataset.id];
          const loading = rowStatus?.state === 'loading';
          return (
            <li key={dataset.id} className="public-dataset-list__item">
              <div className="public-dataset-list__text">
                <span className="public-dataset-list__name" title={dataset.name}>
                  {dataset.name}
                </span>
                <span className="public-dataset-list__path" title={`public/${dataset.path}`}>
                  <span className="resource-list__badge">{badgeFor(dataset)}</span>
                  {dataset.path}
                </span>
                {rowStatus?.state === 'error' && (
                  <span className="public-dataset-list__error">{rowStatus.message}</span>
                )}
              </div>
              <button
                type="button"
                className="control control-button public-dataset-list__add"
                onClick={() => void add(dataset)}
                disabled={disabled || added || loading}
                aria-label={added ? `${dataset.name} is on the map` : `Add ${dataset.name}`}
              >
                {added ? 'Added' : loading ? 'Adding…' : 'Add'}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
