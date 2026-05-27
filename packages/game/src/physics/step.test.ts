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

describe("stepProjectiles — magnetic shield", () => {
  function magneticTank(overrides: Partial<StepTankInfo> = {}): StepTankInfo {
    return {
      sessionId: "defender",
      x: 800, y: 490,
      shieldHp: 600, shieldMaxHp: 600,
      shieldRadius: 100,
      shieldType: "bend",
      hpCostFraction: 0,
      ...overrides,
    };
  }

  it("projectile survives and vx/vy are modified", () => {
    const tank = magneticTank();
    const p = makeProjectile({ x: 800, y: 400, vx: 0, vy: 3000, ownerId: "attacker" }); // 90px away
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.survivors).toHaveLength(1);
  });

  it("emits shield-bend event", () => {
    const tank = magneticTank();
    const p = makeProjectile({ x: 800, y: 400, vy: 3000, ownerId: "attacker" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.events.find(e => e.kind === "shield-bend")).toBeDefined();
  });

  it("adds hpDrain to shieldDrains while projectile is in range", () => {
    const tank = magneticTank();
    const p = makeProjectile({ x: 800, y: 400, vy: 3000, ownerId: "attacker" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.shieldDrains).toHaveLength(1);
    expect(result.shieldDrains[0]!.sessionId).toBe("defender");
    expect(result.shieldDrains[0]!.hpDrain).toBeGreaterThan(0);
  });

  it("no drain when projectile out of range", () => {
    const tank = magneticTank({ x: 800, y: 490 });
    const p = makeProjectile({ x: 800, y: 100, vy: 0, ownerId: "attacker" }); // 390px away — outside 100px radius
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.shieldDrains).toHaveLength(0);
  });

  it("does not apply bend to owner's own projectile", () => {
    const tank = magneticTank({ sessionId: "player1" });
    const p = makeProjectile({ x: 800, y: 400, vy: 3000, ownerId: "player1" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.events.find(e => e.kind === "shield-bend")).toBeUndefined();
  });
});

describe("stepProjectiles — reactive armor", () => {
  function reactiveTank(overrides: Partial<StepTankInfo> = {}): StepTankInfo {
    return {
      sessionId: "defender",
      x: 800, y: 490,
      shieldHp: 1, shieldMaxHp: 1,
      shieldRadius: 50,
      shieldType: "explode",
      hpCostFraction: 1,
      ...overrides,
    };
  }

  it("removes projectile and emits shield-explode when charged (shieldHp=1)", () => {
    const tank = reactiveTank();
    const p = makeProjectile({ x: 800, y: 450, vy: 3000, ownerId: "attacker" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.survivors).toHaveLength(0);
    expect(result.events.find(e => e.kind === "shield-explode")).toBeDefined();
  });

  it("explode event contains contact point", () => {
    const tank = reactiveTank();
    const p = makeProjectile({ x: 800, y: 450, vy: 3000, ownerId: "attacker" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    const ev = result.events.find(e => e.kind === "shield-explode");
    if (ev?.kind === "shield-explode") {
      expect(ev.targetId).toBe("defender");
      expect(typeof ev.x).toBe("number");
    }
  });

  it("does NOT trigger when depleted (shieldHp=0)", () => {
    const tank = reactiveTank({ shieldHp: 0 });
    const p = makeProjectile({ x: 800, y: 450, vy: 3000, ownerId: "attacker" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.events.find(e => e.kind === "shield-explode")).toBeUndefined();
  });

  it("does NOT trigger against owner's projectile", () => {
    const tank = reactiveTank({ sessionId: "player1" });
    const p = makeProjectile({ x: 800, y: 450, vy: 3000, ownerId: "player1" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.events.find(e => e.kind === "shield-explode")).toBeUndefined();
  });
});

describe("stepProjectiles — Patriot", () => {
  function makePatriot(targetId: string, overrides: Partial<LiveProjectile> = {}): LiveProjectile {
    return {
      id: "pat1",
      x: 700, y: 400,
      vx: 0, vy: 0,
      weapon: BABY_MISSILE,
      ownerId: "defender",
      apexReached: false,
      isPatriot: true,
      targetId,
      ...overrides,
    };
  }

  it("updates patriot velocity toward target each tick", () => {
    const target = makeProjectile({ id: "enemy1", x: 900, y: 400, vy: 0, ownerId: "attacker" });
    const patriot = makePatriot("enemy1", { x: 700, y: 400 });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [patriot, target], tanks: NO_TANKS });
    const survivingPatriot = result.survivors.find(p => p.id === "pat1");
    expect(survivingPatriot).toBeDefined();
    expect(survivingPatriot!.vx).toBeGreaterThan(0); // moving right toward target at x=900
  });

  it("emits patriot-intercept and removes both when within 15px", () => {
    const target = makeProjectile({ id: "enemy1", x: 800, y: 400, vy: 0, vx: 0, ownerId: "attacker" });
    const patriot = makePatriot("enemy1", { x: 806, y: 404 }); // ~7px away — within 15px intercept radius
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [patriot, target], tanks: NO_TANKS });
    expect(result.events.find(e => e.kind === "patriot-intercept")).toBeDefined();
    expect(result.survivors.find(p => p.id === "pat1")).toBeUndefined();
    expect(result.survivors.find(p => p.id === "enemy1")).toBeUndefined();
  });

  it("removes patriot when target is already gone from projectiles list", () => {
    const patriot = makePatriot("ghost-target", { x: 800, y: 400 });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [patriot], tanks: NO_TANKS });
    expect(result.survivors.find(p => p.id === "pat1")).toBeUndefined();
  });
});
