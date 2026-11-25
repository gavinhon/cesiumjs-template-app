import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { MAP_COLORS } from '@/cesium/mapColors';
import { APP_CONFIG } from '@/lib/appConfig';
import type {
  LiveTrafficFile,
  TrafficCongestionSnapshot,
  TrafficIncidentSnapshot,
  TrafficLink,
} from '@/lib/liveTrafficTypes';
import { LIVE_TRAFFIC_QUICK_ADD, type LiveTrafficLayerId } from './liveTrafficQuickAdd';
import { ROAD_DETAIL, type RoadDetail } from './trafficPresentation';

/** A live traffic layer on the map, as the layer list shows it. */
export interface LiveTrafficLayer {
  /** Its catalogue id, which shared links carry. */
  id: string;
  layer: LiveTrafficLayerId;
  name: string;
  visible: boolean;
  /** When the snapshot on the map was read from LTA; null until the first arrives. */
  fetchedAt: string | null;
  /** Why the last refresh failed, if it did; the last good snapshot stays up. */
  error: string | null;
  /** Road links drawn, or incidents shown. */
  count: number;
}

const FILE: Record<LiveTrafficLayerId, LiveTrafficFile> = {
  congestion: 'traffic-congestion.json',
  incidents: 'traffic-incidents.json',
};

/**
 * How often the map asks for the snapshots. More often than LTA updates
 * (2–5 min), so a new reading shows within a minute of the server getting
 * it; cheap when nothing changed, as nginx answers "not modified".
 */
const POLL_MS = 60_000;

/** Retry sooner while the server hasn't made its first reading (it takes ~15 s). */
const WAITING_RETRY_MS = 15_000;

/** Singapore, which is all LTA covers: what "zoom to" frames. */
const SINGAPORE = Cesium.Rectangle.fromDegrees(103.6, 1.2, 104.05, 1.48);

/** Thrown for the server's 503: it's reading LTA for the first time. */
class NotReadYet extends Error {}

/**
 * Wider lines for bigger roads, so the expressways read first — and wide
 * enough to click: a 2 px line was a hunt.
 */
function lineWidth(category: number): number {
  return category === 1 ? 5 : category === 2 ? 4 : 3;
}

/**
 * The congestion links of `snapshot` within `detail`, as one batch of
 * ground-clamped polylines — `null` if none qualify.
 *
 * **Ground-clamped, not at a fixed height.** The terrain hides what's
 * under it (`depthTestAgainstTerrain`), so a line drawn at sea level or a
 * few metres up would vanish into every hill. `GroundPolylinePrimitive`
 * drapes each link on the terrain as it's drawn — and only the terrain
 * (`ClassificationType.TERRAIN`), so a road under a building's footprint
 * doesn't paint its roof. Built off the main thread (`asynchronous`): ~2 s
 * for the main roads, ~4 s for all 144,000 links.
 *
 * Each link's id is its index in the snapshot, which is how a click finds
 * its road name and speed.
 */
function buildCongestion(
  snapshot: TrafficCongestionSnapshot,
  detail: RoadDetail,
): Cesium.GroundPolylinePrimitive | null {
  const { categories } = ROAD_DETAIL[detail];
  const scale = snapshot.scale;
  const instances: Cesium.GeometryInstance[] = [];
  snapshot.links.forEach((link, index) => {
    if (!categories.has(link[5])) return;
    instances.push(
      new Cesium.GeometryInstance({
        geometry: new Cesium.GroundPolylineGeometry({
          positions: Cesium.Cartesian3.fromDegreesArray([
            link[0] / scale,
            link[1] / scale,
            link[2] / scale,
            link[3] / scale,
          ]),
          width: lineWidth(link[5]),
        }),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(
            MAP_COLORS.trafficBands[link[4]] ?? MAP_COLORS.trafficBands[0],
          ),
        },
        id: { liveTrafficLink: index },
      }),
    );
  });
  if (instances.length === 0) return null;
  return new Cesium.GroundPolylinePrimitive({
    geometryInstances: instances,
    appearance: new Cesium.PolylineColorAppearance(),
    classificationType: Cesium.ClassificationType.TERRAIN,
    asynchronous: true,
  });
}

/** Calls `onReady` once `primitive` has finished building off-thread. */
function whenReady(
  scene: Cesium.Scene,
  primitive: Cesium.GroundPolylinePrimitive,
  onReady: () => void,
) {
  const remove = scene.postRender.addEventListener(() => {
    if (primitive.isDestroyed()) return remove();
    if (!primitive.ready) return;
    remove();
    onReady();
  });
}

/** Replaces the incident points with `snapshot`'s, in one batch of collection events. */
function drawIncidents(source: Cesium.CustomDataSource, snapshot: TrafficIncidentSnapshot) {
  source.entities.suspendEvents();
  source.entities.removeAll();
  for (const incident of snapshot.incidents) {
    source.entities.add({
      position: Cesium.Cartesian3.fromDegrees(incident.longitude, incident.latitude),
      point: {
        pixelSize: 12,
        color: MAP_COLORS.incident,
        outlineColor: MAP_COLORS.casing,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        // Clamped to the surface, nearby terrain cuts a point in half;
        // skipping the depth test up close draws it whole (as vector points
        // do — see loadVectorDataSource).
        disableDepthTestDistance: 50_000,
      },
      properties: { liveTrafficIncident: true, type: incident.type, message: incident.message },
    });
  }
  source.entities.resumeEvents();
}

function setShown(target: { show: boolean } | null, show: boolean) {
  if (target) target.show = show;
}

/**
 * Live traffic from LTA: congestion (each road link coloured by its speed
 * band) and incidents (points with LTA's report). Both come from snapshots
 * a server writes — the dev server or the Docker container, which hold the
 * LTA key — under `APP_CONFIG.liveTraffic`; see
 * `vite-plugins/liveTrafficFeed.ts`. Without that, nothing here is offered
 * (`LIVE_TRAFFIC_QUICK_ADD` is empty).
 *
 * While a layer is on the map it's refreshed every minute. A failed
 * refresh keeps the last snapshot up and says so on the layer's row,
 * rather than emptying the map.
 */
export function useLiveTraffic(viewer: Cesium.Viewer | null) {
  const [layers, setLayers] = useState<LiveTrafficLayer[]>([]);
  const [roadDetail, setRoadDetailState] = useState<RoadDetail>('main');

  // Cesium objects and timers: refs, since none of them is rendered by React.
  const congestion = useRef<{
    /** The latest snapshot, rebuilt from when the road detail changes. */
    latest: TrafficCongestionSnapshot | null;
    /** The snapshot the primitive on screen was built from — what a click's index refers to. */
    shown: TrafficCongestionSnapshot | null;
    primitive: Cesium.GroundPolylinePrimitive | null;
    /** Bumped per build, so a slower, older build never replaces a newer one. */
    generation: number;
  }>({ latest: null, shown: null, primitive: null, generation: 0 });
  const incidents = useRef<Cesium.CustomDataSource | null>(null);
  const timers = useRef(new Map<LiveTrafficLayerId, ReturnType<typeof setTimeout>>());

  // Read by refreshes and builds, which outlive the render that started them.
  const layersRef = useRef(layers);
  const roadDetailRef = useRef(roadDetail);
  useLayoutEffect(() => {
    layersRef.current = layers;
    roadDetailRef.current = roadDetail;
  });

  const update = useCallback((layer: LiveTrafficLayerId, change: Partial<LiveTrafficLayer>) => {
    setLayers((current) =>
      current.map((entry) => (entry.layer === layer ? { ...entry, ...change } : entry)),
    );
  }, []);

  /** Builds congestion from `snapshot` and swaps it in once ready. */
  const showCongestion = useCallback(
    (snapshot: TrafficCongestionSnapshot) => {
      if (!viewer) return;
      const state = congestion.current;
      const generation = ++state.generation;
      const next = buildCongestion(snapshot, roadDetailRef.current);
      const visible =
        layersRef.current.find((entry) => entry.layer === 'congestion')?.visible ?? true;
      const swap = () => {
        if (viewer.isDestroyed()) return;
        if (generation !== state.generation || !timers.current.has('congestion')) {
          if (next) viewer.scene.groundPrimitives.remove(next);
          return;
        }
        if (state.primitive) viewer.scene.groundPrimitives.remove(state.primitive);
        state.primitive = next;
        state.shown = snapshot;
      };
      if (!next) return swap();
      setShown(next, visible);
      viewer.scene.groundPrimitives.add(next);
      whenReady(viewer.scene, next, swap);
    },
    [viewer],
  );

  // The latest `refresh`, for its own timers to call (set below it).
  const refreshRef = useRef<((layer: LiveTrafficLayerId) => Promise<void>) | null>(null);

  /** Fetches one layer's snapshot and draws it if it's new; schedules the next. */
  const refresh = useCallback(
    async (layer: LiveTrafficLayerId) => {
      if (!viewer || !APP_CONFIG.liveTraffic) return;
      let retryIn = POLL_MS;
      try {
        const response = await fetch(
          new URL(`${APP_CONFIG.liveTraffic}${FILE[layer]}`, document.baseURI),
          {
            // Revalidate every time: the file changes in place at a fixed URL.
            cache: 'no-cache',
          },
        );
        if (response.status === 503) throw new NotReadYet();
        if (!response.ok) throw new Error(`The traffic server answered HTTP ${response.status}.`);
        const snapshot: unknown = await response.json();
        if (!timers.current.has(layer) || viewer.isDestroyed()) return;
        if (layer === 'congestion') {
          const data = snapshot as TrafficCongestionSnapshot;
          if (data.fetchedAt !== congestion.current.latest?.fetchedAt) {
            congestion.current.latest = data;
            showCongestion(data);
          }
          update(layer, {
            fetchedAt: data.fetchedAt,
            error: null,
            count: data.links.filter((link: TrafficLink) =>
              ROAD_DETAIL[roadDetailRef.current].categories.has(link[5]),
            ).length,
          });
        } else {
          const data = snapshot as TrafficIncidentSnapshot;
          if (incidents.current) drawIncidents(incidents.current, data);
          update(layer, { fetchedAt: data.fetchedAt, error: null, count: data.incidents.length });
        }
      } catch (error) {
        if (error instanceof NotReadYet) retryIn = WAITING_RETRY_MS;
        update(layer, {
          error:
            error instanceof NotReadYet
              ? null
              : error instanceof Error
                ? error.message
                : String(error),
        });
      }
      // Rescheduled only while the layer is still on the map — through a
      // ref, as a callback can't name itself while it's being declared.
      if (timers.current.has(layer)) {
        timers.current.set(
          layer,
          setTimeout(() => void refreshRef.current?.(layer), retryIn),
        );
      }
    },
    [viewer, showCongestion, update],
  );
  useLayoutEffect(() => {
    refreshRef.current = refresh;
  });

  /** Puts a live layer on the map. Island-wide, so the camera stays where it is. */
  const add = useCallback(
    async (layer: LiveTrafficLayerId) => {
      if (!viewer || timers.current.has(layer)) return;
      const entry = LIVE_TRAFFIC_QUICK_ADD.find((candidate) => candidate.layer === layer);
      if (!entry) return;
      if (layer === 'incidents') {
        incidents.current = new Cesium.CustomDataSource(entry.item.name);
        await viewer.dataSources.add(incidents.current);
      }
      // A placeholder timer marks the layer as on the map before the first
      // fetch, so a refresh landing after a quick removal is dropped.
      timers.current.set(
        layer,
        setTimeout(() => {}, 0),
      );
      setLayers((current) => [
        ...current,
        {
          id: entry.item.id,
          layer,
          name: entry.item.name,
          visible: true,
          fetchedAt: null,
          error: null,
          count: 0,
        },
      ]);
      await refresh(layer);
    },
    [viewer, refresh],
  );

  const remove = useCallback(
    (layer: LiveTrafficLayerId) => {
      clearTimeout(timers.current.get(layer));
      timers.current.delete(layer);
      if (viewer && !viewer.isDestroyed()) {
        if (layer === 'congestion') {
          const state = congestion.current;
          state.generation++;
          if (state.primitive) viewer.scene.groundPrimitives.remove(state.primitive);
          congestion.current = {
            latest: null,
            shown: null,
            primitive: null,
            generation: state.generation,
          };
        } else if (incidents.current) {
          viewer.dataSources.remove(incidents.current, true);
          incidents.current = null;
        }
      }
      setLayers((current) => current.filter((entry) => entry.layer !== layer));
    },
    [viewer],
  );

  const toggleVisibility = useCallback((layer: LiveTrafficLayerId) => {
    const visible = !layersRef.current.find((entry) => entry.layer === layer)?.visible;
    setShown(layer === 'congestion' ? congestion.current.primitive : incidents.current, visible);
    setLayers((current) =>
      current.map((entry) => (entry.layer === layer ? { ...entry, visible } : entry)),
    );
  }, []);

  /** Draws more or fewer roads, from the snapshot already on hand. */
  const setRoadDetail = useCallback(
    (detail: RoadDetail) => {
      roadDetailRef.current = detail;
      setRoadDetailState(detail);
      const latest = congestion.current.latest;
      if (!latest) return;
      showCongestion(latest);
      update('congestion', {
        count: latest.links.filter((link) => ROAD_DETAIL[detail].categories.has(link[5])).length,
      });
    },
    [showCongestion, update],
  );

  const zoomTo = useCallback(() => {
    viewer?.camera.flyTo({ destination: SINGAPORE });
  }, [viewer]);

  /** The road link a click picked, by the index its primitive was built with. */
  const linkAt = useCallback((index: number) => {
    const shown = congestion.current.shown;
    const link = shown?.links[index];
    return shown && link ? { link, road: shown.roads[link[6]] ?? '' } : null;
  }, []);

  // Leaving the page (or HMR) stops every refresh.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return { layers, roadDetail, add, remove, toggleVisibility, setRoadDetail, zoomTo, linkAt };
}
