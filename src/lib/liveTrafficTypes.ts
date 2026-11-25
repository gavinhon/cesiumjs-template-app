/**
 * The live traffic snapshots the server writes and the map reads — shared
 * by `vite-plugins/liveTrafficFeed.ts` (which packs LTA DataMall's feeds
 * into them, in dev and in the Docker container) and the `live-traffic`
 * feature (which draws them).
 *
 * Types only, like `publicDatasetTypes.ts`: the container runs the
 * Node-side code as-is with type stripping, so nothing here may need to
 * exist at runtime.
 */

/** A snapshot's file name, beside each other under the app's live-feed folder. */
export type LiveTrafficFile = 'traffic-congestion.json' | 'traffic-incidents.json';

/**
 * One road link of LTA's Traffic Speed Bands: its two ends, in millionths
 * of a degree (`scale`), its speed band (1 = under 10 km/h … 8 = 70 km/h or
 * more; 0 = no reading), its road category (1 expressway … 6 slip road,
 * 8 short tunnel) and an index into `roads` for its name. A tuple rather
 * than an object, and integers rather than floats: there are ~144,000 of
 * them every five minutes, and this shape is a fifth of the size LTA sends.
 */
export type TrafficLink = [
  startLongitude: number,
  startLatitude: number,
  endLongitude: number,
  endLatitude: number,
  speedBand: number,
  roadCategory: number,
  roadIndex: number,
];

/** Every road link's current speed band, island-wide. */
export interface TrafficCongestionSnapshot {
  /** When LTA was read, as an ISO time. */
  fetchedAt: string;
  /** What a link's coordinates are multiplied by: 1e6. */
  scale: number;
  /** Road names, each once; links refer to them by index. */
  roads: string[];
  links: TrafficLink[];
}

/** One of LTA's current traffic incidents. */
export interface TrafficIncident {
  /** LTA's incident type: "Accident", "Roadwork", "Vehicle breakdown", "Heavy Traffic"… */
  type: string;
  /** LTA's own description, e.g. "(25/11)11:10 Accident on PIE (towards Tuas) after …". */
  message: string;
  latitude: number;
  longitude: number;
}

/** Every incident on the roads now. */
export interface TrafficIncidentSnapshot {
  fetchedAt: string;
  incidents: TrafficIncident[];
}
