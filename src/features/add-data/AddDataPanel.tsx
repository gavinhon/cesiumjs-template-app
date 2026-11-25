import { useId, useMemo, useState, type ReactNode } from 'react';
import { CATALOGUE_GROUP_ORDER } from '@/lib/catalogueGroups';
import { Panel } from '@/ui/Panel';
import { QuickAddList, type QuickAddItem } from '@/ui/QuickAddList';
import './AddDataPanel.css';

export interface ConnectTab {
  id: string;
  label: string;
  formats: string;
  form: ReactNode;
}

interface AddDataPanelProps {
  open: boolean;
  onClose: () => void;
  disabled: boolean;
  catalogue: readonly QuickAddItem[];
  isAdded: (id: string) => boolean;
  onAdd: (item: QuickAddItem) => Promise<void>;
  connect: readonly ConnectTab[];
}

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
