/**
 * A copy of `items` with the element at `from` moved to `to`, the others
 * shifting to make room — what dropping a dragged row does to a list.
 *
 * `to` is the index the item ends up at, so moving down past three rows is
 * `from + 3`. Out-of-range indices return the list unchanged rather than
 * throwing: a drag that ends outside the list shouldn't break anything.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
