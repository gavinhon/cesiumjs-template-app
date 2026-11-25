import * as Cesium from 'cesium';
import { MAP_COLORS } from './mapColors';

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
          outlineColor: MAP_COLORS.casing,
          outlineWidth: 3,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    },
    hide,
    destroy: hide,
  };
}
