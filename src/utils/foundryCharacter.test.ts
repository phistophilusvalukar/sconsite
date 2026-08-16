import { describe, expect, it } from 'vitest';
import { getMovementSpeedsFromFoundryJson } from './foundryCharacter';

describe('Foundry character movement speeds', () => {
  it('reads prepared PF2e land and alternate speeds', () => {
    expect(getMovementSpeedsFromFoundryJson({
      system: {
        attributes: {
          speed: {
            value: 25,
            total: 30,
            otherSpeeds: [
              { type: 'swim', value: 15 },
              { type: 'climb', total: 20 },
              { type: 'fly', value: 0 }
            ]
          }
        }
      }
    })).toEqual({ land: 30, swim: 15, climb: 20, fly: null, burrow: null });
  });

  it('falls back to ancestry speed in raw actor exports', () => {
    expect(getMovementSpeedsFromFoundryJson({
      items: [{ type: 'ancestry', system: { speed: 25 } }]
    })).toEqual({ land: 25, swim: null, climb: null, fly: null, burrow: null });
  });
});
