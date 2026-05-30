import { describe, it, expect } from "vitest";
import { generateTerrain, generateUnderside } from "./generate";
import type { TerrainType } from "@se/shared";

const W = 1600;
const H = 900;

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
