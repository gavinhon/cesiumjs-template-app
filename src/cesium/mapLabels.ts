import * as Cesium from 'cesium';
import './mapLabels.css';

/**
 * Text anchored to a world position, drawn as HTML over the canvas instead
 * of by Cesium.
 *
 * **Why not `Entity.label`.** Cesium rasterises label text into a
 * signed-distance-field texture atlas and samples it on the GPU. That is
 * the right trade for thousands of moving labels, but at UI sizes it looks
 * wrong: glyph edges pick up fringing and a muddy halo, and no combination
 * of `fillColor`, `outlineWidth`, `showBackground` or `scale` removes it,
 * because the artifact is in the SDF sampling rather than in the styling.
 * DOM text is rasterised by the browser at native resolution, so it is
 * simply crisp — and it can use the app's own fonts and design tokens
 * directly rather than through a hand-mirrored copy.
 *
 * **What you give up.** These are DOM nodes on top of the canvas, so they
 * cannot be occluded by 3D geometry the way a depth-tested billboard can.
 * That costs nothing here: the labels this replaces already set
 * `disableDepthTestDistance: Number.POSITIVE_INFINITY`, i.e. they were
 * explicitly drawn on top of everything anyway. The one occlusion that does
 * matter — a label on the far side of the globe — is handled below.
 *
 * **Scale.** One DOM node and one projection per label per frame is fine
 * for the handful a person draws by hand. If you ever need hundreds that
 * move every frame, go back to `Entity.label`; that is what the SDF atlas
 * is for.
 */
export type MapLabelVariant =
  /** Free text the user typed. */
  | 'text'
  /** A numeric readout, e.g. a measured distance. */
  | 'readout';

export interface MapLabelLayer {
  /** Adds a label and returns the id used to update or remove it. */
  add(position: Cesium.Cartesian3, text: string, variant: MapLabelVariant): string;
  /** Moves and/or retitles an existing label. No-op for an unknown id. */
  update(id: string, position: Cesium.Cartesian3, text: string): void;
  remove(id: string): void;
  /** Tears down the container and stops tracking the scene. */
  destroy(): void;
}

interface TrackedLabel {
  element: HTMLDivElement;
  position: Cesium.Cartesian3;
  /** Last visibility written to the DOM, so we only touch it on a change. */
  visible: boolean;
}

/**
 * Is this surface point on the side of the globe facing the camera?
 *
 * For a point on the ellipsoid, the outward surface normal and the
 * direction to the camera point the same way exactly when the point is on
 * the near side — so a positive dot product is the whole horizon test.
 * Without it, labels on the far side of the planet still project to valid
 * window coordinates and would show through the globe.
 */
function isOnVisibleSide(
  scene: Cesium.Scene,
  position: Cesium.Cartesian3,
  normalScratch: Cesium.Cartesian3,
  toCameraScratch: Cesium.Cartesian3,
): boolean {
  // Only the 3D globe curves away from the viewer; a flattened map has no
  // far side to hide anything.
  if (scene.mode !== Cesium.SceneMode.SCENE3D) return true;

  const normal = scene.globe.ellipsoid.geodeticSurfaceNormal(position, normalScratch);
  if (!normal) return true;
  const toCamera = Cesium.Cartesian3.subtract(scene.camera.positionWC, position, toCameraScratch);
  return Cesium.Cartesian3.dot(normal, toCamera) > 0;
}

/**
 * Where a world position appears in the window, in CSS pixels from the
 * canvas's top-left — or undefined when it can't be seen there: behind the
 * camera, outside the view, or on the far side of the globe.
 *
 * Shared by anything that pins HTML to the map (these labels, the feature
 * info card). Runs every frame, so the caller supplies the scratch objects.
 */
export function toWindowPosition(
  scene: Cesium.Scene,
  position: Cesium.Cartesian3,
  scratch: { window: Cesium.Cartesian2; normal: Cesium.Cartesian3; toCamera: Cesium.Cartesian3 },
): Cesium.Cartesian2 | undefined {
  if (!isOnVisibleSide(scene, position, scratch.normal, scratch.toCamera)) return undefined;
  return Cesium.SceneTransforms.worldToWindowCoordinates(scene, position, scratch.window);
}

/**
 * Creates the overlay and starts tracking the scene.
 *
 * The container is appended to the Viewer's own element rather than to the
 * React tree, so it inherits the canvas's position and stacking: the
 * app's floating panels sit above it, as they should, without anyone
 * choosing a z-index.
 */
export function createMapLabelLayer(viewer: Cesium.Viewer): MapLabelLayer {
  const container = document.createElement('div');
  container.className = 'map-labels';
  viewer.container.appendChild(container);

  const labels = new Map<string, TrackedLabel>();
  let nextId = 0;

  // Reused across every label, every frame. These projections run in the
  // render loop, so allocating three Cartesians per label per frame would
  // be a steady stream of garbage for no reason.
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

      // Anchor the label's bottom centre a little above the point, with the
      // offsets folded into the same transform so positioning is one style
      // write per frame rather than several.
      label.element.style.transform =
        `translate(${Math.round(windowPosition.x)}px, ${Math.round(windowPosition.y)}px)` +
        ` translate(-50%, calc(-100% - 10px))`;
    }
  }

  // `postRender` rather than a raw requestAnimationFrame loop: it fires
  // exactly when Cesium has finished drawing a frame, so the labels move in
  // the same frame as the globe under them instead of trailing it by one.
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
      // Assigning identical text still invalidates layout in some engines,
      // and the measure readout updates on every mouse move.
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
