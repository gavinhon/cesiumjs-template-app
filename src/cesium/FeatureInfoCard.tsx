import { Fragment, useEffect } from 'react';
import * as Cesium from 'cesium';
import type { AttributeRow } from '@/lib/featureAttributes';
import { COMPACT_LAYOUT_QUERY } from '@/ui/compactLayoutQuery';
import { useBottomSheet } from '@/ui/useBottomSheet';
import { toWindowPosition } from './mapLabels';
import './FeatureInfoCard.css';

export interface FeatureCardContent {
  title: string;
  layerName: string;
  rows: AttributeRow[];
  position: Cesium.Cartesian3;
}

interface FeatureInfoCardProps {
  viewer: Cesium.Viewer | null;
  feature: FeatureCardContent | null;
  onClose: () => void;
}

const GAP = 12;
const MARGIN = 8;

export function FeatureInfoCard({ viewer, feature, onClose }: FeatureInfoCardProps) {
  const {
    sheetRef: cardRef,
    detent,
    setDetent,
    grabberProps,
  } = useBottomSheet<HTMLElement>('peek');
  useEffect(() => setDetent('peek'), [feature, setDetent]);

  useEffect(() => {
    const card = cardRef.current;
    if (!viewer || !feature || !card) return;
    const scratch = {
      window: new Cesium.Cartesian2(),
      normal: new Cesium.Cartesian3(),
      toCamera: new Cesium.Cartesian3(),
    };

    const compact = window.matchMedia(COMPACT_LAYOUT_QUERY);

    const place = () => {
      if (compact.matches) {
        card.classList.remove('feature-info--hidden');
        card.style.transform = '';
        return;
      }
      const point = toWindowPosition(viewer.scene, feature.position, scratch);
      card.classList.toggle('feature-info--hidden', !point);
      if (!point) return;

      const { offsetWidth: width, offsetHeight: height } = card;
      const { clientWidth: windowWidth, clientHeight: windowHeight } = viewer.canvas;
      const x = Math.min(Math.max(point.x - width / 2, MARGIN), windowWidth - width - MARGIN);
      const above = point.y - height - GAP;
      const y = above >= MARGIN ? above : Math.min(point.y + GAP, windowHeight - height - MARGIN);
      card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    };
    place();
    return viewer.scene.postRender.addEventListener(place);
  }, [viewer, feature, cardRef]);

  if (!feature) return null;

  return (
    <section
      ref={cardRef}
      className={`feature-info feature-info--sheet-${detent}`}
      aria-label={`Feature: ${feature.title}`}
    >
      <button type="button" className="feature-info__grabber" {...grabberProps} />
      <header className="feature-info__header">
        <div className="feature-info__heading">
          <h2 className="feature-info__title">{feature.title}</h2>
          {feature.title !== feature.layerName && (
            <p className="feature-info__layer">{feature.layerName}</p>
          )}
        </div>
        <button
          type="button"
          className="feature-info__close"
          onClick={onClose}
          aria-label="Close feature info"
        >
          ×
        </button>
      </header>
      {feature.rows.length > 0 ? (
        <dl className="feature-info__attributes">
          {feature.rows.map((row) => (
            <Fragment key={row.key}>
              <dt>{row.key}</dt>
              <dd>{row.value}</dd>
            </Fragment>
          ))}
        </dl>
      ) : (
        <p className="feature-info__empty">This feature has no attributes.</p>
      )}
    </section>
  );
}
