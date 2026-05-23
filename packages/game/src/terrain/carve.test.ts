import { describe, it, expect } from "vitest";
import { carveInPlace, applyCarve } from "./carve";

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
