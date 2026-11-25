import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as Cesium from 'cesium';
import { flyToPoint } from '@/cesium/flyToPoint';
import { createPlaceMarker, type PlaceMarker } from '@/cesium/placeMarker';
import { flyHome, orbitScreenCenter } from './cameraMoves';
import './NavigationControls.css';

interface NavigationControlsProps {
  viewer: Cesium.Viewer | null;
  is2D: boolean;
  onToggleSceneMode: () => void;
  children?: ReactNode;
}

type LocateState = { state: 'idle' } | { state: 'locating' } | { state: 'error'; message: string };

export function NavigationControls({
  viewer,
  is2D,
  onToggleSceneMode,
  children,
}: NavigationControlsProps) {
  const needleRef = useRef<SVGSVGElement>(null);
  const markerRef = useRef<PlaceMarker | null>(null);
  const [locate, setLocate] = useState<LocateState>({ state: 'idle' });

  useEffect(() => {
    if (!viewer) return;
    let lastHeading = Number.NaN;
    const removePostRender = viewer.scene.postRender.addEventListener(() => {
      const heading = viewer.camera.heading;
      if (Math.abs(heading - lastHeading) < 1e-4 || !needleRef.current) return;
      lastHeading = heading;
      needleRef.current.style.transform = `rotate(${-Cesium.Math.toDegrees(heading)}deg)`;
    });
    markerRef.current = createPlaceMarker(viewer);
    return () => {
      removePostRender();
      markerRef.current?.destroy();
      markerRef.current = null;
    };
  }, [viewer]);

  function locateMe() {
    if (!viewer) return;
    if (!('geolocation' in navigator)) {
      setLocate({ state: 'error', message: 'This browser cannot share your location.' });
      return;
    }
    setLocate({ state: 'locating' });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocate({ state: 'idle' });
        if (viewer.isDestroyed()) return;
        markerRef.current?.show(coords.longitude, coords.latitude);
        flyToPoint(viewer, coords.longitude, coords.latitude);
      },
      (error) => {
        setLocate({
          state: 'error',
          message:
            error.code === error.PERMISSION_DENIED
              ? 'Location access was refused.'
              : 'Your location could not be found.',
        });
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  const disabled = !viewer;
  const locateLabel =
    locate.state === 'error'
      ? locate.message
      : locate.state === 'locating'
        ? 'Finding your location…'
        : 'Show my location';

  return (
    <div className="map-nav" role="group" aria-label="Map navigation">
      <button
        type="button"
        className="control control-button map-nav__button"
        onClick={() => viewer && orbitScreenCenter(viewer, 0)}
        disabled={disabled}
        aria-label="Reset to north"
        title="Reset to north"
      >
        <svg ref={needleRef} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M12 3 L16 12 L8 12 Z" fill="currentColor" />
          <path
            d="M12 21 L16 12 L8 12 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        className="control control-button map-nav__button"
        onClick={() => viewer && flyHome(viewer)}
        disabled={disabled}
        aria-label="Back to the starting view"
        title="Back to the starting view"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 11 L12 4 L20 11" strokeLinecap="round" />
          <path d="M6 10 V20 H18 V10" />
        </svg>
      </button>
      <button
        type="button"
        className={
          locate.state === 'error'
            ? 'control control-button map-nav__button map-nav__button--error'
            : 'control control-button map-nav__button'
        }
        onClick={locateMe}
        disabled={disabled || locate.state === 'locating'}
        aria-label={locateLabel}
        title={locateLabel}
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <line x1="12" y1="2" x2="12" y2="5" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="2" y1="12" x2="5" y2="12" />
          <line x1="19" y1="12" x2="22" y2="12" />
        </svg>
      </button>
      <button
        type="button"
        className="control control-button map-nav__button"
        onClick={onToggleSceneMode}
        disabled={disabled}
        title={is2D ? 'Switch to 3D globe' : 'Switch to 2D map'}
      >
        {is2D ? '3D' : '2D'}
      </button>
      {children}
    </div>
  );
}
