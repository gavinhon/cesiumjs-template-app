export interface CameraState {
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  pitch: number;
}

export interface MapUrlState {
  camera?: CameraState;
  basemap?: string;
  terrain?: string | null;
  mode?: '2d' | '3d';
  layers?: string[];
}

export function terrainForLink(
  selectedId: string | null,
  defaultId: string | null,
): string | null | undefined {
  return selectedId === defaultId ? undefined : selectedId;
}

export function encodeMapUrlState(state: MapUrlState): string {
  const params = new URLSearchParams();
  const { camera } = state;
  if (camera) {
    params.set(
      'camera',
      [
        camera.longitude.toFixed(6),
        camera.latitude.toFixed(6),
        camera.height.toFixed(1),
        ((Math.round(camera.heading * 10) / 10) % 360).toFixed(1),
        camera.pitch.toFixed(1),
      ].join(','),
    );
  }
  if (state.basemap) params.set('basemap', state.basemap);
  if (state.terrain !== undefined) params.set('terrain', state.terrain ?? 'none');
  if (state.mode) params.set('mode', state.mode);
  for (const id of state.layers ?? []) params.append('layer', id);
  return params.toString().replace(/%2C/g, ',').replace(/%3A/g, ':').replace(/%2F/g, '/');
}

export function decodeMapUrlState(fragment: string): MapUrlState {
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  const state: MapUrlState = {};

  const camera = params.get('camera')?.split(',').map(Number);
  if (camera && camera.length === 5 && camera.every(Number.isFinite)) {
    const [longitude, latitude, height, heading, pitch] = camera;
    if (Math.abs(longitude) <= 180 && Math.abs(latitude) <= 90 && height > 0) {
      state.camera = { longitude, latitude, height, heading, pitch };
    }
  }

  const basemap = params.get('basemap');
  if (basemap) state.basemap = basemap;

  const terrain = params.get('terrain');
  if (terrain) state.terrain = terrain === 'none' ? null : terrain;

  const mode = params.get('mode');
  if (mode === '2d' || mode === '3d') state.mode = mode;

  const layers = params.getAll('layer').filter(Boolean);
  if (layers.length > 0) state.layers = [...new Set(layers)];

  return state;
}
