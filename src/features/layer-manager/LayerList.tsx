import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { SelectField } from '@/ui/Field';
import { useBottomSheet } from '@/ui/useBottomSheet';
import { LayerLegend } from './LayerLegend';
import { dropIndex } from './layerListDrag';
import type { BasemapChoice, LayerEntry, TerrainChoice } from './layerManagerTypes';
import { TerrainField } from './TerrainField';
import './LayerList.css';

interface LayerListProps {
  /** Expanded (wide screen) or showing as a sheet (phone). */
  open: boolean;
  onToggle: () => void;
  /**
   * The imagery the user added, in Cesium's own order: **index 0 is the
   * bottom**. Shown reversed, topmost first, as every layer list reads.
   * The basemap isn't in it — it's chosen from the map tile, not stacked.
   */
  imagery: LayerEntry[];
  /** Puts imagery layer `id` where layer `toId` is now, the rest shifting. */
  onMoveImagery: (id: string, toId: string) => void;
  /** 3D Tiles, I3S and vector data: in the scene, but not in the imagery stack. */
  sceneData: LayerEntry[];
  /** For the phone sheet's Map section; a wide screen uses the map tile. */
  basemap: BasemapChoice;
  terrain: TerrainChoice;
}

/** A drag in progress: which row, where it started, where it would land. */
interface DragState {
  id: string;
  from: number;
  target: number;
}

/**
 * What's on the map, top-right: a short list of the layers you added, each
 * with the controls you reach for while looking at the map — show/hide,
 * opacity, draw order — and the rest one click away under "…".
 *
 * Minimal on purpose. It hides while nothing's been added, collapses to a
 * one-line chip, and leaves basemap and terrain to the map tile
 * (`BasemapSwitcher`), so it's never more than the data you brought in.
 * There is no toolbar button for it: the chip *is* the way back in. On a
 * phone it's a bottom sheet opened from the rail instead, carrying the
 * basemap and terrain choices too, since the tile is hidden there.
 *
 * **Why only imagery can be dragged.** Raster imagery is painted onto the
 * globe in a fixed sequence, so "above" and "below" are real: a layer
 * higher in `viewer.imageryLayers` hides the ones under it, and moving it
 * is how you uncover something. 3D Tiles and vector features are geometry
 * drawn with a depth buffer — what's in front depends on the camera, not
 * the list. A drag handle on those would be a control that visibly does
 * nothing, so they sit in their own group without one.
 */
export function LayerList({
  open,
  onToggle,
  imagery,
  onMoveImagery,
  sceneData,
  basemap,
  terrain,
}: LayerListProps) {
  const { sheetRef, detent, grabberProps } = useBottomSheet<HTMLElement>('half');
  const count = imagery.length + sceneData.length;
  // Cesium's collection is bottom-first; a layer list reads top-down.
  const topDown = [...imagery].reverse();

  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  // The live drag, read on every pointer move. The row follows the pointer
  // by writing its transform straight to the DOM, as the map labels do:
  // pointer moves arrive at frame rate, and only a change of drop position
  // (a handful per drag) is worth a React render.
  const dragRef = useRef<(DragState & { startY: number; midpoints: number[] }) | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  // A keyboard move re-orders the rows, and React moving a focused element
  // can drop its focus — so the grip that was used gets it back.
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
    // Capture, so the drag carries on when the pointer leaves the small grip.
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

  // The keyboard way to do the same: arrow keys on a focused grip.
  function moveByKey(event: KeyboardEvent<HTMLButtonElement>, id: string, from: number) {
    const to = event.key === 'ArrowUp' ? from - 1 : event.key === 'ArrowDown' ? from + 1 : null;
    if (to === null) return;
    event.preventDefault();
    const destination = topDown[to];
    if (!destination) return;
    refocusRef.current = id;
    onMoveImagery(id, destination.id);
  }

  const className = [
    'layer-list',
    open ? 'layer-list--open' : null,
    count === 0 ? 'layer-list--empty' : null,
    `layer-list--sheet-${detent}`,
  ]
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
        {count === 0 && (
          <p className="layer-list__empty">Nothing added yet. Add data brings some in.</p>
        )}

        {topDown.length > 0 && (
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

        <MapSection basemap={basemap} terrain={terrain} />
      </div>
    </aside>
  );
}

/** The grip's handlers — present only on rows that can be reordered. */
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
  /** Where the dragged row would land, drawn as a line on this row's edge. */
  dropEdge?: 'above' | 'below' | null;
}

/**
 * One layer: grip, eye, name and "…" on a single line; opacity, legend,
 * zoom and remove in the details "…" opens. The first line is what you use
 * while comparing layers on the map; the rest is occasional.
 */
function LayerRow({ entry, grip, rowRef, dragging, dropEdge }: LayerRowProps) {
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
          // Keeps names aligned with the draggable rows above.
          <span className="layer-list__grip-space" aria-hidden="true" />
        )}

        <button
          type="button"
          className="layer-list__icon-button"
          onClick={entry.onToggleVisibility}
          aria-pressed={entry.visible}
          aria-label={entry.visible ? `Hide ${entry.name}` : `Show ${entry.name}`}
          title={entry.visible ? 'Hide' : 'Show'}
        >
          <EyeIcon open={entry.visible} />
        </button>

        <span
          className="layer-list__name"
          title={`${entry.name} — double-click to zoom to it`}
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
          title="Opacity, legend and more"
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
            // Set on the Cesium ImageryLayer itself, so a layer can be
            // blended over the one beneath instead of only covering it.
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
          {entry.detail}
          {entry.legend && <LayerLegend load={entry.legend} />}
          <div className="layer-list__actions">
            <button
              type="button"
              className="control control-button layer-list__action"
              onClick={entry.onZoomTo}
            >
              Zoom to
            </button>
            <button
              type="button"
              className="control control-button layer-list__action"
              onClick={entry.onRemove}
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Basemap and terrain, for the phone sheet only — on a wide screen the map
 * tile in the bottom-left holds them, and CSS hides this.
 */
function MapSection({ basemap, terrain }: { basemap: BasemapChoice; terrain: TerrainChoice }) {
  const formId = useId();
  return (
    <section className="layer-list__section layer-list__map">
      <h2 className="layer-list__heading">Map</h2>
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
      <TerrainField terrain={terrain} />
    </section>
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
