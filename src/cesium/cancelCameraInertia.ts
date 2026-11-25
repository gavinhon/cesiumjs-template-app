import type * as Cesium from 'cesium';

const INERTIA_STATE_KEYS = [
  '_lastInertiaSpinMovement',
  '_lastInertiaTranslateMovement',
  '_lastInertiaZoomMovement',
  '_lastInertiaTiltMovement',
];

export function cancelCameraInertia(scene: Cesium.Scene): void {
  const controller = scene.screenSpaceCameraController as unknown as Record<string, unknown>;

  for (const key of INERTIA_STATE_KEYS) {
    const state = controller[key];
    if (state && typeof state === 'object' && 'inertiaEnabled' in state) {
      (state as { inertiaEnabled: boolean }).inertiaEnabled = false;
    }
  }
}
