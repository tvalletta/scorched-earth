import { describe, it, expect } from 'vitest';
import { computeFit } from './Camera';

describe('computeFit', () => {
  it('clamps scale to minimum 0.4 for very spread tanks', () => {
    const result = computeFit(
      [{ x: 0, y: 0 }, { x: 10000, y: 0 }],
      { width: 1920, height: 1080 },
    );
    expect(result.scale).toBeGreaterThanOrEqual(0.4);
    expect(result.scale).toBeLessThanOrEqual(2.0);
  });

  it('clamps scale to maximum 2.0 for very close tanks', () => {
    const result = computeFit(
      [{ x: 500, y: 300 }, { x: 502, y: 300 }],
      { width: 1920, height: 1080 },
    );
    expect(result.scale).toBe(2.0);
  });

  it('centers view on midpoint of two tanks', () => {
    const vp = { width: 1920, height: 1080 };
    const result = computeFit([{ x: 400, y: 300 }, { x: 600, y: 300 }], vp);
    const midX = (vp.width / 2 - result.x) / result.scale;
    expect(midX).toBeCloseTo(500, 0);
  });

  it('handles a single tank', () => {
    const result = computeFit([{ x: 800, y: 300 }], { width: 1920, height: 1080 });
    expect(result.scale).toBeGreaterThanOrEqual(0.4);
    expect(result.scale).toBeLessThanOrEqual(2.0);
  });

  it('returns safe defaults for empty tanks array', () => {
    const result = computeFit([], { width: 1920, height: 1080 });
    expect(result.scale).toBeGreaterThan(0);
  });
});
