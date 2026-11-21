/**
 * Turns a vector feature's raw properties — whatever a WFS or ArcGIS server
 * sent — into what the info card shows: a title, and one row per field.
 *
 * Pure, so the guesswork in here (which field is the name? which are
 * housekeeping?) is testable without a map.
 */

export interface AttributeRow {
  key: string;
  value: string;
}

export interface FeatureAttributes {
  /** The feature's own name, if a field looks like one. */
  title: string | null;
  rows: AttributeRow[];
}

/**
 * Fields a GIS server adds for its own bookkeeping, which mean nothing to
 * someone reading about the feature: ArcGIS's row ids and its computed
 * geometry sizes (in the layer's native units, often not metres), and the
 * equivalents other servers use.
 */
const SYSTEM_FIELD =
  /^(objectid(_\d+)?|fid|globalid|shape__(area|length)(_\d+)?|shape_(area|length)|st_(area|length)\(shape\))$/i;

/**
 * How likely a field is to hold the feature's name — lower is likelier.
 * Schemas name it every which way (`NAME`, `PAGETITLE`, `PARK_NAME`), and
 * a `TYPE_NAME` is usually a category ("Park") rather than a name, so it
 * ranks below the others.
 */
function titleRank(key: string): number {
  if (/^(name|title)$/i.test(key)) return 0;
  if (/title/i.test(key)) return 1;
  if (/name/i.test(key) && !/type|class|kind/i.test(key)) return 2;
  if (/name/i.test(key)) return 3;
  return Infinity;
}

/**
 * One value as display text. Long decimals are cut to six significant
 * figures (server-computed values carry float noise); whole numbers are
 * left alone so a year doesn't read "2,018"; HTML — which some layers
 * store in description fields — is reduced to its text, never rendered.
 */
export function formatAttributeValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(6)));
  }
  if (typeof value === 'string') {
    const text = /<[a-z!/]/i.test(value)
      ? (new DOMParser().parseFromString(value, 'text/html').body.textContent ?? '')
      : value;
    return text.trim() || '—';
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return JSON.stringify(value);
}

/** The title and rows for a feature's properties, in the server's field order. */
export function readAttributes(properties: Record<string, unknown>): FeatureAttributes {
  const entries = Object.entries(properties).filter(([key]) => !SYSTEM_FIELD.test(key));

  let title: string | null = null;
  let bestRank = Infinity;
  for (const [key, value] of entries) {
    const rank = titleRank(key);
    if (rank < bestRank && typeof value === 'string' && value.trim()) {
      title = value.trim();
      bestRank = rank;
    }
  }

  return {
    title,
    rows: entries.map(([key, value]) => ({ key, value: formatAttributeValue(value) })),
  };
}
