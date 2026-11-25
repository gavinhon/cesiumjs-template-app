export interface AttributeRow {
  key: string;
  value: string;
}

export interface FeatureAttributes {
  title: string | null;
  rows: AttributeRow[];
}

const SYSTEM_FIELD =
  /^(objectid(_\d+)?|fid|globalid|shape__(area|length)(_\d+)?|shape_(area|length)|st_(area|length)\(shape\))$/i;

function titleRank(key: string): number {
  if (/^(name|title)$/i.test(key)) return 0;
  if (/title/i.test(key)) return 1;
  if (/name/i.test(key) && !/type|class|kind/i.test(key)) return 2;
  if (/name/i.test(key)) return 3;
  return Infinity;
}

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
