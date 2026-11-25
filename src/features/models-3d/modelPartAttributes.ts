import { formatAttributeValue, type FeatureAttributes } from '@/lib/featureAttributes';

export interface PartProperty {
  id: string;
  value: unknown;
}

const INTERNAL_PROPERTY = /^(objectPlacement|ownerHistory|representation|expressId|classId)$/;

const IDENTITY_FIRST = [
  'name',
  'className',
  'objectType',
  'predefinedType',
  'tag',
  'description',
  'globalId',
];

function normalize(label: string): string {
  return label.toLowerCase().replace(/[^a-z]/g, '');
}

export function readModelPart(
  properties: readonly PartProperty[],
  names: Record<string, string>,
): FeatureAttributes {
  const present = properties.filter(
    ({ id, value }) =>
      !INTERNAL_PROPERTY.test(id) &&
      value !== undefined &&
      value !== null &&
      !(typeof value === 'string' && value.trim() === ''),
  );
  const rank = (id: string) => {
    const index = IDENTITY_FIRST.indexOf(id);
    return index === -1 ? IDENTITY_FIRST.length : index;
  };
  const ordered = [...present].sort((a, b) => rank(a.id) - rank(b.id));

  const seen = new Set<string>();
  const rows: FeatureAttributes['rows'] = [];
  for (const { id, value } of ordered) {
    const key = names[id] ?? id;
    const normalized = normalize(key);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    rows.push({ key, value: formatAttributeValue(value) });
  }

  const titleOf = (id: string) => {
    const value = present.find((property) => property.id === id)?.value;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };
  return { title: titleOf('name') ?? titleOf('className'), rows };
}
