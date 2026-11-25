import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { SelectField } from '@/ui/Field';
import { useBottomSheet } from '@/ui/useBottomSheet';
import { LayerLegend } from './LayerLegend';
import { dropIndex } from './layerListDrag';
import type { BasemapChoice, LayerEntry, TerrainChoice } from './layerManagerTypes';
import { TerrainField } from './TerrainField';
import './LayerList.css';

interface LayerListProps {
  open: boolean;
  onToggle: () => void;
  imagery: LayerEntry[];
  basemapLayer: LayerEntry | null;
  onMoveImagery: (id: string, toId: string) => void;
  sceneData: LayerEntry[];
  basemap: BasemapChoice;
  terrain: TerrainChoice;
}

interface DragState {
  id: string;
  from: number;
  target: number;
}

export function LayerList({
  open,
  onToggle,
  imagery,
  onMoveImagery,
  sceneData,
  basemapLayer,
  basemap,
  terrain,
}: LayerListProps) {
  const { sheetRef, detent, grabberProps } = useBottomSheet<HTMLElement>('half');
  const added = imagery.length + sceneData.length;
  const count = added + (basemapLayer ? 1 : 0) + 1;
  const topDown = [...imagery].reverse();

  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const dragRef = useRef<(DragState & { startY: number; midpoints: number[] }) | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const refocusRef = useRef<string | null>(null);
  useEffect(() => {
    const id = refocusRef.current;
    if (!id) return;
    refocusRef.current = null;
    rowRefs.current.get(id)?.querySelector<HTMLElement>('.layer-list__grip')?.focus();
  });

  function startDrag(event: PointerEvent<HTMLButtonElement>, id: string, from: number) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const midpoints = topDown.map((entry) => {
      const box = rowRefs.current.get(entry.id)?.getBoundingClientRect();
      return box ? box.top + box.height / 2 : 0;
    });
    dragRef.current = { id, from, target: from, startY: event.clientY, midpoints };
    setDrag({ id, from, target: from });
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = dragRef.current;
    if (!current) return;
    const row = rowRefs.current.get(current.id);
    if (row) row.style.transform = `translateY(${event.clientY - current.startY}px)`;
    const target = dropIndex(current.midpoints, current.from, event.clientY);
    if (target !== current.target) {
      current.target = target;
      setDrag({ id: current.id, from: current.from, target });
    }
  }

  function endDrag(cancelled: boolean) {
    const current = dragRef.current;
    if (!current) return;
    dragRef.current = null;
    const row = rowRefs.current.get(current.id);
    if (row) row.style.transform = '';
    setDrag(null);
    const destination = topDown[current.target];
    if (!cancelled && current.target !== current.from && destination) {
      onMoveImagery(current.id, destination.id);
    }
  }

  function moveByKey(event: KeyboardEvent<HTMLButtonElement>, id: string, from: number) {
    const to = event.key === 'ArrowUp' ? from - 1 : event.key === 'ArrowDown' ? from + 1 : null;
    if (to === null) return;
    event.preventDefault();
    const destination = topDown[to];
    if (!destination) return;
    refocusRef.current = id;
    onMoveImagery(id, destination.id);
  }

  const className = ['layer-list', open ? 'layer-list--open' : null, `layer-list--sheet-${detent}`]
    .filter(Boolean)
    .join(' ');

  return (
    <aside ref={sheetRef} id="layer-list" className={className} aria-label="Layers on the map">
      <button type="button" className="layer-list__grabber" {...grabberProps} />
      <button
        type="button"
        className="layer-list__header"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="layer-list-body"
      >
        <span className="layer-list__title">On the map</span>
        <span className="layer-list__count">{count}</span>
        <svg
          className="layer-list__chevron"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 15 L12 9 L18 15" />
        </svg>
      </button>

      <div id="layer-list-body" className="layer-list__body">
        {added === 0 && (
          <p className="layer-list__empty">Add data puts your layers here, above these.</p>
        )}

        {(topDown.length > 0 || basemapLayer) && (
          <section className="layer-list__section">
            <h2 className="layer-list__heading">Imagery</h2>
            <ol className="layer-list__rows">
              {topDown.map((entry, index) => (
                <LayerRow
                  key={entry.id}
                  entry={entry}
                  rowRef={(element) => {
                    if (element) rowRefs.current.set(entry.id, element);
                    else rowRefs.current.delete(entry.id);
                  }}
                  dragging={drag?.id === entry.id}
                  dropEdge={
                    drag && drag.target === index && drag.id !== entry.id
                      ? index < drag.from
                        ? 'above'
                        : 'below'
                      : null
                  }
                  grip={{
                    onPointerDown: (event) => startDrag(event, entry.id, index),
                    onPointerMove: moveDrag,
                    onPointerUp: () => endDrag(false),
                    onPointerCancel: () => endDrag(true),
                    onKeyDown: (event) => moveByKey(event, entry.id, index),
                  }}
                />
              ))}
              {basemapLayer && (
                <LayerRow entry={basemapLayer} extra={<BasemapField basemap={basemap} />} />
              )}
            </ol>
          </section>
        )}

        {sceneData.length > 0 && (
          <section className="layer-list__section">
            <h2 className="layer-list__heading">Features and 3D</h2>
            <ol className="layer-list__rows">
              {sceneData.map((entry) => (
                <LayerRow key={entry.id} entry={entry} />
              ))}
            </ol>
          </section>
        )}

        <section className="layer-list__section">
          <h2 className="layer-list__heading">Terrain</h2>
          <ol className="layer-list__rows">
            <TerrainRow terrain={terrain} />
          </ol>
        </section>
      </div>
    </aside>
  );
}

interface GripHandlers {
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

interface LayerRowProps {
  entry: LayerEntry;
  grip?: GripHandlers;
  rowRef?: (element: HTMLLIElement | null) => void;
  dragging?: boolean;
  dropEdge?: 'above' | 'below' | null;
  extra?: ReactNode;
  toggleDisabled?: boolean;
}

function LayerRow({
  entry,
  grip,
  rowRef,
  dragging,
  dropEdge,
  extra,
  toggleDisabled,
}: LayerRowProps) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const className = [
    'layer-list__item',
    dragging ? 'layer-list__item--dragging' : null,
    dropEdge ? `layer-list__item--drop-${dropEdge}` : null,
    entry.visible ? null : 'layer-list__item--hidden',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li ref={rowRef} className={className}>
      <div className="layer-list__row">
        {grip ? (
          <button
            type="button"
            className="layer-list__grip"
            aria-label={`Reorder ${entry.name}`}
            title="Drag to reorder · arrow keys move it"
            {...grip}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
              <circle cx="9" cy="6" r="1.6" />
              <circle cx="15" cy="6" r="1.6" />
              <circle cx="9" cy="12" r="1.6" />
              <circle cx="15" cy="12" r="1.6" />
              <circle cx="9" cy="18" r="1.6" />
              <circle cx="15" cy="18" r="1.6" />
            </svg>
          </button>
        ) : (
          <span className="layer-list__grip-space" aria-hidden="true" />
        )}

        <button
          type="button"
          className="layer-list__icon-button"
          onClick={entry.onToggleVisibility}
          disabled={toggleDisabled}
          aria-pressed={entry.visible}
          aria-label={entry.visible ? `Hide ${entry.name}` : `Show ${entry.name}`}
          title={entry.visible ? 'Hide' : 'Show'}
        >
          <EyeIcon open={entry.visible} />
        </button>

        <span
          className="layer-list__name"
          title={entry.onZoomTo ? `${entry.name} — double-click to zoom to it` : entry.name}
          onDoubleClick={entry.onZoomTo}
        >
          {entry.name}
        </span>

        <button
          type="button"
          className={
            expanded
              ? 'layer-list__icon-button layer-list__icon-button--active'
              : 'layer-list__icon-button'
          }
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={`${entry.name} options`}
          title="More"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
            <circle cx="6" cy="12" r="1.7" />
            <circle cx="12" cy="12" r="1.7" />
            <circle cx="18" cy="12" r="1.7" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div id={detailsId} className="layer-list__details">
          <span className="resource-list__badge">{entry.kind}</span>
          {entry.opacity && (
            <label className="layer-list__opacity">
              <span>Opacity</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={entry.opacity.value}
                onChange={(event) => entry.opacity?.onChange(Number(event.target.value))}
              />
              <span className="layer-list__opacity-value">
                {Math.round(entry.opacity.value * 100)}%
              </span>
            </label>
          )}
          {extra}
          {entry.detail}
          {entry.legend && <LayerLegend load={entry.legend} />}
          {(entry.onZoomTo || entry.onRemove) && (
            <div className="layer-list__actions">
              {entry.onZoomTo && (
                <button
                  type="button"
                  className="control control-button layer-list__action"
                  onClick={entry.onZoomTo}
                >
                  Zoom to
                </button>
              )}
              {entry.onRemove && (
                <button
                  type="button"
                  className="control control-button layer-list__action"
                  onClick={entry.onRemove}
                >
                  Remove
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function TerrainRow({ terrain }: { terrain: TerrainChoice }) {
  const [lastId, setLastId] = useState(terrain.selectedId ?? terrain.options[0]?.id ?? null);
  if (terrain.selectedId !== null && terrain.selectedId !== lastId) setLastId(terrain.selectedId);

  const shown = terrain.options.find((option) => option.id === (terrain.selectedId ?? lastId));
  const entry: LayerEntry = {
    id: 'terrain',
    name: shown?.name ?? 'No terrain',
    kind: 'QUANTIZED MESH',
    visible: terrain.selectedId !== null,
    onToggleVisibility: () => terrain.onSelect(terrain.selectedId === null ? lastId : null),
    onZoomTo: terrain.selectedId === null ? undefined : terrain.onZoomTo,
  };
  return (
    <LayerRow
      entry={entry}
      extra={<TerrainField terrain={terrain} />}
      toggleDisabled={lastId === null}
    />
  );
}

function BasemapField({ basemap }: { basemap: BasemapChoice }) {
  const formId = useId();
  return (
    <div className="layer-list__field">
      <SelectField
        formId={formId}
        fieldId="basemap"
        label="Basemap"
        value={basemap.selectedId}
        onChange={(event) => basemap.onSelect(event.target.value)}
      >
        {basemap.options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </SelectField>
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12 C5 6.5 8.5 4.5 12 4.5 C15.5 4.5 19 6.5 22 12 C19 17.5 15.5 19.5 12 19.5 C8.5 19.5 5 17.5 2 12 Z" />
      {open ? <circle cx="12" cy="12" r="3" /> : <path d="M4 4 L20 20" />}
    </svg>
  );
}
