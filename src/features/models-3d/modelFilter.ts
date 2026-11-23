/**
 * The pure half of filtering a 3D model by its parts' attributes — which
 * attributes are worth filtering on, the style expression that does it,
 * and the height range a section cut can move through. No Cesium objects,
 * so all of it is testable; `useModelFilters` applies it to tilesets.
 */

/** One attribute a model's parts carry, and the values seen on them. */
export interface FilterableAttribute {
  /** The property id, as `Cesium3DTileFeature.getProperty` takes it. */
  id: string;
  /** The schema's name for it, or the id. */
  label: string;
  /** Distinct values seen so far, sorted. */
  values: string[];
  /** Looks like the floor a part is on — offered first. */
  isFloor: boolean;
}

/** What a model is filtered to: one attribute's chosen values, and a section cut. */
export interface ModelFilter {
  attributeId: string | null;
  /** Show only parts with one of these values; empty shows everything. */
  values: string[];
  /** Cut away everything above this local height, in metres; `null` for no cut. */
  section: number | null;
}

export const NO_FILTER: ModelFilter = { attributeId: null, values: [], section: null };

/**
 * IFC's internal cross-references, and per-part identifiers: filtering on
 * a GlobalId shows one part, which clicking it already does.
 */
const NOT_FILTERABLE =
  /^(objectPlacement|ownerHistory|representation|expressId|classId|globalId|name_1|bBIMBooleanData)$/;

/** More distinct values than this, and an attribute is an identifier, not a category. */
const MAX_VALUES = 60;

/**
 * Whether an attribute says which floor a part is on. BIM exports name it
 * every which way — IfcBuildingStorey, "Level", "Base Constraint", "Floor"
 * — so the id and the schema name are both tried. Heights, areas and
 * thicknesses that merely mention a floor ("FloorArea") don't count.
 */
export function isFloorAttribute(id: string, label: string): boolean {
  const text = `${id} ${label}`;
  return (
    /(storey|story|level|floor|base\s*constraint)/i.test(text) &&
    !/(height|area|thickness|elevation|offset|finish)/i.test(text)
  );
}

/**
 * The attributes worth offering as filters, from the values seen per
 * property id: categories with at least two values, floor first, then by
 * label. Identifiers, internal references and one-value properties are
 * left out — none of them narrows anything down usefully.
 */
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

/**
 * The 3D Tiles style expression showing only parts whose `attributeId` is
 * one of `values` — or `null` for no filter.
 *
 * The property goes through `feature["…"]` rather than `${id}` so any id
 * works, whatever characters it has; values are JSON-quoted, which escapes
 * them the way the expression language expects.
 */
export function showExpression(
  attributeId: string | null,
  values: readonly string[],
): string | null {
  if (!attributeId || values.length === 0) return null;
  const property = `\${feature[${JSON.stringify(attributeId)}]}`;
  return values.map((value) => `${property} === ${JSON.stringify(value)}`).join(' || ');
}

/**
 * The heights a section cut can move through, in the frame Cesium places a
 * tileset's clipping planes in — or `null` where that frame isn't known.
 *
 * For a tileset whose root has a `transform` and a `box` (what BIM
 * converters write: a local east-north-up frame on the site), Cesium
 * clips in that frame, and the box's vertical extent is the range: its
 * centre's z plus or minus the z part of its three half-axes. Other shapes
 * put the clipping origin elsewhere, so they get no section cut rather
 * than one that starts in the wrong place.
 */
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
