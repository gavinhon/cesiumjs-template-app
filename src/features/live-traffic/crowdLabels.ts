import * as Cesium from 'cesium';
import { toWindowPosition } from '@/cesium/mapLabels';
import type { CrowdLevel } from '@/lib/liveTrafficTypes';
import '@/cesium/mapLabels.css';
import './crowdLabels.css';

export interface CrowdLabel {
  name: string;
  longitude: number;
  latitude: number;
  level: CrowdLevel;
  busy: boolean;
  symbolSize: number;
}

export interface CrowdLabelLayer {
  set(labels: CrowdLabel[]): void;
  setShown(shown: boolean): void;
  destroy(): void;
}

interface Tracked {
  label: CrowdLabel;
  element: HTMLDivElement;
  cartographic: Cesium.Cartographic;
  position: Cesium.Cartesian3 | null;
  width: number;
  height: number;
  visible: boolean;
}

const QUIET_RANGE = 4_000;
const BUSY_RANGE = 60_000;
const GAP = 4;

const PRIORITY: Record<CrowdLevel, number> = { h: 3, m: 2, l: 1, '': 0 };

export function createCrowdLabelLayer(
  viewer: Cesium.Viewer,
  symbolScale: Cesium.NearFarScalar,
): CrowdLabelLayer {
  const container = document.createElement('div');
  container.className = 'map-labels';
  viewer.container.appendChild(container);

  let tracked: Tracked[] = [];
  let shown = true;
  let terrain: Cesium.TerrainProvider | undefined = viewer.scene.terrainProvider;
  const scratch = {
    window: new Cesium.Cartesian2(),
    normal: new Cesium.Cartesian3(),
    toCamera: new Cesium.Cartesian3(),
  };

  const hide = (entry: Tracked) => {
    if (!entry.visible) return;
    entry.element.classList.add('map-label--hidden');
    entry.visible = false;
  };

  const groundPosition = (entry: Tracked) => {
    if (entry.position) return entry.position;
    // Early terrain samples can be wildly wrong (~-6,356 km); don't cache those.
    const sampled = viewer.scene.globe.getHeight(entry.cartographic);
    const plausible = sampled !== undefined && Math.abs(sampled) < 10_000;
    const position = Cesium.Cartographic.toCartesian(
      new Cesium.Cartographic(
        entry.cartographic.longitude,
        entry.cartographic.latitude,
        plausible ? sampled : 0,
      ),
    );
    if (plausible) entry.position = position;
    return position;
  };

  const scaleAt = (distance: number) => {
    const { near, nearValue, far, farValue } = symbolScale;
    const t = Cesium.Math.clamp((distance - near) / (far - near), 0, 1);
    return Cesium.Math.lerp(nearValue, farValue, t);
  };

  function reposition() {
    if (!shown || tracked.length === 0) return;
    const scene = viewer.scene;
    if (scene.terrainProvider !== terrain) {
      terrain = scene.terrainProvider;
      for (const entry of tracked) entry.position = null;
    }
    const camera = scene.camera.positionWC;
    const width = scene.canvas.clientWidth;
    const height = scene.canvas.clientHeight;
    const placed: { x: number; y: number; w: number; h: number }[] = [];

    for (const entry of tracked) {
      const position = groundPosition(entry);
      const distance = Cesium.Cartesian3.distance(camera, position);
      if (distance > (entry.label.busy ? BUSY_RANGE : QUIET_RANGE)) {
        hide(entry);
        continue;
      }
      const at = toWindowPosition(scene, position, scratch);
      if (!at) {
        hide(entry);
        continue;
      }
      if (entry.width === 0) {
        entry.element.classList.remove('map-label--hidden');
        entry.width = entry.element.offsetWidth;
        entry.height = entry.element.offsetHeight;
        entry.visible = true;
      }
      const lift = (entry.label.symbolSize / 2) * scaleAt(distance) + GAP;
      const box = {
        x: Math.round(at.x - entry.width / 2),
        y: Math.round(at.y - lift - entry.height),
        w: entry.width,
        h: entry.height,
      };
      const offScreen = box.x + box.w < 0 || box.x > width || box.y + box.h < 0 || box.y > height;
      const overlaps = placed.some(
        (other) =>
          box.x < other.x + other.w + GAP &&
          other.x < box.x + box.w + GAP &&
          box.y < other.y + other.h &&
          other.y < box.y + box.h,
      );
      if (offScreen || overlaps) {
        hide(entry);
        continue;
      }
      placed.push(box);
      entry.element.style.transform = `translate(${box.x}px, ${box.y}px)`;
      if (!entry.visible) {
        entry.element.classList.remove('map-label--hidden');
        entry.visible = true;
      }
    }
  }

  viewer.scene.postRender.addEventListener(reposition);

  return {
    set(labels) {
      for (const entry of tracked) entry.element.remove();
      tracked = [...labels]
        .sort((a, b) => PRIORITY[b.level] - PRIORITY[a.level])
        .map((label) => {
          const element = document.createElement('div');
          element.className = `map-label map-label--station map-label--crowd-${label.level || 'none'}`;
          element.textContent = label.name;
          container.appendChild(element);
          const entry: Tracked = {
            label,
            element,
            cartographic: Cesium.Cartographic.fromDegrees(label.longitude, label.latitude),
            position: null,
            width: element.offsetWidth,
            height: element.offsetHeight,
            visible: true,
          };
          hide(entry);
          return entry;
        });
      viewer.scene.requestRender();
    },
    setShown(next) {
      shown = next;
      container.hidden = !next;
      if (next) viewer.scene.requestRender();
    },
    destroy() {
      viewer.scene.postRender.removeEventListener(reposition);
      container.remove();
      tracked = [];
    },
  };
}
