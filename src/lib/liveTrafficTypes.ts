export type LiveTrafficFile =
  'traffic-congestion.json' | 'traffic-incidents.json' | 'mrt-crowd.json';

export type TrafficLink = [
  startLongitude: number,
  startLatitude: number,
  endLongitude: number,
  endLatitude: number,
  speedBand: number,
  roadCategory: number,
  roadIndex: number,
];

export interface TrafficCongestionSnapshot {
  fetchedAt: string;
  scale: number;
  roads: string[];
  links: TrafficLink[];
}

export interface TrafficIncident {
  type: string;
  message: string;
  latitude: number;
  longitude: number;
}

export interface TrafficIncidentSnapshot {
  fetchedAt: string;
  incidents: TrafficIncident[];
}

export type CrowdLevel = 'l' | 'm' | 'h' | '';

export interface MrtCrowdLine {
  code: string;
  line: string;
  now: CrowdLevel;
  forecast: CrowdLevel[];
}

export interface MrtCrowdStation {
  name: string;
  longitude: number;
  latitude: number;
  lines: MrtCrowdLine[];
}

export interface MrtCrowdSnapshot {
  fetchedAt: string;
  windowStart: string;
  windowEnd: string;
  forecastTimes: string[];
  stations: MrtCrowdStation[];
}
