import { describe, it, expect } from 'vitest';
import {
  computeFit,
  minScaleFor,
  clampPan,
  WORLD_LEFT,
  WORLD_RIGHT,
  WORLD_TOP,
  WORLD_BOTTOM,
} from './Camera';

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

describe('minScaleFor', () => {
  it('returns the scale at which the world band exactly covers the viewport', () => {
    const vp = { width: 1600, height: 900 };
    const s = minScaleFor(vp);
    const worldW = WORLD_RIGHT - WORLD_LEFT;
    const worldH = WORLD_BOTTOM - WORLD_TOP;
    expect(s).toBeCloseTo(Math.max(vp.width / worldW, vp.height / worldH), 5);
  });
});

describe('clampPan', () => {
  it('prevents revealing space to the left of the world', () => {
    const vp = { width: 800, height: 600 };
    const scale = 1;
    // try to pan so world-left maps to x=200 (would show void on the left)
    const { x } = clampPan(200, 0, scale, vp);
    // after clamp, world-left must be at or left of screen 0
    expect(WORLD_LEFT * scale + x).toBeLessThanOrEqual(0 + 1e-6);
  });
});
