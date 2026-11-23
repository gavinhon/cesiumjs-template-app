import { formatAttributeValue, type FeatureAttributes } from '@/lib/featureAttributes';

/** One property of a clicked model part, as `Cesium3DTileFeature` reports it. */
export interface PartProperty {
  id: string;
  value: unknown;
}

/**
 * IFC's internal cross-references, which a BIM conversion carries over as
 * properties: numbers pointing at other records in the original file
 * (placement, owner history, geometry, the line number). They mean nothing
 * once the model is tiles.
 */
const INTERNAL_PROPERTY = /^(objectPlacement|ownerHistory|representation|expressId|classId)$/;

/**
 * The properties that say what a part *is*, shown first when present — the
 * IFC identity fields. Anything else (the property sets) follows in the
 * order the tileset lists it.
 */
const IDENTITY_FIRST = [
  'name',
  'className',
  'objectType',
  'predefinedType',
  'tag',
  'description',
  'globalId',
];

/** Letters only, lower case: "Object Type", "ObjectType" and "objectType_1" all compare equal. */
function normalize(label: string): string {
  return label.toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * The title and rows for a clicked 3D model part — a wall, slab or beam of
 * a BIM model, or a building in a city model.
 *
 * Labels are the schema's names where it has them (`names`, from
 * `fetchPropertyNames`), otherwise the raw ids. Properties with no value
 * are left out: a BIM conversion merges every element type into one class,
 * so a beam carries empty slots for the wall and slab property sets, and
 * listing them would bury the few that apply. Duplicates a conversion
 * leaves behind (`objectType` and `objectType_1`) are listed once.
 *
 * The title is the part's name, else its class ("IfcWall"); `null` if it
 * has neither, for the caller to fall back to the model's name.
 */
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
  // Array sort is stable, so everything after the identity fields keeps
  // the tileset's own order.
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
