import { fromSvy21, isWithinSvy21Area } from '@/lib/svy21';

export interface CoordinateMatch {
  latitude: number;
  longitude: number;
  system: 'WGS84' | 'SVY21';
}

const NUMBER = String.raw`(-?\d+(?:\.\d+)?)`;
const HEMI = String.raw`([NSEW])?`;
const PAIR = new RegExp(
  String.raw`^${HEMI}\s*${NUMBER}\s*${HEMI}\s+${HEMI}\s*${NUMBER}\s*${HEMI}$`,
);

export function parseCoordinateQuery(text: string): CoordinateMatch | null {
  const normalised = text
    .toUpperCase()
    .replace(/°/g, ' ')
    .replace(/[,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const match = PAIR.exec(normalised);
  if (!match) return null;

  const [, preA, rawA, rawPostA, rawPreB, rawB, postB] = match;
  const shift = preA && rawPostA && !rawPreB;
  const postA = shift ? undefined : rawPostA;
  const preB = shift ? rawPostA : rawPreB;
  const a = Number(rawA);
  const b = Number(rawB);
  const letterA = preA ?? postA;
  const letterB = preB ?? postB;
  if ((preA && postA) || (preB && postB)) return null;

  if (Math.abs(a) > 180 || Math.abs(b) > 180) return parseSvy21(a, b, letterA, letterB);
  return parseDegrees(a, b, letterA, letterB);
}

function parseSvy21(
  a: number,
  b: number,
  letterA: string | undefined,
  letterB: string | undefined,
): CoordinateMatch | null {
  let easting = a;
  let northing = b;
  if (letterA === 'N' || letterB === 'E') [easting, northing] = [b, a];
  else if (letterA && letterA !== 'E') return null;
  if (letterB && letterB !== 'N' && letterB !== 'E') return null;

  const { latitude, longitude } = fromSvy21(northing, easting);
  if (!isWithinSvy21Area(latitude, longitude)) return null;
  return { latitude, longitude, system: 'SVY21' };
}

function parseDegrees(
  a: number,
  b: number,
  letterA: string | undefined,
  letterB: string | undefined,
): CoordinateMatch | null {
  let latitude: number;
  let longitude: number;

  if (letterA || letterB) {
    const isLat = (letter: string | undefined) => letter === 'N' || letter === 'S';
    const latFirst = isLat(letterA) || (!letterA && !isLat(letterB));
    const [latValue, latLetter, lonValue, lonLetter] = latFirst
      ? [a, letterA, b, letterB]
      : [b, letterB, a, letterA];
    if (latLetter && !isLat(latLetter)) return null;
    if (lonLetter && isLat(lonLetter)) return null;
    latitude = latLetter === 'S' ? -Math.abs(latValue) : latValue;
    longitude = lonLetter === 'W' ? -Math.abs(lonValue) : lonValue;
  } else if (Math.abs(a) > 90 && Math.abs(b) <= 90) {
    [longitude, latitude] = [a, b];
  } else {
    [latitude, longitude] = [a, b];
  }

  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude, system: 'WGS84' };
}
