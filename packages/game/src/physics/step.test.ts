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
  wallMode: "none" as const,
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
    const p = makeProjectile({ x: 800, y: 1399, vy: 200 }); // SOFT_BOTTOM = 900+500=1400
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: NO_TANKS });
    expect(result.events.some(e => e.kind === "out-of-bounds")).toBe(true);
  });

  it("MIRV splits into a flat symmetric horizontal fan at apex", () => {
    // vy=-2 then +gravity crosses apex (prevVy<0, vy>=0) → split fires this step.
    const p = makeProjectile({ weapon: MIRV, x: 800, y: 100, vx: 0, vy: -2 });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: NO_TANKS });
    const kids = result.spawned;
    expect(kids).toHaveLength(5);
    const vxs = kids.map((k) => k.vx).sort((a, b) => a - b);
    expect(vxs[0]!).toBeLessThan(0); // leftmost goes left
    expect(vxs[vxs.length - 1]!).toBeGreaterThan(0); // rightmost goes right
    expect(Math.abs(vxs[0]! + vxs[vxs.length - 1]!)).toBeLessThan(40); // symmetric
    expect(kids.every((k) => k.vy <= 0)).toBe(true); // slight upward lift at burst
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
      // absorbed = min(damage, shieldHp) = min(BABY_MISSILE.damage, 200)
      const expectedAbsorbed = Math.min(BABY_MISSILE.damage, 200);
      expect(ev.absorbed).toBe(expectedAbsorbed);
      expect(ev.hpAfter).toBe(200 - expectedAbsorbed);
      expect(ev.overflow).toBe(BABY_MISSILE.damage - expectedAbsorbed);
      expect(ev.ownerId).toBe("attacker");
    }
  });

  it("overflow equals zero when shield has enough HP", () => {
    // Shield HP 200, BABY_MISSILE.damage is <= 200
    const tank = absorbTank({ shieldHp: 200 });
    const p = makeProjectile({ x: 800, y: 455, vy: 3000, ownerId: "attacker" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    const ev = result.events.find(e => e.kind === "shield-absorb");
    expect(ev).toBeDefined();
    if (ev?.kind === "shield-absorb") {
      expect(ev.overflow).toBe(0);
    }
  });

  it("shield-absorb event carries ownerId for force-shield reflect", () => {
    const tanks: StepTankInfo[] = [{
      sessionId: "p2", x: 400, y: 400,
      shieldHp: 500, shieldMaxHp: 500, shieldRadius: 65,
      shieldType: "absorb",
    }];
    const result = stepProjectiles({
      projectiles: [{
        id: "proj1", x: 395, y: 400, vx: 100, vy: 0,
        weapon: BABY_MISSILE, ownerId: "p1", apexReached: true,
      }],
      tanks, terrain: new Int16Array(1600).fill(900),
      terrainWidth: 1600, terrainHeight: 900,
      wind: 0, gravity: 0, dt: 1 / 60, wallMode: "none",
    });
    const absorb = result.events.find(e => e.kind === "shield-absorb");
    expect(absorb).toBeDefined();
    if (absorb?.kind === "shield-absorb") {
      expect(absorb.ownerId).toBe("p1"); // server uses this to reflect damage to attacker
    }
  });

  it("overflow equals damage minus shieldHp when shield is too weak", () => {
    const tank = absorbTank({ shieldHp: 5 }); // small shield
    const p = makeProjectile({ x: 800, y: 455, vy: 3000, ownerId: "attacker" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    const ev = result.events.find(e => e.kind === "shield-absorb");
    if (ev?.kind === "shield-absorb") {
      expect(ev.absorbed).toBe(5);
      expect(ev.hpAfter).toBe(0);
      expect(ev.overflow).toBe(BABY_MISSILE.damage - 5);
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

describe("stepProjectiles — magnetic shield (bend)", () => {
  function magneticTank(overrides: Partial<StepTankInfo> = {}): StepTankInfo {
    return {
      sessionId: "defender",
      x: 800, y: 490,
      shieldHp: 600, shieldMaxHp: 600,
      shieldRadius: 100,
      shieldType: "bend",
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

describe("stepProjectiles — wall modes", () => {
  const WIDE = 1600;
  const BASE = {
    terrain: new Int16Array(WIDE).fill(800),
    terrainWidth: WIDE,
    terrainHeight: 900,
    wind: 0,
    gravity: 0, // no gravity so position is predictable
    dt: 1 / 60,
    tanks: NO_TANKS,
  };

  function flyingLeft(): LiveProjectile {
    return makeProjectile({ x: 2, y: 100, vx: -600, vy: 0 }); // will exit left
  }

  function flyingRight(): LiveProjectile {
    return makeProjectile({ x: WIDE - 2, y: 100, vx: 600, vy: 0 }); // will exit right
  }

  it("none — projectile that exits left emits out-of-bounds", () => {
    const result = stepProjectiles({ ...BASE, wallMode: "none", projectiles: [flyingLeft()] });
    const oob = result.events.find((e) => e.kind === "out-of-bounds");
    expect(oob).toBeDefined();
    expect(result.survivors).toHaveLength(0);
  });

  it("wrap — projectile exiting right reappears at left with same vx", () => {
    const p = flyingRight();
    const origVx = p.vx;
    const result = stepProjectiles({ ...BASE, wallMode: "wrap", projectiles: [p] });
    expect(result.survivors).toHaveLength(1);
    expect(result.survivors[0]!.vx).toBeCloseTo(origVx);
    expect(result.survivors[0]!.x).toBeGreaterThanOrEqual(0);
    expect(result.survivors[0]!.x).toBeLessThan(WIDE);
    expect(result.events.find((e) => e.kind === "out-of-bounds")).toBeUndefined();
  });

  it("reflect — projectile exiting left has vx negated", () => {
    const p = flyingLeft();
    const origVx = p.vx;
    const result = stepProjectiles({ ...BASE, wallMode: "reflect", projectiles: [p] });
    expect(result.survivors).toHaveLength(1);
    expect(result.survivors[0]!.vx).toBeCloseTo(-origVx);
    expect(result.survivors[0]!.x).toBeGreaterThanOrEqual(0);
  });

  it("absorb — projectile exiting right emits terrain-impact at edge", () => {
    const result = stepProjectiles({ ...BASE, wallMode: "absorb", projectiles: [flyingRight()] });
    const impact = result.events.find((e) => e.kind === "terrain-impact");
    expect(impact).toBeDefined();
    if (impact && impact.kind === "terrain-impact") {
      expect(impact.x).toBe(WIDE - 1);
    }
    expect(result.survivors).toHaveLength(0);
  });

  it("none — top OOB (y < -600) emits out-of-bounds", () => {
    const p = makeProjectile({ x: 800, y: -650, vx: 0, vy: -100 });
    const result = stepProjectiles({ ...BASE, wallMode: "none", projectiles: [p] });
    expect(result.events.find((e) => e.kind === "out-of-bounds")).toBeDefined();
    expect(result.survivors).toHaveLength(0);
  });

  it("absorb — projectile exiting left emits terrain-impact at x=0", () => {
    const result = stepProjectiles({ ...BASE, wallMode: "absorb", projectiles: [flyingLeft()] });
    const impact = result.events.find((e) => e.kind === "terrain-impact");
    expect(impact).toBeDefined();
    if (impact && impact.kind === "terrain-impact") {
      expect(impact.x).toBe(0);
    }
    expect(result.survivors).toHaveLength(0);
  });

  it("reflect — projectile exiting right has vx negated and x clamped to terrainWidth - 1", () => {
    const p = flyingRight();
    const origVx = p.vx;
    const result = stepProjectiles({ ...BASE, wallMode: "reflect", projectiles: [p] });
    expect(result.survivors).toHaveLength(1);
    expect(result.survivors[0]!.vx).toBeCloseTo(-origVx);
    expect(result.survivors[0]!.x).toBeLessThanOrEqual(WIDE - 1);
  });
});
