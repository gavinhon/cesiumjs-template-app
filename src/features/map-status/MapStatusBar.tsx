import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { pickSurface } from '@/cesium/pickSurface';
import { formatHeight, formatLatLon, formatSvy21, niceScaleBar } from '@/lib/mapReadouts';
import { isWithinSvy21Area, toSvy21 } from '@/lib/svy21';
import { useWidthAsCssVariable } from '@/ui/useWidthAsCssVariable';
import './MapStatusBar.css';

interface MapStatusBarProps {
  viewer: Cesium.Viewer | null;
}

type CoordinateFormat = 'wgs84' | 'svy21';

const SCALE_BAR_MAX_PX = 96;

const NONE = '—';

export function MapStatusBar({ viewer }: MapStatusBarProps) {
  const [format, setFormat] = useState<CoordinateFormat>('wgs84');
  const [copied, setCopied] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const coordsRef = useRef<HTMLButtonElement>(null);
  const elevationRef = useRef<HTMLSpanElement>(null);
  const scaleRef = useRef<HTMLSpanElement>(null);
  const scaleBarRef = useRef<HTMLSpanElement>(null);
  const scaleLabelRef = useRef<HTMLSpanElement>(null);
  const cameraRef = useRef<HTMLSpanElement>(null);

  const formatRef = useRef(format);
  const cursorRef = useRef<Cesium.Cartographic | null>(null);

  useWidthAsCssVariable(rootRef, '--map-status-width');

  useEffect(() => {
    formatRef.current = format;
    writeCoordinates(coordsRef.current, cursorRef.current, format);
  }, [format]);

  useEffect(() => {
    if (!viewer) return;
    const { scene, camera } = viewer;
    const canvas = scene.canvas;

    const pointer = new Cesium.Cartesian2();
    let frame = 0;
    const handler = new Cesium.ScreenSpaceEventHandler(canvas);
    handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
      Cesium.Cartesian2.clone(movement.endPosition, pointer);
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const position = pickSurface(viewer, pointer);
        const cartographic = position ? Cesium.Cartographic.fromCartesian(position) : null;
        cursorRef.current = cartographic;
        writeCoordinates(coordsRef.current, cartographic, formatRef.current);
        if (elevationRef.current) {
          elevationRef.current.textContent = cartographic
            ? formatHeight(cartographic.height)
            : NONE;
        }
      });
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    function clearCursor() {
      cursorRef.current = null;
      writeCoordinates(coordsRef.current, null, formatRef.current);
      if (elevationRef.current) elevationRef.current.textContent = NONE;
    }
    canvas.addEventListener('pointerleave', clearCursor);

    const lastPosition = new Cesium.Cartesian3();
    const lastDirection = new Cesium.Cartesian3();
    let first = true;
    const left = new Cesium.Cartesian2();
    const right = new Cesium.Cartesian2();
    const geodesic = new Cesium.EllipsoidGeodesic();

    function onPostRender() {
      const moved =
        first ||
        !Cesium.Cartesian3.equalsEpsilon(camera.positionWC, lastPosition, 0, 0.01) ||
        !Cesium.Cartesian3.equalsEpsilon(camera.directionWC, lastDirection, 1e-6);
      if (!moved) return;
      first = false;
      Cesium.Cartesian3.clone(camera.positionWC, lastPosition);
      Cesium.Cartesian3.clone(camera.directionWC, lastDirection);

      if (cameraRef.current) {
        cameraRef.current.textContent = formatHeight(camera.positionCartographic.height);
      }

      left.x = canvas.clientWidth / 2 - 50;
      right.x = canvas.clientWidth / 2 + 50;
      left.y = right.y = canvas.clientHeight / 2;
      const a = camera.pickEllipsoid(left, scene.globe.ellipsoid);
      const b = camera.pickEllipsoid(right, scene.globe.ellipsoid);
      let bar = null;
      if (a && b) {
        geodesic.setEndPoints(
          Cesium.Cartographic.fromCartesian(a),
          Cesium.Cartographic.fromCartesian(b),
        );
        bar = niceScaleBar(geodesic.surfaceDistance / 100, SCALE_BAR_MAX_PX);
      }
      if (scaleRef.current) scaleRef.current.hidden = !bar;
      if (bar && scaleBarRef.current && scaleLabelRef.current) {
        scaleBarRef.current.style.width = `${Math.round(bar.widthPx)}px`;
        scaleLabelRef.current.textContent = bar.label;
      }
    }
    const removePostRender = scene.postRender.addEventListener(onPostRender);

    return () => {
      handler.destroy();
      canvas.removeEventListener('pointerleave', clearCursor);
      removePostRender();
      cancelAnimationFrame(frame);
    };
  }, [viewer]);

  async function copyCoordinates() {
    const text = coordsRef.current?.textContent;
    if (!cursorRef.current || !text || text === NONE) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  return (
    <div ref={rootRef} className="control map-status" role="group" aria-label="Map status">
      <span className="map-status__cursor">
        <button
          type="button"
          ref={coordsRef}
          className="map-status__coords"
          onClick={() => void copyCoordinates()}
          title="Click to copy the coordinate under the cursor"
        >
          {NONE}
        </button>
        <button
          type="button"
          className="map-status__format"
          onClick={() => setFormat((current) => (current === 'wgs84' ? 'svy21' : 'wgs84'))}
          title="Switch between WGS84 latitude/longitude and SVY21, Singapore's national grid"
        >
          {copied ? 'Copied' : format === 'wgs84' ? 'WGS84' : 'SVY21'}
        </button>
      </span>
      <span className="map-status__item map-status__cursor" title="Ground height under the cursor">
        <span className="map-status__label">Elev</span>
        <span ref={elevationRef}>{NONE}</span>
      </span>
      <span ref={scaleRef} className="map-status__item map-status__scale" hidden>
        <span ref={scaleBarRef} className="map-status__scale-bar" />
        <span ref={scaleLabelRef} />
      </span>
      <span className="map-status__item" title="Camera altitude">
        <span className="map-status__label">Cam</span>
        <span ref={cameraRef}>{NONE}</span>
      </span>
    </div>
  );
}

function writeCoordinates(
  element: HTMLElement | null,
  cartographic: Cesium.Cartographic | null,
  format: CoordinateFormat,
) {
  if (!element) return;
  if (!cartographic) {
    element.textContent = NONE;
    return;
  }
  const latitude = Cesium.Math.toDegrees(cartographic.latitude);
  const longitude = Cesium.Math.toDegrees(cartographic.longitude);
  if (format === 'svy21' && isWithinSvy21Area(latitude, longitude)) {
    const { easting, northing } = toSvy21(latitude, longitude);
    element.textContent = formatSvy21(easting, northing);
  } else {
    element.textContent = formatLatLon(latitude, longitude);
  }
}
