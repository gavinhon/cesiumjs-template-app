import { useEffect, useState } from 'react';
import type { LegendContent, LegendItem, VectorGeometry } from '@/lib/legendTypes';
import './LayerLegend.css';

interface LayerLegendProps {
  /** From the layer's `LayerEntry.legend`. */
  load: () => Promise<LegendContent | null>;
}

type LoadState =
  | { state: 'loading' }
  | { state: 'done'; legend: LegendContent | null }
  | { state: 'error'; message: string };

const GEOMETRY_LABEL: Record<VectorGeometry, string> = {
  point: 'Points',
  line: 'Lines',
  polygon: 'Areas',
};

/**
 * What a layer's symbols mean, under its row in the layer manager — open
 * by default, the way GIS workbenches (ArcGIS Map Viewer, TerriaJS) show
 * legends beside the layer rather than in a separate legend panel you have
 * to remember to open.
 *
 * A native `<details>`, so it folds away with no state of its own and is
 * keyboard- and screen-reader-friendly for free. Loaded once, when the row
 * first mounts — and since panels stay mounted (CLAUDE.md, invariant 5),
 * that's when the layer is added, not every time the panel opens.
 */
export function LayerLegend({ load }: LayerLegendProps) {
  const [result, setResult] = useState<LoadState>({ state: 'loading' });

  useEffect(() => {
    let current = true;
    load().then(
      (legend) => current && setResult({ state: 'done', legend }),
      (error: unknown) =>
        current &&
        setResult({
          state: 'error',
          message: error instanceof Error ? error.message : String(error),
        }),
    );
    return () => {
      current = false;
    };
    // Load once per row: `load` is rebuilt on every App render, and a new
    // closure over the same layer is not a reason to fetch again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A service with nothing to say gets no legend at all, not an empty box.
  if (result.state === 'done' && !result.legend) return null;

  return (
    <details className="layer-legend" open>
      <summary className="layer-legend__summary">Legend</summary>
      {result.state === 'loading' && <p className="layer-legend__note">Loading…</p>}
      {result.state === 'error' && (
        <p className="layer-legend__note layer-legend__note--error">{result.message}</p>
      )}
      {result.state === 'done' && result.legend && <LegendBody legend={result.legend} />}
    </details>
  );
}

function LegendBody({ legend }: { legend: LegendContent }) {
  switch (legend.kind) {
    case 'items':
      return <LegendItems items={legend.items} />;
    case 'vector':
      return (
        <ul className="layer-legend__list">
          {legend.geometries.map((geometry) => (
            <li key={geometry} className="layer-legend__item">
              <span className={`layer-legend__swatch layer-legend__swatch--${geometry}`} />
              {GEOMETRY_LABEL[geometry]}
            </li>
          ))}
        </ul>
      );
    default: {
      const unreachable: never = legend;
      return unreachable;
    }
  }
}

function LegendItems({ items }: { items: LegendItem[] }) {
  return (
    <ul className="layer-legend__list">
      {items.map((item, index) => (
        <LegendItemRow
          key={`${item.group ?? ''}:${item.label}:${index}`}
          item={item}
          // A sublayer's name heads its first symbol.
          heading={item.group && item.group !== items[index - 1]?.group ? item.group : null}
        />
      ))}
    </ul>
  );
}

function LegendItemRow({ item, heading }: { item: LegendItem; heading: string | null }) {
  // A WMS server that doesn't implement GetLegendGraphic answers with an
  // error image or nothing at all; hide the row rather than show a broken
  // image icon.
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <>
      {heading && <li className="layer-legend__group">{heading}</li>}
      <li className="layer-legend__item">
        <img
          className="layer-legend__image"
          src={item.imageSrc}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
        />
        <span className="layer-legend__label">{item.label}</span>
      </li>
    </>
  );
}
