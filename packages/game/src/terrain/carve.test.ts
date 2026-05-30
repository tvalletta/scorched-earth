import { describe, it, expect } from "vitest";
import { carveInPlace, applyCarve, carveCeilingInPlace } from "./carve";

describe("carveCeilingInPlace", () => {
  it("recedes the ceiling upward within the radius, clamped >= 0", () => {
    const ceil = new Int16Array(1600).fill(300);
    carveCeilingInPlace(ceil, { x: 800, y: 300, radius: 50, tick: 0 } as never);
    expect(ceil[800]!).toBeLessThan(300); // rock removed → ceiling moved up
    expect(ceil[600]!).toBe(300);         // outside radius unchanged
    expect(ceil[800]!).toBeGreaterThanOrEqual(0);
  });
});

function flatTerrain(width: number, h: number): Int16Array {
  const t = new Int16Array(width);
  for (let i = 0; i < width; i++) t[i] = h;
  return t;
}

describe("carveInPlace", () => {
  it("does nothing if the carve circle is entirely above the surface", () => {
    const t = flatTerrain(100, 500);
    carveInPlace(t, { x: 50, y: 100, radius: 20, tick: 0 });
    for (let i = 0; i < 100; i++) {
      expect(t[i]).toBe(500);
    }
  });

  it("does nothing if the carve circle is entirely below the surface (no overhangs)", () => {
    const t = flatTerrain(100, 500);
    carveInPlace(t, { x: 50, y: 600, radius: 20, tick: 0 });
    for (let i = 0; i < 100; i++) {
      expect(t[i]).toBe(500);
    }
  });

  it("carves a circle that straddles the surface, lowering affected columns", () => {
    const t = flatTerrain(100, 500);
    carveInPlace(t, { x: 50, y: 500, radius: 20, tick: 0 });
    expect(t[50]).toBe(520);
    expect(t[30]).toBe(500);
    expect(t[70]).toBe(500);
    expect(t[40]).toBeGreaterThan(500);
    expect(t[40]).toBeLessThan(520);
  });

  it("never produces negative heights", () => {
    const t = flatTerrain(100, 50);
    carveInPlace(t, { x: 50, y: 50, radius: 100, tick: 0 });
    for (let i = 0; i < 100; i++) {
      expect(t[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it("clamps to terrain height when given", () => {
    const t = flatTerrain(100, 500);
    carveInPlace(t, { x: 50, y: 500, radius: 200, tick: 0 }, { terrainHeight: 900 });
    for (let i = 0; i < 100; i++) {
      expect(t[i]).toBeLessThanOrEqual(900);
    }
  });

  it("carves a near-vertical wall when the explosion is at the wall face", () => {
    // Build a steep wall: left plateau at y=300, right valley at y=500.
    // Columns 40-59 transition steeply (10px drop per column).
    const t = new Int16Array(100);
    for (let i = 0; i < 100; i++) {
      if (i < 40) t[i] = 300;
      else if (i >= 60) t[i] = 500;
      else t[i] = 300 + (i - 40) * 10; // 300..500
    }

    // Explosion at the wall face (x=50, y=500) radius=30.
    // Without the fix, columns left of 50 (high terrain) were skipped.
    carveInPlace(t, { x: 50, y: 500, radius: 30, tick: 0 });

    // The center column and right side should definitely carve.
    expect(t[50]).toBeGreaterThan(500);

    // Left-side wall columns within the explosion radius must also carve.
    // Column 40 (terrain=300) is 10px inside the radius (distance=10 < 30).
    expect(t[40]).toBeGreaterThan(300);
    expect(t[35]).toBeGreaterThan(300); // dx=15, dy=sqrt(900-225)≈26, bottom≈526
  });

  it("is idempotent on the floor", () => {
    const t = flatTerrain(100, 500);
    carveInPlace(t, { x: 50, y: 500, radius: 20, tick: 0 });
    const snapshot = Array.from(t);
    carveInPlace(t, { x: 50, y: 500, radius: 20, tick: 0 });
    expect(Array.from(t)).toEqual(snapshot);
  });
});

describe("applyCarve", () => {
  it("returns a new array without mutating the input", () => {
    const a = flatTerrain(100, 500);
    const snapshot = Array.from(a);
    const b = applyCarve(a, { x: 50, y: 500, radius: 20, tick: 0 });
    expect(Array.from(a)).toEqual(snapshot);
    expect(b).not.toBe(a);
  });
});
