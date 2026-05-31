import { describe, it, expect } from "vitest";
import { simulateProjectile } from "../physics/simulate";
import { FUNKY_BOMB } from "./funky-bomb";
import { MIRV } from "./mirv";
import type { SimInput } from "../types";

const W = 1600, H = 900;
function flat(y: number): Int16Array { const t = new Int16Array(W); t.fill(y); return t; }
function base(overrides: Partial<SimInput> = {}): SimInput {
  return {
    weapon: FUNKY_BOMB, origin: { x: 800, y: 700 },
    angle: 90, power: 500, wind: 0, gravity: 250,
    terrain: flat(800), terrainWidth: W, terrainHeight: H,
    wallMode: "none", targets: [],
    ...overrides,
  };
}

describe("FUNKY_BOMB", () => {
  it("id and stats", () => {
    expect(FUNKY_BOMB.id).toBe("funky-bomb");
    expect(FUNKY_BOMB.radius).toBe(0);
    expect(FUNKY_BOMB.damage).toBe(0);
    expect(FUNKY_BOMB.split?.trigger).toBe("ground");   // was "apex"
    expect(FUNKY_BOMB.split?.count).toBe(8);
    expect(FUNKY_BOMB.split?.spreadDeg).toBe(160);      // was 360
    expect(FUNKY_BOMB.split?.inheritVelocity).toBe(false);
  });

  it("sub-munition is wind-immune", () => {
    expect(FUNKY_BOMB.split?.child.windImmune).toBe(true);
  });
});

describe("MIRV", () => {
  it("id and stats", () => {
    expect(MIRV.id).toBe("mirv");
    expect(MIRV.radius).toBe(0);
    expect(MIRV.split?.count).toBe(5);
    expect(MIRV.split?.spreadDeg).toBe(120);
    expect(MIRV.split?.inheritVelocity).toBe(true);
    expect(MIRV.split?.child.radius).toBe(25);
  });

  it("splits into 5 children", () => {
    const r = simulateProjectile(base({ weapon: MIRV }));
    expect(r.children).toHaveLength(5);
  });

  it("all MIRV children impact below the split point", () => {
    const r = simulateProjectile(base({ weapon: MIRV, angle: 90, power: 600 }));
    for (const c of r.children!) {
      if (c.impact) expect(c.impact.y).toBeGreaterThan(r.splitAt!.y);
    }
  });
});

describe("FUNKY_BOMB ground trigger", () => {
  it("splits into 8 children on terrain impact (not at apex)", () => {
    const r = simulateProjectile(base({ weapon: FUNKY_BOMB, angle: 90, power: 500 }));
    expect(r.children).toHaveLength(8);
  });

  it("parent has no carveOp — children carve individually", () => {
    const r = simulateProjectile(base({ weapon: FUNKY_BOMB }));
    expect(r.carveOp).toBeNull();
  });

  it("children spread to both left and right of impact", () => {
    const r = simulateProjectile(base({ weapon: FUNKY_BOMB, angle: 90, power: 500 }));
    const left  = r.children!.filter((c) => c.impact && c.impact.x < 800);
    const right = r.children!.filter((c) => c.impact && c.impact.x > 800);
    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
  });
});
