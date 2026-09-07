import type * as Cesium from 'cesium';

/**
 * Inertia states Cesium keeps on its camera controller, one per gesture.
 * Private, hence the string keys — see the note in `cancelCameraInertia`.
 */
const INERTIA_STATE_KEYS = [
  '_lastInertiaSpinMovement',
  '_lastInertiaTranslateMovement',
  '_lastInertiaZoomMovement',
  '_lastInertiaTiltMovement',
];

/**
 * Stops the camera gliding after an interaction that borrowed the mouse.
 *
 * Setting `screenSpaceCameraController.enableInputs = false` stops the
 * camera *moving* during a drag, but it does not stop Cesium's
 * `CameraEventAggregator` from **recording** that drag. When inputs come
 * back on release, the controller's `maintainInertia` replays the recorded
 * movement as spin inertia — so letting go of a dragged vertex sends the
 * whole globe sliding for about a second afterwards.
 *
 * `maintainInertia` checks an `inertiaEnabled` flag on each gesture's
 * movement state before replaying, so clearing that flag is the exact
 * escape hatch. The states are private (`_lastInertia*Movement`), which is
 * why this reads them defensively by key and skips anything that doesn't
 * look right — a Cesium upgrade that renames them degrades to the old
 * glide rather than throwing.
 *
 * Call this when a drag you handled yourself ends, right after re-enabling
 * camera input.
 */
export function cancelCameraInertia(scene: Cesium.Scene): void {
  const controller = scene.screenSpaceCameraController as unknown as Record<string, unknown>;

  for (const key of INERTIA_STATE_KEYS) {
    const state = controller[key];
    if (state && typeof state === 'object' && 'inertiaEnabled' in state) {
      (state as { inertiaEnabled: boolean }).inertiaEnabled = false;
    }
  }
}
