import { fromSvy21, isWithinSvy21Area } from '@/lib/svy21';

/** A coordinate typed or pasted into the search box, in WGS84 degrees. */
export interface CoordinateMatch {
  latitude: number;
  longitude: number;
  /** What the text was written in, for the result's label. */
  system: 'WGS84' | 'SVY21';
}

const NUMBER = String.raw`(-?\d+(?:\.\d+)?)`;
const HEMI = String.raw`([NSEW])?`;
/** Two numbers, each with an optional hemisphere/axis letter before or after it. */
const PAIR = new RegExp(
  String.raw`^${HEMI}\s*${NUMBER}\s*${HEMI}\s+${HEMI}\s*${NUMBER}\s*${HEMI}$`,
);

/**
 * Recognises a coordinate in the forms GIS users paste:
 *
 *  - `1.2834, 103.8607` — latitude first, as Google Maps copies it
 *  - `103.8607, 1.2834` — longitude first, as GeoJSON and most GIS
 *    software write it; unambiguous because a latitude can't exceed 90
 *  - `1.2834° N 103.8607° E`, `1.2834N, 103.8607E` — with hemispheres
 *  - `E 30123.4 N 29876.5`, `30123 29876` — SVY21 easting/northing, as on
 *    Singapore's plans and in this app's own status bar (easting first
 *    when the axes aren't labelled, as surveyors and OneMap's X/Y write it)
 *
 * Returns `null` for anything else — including SVY21-sized numbers that
 * land outside Singapore — so a search for "Block 123 45" isn't hijacked
 * into a coordinate.
 */
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
  // In "E 30123 N 29876" the regex can't tell whether the N trails the
  // first number or leads the second. A number that already has a leading
  // letter can't also have a trailing one, so it leads the second.
  const shift = preA && rawPostA && !rawPreB;
  const postA = shift ? undefined : rawPostA;
  const preB = shift ? rawPostA : rawPreB;
  const a = Number(rawA);
  const b = Number(rawB);
  const letterA = preA ?? postA;
  const letterB = preB ?? postB;
  // A letter on both sides of one number ("N 1.28 E") is nonsense.
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
    // Letters decide which is which, and the sign: S and W are negative.
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
    // Can only be longitude first.
    [longitude, latitude] = [a, b];
  } else {
    [latitude, longitude] = [a, b];
  }

  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude, system: 'WGS84' };
}
