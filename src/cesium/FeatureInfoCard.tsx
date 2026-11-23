import { Fragment, useEffect } from 'react';
import * as Cesium from 'cesium';
import type { AttributeRow } from '@/lib/featureAttributes';
import { COMPACT_LAYOUT_QUERY } from '@/ui/compactLayoutQuery';
import { useBottomSheet } from '@/ui/useBottomSheet';
import { toWindowPosition } from './mapLabels';
import './FeatureInfoCard.css';

/**
 * What the card shows about a clicked thing, whichever feature found it: a
 * vector feature (`useFeatureInspector`) or a part of a 3D model
 * (`useModelPartInspector`). The card knows only this, which is what lets
 * two features share it without importing each other.
 */
export interface FeatureCardContent {
  title: string;
  /** The layer or model it belongs to — shown under the title unless it *is* the title. */
  layerName: string;
  rows: AttributeRow[];
  /** The clicked point on the surface, which the card stays pinned to. */
  position: Cesium.Cartesian3;
}

interface FeatureInfoCardProps {
  viewer: Cesium.Viewer | null;
  /** The clicked feature or model part; nothing renders without one. */
  feature: FeatureCardContent | null;
  onClose: () => void;
}

/** Gap between the clicked point and the card, and between the card and the window's edges. */
const GAP = 12;
const MARGIN = 8;

/**
 * A clicked feature's attributes, in a card pinned to where it was clicked
 * that follows the map as it moves.
 *
 * React renders the contents once per selection; the *position* is written
 * straight to the element from Cesium's `postRender`, every frame, never
 * through React state — the same split the map labels use, and for the same
 * reason (see CLAUDE.md, per-frame data).
 *
 * The card sits above the point, flips below it near the top of the window,
 * and is kept inside the window at the sides, so it's never cut off by the
 * edge it was clicked near.
 */
export function FeatureInfoCard({ viewer, feature, onClose }: FeatureInfoCardProps) {
  // On a phone the card is a bottom sheet, opening at peek height — the
  // title and first few attributes — like a tapped place in a maps app.
  // It can be pulled up for the rest. On wider screens this has no effect.
  const {
    sheetRef: cardRef,
    detent,
    setDetent,
    grabberProps,
  } = useBottomSheet<HTMLElement>('peek');
  // Each newly tapped feature opens at peek again, not wherever the last
  // card was left.
  useEffect(() => setDetent('peek'), [feature, setDetent]);

  useEffect(() => {
    const card = cardRef.current;
    if (!viewer || !feature || !card) return;
    const scratch = {
      window: new Cesium.Cartesian2(),
      normal: new Cesium.Cartesian3(),
      toCamera: new Cesium.Cartesian3(),
    };

    // On a phone a 280px card above the tapped point covers most of the
    // map around it (and the finger is already in the way), so it docks to
    // the bottom like a sheet instead — FeatureInfoCard.css positions it.
    // Held once and read per frame: `.matches` on a kept MediaQueryList is
    // a property read, not a fresh query.
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
          {/* A nameless feature is titled with its layer, so don't say it twice. */}
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
