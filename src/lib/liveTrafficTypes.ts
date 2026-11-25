export type LiveTrafficFile = 'traffic-congestion.json' | 'traffic-incidents.json';

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
