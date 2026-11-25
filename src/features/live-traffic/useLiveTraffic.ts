import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { MAP_COLORS } from '@/cesium/mapColors';
import { APP_CONFIG } from '@/lib/appConfig';
import type {
  LiveTrafficFile,
  MrtCrowdSnapshot,
  TrafficCongestionSnapshot,
  TrafficIncidentSnapshot,
  TrafficLink,
} from '@/lib/liveTrafficTypes';
import { LIVE_TRAFFIC_QUICK_ADD, type LiveTrafficLayerId } from './liveTrafficQuickAdd';
import { ROAD_DETAIL, type RoadDetail } from './trafficPresentation';
import {
  busyCount,
  CROWD_NOW,
  crowdRank,
  crowdTimeOptions,
  stationLevelAt,
  upcomingTimes,
} from './crowdPresentation';
import { CROWD_SYMBOL_SIZE, crowdSymbol } from './crowdSymbols';
import { createCrowdLabelLayer, type CrowdLabelLayer } from './crowdLabels';

export interface LiveTrafficLayer {
  id: string;
  layer: LiveTrafficLayerId;
  name: string;
  visible: boolean;
  fetchedAt: string | null;
  error: string | null;
  count: number;
  busy?: number;
}

const FILE: Record<LiveTrafficLayerId, LiveTrafficFile> = {
  congestion: 'traffic-congestion.json',
  incidents: 'traffic-incidents.json',
  crowd: 'mrt-crowd.json',
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

const CROWD_SCALE = new Cesium.NearFarScalar(1000, 1.1, 50_000, 0.7);
const QUIET_FADE = new Cesium.NearFarScalar(15_000, 1, 50_000, 0.5);

interface CrowdLayer {
  source: Cesium.CustomDataSource | null;
  labels: CrowdLabelLayer | null;
  latest: MrtCrowdSnapshot | null;
}

function drawCrowd(layer: CrowdLayer, snapshot: MrtCrowdSnapshot, time: string) {
  const { source, labels } = layer;
  if (!source) return;
  source.entities.suspendEvents();
  source.entities.removeAll();
  const ordered = snapshot.stations
    .map((station, index) => ({ station, index, level: stationLevelAt(snapshot, station, time) }))
    .sort((a, b) => crowdRank(a.level) - crowdRank(b.level));
  for (const { station, index, level } of ordered) {
    const size = CROWD_SYMBOL_SIZE[level];
    source.entities.add({
      position: Cesium.Cartesian3.fromDegrees(station.longitude, station.latitude),
      billboard: {
        image: crowdSymbol(level),
        width: size,
        height: size,
        heightReference: Cesium.HeightReference.CLAMP_TO_TERRAIN,
        disableDepthTestDistance: 50_000,
        scaleByDistance: CROWD_SCALE,
        translucencyByDistance: crowdRank(level) < 2 ? QUIET_FADE : undefined,
      },
      properties: { mrtCrowdStation: index },
    });
  }
  source.entities.resumeEvents();
  labels?.set(
    ordered.map(({ station, level }) => ({
      name: station.name,
      longitude: station.longitude,
      latitude: station.latitude,
      level,
      busy: crowdRank(level) >= 2,
      symbolSize: CROWD_SYMBOL_SIZE[level],
    })),
  );
}

function setShown(target: { show: boolean } | null, show: boolean) {
  if (target) target.show = show;
}

export function useLiveTraffic(viewer: Cesium.Viewer | null) {
  const [layers, setLayers] = useState<LiveTrafficLayer[]>([]);
  const [roadDetail, setRoadDetailState] = useState<RoadDetail>('main');
  const [crowdSnapshot, setCrowdSnapshot] = useState<MrtCrowdSnapshot | null>(null);
  const [crowdTimes, setCrowdTimes] = useState(() => crowdTimeOptions(null, 0));
  const [crowdTime, setCrowdTimeState] = useState<string>(CROWD_NOW);

  const congestion = useRef<{
    latest: TrafficCongestionSnapshot | null;
    shown: TrafficCongestionSnapshot | null;
    primitive: Cesium.GroundPolylinePrimitive | null;
    generation: number;
  }>({ latest: null, shown: null, primitive: null, generation: 0 });
  const incidents = useRef<Cesium.CustomDataSource | null>(null);
  const crowd = useRef<CrowdLayer>({ source: null, labels: null, latest: null });
  const timers = useRef(new Map<LiveTrafficLayerId, ReturnType<typeof setTimeout>>());

  const layersRef = useRef(layers);
  const roadDetailRef = useRef(roadDetail);
  const crowdTimeRef = useRef(crowdTime);
  useLayoutEffect(() => {
    layersRef.current = layers;
    roadDetailRef.current = roadDetail;
    crowdTimeRef.current = crowdTime;
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
        } else if (layer === 'crowd') {
          const data = snapshot as MrtCrowdSnapshot;
          let time = crowdTimeRef.current;
          if (time !== CROWD_NOW && !upcomingTimes(data, Date.now()).includes(time)) {
            time = CROWD_NOW;
            crowdTimeRef.current = time;
            setCrowdTimeState(time);
          }
          crowd.current.latest = data;
          setCrowdSnapshot(data);
          setCrowdTimes(crowdTimeOptions(data, Date.now()));
          drawCrowd(crowd.current, data, time);
          update(layer, {
            fetchedAt: data.fetchedAt,
            error: null,
            count: data.stations.length,
            busy: busyCount(data, time),
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
      } else if (layer === 'crowd') {
        crowd.current.source = new Cesium.CustomDataSource(entry.item.name);
        crowd.current.labels = createCrowdLabelLayer(viewer, CROWD_SCALE);
        await viewer.dataSources.add(crowd.current.source);
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
        } else if (layer === 'crowd') {
          if (crowd.current.source) viewer.dataSources.remove(crowd.current.source, true);
          crowd.current.labels?.destroy();
          crowd.current = { source: null, labels: null, latest: null };
          setCrowdSnapshot(null);
          setCrowdTimes(crowdTimeOptions(null, 0));
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
    if (layer === 'crowd') crowd.current.labels?.setShown(visible);
    setShown(
      layer === 'congestion'
        ? congestion.current.primitive
        : layer === 'crowd'
          ? crowd.current.source
          : incidents.current,
      visible,
    );
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

  const setCrowdTime = useCallback(
    (time: string) => {
      crowdTimeRef.current = time;
      setCrowdTimeState(time);
      const { latest } = crowd.current;
      if (!latest) return;
      drawCrowd(crowd.current, latest, time);
      update('crowd', { busy: busyCount(latest, time) });
    },
    [update],
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

  return {
    layers,
    roadDetail,
    crowdSnapshot,
    crowdTime,
    crowdTimes,
    add,
    remove,
    toggleVisibility,
    setRoadDetail,
    setCrowdTime,
    zoomTo,
    linkAt,
  };
}
