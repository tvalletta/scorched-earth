import { describe, it, expect } from "vitest";
import { carveInPlace, applyCarve, carveCeilingInPlace, settleInPlace } from "./carve";

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

describe("settleInPlace", () => {
  it("does not modify flat terrain", () => {
    const t = flatTerrain(100, 400);
    const before = settleInPlace(t, 30, 70);
    expect(Array.from(t)).toEqual(Array.from(flatTerrain(100, 400)));
    // before snapshot matches original
    const lo = Math.max(0, 30 - 5);
    const hi = Math.min(99, 70 + 5);
    expect(before.length).toBe(hi - lo + 1);
  });

  it("settles a steep cliff-valley pair to within threshold", () => {
    // cliff at y=100 (high), valley at y=500 (low), adjacent columns
    const t = new Int16Array(100);
    for (let i = 0; i < 100; i++) t[i] = i < 50 ? 100 : 500;
    settleInPlace(t, 45, 55);
    // after settling, adjacent pair difference must be <= 80 (threshold)
    for (let x = 0; x < 99; x++) {
      expect(Math.abs((t[x] as number) - (t[x + 1] as number))).toBeLessThanOrEqual(80);
    }
  });

  it("returns a pre-settle snapshot covering [xMin-5 .. xMax+5]", () => {
    const t = new Int16Array(100);
    for (let i = 0; i < 100; i++) t[i] = i < 50 ? 100 : 500;
    const before = settleInPlace(t, 48, 52);
    const lo = Math.max(0, 48 - 5);
    const hi = Math.min(99, 52 + 5);
    expect(before.length).toBe(hi - lo + 1);
    // before[0] corresponds to terrain[lo] — which was 100 before settling
    expect(before[0]).toBe(100);
  });

  it("respects MAX_PASSES cap — terminates even on extreme input", () => {
    // 2-column terrain with a huge cliff; needs many passes
    const t = new Int16Array(10);
    t[0] = 0; t[1] = 900; // 900px diff
    for (let i = 2; i < 10; i++) t[i] = 900;
    // Should not throw or hang
    settleInPlace(t, 0, 1, { maxPasses: 5 });
    // values must remain within valid Int16 range after capped settling
    for (let i = 0; i < t.length; i++) {
      expect(t[i]).toBeGreaterThanOrEqual(0);
      expect(t[i]).toBeLessThanOrEqual(32767);
    }
  });

  it("handles right-to-left slope (right column is higher)", () => {
    const t = new Int16Array(100);
    for (let i = 0; i < 100; i++) t[i] = i >= 50 ? 100 : 500;
    settleInPlace(t, 45, 55);
    for (let x = 0; x < 99; x++) {
      expect(Math.abs((t[x] as number) - (t[x + 1] as number))).toBeLessThanOrEqual(80);
    }
  });
});
