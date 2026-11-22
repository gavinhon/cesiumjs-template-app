import { describe, expect, it } from 'vitest';
import { nearestDetent } from './useBottomSheet';

describe('nearestDetent', () => {
  const heights = { peek: 128, half: 406, full: 744 };

  it('snaps to whichever resting height is closest', () => {
    expect(nearestDetent(100, heights)).toBe('peek');
    expect(nearestDetent(260, heights)).toBe('peek');
    expect(nearestDetent(270, heights)).toBe('half');
    expect(nearestDetent(560, heights)).toBe('half');
    expect(nearestDetent(600, heights)).toBe('full');
    expect(nearestDetent(900, heights)).toBe('full');
  });
});
