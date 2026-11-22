import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import * as Cesium from 'cesium';
import { flyToPoint } from '@/cesium/flyToPoint';
import { createPlaceMarker, type PlaceMarker } from '@/cesium/placeMarker';
import { formatLatLon } from '@/lib/mapReadouts';
import { parseCoordinateQuery } from './parseCoordinateQuery';
import {
  AS_YOU_TYPE_SERVICE,
  ON_REQUEST_SERVICE,
  type PlaceResult,
  type PlaceService,
} from './searchPlaces';
import type { SearchableDataset } from './searchTypes';
import './SearchBox.css';

interface SearchBoxProps {
  viewer: Cesium.Viewer | null;
  /** The Add data catalogue, so a dataset can be found by name. */
  datasets: readonly SearchableDataset[];
}

/** One selectable row. Headings are rendered between groups, not as rows. */
type Row =
  | {
      kind: 'coordinate';
      id: string;
      title: string;
      subtitle: string;
      latitude: number;
      longitude: number;
    }
  | { kind: 'place'; id: string; place: PlaceResult }
  | { kind: 'dataset'; id: string; dataset: SearchableDataset }
  | { kind: 'worldwide'; id: string };

/** Where places are being looked up, and with what result — tagged by the service asked. */
type PlaceState =
  | { state: 'idle' }
  | { state: 'loading'; service: PlaceService }
  | { state: 'done'; service: PlaceService; places: PlaceResult[] }
  | { state: 'error'; service: PlaceService; message: string };

/** Typing pauses this long before a gazetteer is asked, so a word costs one request, not five. */
const DEBOUNCE_MS = 300;
const MIN_QUERY = 3;

/** What the box can find: places only when the deployment has a gazetteer (`searchPlaces.ts`). */
const SEARCH_LABEL = AS_YOU_TYPE_SERVICE
  ? 'Search places, coordinates or data'
  : 'Search coordinates or data';

const IDLE: PlaceState = { state: 'idle' };

/** Whether text is worth asking a gazetteer about: long enough, and not a coordinate. */
function isPlaceQuery(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length >= MIN_QUERY && !parseCoordinateQuery(trimmed);
}

/**
 * The search box at the top-left — the front door of every web map.
 *
 * One box finds three kinds of thing, listed in this order:
 *
 *  1. **A coordinate** typed or pasted, in degrees or SVY21
 *     (`parseCoordinateQuery`), recognised instantly and offline.
 *  2. **Datasets** from the Add data catalogue, by name, group or
 *     format — so "rail" finds the rail layers without knowing they're
 *     in the catalogue. Adding one is a click.
 *  3. **Places**: Singapore addresses and buildings from OneMap as you
 *     type, or anywhere in the world from OpenStreetMap on request
 *     (`searchPlaces.ts` explains why the two behave differently). A
 *     deployment can swap both for its own Nominatim server, or — offline
 *     with none — leave places out; `searchPlaces.ts` decides which.
 *
 * Choosing a place or coordinate flies there and drops a pin
 * (`createPlaceMarker`), replacing the previous one.
 */
export function SearchBox({ viewer, datasets }: SearchBoxProps) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [fetchedPlaces, setPlaces] = useState<PlaceState>(IDLE);
  const [addError, setAddError] = useState<{ id: string; message: string } | null>(null);
  const markerRef = useRef<PlaceMarker | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!viewer) return;
    markerRef.current = createPlaceMarker(viewer);
    return () => {
      markerRef.current?.destroy();
      markerRef.current = null;
    };
  }, [viewer]);

  const trimmed = query.trim();
  const coordinate = useMemo(() => parseCoordinateQuery(trimmed), [trimmed]);

  // A coordinate or a couple of letters is never sent to a gazetteer, so for
  // those the places section is simply idle — worked out here, not stored.
  // The stored answer is also dropped in `changeQuery`, the event that made
  // the query ineligible, so it can't flash back when a new word is typed.
  const eligible = AS_YOU_TYPE_SERVICE !== null && !coordinate && trimmed.length >= MIN_QUERY;
  const places: PlaceState = eligible ? fetchedPlaces : IDLE;

  // The as-you-type gazetteer (OneMap, unless the deployment configured its
  // own). Each keystroke cancels the previous request, so a slow early
  // answer can never overwrite a later one. The only state set here is its
  // answer (and "loading", once the debounce has elapsed and the request is
  // really going out) — never a reset, which belongs to the event that
  // caused it.
  useEffect(() => {
    requestRef.current?.abort();
    const service = AS_YOU_TYPE_SERVICE;
    if (!eligible || !service) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const timer = window.setTimeout(() => {
      setPlaces({ state: 'loading', service });
      service.search(trimmed, controller.signal).then(
        (found) => setPlaces({ state: 'done', service, places: found }),
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setPlaces({ state: 'error', service, message: messageOf(error) });
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, eligible]);

  const matchingDatasets = useMemo(() => {
    if (trimmed.length < 2 || coordinate) return [];
    const needle = trimmed.toLowerCase();
    return datasets
      .filter((dataset) =>
        [dataset.name, dataset.group, dataset.badge].some((text) =>
          text.toLowerCase().includes(needle),
        ),
      )
      .slice(0, 5);
  }, [datasets, trimmed, coordinate]);

  const rows: Row[] = [];
  if (coordinate) {
    rows.push({
      kind: 'coordinate',
      id: 'coordinate',
      title: formatLatLon(coordinate.latitude, coordinate.longitude),
      subtitle: coordinate.system === 'SVY21' ? 'From SVY21 grid coordinates' : 'Coordinate',
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
    });
  }
  for (const dataset of matchingDatasets) rows.push({ kind: 'dataset', id: dataset.id, dataset });
  if (places.state === 'done') {
    for (const place of places.places) rows.push({ kind: 'place', id: place.id, place });
  }
  if (
    ON_REQUEST_SERVICE &&
    !coordinate &&
    trimmed.length >= MIN_QUERY &&
    !(places.state === 'done' && places.service === ON_REQUEST_SERVICE)
  ) {
    rows.push({ kind: 'worldwide', id: 'worldwide' });
  }
  const activeIndex = Math.min(active, rows.length - 1);

  function searchWorldwide() {
    const service = ON_REQUEST_SERVICE;
    if (!service) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setPlaces({ state: 'loading', service });
    service.search(trimmed, controller.signal).then(
      (found) => setPlaces({ state: 'done', service, places: found }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setPlaces({ state: 'error', service, message: messageOf(error) });
      },
    );
  }

  function goTo(longitude: number, latitude: number, bbox?: PlaceResult['bbox']) {
    if (!viewer) return;
    markerRef.current?.show(longitude, latitude);
    // A district or a park is worth framing whole; a building or an
    // address is a point, and framing its tiny box would dive to the roof.
    if (bbox && bbox.north - bbox.south > 0.01) {
      viewer.camera.flyTo({
        destination: Cesium.Rectangle.fromDegrees(bbox.west, bbox.south, bbox.east, bbox.north),
        duration: 1.2,
      });
    } else {
      flyToPoint(viewer, longitude, latitude);
    }
  }

  function choose(row: Row | undefined) {
    if (!row) return;
    switch (row.kind) {
      case 'coordinate':
        goTo(row.longitude, row.latitude);
        setOpen(false);
        return;
      case 'place':
        goTo(row.place.longitude, row.place.latitude, row.place.bbox);
        setQuery(row.place.title);
        setOpen(false);
        return;
      case 'dataset':
        if (row.dataset.isAdded) return;
        setAddError(null);
        row.dataset.add().then(
          () => setOpen(false),
          (error: unknown) => setAddError({ id: row.dataset.id, message: messageOf(error) }),
        );
        return;
      case 'worldwide':
        searchWorldwide();
        return;
      default: {
        const unreachable: never = row;
        return unreachable;
      }
    }
  }

  /** Every edit of the query goes through here, so stale places are dropped where they go stale. */
  function changeQuery(value: string) {
    setQuery(value);
    if (!isPlaceQuery(value)) setPlaces(IDLE);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      if (rows.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + step + rows.length) % rows.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(rows[activeIndex]);
    } else if (event.key === 'Escape') {
      // First Escape closes the list; a second clears the box.
      if (open) setOpen(false);
      else changeQuery('');
    }
  }

  const showList = open && trimmed.length > 0 && (rows.length > 0 || places.state !== 'idle');

  return (
    <div
      ref={rootRef}
      className="search-box"
      onBlur={(event) => {
        // Close when focus leaves the whole widget, not when it moves from
        // the input to a result row inside it.
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <input
        type="search"
        className="control control-input search-box__input"
        placeholder={SEARCH_LABEL}
        aria-label={SEARCH_LABEL}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={
          showList && rows[activeIndex] ? `${listId}-${activeIndex}` : undefined
        }
        aria-autocomplete="list"
        value={query}
        onChange={(event) => {
          changeQuery(event.target.value);
          setActive(0);
          setAddError(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        disabled={!viewer}
      />

      {showList && (
        <div className="control search-box__results">
          <ul id={listId} role="listbox" aria-label="Search results" className="search-box__list">
            {rows.map((row, index) => (
              <ResultRow
                key={row.id}
                row={row}
                id={`${listId}-${index}`}
                active={index === activeIndex}
                heading={headingBefore(rows, index, places)}
                error={row.kind === 'dataset' && addError?.id === row.id ? addError.message : null}
                worldwideLoading={
                  places.state === 'loading' && places.service === ON_REQUEST_SERVICE
                }
                onHover={() => setActive(index)}
                onChoose={() => choose(row)}
              />
            ))}
          </ul>
          {places.state === 'loading' && places.service === AS_YOU_TYPE_SERVICE && (
            <p className="search-box__status">Searching {places.service.name}…</p>
          )}
          {places.state === 'error' && (
            <p className="search-box__status search-box__status--error">{places.message}</p>
          )}
          {places.state === 'done' && places.places.length === 0 && (
            <p className="search-box__status">No places found{places.service.scope}.</p>
          )}
        </div>
      )}
    </div>
  );
}

interface ResultRowProps {
  row: Row;
  id: string;
  active: boolean;
  heading: string | null;
  error: string | null;
  worldwideLoading: boolean;
  onHover: () => void;
  onChoose: () => void;
}

/** One result, preceded by its group's heading when it's the first of its kind. */
function ResultRow({
  row,
  id,
  active,
  heading,
  error,
  worldwideLoading,
  onHover,
  onChoose,
}: ResultRowProps) {
  const className = active ? 'search-box__row search-box__row--active' : 'search-box__row';
  let title: string;
  let subtitle: string | undefined;
  let badge: string | undefined;
  switch (row.kind) {
    case 'coordinate':
      ({ title, subtitle } = row);
      break;
    case 'place':
      ({ title, subtitle } = row.place);
      break;
    case 'dataset':
      title = row.dataset.name;
      subtitle = row.dataset.isAdded ? 'On the map' : `Add · ${row.dataset.group}`;
      badge = row.dataset.badge;
      break;
    case 'worldwide':
      title = worldwideLoading ? 'Searching worldwide…' : 'Search worldwide';
      subtitle = 'Places outside Singapore, from OpenStreetMap';
      break;
    default: {
      const unreachable: never = row;
      return unreachable;
    }
  }

  return (
    <>
      {heading && (
        <li role="presentation" className="search-box__heading">
          {heading}
        </li>
      )}
      <li
        id={id}
        role="option"
        aria-selected={active}
        className={className}
        // Mouse down, not click: the input's blur fires before a click and
        // would close the list out from under it.
        onMouseDown={(event) => {
          event.preventDefault();
          onChoose();
        }}
        onMouseEnter={onHover}
      >
        <span className="search-box__text">
          <span className="search-box__title">{title}</span>
          {subtitle && <span className="search-box__subtitle">{subtitle}</span>}
          {error && <span className="search-box__row-error">{error}</span>}
        </span>
        {badge && <span className="resource-list__badge">{badge}</span>}
      </li>
    </>
  );
}

/** The group heading to show above row `index`, if it starts a new group. */
function headingBefore(rows: Row[], index: number, places: PlaceState): string | null {
  const kind = rows[index].kind;
  if (index > 0 && rows[index - 1].kind === kind) return null;
  switch (kind) {
    case 'coordinate':
      return 'Coordinate';
    case 'dataset':
      return 'Datasets';
    case 'place':
      // Every service's terms require credit; this is where it's given.
      return places.state === 'done' ? `Places · ${places.service.credit}` : null;
    case 'worldwide':
      return null;
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
