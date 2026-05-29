import { describe, it, expect } from 'vitest';
import { randomSlots } from '../src/rooms/placement';
import { TERRAIN_WIDTH } from '@se/shared';

const fakeTerrain = new Int16Array(TERRAIN_WIDTH).fill(200);

describe('randomSlots', () => {
  it('returns the requested number of slots', () => {
    expect(randomSlots(4, fakeTerrain).length).toBe(4);
  });

  it('maintains minimum buffer between all slots', () => {
    for (let i = 0; i < 10; i++) {
      const slots = randomSlots(4, fakeTerrain, 120);
      for (let a = 0; a < slots.length; a++) {
        for (let b = a + 1; b < slots.length; b++) {
          expect(Math.abs(slots[a]! - slots[b]!)).toBeGreaterThanOrEqual(120);
        }
      }
    }
  });

  it('respects 40px edge margins', () => {
    for (let i = 0; i < 5; i++) {
      const slots = randomSlots(4, fakeTerrain);
      slots.forEach(x => {
        expect(x).toBeGreaterThanOrEqual(40);
        expect(x).toBeLessThanOrEqual(TERRAIN_WIDTH - 40);
      });
    }
  });

  it('falls back gracefully when spacing is impossible', () => {
    expect(randomSlots(20, fakeTerrain, 120).length).toBe(20);
  });
});
