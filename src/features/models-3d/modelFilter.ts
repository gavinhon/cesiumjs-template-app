export interface FilterableAttribute {
  id: string;
  label: string;
  values: string[];
  isFloor: boolean;
}

export interface ModelFilter {
  attributeId: string | null;
  values: string[];
  section: number | null;
}

export const NO_FILTER: ModelFilter = { attributeId: null, values: [], section: null };

const NOT_FILTERABLE =
  /^(objectPlacement|ownerHistory|representation|expressId|classId|globalId|name_1|bBIMBooleanData)$/;

const MAX_VALUES = 60;

export function isFloorAttribute(id: string, label: string): boolean {
  const text = `${id} ${label}`;
  return (
    /(storey|story|level|floor|base\s*constraint)/i.test(text) &&
    !/(height|area|thickness|elevation|offset|finish)/i.test(text)
  );
}

export function filterableAttributes(
  seen: ReadonlyMap<string, ReadonlySet<string>>,
  names: Record<string, string>,
): FilterableAttribute[] {
  const attributes: FilterableAttribute[] = [];
  for (const [id, valueSet] of seen) {
    if (NOT_FILTERABLE.test(id)) continue;
    const values = [...valueSet].filter((value) => value.trim() !== '');
    if (values.length < 2 || values.length > MAX_VALUES) continue;
    const label = names[id] || id;
    values.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    attributes.push({ id, label, values, isFloor: isFloorAttribute(id, label) });
  }
  return attributes.sort(
    (a, b) => Number(b.isFloor) - Number(a.isFloor) || a.label.localeCompare(b.label),
  );
}

export function showExpression(
  attributeId: string | null,
  values: readonly string[],
): string | null {
  if (!attributeId || values.length === 0) return null;
  const property = `\${feature[${JSON.stringify(attributeId)}]}`;
  return values.map((value) => `${property} === ${JSON.stringify(value)}`).join(' || ');
}

export function sectionRange(tilesetJson: unknown): { min: number; max: number } | null {
  const root = (
    tilesetJson as { root?: { transform?: unknown; boundingVolume?: { box?: unknown } } }
  )?.root;
  const box = root?.boundingVolume?.box;
  if (!root?.transform || !Array.isArray(box) || box.length !== 12) return null;
  if (!box.every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  const numbers = box as number[];
  const centreZ = numbers[2];
  const halfZ = Math.abs(numbers[5]) + Math.abs(numbers[8]) + Math.abs(numbers[11]);
  if (halfZ <= 0) return null;
  return { min: centreZ - halfZ, max: centreZ + halfZ };
}
