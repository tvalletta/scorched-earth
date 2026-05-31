import { describe, it, expect } from "vitest";
import { generateTerrain, generateUnderside, generateCeiling } from "./generate";
import { CAVE_MIN_GAP, CAVE_EDGE_SEAL } from "@se/shared";
import type { TerrainType } from "@se/shared";

const W = 1600;
const H = 900;

describe("generateCeiling", () => {
  it("stays above the floor with the min gap mid-cave, sealed at the edges", () => {
    const floor = generateTerrain({ seed: "cave", type: "flat", width: W, height: H });
    const ceil = generateCeiling({ seed: "cave", type: "random", width: W, height: H }, floor);
    expect(ceil.length).toBe(W);
    for (let x = CAVE_EDGE_SEAL; x < W - CAVE_EDGE_SEAL; x++) {
      expect((floor[x] as number) - (ceil[x] as number)).toBeGreaterThanOrEqual(CAVE_MIN_GAP - 1);
    }
    // sealed: near the edges the gap collapses toward zero
    expect((floor[2] as number) - (ceil[2] as number)).toBeLessThan(40);
    expect((floor[W - 3] as number) - (ceil[W - 3] as number)).toBeLessThan(40);
  });
});

describe("generateUnderside", () => {
  it("returns an organic bottom below the surface that plunges at the edges", () => {
    const u = generateUnderside("seed-1", W, 500); // avgSurface = 500
    expect(u.length).toBe(W);
    for (let x = 0; x < W; x++) expect(u[x]!).toBeGreaterThan(500); // below the surface
    // edges plunge: they are not shallower than the middle's shallowest point
    const midSlice = Array.from(u.slice(Math.floor(W * 0.4), Math.floor(W * 0.6)));
    const midMin = Math.min(...midSlice);
    expect(Math.max(u[5]!, u[W - 6]!)).toBeGreaterThan(midMin - 1);
  });
});

const ALL_TYPES: TerrainType[] = [
  "mountains", "hills", "valleys", "cliffs", "crater",
  "sky-high", "plateau", "flat", "random",
];

describe("generateTerrain", () => {
  for (const type of ALL_TYPES) {
    describe(type, () => {
      it("returns an Int16Array of length width", () => {
        const t = generateTerrain({ seed: "abc", type, width: W, height: H });
        expect(t).toBeInstanceOf(Int16Array);
        expect(t.length).toBe(W);
      });

      it("all heights are within [0, height]", () => {
        const t = generateTerrain({ seed: "bounds", type, width: W, height: H });
        for (let i = 0; i < t.length; i++) {
          expect(t[i]).toBeGreaterThanOrEqual(0);
          expect(t[i]).toBeLessThanOrEqual(H);
        }
      });

      it("is deterministic — same seed same output", () => {
        const a = generateTerrain({ seed: "det", type, width: W, height: H });
        const b = generateTerrain({ seed: "det", type, width: W, height: H });
        expect(Array.from(a)).toEqual(Array.from(b));
      });
    });
  }

  it("different seeds produce different outputs (random)", () => {
    const a = generateTerrain({ seed: "seed-A", type: "random", width: W, height: H });
    const b = generateTerrain({ seed: "seed-B", type: "random", width: W, height: H });
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it("flat terrain is uniform", () => {
    const t = generateTerrain({ seed: "s", type: "flat", width: W, height: H });
    const first = t[0];
    for (let i = 1; i < t.length; i++) expect(t[i]).toBe(first);
  });
});

describe("plateau terrain", () => {
  it("left edge is not perfectly linear — smoothstep produces a curved slope", () => {
    const t = generateTerrain({ seed: "plat-test", type: "plateau", width: W, height: H });
    // Smoothstep produces an S-curve: slow at the edges, steepest in the middle.
    // The total drop in the first 10% of the ramp should be less than the drop
    // in a middle 10% slice — which is NOT true for a linear ramp.
    const leftEdge = 192; // minimum possible leftEdge for this seed/width
    const earlyStart = 1;
    const earlyEnd = Math.round(leftEdge * 0.10);
    const midStart = Math.round(leftEdge * 0.45);
    const midEnd = Math.round(leftEdge * 0.55);
    let earlyDrop = 0;
    let midDrop = 0;
    for (let x = earlyStart + 1; x <= earlyEnd; x++) earlyDrop += Math.abs(t[x]! - t[x - 1]!);
    for (let x = midStart + 1; x <= midEnd; x++) midDrop += Math.abs(t[x]! - t[x - 1]!);
    // Smoothstep ratio is ~5×; linear ratio is ~1×. Threshold of 2× clearly separates them.
    expect(midDrop).toBeGreaterThan(earlyDrop * 2);
  });
});
