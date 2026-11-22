import { describe, expect, it } from 'vitest';
import { moveItem } from './moveItem';

describe('moveItem', () => {
  const items = ['a', 'b', 'c', 'd'];

  it('moves an item down, shifting the ones it passes up', () => {
    expect(moveItem(items, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves an item up, shifting the ones it passes down', () => {
    expect(moveItem(items, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('returns an unchanged copy for a move in place or out of range', () => {
    expect(moveItem(items, 1, 1)).toEqual(items);
    expect(moveItem(items, -1, 2)).toEqual(items);
    expect(moveItem(items, 0, 4)).toEqual(items);
    expect(moveItem(items, 1, 1)).not.toBe(items);
  });
});
