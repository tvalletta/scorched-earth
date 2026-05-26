import { describe, it, expect } from "vitest";
import { simulateProjectile } from "./simulate";
import { BABY_MISSILE } from "../weapons/baby-missile";
import type { SimInput } from "../types";

const W = 1600;
const H = 900;

function flatTerrain(surfaceY: number): Int16Array {
  const t = new Int16Array(W);
  for (let i = 0; i < W; i++) t[i] = surfaceY;
  return t;
}

function defaultInput(overrides: Partial<SimInput> = {}): SimInput {
  return {
    weapon: BABY_MISSILE,
    origin: { x: 800, y: 600 },
    angle: 90,
    power: 500,
    wind: 0,
    gravity: 250,
    terrain: flatTerrain(700),
    terrainWidth: W,
    terrainHeight: H,
    walls: "none",
    targets: [],
    ...overrides,
  };
}

describe("simulateProjectile", () => {
  it("vertical shot with no wind lands near the launch x", () => {
    const r = simulateProjectile(defaultInput({ angle: 90 }));
    expect(r.impact).not.toBeNull();
    if (!r.impact) throw new Error("unreachable");
    expect(Math.abs(r.impact.x - 800)).toBeLessThan(5);
  });

  it("135° shot lands to the right of origin", () => {
    const r = simulateProjectile(defaultInput({ angle: 135, power: 200 }));
    expect(r.impact).not.toBeNull();
    if (!r.impact) throw new Error("unreachable");
    expect(r.impact.x).toBeGreaterThan(800);
  });

  it("45° shot lands to the left of origin", () => {
    const r = simulateProjectile(defaultInput({ angle: 45, power: 200 }));
    expect(r.impact).not.toBeNull();
    if (!r.impact) throw new Error("unreachable");
    expect(r.impact.x).toBeLessThan(800);
  });

  it("positive wind pushes a vertical shot to the right", () => {
    const noWind = simulateProjectile(defaultInput({ angle: 90, wind: 0 }));
    const withWind = simulateProjectile(defaultInput({ angle: 90, wind: 10 }));
    if (!noWind.impact || !withWind.impact) throw new Error("expected impacts");
    expect(withWind.impact.x).toBeGreaterThan(noWind.impact.x + 10);
  });

  it("wind-immune projectile is unaffected by wind", () => {
    const immune = { ...BABY_MISSILE, windImmune: true };
    const a = simulateProjectile(defaultInput({ weapon: immune, angle: 90, wind: 0 }));
    const b = simulateProjectile(defaultInput({ weapon: immune, angle: 90, wind: 10 }));
    if (!a.impact || !b.impact) throw new Error("expected impacts");
    expect(Math.abs(a.impact.x - b.impact.x)).toBeLessThan(2);
  });

  it("horizontal high-power shot exits screen (walls=none) with null impact", () => {
    const r = simulateProjectile(
      defaultInput({ angle: 180, power: 1000, terrain: flatTerrain(880) }),
    );
    expect(r.impact).toBeNull();
    expect(r.samples[r.samples.length - 1]!.x).toBeGreaterThan(W - 5);
  });

  it("samples are time-ordered and end at impact", () => {
    const r = simulateProjectile(defaultInput({ angle: 90 }));
    for (let i = 1; i < r.samples.length; i++) {
      expect(r.samples[i]!.t).toBeGreaterThan(r.samples[i - 1]!.t);
    }
    if (r.impact) {
      const last = r.samples[r.samples.length - 1]!;
      expect(Math.abs(last.x - r.impact.x)).toBeLessThan(2);
      expect(Math.abs(last.y - r.impact.y)).toBeLessThan(2);
    }
  });

  it("downsamples to <= 100 samples for long shots", () => {
    const r = simulateProjectile(defaultInput({ angle: 90, power: 999 }));
    expect(r.samples.length).toBeLessThanOrEqual(100);
    expect(r.samples.length).toBeGreaterThan(2);
  });

  it("produces a CarveOp at the impact point with weapon radius", () => {
    const r = simulateProjectile(defaultInput({ angle: 90 }));
    expect(r.carveOp).not.toBeNull();
    if (!r.carveOp || !r.impact) throw new Error("unreachable");
    expect(r.carveOp.x).toBe(Math.round(r.impact.x));
    expect(r.carveOp.y).toBe(Math.round(r.impact.y));
    expect(r.carveOp.radius).toBe(BABY_MISSILE.radius);
  });

  it("computes damages for targets in radius", () => {
    const r = simulateProjectile(
      defaultInput({
        angle: 90,
        targets: [{ playerId: "victim", x: 800, y: 700, shieldHp: 0 }],
      }),
    );
    expect(r.damages.length).toBe(1);
    expect(r.damages[0]!.playerId).toBe("victim");
    expect(r.damages[0]!.amount).toBeGreaterThan(0);
  });

  it("durationMs matches the last sample time", () => {
    const r = simulateProjectile(defaultInput({ angle: 90 }));
    const last = r.samples[r.samples.length - 1]!;
    expect(r.durationMs).toBe(last.t);
  });
});
