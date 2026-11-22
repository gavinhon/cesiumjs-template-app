/**
 * Formatting for the numbers the map shows outside the drawing tools:
 * coordinates, heights and the scale bar. Pure functions, so the rounding
 * and the "nice number" choice are unit-tested rather than eyeballed.
 */

/** "1.28340° N, 103.86070° E" — five decimals is about a metre. */
export function formatLatLon(latitude: number, longitude: number): string {
  const lat = `${Math.abs(latitude).toFixed(5)}° ${latitude >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(longitude).toFixed(5)}° ${longitude >= 0 ? 'E' : 'W'}`;
  return `${lat}, ${lon}`;
}

/** "E 30123.4 N 29876.5" — SVY21 to the decimetre, easting first as surveyors write it. */
export function formatSvy21(easting: number, northing: number): string {
  return `E ${easting.toFixed(1)} N ${northing.toFixed(1)}`;
}

/**
 * A height or altitude at the precision it's worth reading: whole metres
 * up close, kilometres to one decimal (then none) further out. "12 m",
 * "850 m", "1.2 km", "120 km".
 */
export function formatHeight(meters: number): string {
  const abs = Math.abs(meters);
  if (abs < 1000) return `${Math.round(meters)} m`;
  if (abs < 100_000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000)} km`;
}

/** A scale bar: how long to draw it and what to label it. */
export interface ScaleBar {
  widthPx: number;
  label: string;
}

/**
 * The longest "nice" distance — 1, 2 or 5 × a power of ten — that fits in
 * `maxWidthPx` at the given ground resolution, as cartographers draw scale
 * bars. A bar reading "1,371 m" is a measurement, not a scale; "1 km" is
 * one you can compare against at a glance.
 */
export function niceScaleBar(metersPerPixel: number, maxWidthPx: number): ScaleBar | null {
  if (!(metersPerPixel > 0) || !Number.isFinite(metersPerPixel)) return null;
  const maxMeters = metersPerPixel * maxWidthPx;
  const magnitude = 10 ** Math.floor(Math.log10(maxMeters));
  const step = [5, 2, 1].find((candidate) => candidate * magnitude <= maxMeters) ?? 1;
  const meters = step * magnitude;
  return {
    widthPx: meters / metersPerPixel,
    label: meters >= 1000 ? `${meters / 1000} km` : `${meters} m`,
  };
}
