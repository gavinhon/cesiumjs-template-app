/**
 * The map's state as a URL fragment, so a view can be bookmarked or sent:
 *
 *   #camera=103.86080,1.28345,1500.0,0.0,-90.0&basemap=esri&terrain=public:…
 *    &mode=2d&layer=example:sg-rail-lines&layer=public:tilesets/sg1965
 *
 * In the fragment, not the query string, because it never reaches a
 * server — the app is static files (GitHub Pages) and a query string would
 * be one more thing every cache keyed on.
 *
 * Layers are listed by their catalogue id, the id the Add data catalogue
 * adds them under, so a link restores exactly those datasets. Layers
 * connected by typing a service URL have no such id and are left out — a
 * link carrying arbitrary service URLs (and ArcGIS tokens) is a link nobody
 * should be sending around.
 *
 * Pure functions, unit-tested; the hook that reads and writes the address
 * bar is `useMapUrlState`.
 */

/** Where the camera is and which way it looks: degrees and metres. */
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
  /** A terrain id, or `null` for the bare ellipsoid. Absent: leave the default. */
  terrain?: string | null;
  mode?: '2d' | '3d';
  /** Catalogue ids, imagery bottom-to-top first, then everything else. */
  layers?: string[];
}

/**
 * What a link should say about terrain: nothing while it's the app's
 * default, so the link keeps meaning "whatever terrain the app starts on".
 *
 * Writing the selection every time froze the deployment of the day into
 * every link. Before the site had any terrain, each address it wrote said
 * `terrain=none` — so once terrain was added, every bookmark and open tab
 * kept switching it off, and the new terrain looked missing. Now only a
 * deliberate change is written: choosing "None" while a default exists, or
 * another terrain than the default.
 */
export function terrainForLink(
  selectedId: string | null,
  defaultId: string | null,
): string | null | undefined {
  return selectedId === defaultId ? undefined : selectedId;
}

/** The fragment (without its `#`) for `state`. Absent fields are left out. */
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
        // 359.97° would print as "360.0"; north is "0.0".
        ((Math.round(camera.heading * 10) / 10) % 360).toFixed(1),
        camera.pitch.toFixed(1),
      ].join(','),
    );
  }
  if (state.basemap) params.set('basemap', state.basemap);
  if (state.terrain !== undefined) params.set('terrain', state.terrain ?? 'none');
  if (state.mode) params.set('mode', state.mode);
  for (const id of state.layers ?? []) params.append('layer', id);
  // URLSearchParams escapes `,`, `:` and `/`, but all three are legal in a
  // fragment (RFC 3986) and a link people can read is one they trust more.
  return params.toString().replace(/%2C/g, ',').replace(/%3A/g, ':').replace(/%2F/g, '/');
}

/**
 * Reads a fragment back. Tolerant by design — it may have been hand-edited
 * or truncated by a chat app — so anything malformed is dropped field by
 * field rather than rejecting the whole link.
 */
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
