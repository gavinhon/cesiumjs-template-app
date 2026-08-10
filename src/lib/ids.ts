/**
 * A locally-unique id for something the user has added to the map.
 *
 * There is no backend and nothing is persisted, so these only need to be
 * unique within the current page session — which is exactly what React
 * needs from a list key. No uuid library required.
 */
export function createId(): string {
  return crypto.randomUUID();
}
