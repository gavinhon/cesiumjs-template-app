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

export interface LiveTrafficLayer {
  id: string;
  layer: LiveTrafficLayerId;
  name: string;
  visible: boolean;
  fetchedAt: string | null;
  error: string | null;
  count: number;
}

const FILE: Record<LiveTrafficLayerId, LiveTrafficFile> = {
  congestion: 'traffic-congestion.json',
  incidents: 'traffic-incidents.json',
};

const POLL_MS = 60_000;

const WAITING_RETRY_MS = 15_000;

const SINGAPORE = Cesium.Rectangle.fromDegrees(103.6, 1.2, 104.05, 1.48);

class NotReadYet extends Error {}

function lineWidth(category: number): number {
  return category === 1 ? 5 : category === 2 ? 4 : 3;
}

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

export function useLiveTraffic(viewer: Cesium.Viewer | null) {
  const [layers, setLayers] = useState<LiveTrafficLayer[]>([]);
  const [roadDetail, setRoadDetailState] = useState<RoadDetail>('main');

  const congestion = useRef<{
    latest: TrafficCongestionSnapshot | null;
    shown: TrafficCongestionSnapshot | null;
    primitive: Cesium.GroundPolylinePrimitive | null;
    generation: number;
  }>({ latest: null, shown: null, primitive: null, generation: 0 });
  const incidents = useRef<Cesium.CustomDataSource | null>(null);
  const timers = useRef(new Map<LiveTrafficLayerId, ReturnType<typeof setTimeout>>());

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

  const refreshRef = useRef<((layer: LiveTrafficLayerId) => Promise<void>) | null>(null);

  const refresh = useCallback(
    async (layer: LiveTrafficLayerId) => {
      if (!viewer || !APP_CONFIG.liveTraffic) return;
      let retryIn = POLL_MS;
      try {
        const response = await fetch(
          new URL(`${APP_CONFIG.liveTraffic}${FILE[layer]}`, document.baseURI),
          {
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

  const add = useCallback(
    async (layer: LiveTrafficLayerId) => {
      if (!viewer || timers.current.has(layer)) return;
      const entry = LIVE_TRAFFIC_QUICK_ADD.find((candidate) => candidate.layer === layer);
      if (!entry) return;
      if (layer === 'incidents') {
        incidents.current = new Cesium.CustomDataSource(entry.item.name);
        await viewer.dataSources.add(incidents.current);
      }
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

  const linkAt = useCallback((index: number) => {
    const shown = congestion.current.shown;
    const link = shown?.links[index];
    return shown && link ? { link, road: shown.roads[link[6]] ?? '' } : null;
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return { layers, roadDetail, add, remove, toggleVisibility, setRoadDetail, zoomTo, linkAt };
}
