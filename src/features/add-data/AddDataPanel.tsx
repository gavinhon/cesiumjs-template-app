import { useId, useMemo, useState, type ReactNode } from 'react';
import { CATALOGUE_GROUP_ORDER } from '@/lib/catalogueGroups';
import { Panel } from '@/ui/Panel';
import { QuickAddList, type QuickAddItem } from '@/ui/QuickAddList';
import './AddDataPanel.css';

/** One way to connect your own data, shown as a tab beside the catalogue. */
export interface ConnectTab {
  id: string;
  /** Tab label, e.g. "Map service". */
  label: string;
  /** One line under the tabs naming the formats it takes. */
  formats: string;
  /** The form itself, from the feature that knows the protocol. */
  form: ReactNode;
}

interface AddDataPanelProps {
  open: boolean;
  onClose: () => void;
  /** True while the Cesium viewer hasn't finished initializing yet. */
  disabled: boolean;
  /** Every ready-made dataset, from all the features that offer some. */
  catalogue: readonly QuickAddItem[];
  isAdded: (id: string) => boolean;
  onAdd: (item: QuickAddItem) => Promise<void>;
  /** The "connect by URL" forms, one tab each. */
  connect: readonly ConnectTab[];
}

/**
 * The one place to add data: a catalogue of ready-made datasets — map
 * services, files in `public/`, 3D models — and a tab per way of
 * connecting your own by URL.
 *
 * It replaces two panels, Map Services and 3D Tiles, that split adding data
 * by protocol. That made people guess which panel a dataset was in, and
 * "3D Tiles" was the wrong name for a panel that also took I3S. The
 * catalogue groups by what the data is (CATALOGUE_GROUPS); the formats live
 * in the badges and in the connect tabs, which is where the protocol
 * actually matters — you're pasting a URL of that kind.
 *
 * This feature knows no protocols itself. `App` hands it the catalogue and
 * the forms from the features that own them (which may not import each
 * other), the same way it feeds the layer manager and search.
 *
 * Docks right, opposite the Layers panel, so what you add can be seen
 * arriving in the list. Tabs are switched with `hidden`, not by unmounting,
 * for the same reason panels stay mounted (CLAUDE.md, invariant 5): a
 * half-filled form survives a look at the catalogue.
 */
export function AddDataPanel({
  open,
  onClose,
  disabled,
  catalogue,
  isAdded,
  onAdd,
  connect,
}: AddDataPanelProps) {
  const tabsId = useId();
  const [tab, setTab] = useState('catalogue');
  const [filter, setFilter] = useState('');

  const items = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matching = needle
      ? catalogue.filter((item) =>
          [item.name, item.badge, item.source, item.group].some((text) =>
            text.toLowerCase().includes(needle),
          ),
        )
      : catalogue;
    // QuickAddList lists groups in order of first appearance; sort so they
    // always come in the catalogue's order, whatever order features supplied.
    const rank = (item: QuickAddItem) => {
      const index = CATALOGUE_GROUP_ORDER.indexOf(item.group);
      return index === -1 ? CATALOGUE_GROUP_ORDER.length : index;
    };
    return [...matching].sort((a, b) => rank(a) - rank(b));
  }, [catalogue, filter]);

  const tabs = [{ id: 'catalogue', label: 'Catalogue' }, ...connect];

  return (
    <Panel
      id="add-data-panel"
      side="beside"
      title="Add data"
      subtitle="Ready-made datasets, or connect your own service by URL."
      open={open}
      onClose={onClose}
    >
      <div className="add-data__tabs" role="tablist" aria-label="Ways to add data">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`${tabsId}-${entry.id}-tab`}
            aria-selected={tab === entry.id}
            aria-controls={`${tabsId}-${entry.id}`}
            className={tab === entry.id ? 'add-data__tab add-data__tab--active' : 'add-data__tab'}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <section
        id={`${tabsId}-catalogue`}
        role="tabpanel"
        aria-labelledby={`${tabsId}-catalogue-tab`}
        hidden={tab !== 'catalogue'}
      >
        <input
          type="search"
          className="add-data__filter"
          placeholder="Filter by name, format or source"
          aria-label="Filter the catalogue"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        {items.length > 0 ? (
          <QuickAddList items={items} isAdded={isAdded} onAdd={onAdd} disabled={disabled} />
        ) : (
          <p className="add-data__empty">Nothing in the catalogue matches “{filter.trim()}”.</p>
        )}
      </section>

      {connect.map((entry) => (
        <section
          key={entry.id}
          id={`${tabsId}-${entry.id}`}
          role="tabpanel"
          aria-labelledby={`${tabsId}-${entry.id}-tab`}
          hidden={tab !== entry.id}
        >
          <p className="add-data__formats">{entry.formats}</p>
          {entry.form}
        </section>
      ))}
    </Panel>
  );
}
