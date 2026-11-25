import * as Cesium from 'cesium';
import './mapLabels.css';

export type MapLabelVariant = 'text' | 'readout';

export interface MapLabelLayer {
  add(position: Cesium.Cartesian3, text: string, variant: MapLabelVariant): string;
  update(id: string, position: Cesium.Cartesian3, text: string): void;
  remove(id: string): void;
  destroy(): void;
}

interface TrackedLabel {
  element: HTMLDivElement;
  position: Cesium.Cartesian3;
  visible: boolean;
}

function isOnVisibleSide(
  scene: Cesium.Scene,
  position: Cesium.Cartesian3,
  normalScratch: Cesium.Cartesian3,
  toCameraScratch: Cesium.Cartesian3,
): boolean {
  if (scene.mode !== Cesium.SceneMode.SCENE3D) return true;

  const normal = scene.globe.ellipsoid.geodeticSurfaceNormal(position, normalScratch);
  if (!normal) return true;
  const toCamera = Cesium.Cartesian3.subtract(scene.camera.positionWC, position, toCameraScratch);
  return Cesium.Cartesian3.dot(normal, toCamera) > 0;
}

export function toWindowPosition(
  scene: Cesium.Scene,
  position: Cesium.Cartesian3,
  scratch: { window: Cesium.Cartesian2; normal: Cesium.Cartesian3; toCamera: Cesium.Cartesian3 },
): Cesium.Cartesian2 | undefined {
  if (!isOnVisibleSide(scene, position, scratch.normal, scratch.toCamera)) return undefined;
  return Cesium.SceneTransforms.worldToWindowCoordinates(scene, position, scratch.window);
}

export function createMapLabelLayer(viewer: Cesium.Viewer): MapLabelLayer {
  const container = document.createElement('div');
  container.className = 'map-labels';
  viewer.container.appendChild(container);

  const labels = new Map<string, TrackedLabel>();
  let nextId = 0;

  const scratch = {
    window: new Cesium.Cartesian2(),
    normal: new Cesium.Cartesian3(),
    toCamera: new Cesium.Cartesian3(),
  };

  function reposition() {
    if (labels.size === 0) return;

    for (const label of labels.values()) {
      const windowPosition = toWindowPosition(viewer.scene, label.position, scratch);

      const visible = windowPosition !== undefined;
      if (visible !== label.visible) {
        label.element.classList.toggle('map-label--hidden', !visible);
        label.visible = visible;
      }
      if (!windowPosition) continue;

      label.element.style.transform =
        `translate(${Math.round(windowPosition.x)}px, ${Math.round(windowPosition.y)}px)` +
        ` translate(-50%, calc(-100% - 10px))`;
    }
  }

  viewer.scene.postRender.addEventListener(reposition);

  return {
    add(position, text, variant) {
      const id = `map-label-${nextId++}`;
      const element = document.createElement('div');
      element.className = `map-label map-label--${variant} map-label--hidden`;
      element.textContent = text;
      container.appendChild(element);
      labels.set(id, { element, position, visible: false });
      return id;
    },

    update(id, position, text) {
      const label = labels.get(id);
      if (!label) return;
      label.position = position;
      if (label.element.textContent !== text) {
        label.element.textContent = text;
      }
    },

    remove(id) {
      const label = labels.get(id);
      if (!label) return;
      label.element.remove();
      labels.delete(id);
    },

    destroy() {
      viewer.scene.postRender.removeEventListener(reposition);
      labels.clear();
      container.remove();
    },
  };
}
