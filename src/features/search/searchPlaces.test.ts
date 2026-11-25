import { describe, expect, it } from 'vitest';
import { parseNominatimResults, parseOneMapResults } from './searchPlaces';

describe('parseOneMapResults', () => {
  const response = {
    error:
      'Authentication token missing. Please create an account and generate or renew your API Token.',
    found: 2,
    results: [
      {
        SEARCHVAL: 'MARINA BAY SANDS',
        ADDRESS: '1 BAYFRONT AVENUE MARINA BAY SANDS SINGAPORE 018971',
        LATITUDE: '1.283454196908438',
        LONGITUDE: '103.8608090489553',
      },
      { SEARCHVAL: 'SAME AS TITLE', ADDRESS: 'SAME AS TITLE', LATITUDE: '1.3', LONGITUDE: '103.8' },
      { SEARCHVAL: 'NO COORDINATES', ADDRESS: 'X', LATITUDE: 'NIL', LONGITUDE: 'NIL' },
    ],
  };

  it('reads title, address and coordinates, ignoring the token notice', () => {
    const [first] = parseOneMapResults(response);
    expect(first).toMatchObject({
      title: 'MARINA BAY SANDS',
      subtitle: '1 BAYFRONT AVENUE MARINA BAY SANDS SINGAPORE 018971',
      latitude: 1.283454196908438,
      longitude: 103.8608090489553,
    });
  });

  it('drops an address that only repeats the title, and entries without coordinates', () => {
    const places = parseOneMapResults(response);
    expect(places).toHaveLength(2);
    expect(places[1].subtitle).toBeUndefined();
  });

  it('copes with an unexpected shape', () => {
    expect(parseOneMapResults(null)).toEqual([]);
    expect(parseOneMapResults({ results: 'nope' })).toEqual([]);
  });
});

describe('parseNominatimResults', () => {
  it('reads name, full address, point and extent', () => {
    const [place] = parseNominatimResults([
      {
        place_id: 97838275,
        name: 'Tour Eiffel',
        display_name: 'Tour Eiffel, 5, Avenue Anatole France, Paris, France',
        lat: '48.8582599',
        lon: '2.2945006',
        boundingbox: ['48.8574753', '48.8590453', '2.2933119', '2.2956897'],
      },
    ]);
    expect(place).toEqual({
      id: 'osm:97838275',
      title: 'Tour Eiffel',
      subtitle: 'Tour Eiffel, 5, Avenue Anatole France, Paris, France',
      latitude: 48.8582599,
      longitude: 2.2945006,
      bbox: { west: 2.2933119, south: 48.8574753, east: 2.2956897, north: 48.8590453 },
    });
  });

  it('falls back to the first part of the address for an unnamed place', () => {
    const [place] = parseNominatimResults([
      { display_name: '10, Downing Street, London', lat: '51.5', lon: '-0.12' },
    ]);
    expect(place.title).toBe('10');
    expect(place.bbox).toBeUndefined();
  });

  it('copes with an unexpected shape', () => {
    expect(parseNominatimResults({ error: 'x' })).toEqual([]);
  });
});
