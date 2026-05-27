import { describe, it, expect } from "vitest";
import { stepProjectiles, initialVelocityFromAnglePower } from "./step";
import type { LiveProjectile, StepTankInfo } from "../types";
import { BABY_MISSILE } from "../weapons/baby-missile";
import { MIRV } from "../weapons/mirv";

const FLAT_TERRAIN = new Int16Array(1600).fill(500);
const NO_TANKS: StepTankInfo[] = [];
const BASE_INPUT = {
  terrain: FLAT_TERRAIN,
  terrainWidth: 1600,
  terrainHeight: 900,
  wind: 0,
  gravity: 250,
  dt: 1 / 60,
};

function makeProjectile(overrides: Partial<LiveProjectile> = {}): LiveProjectile {
  return {
    id: "p1",
    x: 800, y: 100,
    vx: 0, vy: 0,
    weapon: BABY_MISSILE,
    ownerId: "player1",
    apexReached: false,
    ...overrides,
  };
}

describe("stepProjectiles — core", () => {
  it("applies gravity to vy each tick", () => {
    const p = makeProjectile({ vy: 0 });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: NO_TANKS });
    const survivor = result.survivors[0];
    expect(survivor).toBeDefined();
    expect(survivor!.vy).toBeCloseTo(250 / 60, 5);
  });

  it("applies wind to vx (non-immune weapon)", () => {
    const p = makeProjectile({ vx: 0 });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: NO_TANKS, wind: 60 });
    const survivor = result.survivors[0];
    expect(survivor!.vx).toBeCloseTo(60 * 5 / 60, 4); // WIND_ACCEL_SCALE = 5
  });

  it("wind-immune weapon ignores wind", () => {
    const immune = { ...BABY_MISSILE, windImmune: true };
    const p = makeProjectile({ weapon: immune, vx: 0 });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: NO_TANKS, wind: 100 });
    expect(result.survivors[0]!.vx).toBeCloseTo(0, 5);
  });

  it("emits terrain-impact when projectile hits terrain surface", () => {
    const terrain = new Int16Array(1600).fill(200);
    const p = makeProjectile({ x: 800, y: 195, vy: 400 });
    const result = stepProjectiles({ ...BASE_INPUT, terrain, projectiles: [p], tanks: NO_TANKS });
    const impact = result.events.find(e => e.kind === "terrain-impact");
    expect(impact).toBeDefined();
    expect(result.survivors).toHaveLength(0);
  });

  it("emits out-of-bounds when projectile leaves terrain width", () => {
    const p = makeProjectile({ x: 1598, vx: 200 });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: NO_TANKS });
    const oob = result.events.find(e => e.kind === "out-of-bounds");
    expect(oob).toBeDefined();
    expect(result.survivors).toHaveLength(0);
  });

  it("emits out-of-bounds when projectile falls below soft bottom", () => {
    const p = makeProjectile({ x: 800, y: 1099, vy: 200 }); // SOFT_BOTTOM = 900+200=1100
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: NO_TANKS });
    expect(result.events.some(e => e.kind === "out-of-bounds")).toBe(true);
  });

  it("handles multiple simultaneous projectiles independently", () => {
    const p1 = makeProjectile({ id: "p1", x: 400 });
    const p2 = makeProjectile({ id: "p2", x: 1200 });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p1, p2], tanks: NO_TANKS });
    expect(result.survivors).toHaveLength(2);
  });

  it("emits mirv-split at apex (vy crosses 0 negative→positive)", () => {
    const p = makeProjectile({ weapon: MIRV, vy: -1, apexReached: false }); // about to cross apex
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: NO_TANKS, gravity: 250 });
    const split = result.events.find(e => e.kind === "mirv-split");
    expect(split).toBeDefined();
    expect(result.spawned.length).toBeGreaterThan(0);
  });

  it("does not split twice — apexReached guard", () => {
    const p = makeProjectile({ weapon: MIRV, vy: 10, apexReached: true });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: NO_TANKS });
    expect(result.events.find(e => e.kind === "mirv-split")).toBeUndefined();
  });
});

// Helper — builds a StepTankInfo with absorb shield
function absorbTank(overrides: Partial<StepTankInfo> = {}): StepTankInfo {
  return {
    sessionId: "defender",
    x: 800, y: 490,
    shieldHp: 200, shieldMaxHp: 200,
    shieldRadius: 60,
    shieldType: "absorb",
    hpCostFraction: 0.5,
    ...overrides,
  };
}

describe("stepProjectiles — absorb shield", () => {
  it("absorbs projectile within radius, emits shield-absorb", () => {
    const tank = absorbTank();
    const p = makeProjectile({ x: 800, y: 455, vy: 3000, ownerId: "attacker" }); // within 60px of tank
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    const ev = result.events.find(e => e.kind === "shield-absorb");
    expect(ev).toBeDefined();
    expect(result.survivors).toHaveLength(0);
    if (ev?.kind === "shield-absorb") {
      expect(ev.targetId).toBe("defender");
      expect(ev.hpAfter).toBe(200 - Math.floor(BABY_MISSILE.damage * 0.5));
    }
  });

  it("does NOT absorb when shield HP is 0", () => {
    const tank = absorbTank({ shieldHp: 0 });
    const p = makeProjectile({ x: 800, y: 455, vy: 3000, ownerId: "attacker" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.events.find(e => e.kind === "shield-absorb")).toBeUndefined();
  });

  it("does NOT absorb owner's own projectile", () => {
    const tank = absorbTank({ sessionId: "player1" });
    const p = makeProjectile({ x: 800, y: 455, vy: 3000, ownerId: "player1" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.events.find(e => e.kind === "shield-absorb")).toBeUndefined();
  });

  it("does NOT absorb projectile outside radius", () => {
    const tank = absorbTank({ x: 800, y: 490 });
    const p = makeProjectile({ x: 800, y: 300, vy: 5, ownerId: "attacker" }); // 190px away, shield radius=60
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.events.find(e => e.kind === "shield-absorb")).toBeUndefined();
  });
});

describe("stepProjectiles — deflector shield", () => {
  function deflectTank(overrides: Partial<StepTankInfo> = {}): StepTankInfo {
    return {
      sessionId: "defender",
      x: 800, y: 490,
      shieldHp: 500, shieldMaxHp: 500,
      shieldRadius: 70,
      shieldType: "deflect",
      hpCostFraction: 0.25,
      ...overrides,
    };
  }

  it("emits shield-deflect and projectile survives (remains in survivors)", () => {
    const tank = deflectTank();
    const p = makeProjectile({ x: 800, y: 430, vy: 3000, ownerId: "attacker" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.events.find(e => e.kind === "shield-deflect")).toBeDefined();
    expect(result.survivors).toHaveLength(1);
  });

  it("reflected projectile has reversed vy component (hits from above → bounces up)", () => {
    const tank = deflectTank({ x: 800, y: 500 });
    // Projectile coming straight down toward tank center — nx≈0, ny≈-1 after entering radius
    const p = makeProjectile({ x: 800, y: 440, vx: 0, vy: 3000, ownerId: "attacker" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    const deflected = result.survivors[0];
    expect(deflected).toBeDefined();
    expect(deflected!.vy).toBeLessThan(0); // reflected upward
  });

  it("reduces shield HP by hpCostFraction * damage", () => {
    const tank = deflectTank();
    const p = makeProjectile({ x: 800, y: 430, vy: 3000, ownerId: "attacker" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    const ev = result.events.find(e => e.kind === "shield-deflect");
    if (ev?.kind === "shield-deflect") {
      const expectedCost = Math.floor(BABY_MISSILE.damage * 0.25);
      expect(ev.hpAfter).toBe(500 - expectedCost);
    }
  });

  it("does NOT deflect own projectile", () => {
    const tank = deflectTank({ sessionId: "player1" });
    const p = makeProjectile({ x: 800, y: 430, vy: 3000, ownerId: "player1" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.events.find(e => e.kind === "shield-deflect")).toBeUndefined();
  });
});
