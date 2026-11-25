import type { LegendContent } from '@/lib/legendTypes';
import type {
  CrowdLevel,
  MrtCrowdLine,
  MrtCrowdSnapshot,
  MrtCrowdStation,
} from '@/lib/liveTrafficTypes';

export const CROWD_NOW = 'now';

const RANK: Record<CrowdLevel, number> = { '': 0, l: 1, m: 2, h: 3 };

const LEVEL_NAME: Record<CrowdLevel, string> = {
  '': 'No reading',
  l: 'Low',
  m: 'Moderate',
  h: 'High',
};

const LINE_NAME: Record<string, string> = {
  CCL: 'Circle Line',
  CEL: 'Circle Line',
  CGL: 'East-West Line',
  DTL: 'Downtown Line',
  EWL: 'East-West Line',
  NEL: 'North East Line',
  NSL: 'North-South Line',
  TEL: 'Thomson-East Coast Line',
  BPL: 'Bukit Panjang LRT',
  SLRT: 'Sengkang LRT',
  PLRT: 'Punggol LRT',
};

const SLOT_MS = 30 * 60_000;

const CLOCK = new Intl.DateTimeFormat('en-SG', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Singapore',
});

export function clockTime(iso: string): string {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? CLOCK.format(time) : '';
}

export function crowdLevelName(level: CrowdLevel): string {
  return LEVEL_NAME[level];
}

export function crowdRank(level: CrowdLevel): number {
  return RANK[level];
}

export function lineName(line: string): string {
  return LINE_NAME[line] ?? line;
}

function busiest(levels: CrowdLevel[]): CrowdLevel {
  return levels.reduce<CrowdLevel>((top, level) => (RANK[level] > RANK[top] ? level : top), '');
}

export function lineLevelAt(snapshot: MrtCrowdSnapshot, line: MrtCrowdLine, time: string) {
  if (time === CROWD_NOW) return line.now;
  return line.forecast[snapshot.forecastTimes.indexOf(time)] ?? '';
}

export function stationLevelAt(
  snapshot: MrtCrowdSnapshot,
  station: MrtCrowdStation,
  time: string,
): CrowdLevel {
  return busiest(station.lines.map((line) => lineLevelAt(snapshot, line, time)));
}

export function upcomingTimes(snapshot: MrtCrowdSnapshot, now: number): string[] {
  return snapshot.forecastTimes.filter((time) => Date.parse(time) > now - SLOT_MS / 2);
}

export function crowdTimeOptions(snapshot: MrtCrowdSnapshot | null, now: number) {
  return [
    { value: CROWD_NOW, label: 'Now' },
    ...(snapshot ? upcomingTimes(snapshot, now) : []).map((time) => ({
      value: time,
      label: clockTime(time),
    })),
  ];
}

export function busyCount(snapshot: MrtCrowdSnapshot, time: string): number {
  return snapshot.stations.filter((station) => RANK[stationLevelAt(snapshot, station, time)] >= 2)
    .length;
}

export function busiestAhead(
  snapshot: MrtCrowdSnapshot,
  station: MrtCrowdStation,
  now: number,
): string {
  let top: CrowdLevel = '';
  let at = '';
  for (const time of upcomingTimes(snapshot, now)) {
    const level = stationLevelAt(snapshot, station, time);
    if (RANK[level] > RANK[top]) {
      top = level;
      at = time;
    }
  }
  if (RANK[top] <= 1) return top ? 'Low for the rest of today' : 'No forecast';
  return `${LEVEL_NAME[top]} at ${clockTime(at)}`;
}

export function crowdLegend(): LegendContent {
  return {
    kind: 'swatches',
    items: [
      { label: 'High', color: 'var(--crowd-high)', shape: 'halo' },
      { label: 'Moderate', color: 'var(--crowd-moderate)', shape: 'ring-dot' },
      { label: 'Low', color: 'var(--crowd-low)', shape: 'ring' },
    ],
  };
}
