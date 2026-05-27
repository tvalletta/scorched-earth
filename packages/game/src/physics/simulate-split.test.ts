import { describe, it, expect } from "vitest";
import { simulateProjectile } from "./simulate";
import { BABY_MISSILE } from "../weapons/baby-missile";
import type { SimInput, WeaponDef } from "../types";

const W = 1600, H = 900;
function flatTerrain(y: number): Int16Array {
  const t = new Int16Array(W);
  for (let i = 0; i < W; i++) t[i] = y;
  return t;
}
function base(weapon: WeaponDef, overrides: Partial<SimInput> = {}): SimInput {
  return {
    weapon, origin: { x: 800, y: 600 },
    angle: 90, power: 500, wind: 0, gravity: 250,
    terrain: flatTerrain(800), terrainWidth: W, terrainHeight: H,
    wallMode: "none", targets: [],
    ...overrides,
  };
}

const RADIAL_3: WeaponDef = {
  id: "test-radial", radius: 0, damage: 0, windImmune: false, price: 0, packSize: 0,
  split: {
    trigger: "apex", count: 3, spreadDeg: 360, centerDeg: 90,
    inheritVelocity: false, ejectionSpeed: 200,
    child: { id: "test-child", radius: 15, damage: 10, windImmune: false, price: 0, packSize: 0 },
  },
};

const FAN_3: WeaponDef = {
  id: "test-fan", radius: 0, damage: 0, windImmune: false, price: 0, packSize: 0,
  split: {
    trigger: "apex", count: 3, spreadDeg: 120, centerDeg: 90,
    inheritVelocity: true, ejectionSpeed: 300,
    child: { id: "test-fan-child", radius: 15, damage: 10, windImmune: false, price: 0, packSize: 0 },
  },
};

describe("simulateProjectile — split weapons", () => {
  it("parent has null carveOp and no direct damages", () => {
    const r = simulateProjectile(base(RADIAL_3));
    expect(r.carveOp).toBeNull();
    expect(r.damages).toEqual([]);
  });

  it("records splitAt near the apex (above origin)", () => {
    const r = simulateProjectile(base(RADIAL_3));
    expect(r.splitAt).toBeDefined();
    expect(r.splitAt!.y).toBeLessThan(600);
  });

  it("produces correct child count", () => {
    const r = simulateProjectile(base(RADIAL_3));
    expect(r.children).toHaveLength(3);
  });

  it("each child has samples and an impact", () => {
    const r = simulateProjectile(base(RADIAL_3));
    for (const c of r.children!) {
      expect(c.samples.length).toBeGreaterThan(1);
      expect(c.impact).not.toBeNull();
    }
  });

  it("radial children spread both left and right", () => {
    const r = simulateProjectile(base(RADIAL_3));
    const left = r.children!.filter((c) => c.impact!.x < 800);
    const right = r.children!.filter((c) => c.impact!.x > 800);
    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
  });

  it("fan children all impact below the split point", () => {
    const r = simulateProjectile(base(FAN_3, { angle: 90, power: 600 }));
    for (const c of r.children!) {
      expect(c.impact!.y).toBeGreaterThan(r.splitAt!.y);
    }
  });

  it("child carveOp uses child weapon radius", () => {
    const r = simulateProjectile(base(RADIAL_3));
    const withCarve = r.children!.filter((c) => c.carveOp !== null);
    expect(withCarve.length).toBeGreaterThan(0);
    for (const c of withCarve) {
      expect(c.carveOp!.radius).toBe(15);
    }
  });

  it("BABY_MISSILE (no split) is unchanged — no splitAt or children", () => {
    const r = simulateProjectile(base(BABY_MISSILE));
    expect(r.splitAt).toBeUndefined();
    expect(r.children).toBeUndefined();
    expect(r.impact).not.toBeNull();
  });

  it("initialVelocity override bypasses angle/power", () => {
    const r = simulateProjectile(base(BABY_MISSILE, {
      initialVelocity: { vx: 0, vy: -300 }, // straight up
    }));
    expect(r.impact).not.toBeNull();
    expect(Math.abs(r.impact!.x - 800)).toBeLessThan(10);
  });
});
