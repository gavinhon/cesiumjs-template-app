export function formatLatLon(latitude: number, longitude: number): string {
  const lat = `${Math.abs(latitude).toFixed(5)}° ${latitude >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(longitude).toFixed(5)}° ${longitude >= 0 ? 'E' : 'W'}`;
  return `${lat}, ${lon}`;
}

export function formatSvy21(easting: number, northing: number): string {
  return `E ${easting.toFixed(1)} N ${northing.toFixed(1)}`;
}

export function formatHeight(meters: number): string {
  const abs = Math.abs(meters);
  if (abs < 1000) return `${Math.round(meters)} m`;
  if (abs < 100_000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000)} km`;
}

export interface ScaleBar {
  widthPx: number;
  label: string;
}

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
