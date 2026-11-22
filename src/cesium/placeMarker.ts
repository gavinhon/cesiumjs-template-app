import * as Cesium from 'cesium';
import { MAP_COLORS } from './mapColors';

/**
 * A single "this place" pin — for the user's location and a search
 * result. Shared because both features mark a place the same way, and two
 * slightly different pins would read as two different kinds of thing.
 *
 * One marker per caller: `show` moves it, `hide` takes it away. It is not
 * a `DrawnFeature` — it isn't the user's work — so the drawing tools' list
 * and discard button never see it.
 */
export interface PlaceMarker {
  show(longitude: number, latitude: number): void;
  hide(): void;
  destroy(): void;
}

export function createPlaceMarker(viewer: Cesium.Viewer): PlaceMarker {
  let entity: Cesium.Entity | null = null;

  function hide() {
    if (entity && !viewer.isDestroyed()) viewer.entities.remove(entity);
    entity = null;
  }

  return {
    show(longitude, latitude) {
      hide();
      entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(longitude, latitude),
        point: {
          pixelSize: 12,
          color: MAP_COLORS.location,
          // The same dark casing measurements get, so a white dot still
          // reads on a white street or a pale roof.
          outlineColor: MAP_COLORS.casing,
          outlineWidth: 3,
          // Sit on the rendered surface, never the bare ellipsoid (CLAUDE.md,
          // terrain) — and stay visible through a building in front of it.
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    },
    hide,
    destroy: hide,
  };
}
