import { useEffect, useState, type CSSProperties } from 'react';
import type { LegendContent, LegendItem, VectorGeometry } from '@/lib/legendTypes';
import './LayerLegend.css';

interface LayerLegendProps {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    case 'swatches':
      return (
        <ul className="layer-legend__list">
          {legend.items.map((item) => (
            <li key={item.label} className="layer-legend__item">
              <span
                className={`layer-legend__swatch layer-legend__swatch--${item.shape}`}
                style={{ '--swatch-color': item.color } as CSSProperties}
              />
              {item.label}
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
          heading={item.group && item.group !== items[index - 1]?.group ? item.group : null}
        />
      ))}
    </ul>
  );
}

function LegendItemRow({ item, heading }: { item: LegendItem; heading: string | null }) {
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
