import { describe, it, expect } from "vitest";
import { generateTerrain } from "./generate";

const W = 1600;
const H = 900;

describe("generateTerrain", () => {
  it("returns an Int16Array of length width", () => {
    const t = generateTerrain({ seed: "abc", type: "random", width: W, height: H });
    expect(t).toBeInstanceOf(Int16Array);
    expect(t.length).toBe(W);
  });

  it("heights are within [0, height]", () => {
    const t = generateTerrain({ seed: "bounds", type: "random", width: W, height: H });
    for (let i = 0; i < t.length; i++) {
      expect(t[i]).toBeGreaterThanOrEqual(0);
      expect(t[i]).toBeLessThanOrEqual(H);
    }
  });

  it("is deterministic — same seed produces identical output", () => {
    const a = generateTerrain({ seed: "det", type: "random", width: W, height: H });
    const b = generateTerrain({ seed: "det", type: "random", width: W, height: H });
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("different seeds produce different outputs", () => {
    const a = generateTerrain({ seed: "seed-A", type: "random", width: W, height: H });
    const b = generateTerrain({ seed: "seed-B", type: "random", width: W, height: H });
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it("is reasonably smooth — neighbor delta < 50 pixels in 95% of columns", () => {
    const t = generateTerrain({ seed: "smooth", type: "random", width: W, height: H });
    let bigJumps = 0;
    for (let i = 1; i < t.length; i++) {
      if (Math.abs((t[i] as number) - (t[i - 1] as number)) > 50) bigJumps++;
    }
    expect(bigJumps).toBeLessThan(W * 0.05);
  });
});
