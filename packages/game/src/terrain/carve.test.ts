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

  it("carves a near-vertical wall — center carves, cliff tops above blast are capped", () => {
    // Steep wall: left plateau at y=300, right valley at y=500.
    const t = new Int16Array(100);
    for (let i = 0; i < 100; i++) {
      if (i < 40) t[i] = 300;
      else if (i >= 60) t[i] = 500;
      else t[i] = 300 + (i - 40) * 10; // 300..500
    }

    // Explosion at (x=50, y=500) radius=30. Surface at col 50 is 400.
    carveInPlace(t, { x: 50, y: 500, radius: 30, tick: 0 });

    // Center column: surface was 400, blast center 100 units below (> 2r=60),
    // so capped to 400+30=430. It DID carve — just not down to the raw circleBottom.
    expect(t[50]).toBeGreaterThan(400);

    // Left-side cliff columns also carve (capped similarly).
    expect(t[40]).toBeGreaterThan(300);
    expect(t[35]).toBeGreaterThan(300);

    // Cliff tops far above the blast are capped to at most 1 radius below their
    // original surface — they are not catastrophically removed.
    expect(t[40]).toBeLessThanOrEqual(300 + 30 + 1); // capped near currentSurface + r
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
