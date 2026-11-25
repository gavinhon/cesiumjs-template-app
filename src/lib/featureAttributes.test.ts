// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { formatAttributeValue, readAttributes } from './featureAttributes';

describe('readAttributes', () => {
  it('hides server bookkeeping fields and keeps the rest in order', () => {
    const { rows } = readAttributes({
      OBJECTID_1: 1,
      TYPE: 'MRT',
      NAME: 'Punggol',
      Shape__Area: 12804.7,
      Shape__Length: 722.3,
    });
    expect(rows).toEqual([
      { key: 'TYPE', value: 'MRT' },
      { key: 'NAME', value: 'Punggol' },
    ]);
  });

  it('takes the title from the field most likely to be a name', () => {
    expect(readAttributes({ NAME: 'Punggol', TYPE: 'MRT' }).title).toBe('Punggol');
    expect(
      readAttributes({ PAGETITLE: 'Chinatown Heritage Centre', ADDRESS: '48 Pagoda St' }).title,
    ).toBe('Chinatown Heritage Centre');
    expect(readAttributes({ TYPE_NAME: 'Park', PARK_NAME: 'Punggol Park' }).title).toBe(
      'Punggol Park',
    );
  });

  it('has no title when nothing looks like a name, or the name is blank', () => {
    expect(readAttributes({ ADDRESS: '48 Pagoda St' }).title).toBeNull();
    expect(readAttributes({ NAME: '  ' }).title).toBeNull();
  });
});

describe('formatAttributeValue', () => {
  it('shows a dash for missing values', () => {
    expect(formatAttributeValue(null)).toBe('—');
    expect(formatAttributeValue(undefined)).toBe('—');
    expect(formatAttributeValue('   ')).toBe('—');
  });

  it('trims float noise but leaves whole numbers alone', () => {
    expect(formatAttributeValue(205.49703085422516)).toBe('205.497');
    expect(formatAttributeValue(2018)).toBe('2018');
  });

  it('reduces HTML to its text instead of rendering it', () => {
    expect(formatAttributeValue('<p>Open <b>daily</b></p>')).toBe('Open daily');
    expect(formatAttributeValue('<img src=x onerror=alert(1)>Hi')).toBe('Hi');
  });

  it('spells out booleans and serialises anything else', () => {
    expect(formatAttributeValue(true)).toBe('Yes');
    expect(formatAttributeValue({ a: 1 })).toBe('{"a":1}');
  });
});
