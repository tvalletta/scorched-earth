import { describe, it, expect, vi } from "vitest";
import { MatchState, Tank, REACTIVE_BLAST, TERRAIN_WIDTH, TERRAIN_HEIGHT } from "@se/shared";
import { computeDamage } from "@se/game";
import { applyStepEvent } from "../src/rooms/tickLoop";
import type { ResolveContext } from "../src/rooms/resolveTurn";

// ─── helpers ────────────────────────────────────────────────────────────────

function flatTerrain(): Int16Array {
  const t = new Int16Array(TERRAIN_WIDTH);
  t.fill(TERRAIN_HEIGHT - 50);
  return t;
}

function makeCtx(state: MatchState): ResolveContext {
  return {
    state,
    broadcast: vi.fn(),
    schedule: vi.fn(),
    terrain: flatTerrain(),
    ceiling: null,
    onTurnReady: vi.fn(),
    startTickLoop: vi.fn(),
  };
}

function addTank(state: MatchState, id: string, x: number, hp = 100, shieldHp = 0, shieldId = ""): Tank {
  const t = new Tank();
  t.playerId = id;
  t.sessionId = id;
  t.nickname = id;
  t.color = "red";
  t.alive = true;
  t.hp = hp;
  t.x = x;
  t.y = TERRAIN_HEIGHT - 50;
  t.shieldHp = shieldHp;
  t.shieldId = shieldId;
  t.angle = 90;
  t.power = 500;
  t.weaponId = "baby-missile";
  t.inventory.set("baby-missile", -1);
  state.tanks.set(id, t);
  return t;
}

// ─── REACTIVE_BLAST constant ─────────────────────────────────────────────────

describe("REACTIVE_BLAST constant", () => {
  it("is { radius: 60, damage: 40 }", () => {
    expect(REACTIVE_BLAST).toMatchObject({ radius: 60, damage: 40 });
  });
});

// ─── computeDamage unit test: blast math ─────────────────────────────────────

describe("computeDamage — reactive blast math", () => {
  const blastWeapon = {
    id: "reactive-armor",
    radius: REACTIVE_BLAST.radius,
    damage: REACTIVE_BLAST.damage,
    windImmune: true,
    price: 0,
    packSize: 0,
  };

  it("tank at blast center (~0 dist) takes ~40 hp", () => {
    const targets = [{ playerId: "p1", x: 100, y: 100, shieldHp: 0 }];
    const damages = computeDamage({ x: 100, y: 100 }, blastWeapon, targets);
    expect(damages).toHaveLength(1);
    // At dist=0: amount = floor(40 * (1 - 0.4*0/60)) = 40
    expect(damages[0]!.hullDamage).toBe(40);
  });

  it("tank ~200px away takes 0 damage (outside radius=60)", () => {
    const targets = [{ playerId: "p1", x: 300, y: 100, shieldHp: 0 }];
    const damages = computeDamage({ x: 100, y: 100 }, blastWeapon, targets);
    expect(damages).toHaveLength(0);
  });

  it("tank at blast edge (dist=59) takes non-zero but reduced damage", () => {
    const targets = [{ playerId: "p1", x: 100 + 59, y: 100, shieldHp: 0 }];
    const damages = computeDamage({ x: 100, y: 100 }, blastWeapon, targets);
    expect(damages).toHaveLength(1);
    // amount = floor(40 * (1 - 0.4*59/60)) = floor(40 * 0.6067) = floor(24.27) = 24
    expect(damages[0]!.hullDamage).toBeGreaterThan(0);
    expect(damages[0]!.hullDamage).toBeLessThan(40);
  });
});

// ─── shield-absorb handler ───────────────────────────────────────────────────

describe("applyStepEvent — shield-absorb", () => {
  it("updates shieldHp to hpAfter", () => {
    const state = new MatchState();
    const tank = addTank(state, "p1", 400, 100, 80, "bubble");
    const ctx = makeCtx(state);

    applyStepEvent(ctx, {
      kind: "shield-absorb",
      projectileId: "proj-1",
      targetId: "p1",
      hpBefore: 80,
      hpAfter: 50,
      piercedHull: 0,
      ownerId: "p2",
    }, [], "p2");

    expect(tank.shieldHp).toBe(50);
    expect(tank.shieldId).toBe("bubble");
    expect(tank.hp).toBe(100);
  });

  it("clears shieldId when shieldHp reaches 0", () => {
    const state = new MatchState();
    const tank = addTank(state, "p1", 400, 100, 10, "bubble");
    const ctx = makeCtx(state);

    applyStepEvent(ctx, {
      kind: "shield-absorb",
      projectileId: "proj-1",
      targetId: "p1",
      hpBefore: 10,
      hpAfter: 0,
      piercedHull: 0,
      ownerId: "p2",
    }, [], "p2");

    expect(tank.shieldHp).toBe(0);
    expect(tank.shieldId).toBe("");
  });

  it("applies piercedHull damage to tank hull", () => {
    const state = new MatchState();
    const tank = addTank(state, "p1", 400, 100, 5, "bubble");
    const ctx = makeCtx(state);

    applyStepEvent(ctx, {
      kind: "shield-absorb",
      projectileId: "proj-1",
      targetId: "p1",
      hpBefore: 5,
      hpAfter: 0,
      piercedHull: 20,
      ownerId: "p2",
    }, [], "p2");

    expect(tank.hp).toBe(80);
    expect(tank.alive).toBe(true);
  });

  it("kills tank when piercedHull exceeds remaining hull hp", () => {
    const state = new MatchState();
    const tank = addTank(state, "p1", 400, 15, 5, "bubble");
    const ctx = makeCtx(state);

    applyStepEvent(ctx, {
      kind: "shield-absorb",
      projectileId: "proj-1",
      targetId: "p1",
      hpBefore: 5,
      hpAfter: 0,
      piercedHull: 30,
      ownerId: "p2",
    }, [], "p2");

    expect(tank.hp).toBe(0);
    expect(tank.alive).toBe(false);
  });

  it("broadcasts shield-hit with absorb type", () => {
    const state = new MatchState();
    addTank(state, "p1", 400, 100, 80, "bubble");
    const ctx = makeCtx(state);

    applyStepEvent(ctx, {
      kind: "shield-absorb",
      projectileId: "proj-1",
      targetId: "p1",
      hpBefore: 80,
      hpAfter: 60,
      piercedHull: 0,
      ownerId: "p2",
    }, [], "p2");

    expect(ctx.broadcast).toHaveBeenCalledWith("shield-hit", {
      targetId: "p1",
      type: "absorb",
      hpBefore: 80,
      hpAfter: 60,
    });
  });

  it("does NOT apply reflectFraction (old mechanic removed)", () => {
    // Attacker should take no reflect damage regardless of shield type
    const state = new MatchState();
    addTank(state, "p1", 400, 100, 50, "force-shield");
    const attacker = addTank(state, "p2", 500, 100);
    const ctx = makeCtx(state);

    applyStepEvent(ctx, {
      kind: "shield-absorb",
      projectileId: "proj-1",
      targetId: "p1",
      hpBefore: 50,
      hpAfter: 10,
      piercedHull: 0,
      ownerId: "p2",
    }, [], "p2");

    expect(attacker.hp).toBe(100); // no reflect damage
  });
});

// ─── shield-deflect handler ──────────────────────────────────────────────────

describe("applyStepEvent — shield-deflect", () => {
  it("updates shieldHp and clears shieldId at 0", () => {
    const state = new MatchState();
    const tank = addTank(state, "p1", 400, 100, 8, "mirror");
    const ctx = makeCtx(state);

    applyStepEvent(ctx, {
      kind: "shield-deflect",
      projectileId: "proj-1",
      targetId: "p1",
      newVx: 5,
      newVy: -5,
      hpBefore: 8,
      hpAfter: 0,
      piercedHull: 0,
      ownerId: "p2",
    }, [], "p2");

    expect(tank.shieldHp).toBe(0);
    expect(tank.shieldId).toBe("");
  });

  it("applies piercedHull to hull", () => {
    const state = new MatchState();
    const tank = addTank(state, "p1", 400, 100, 20, "mirror");
    const ctx = makeCtx(state);

    applyStepEvent(ctx, {
      kind: "shield-deflect",
      projectileId: "proj-1",
      targetId: "p1",
      newVx: 5,
      newVy: -5,
      hpBefore: 20,
      hpAfter: 10,
      piercedHull: 15,
      ownerId: "p2",
    }, [], "p2");

    expect(tank.hp).toBe(85);
  });

  it("broadcasts shield-hit with deflect type", () => {
    const state = new MatchState();
    addTank(state, "p1", 400, 100, 20, "mirror");
    const ctx = makeCtx(state);

    applyStepEvent(ctx, {
      kind: "shield-deflect",
      projectileId: "proj-1",
      targetId: "p1",
      newVx: 3,
      newVy: -3,
      hpBefore: 20,
      hpAfter: 10,
      piercedHull: 0,
      ownerId: "p2",
    }, [], "p2");

    expect(ctx.broadcast).toHaveBeenCalledWith("shield-hit", {
      targetId: "p1",
      type: "deflect",
      hpBefore: 20,
      hpAfter: 10,
    });
  });
});

// ─── shield-explode handler ──────────────────────────────────────────────────

describe("applyStepEvent — shield-explode", () => {
  const dummyWeapon = {
    id: "missile",
    radius: 40,
    damage: 60,
    windImmune: false,
    price: 0,
    packSize: 1,
  };

  it("clears shieldHp and shieldId on the target tank", () => {
    const state = new MatchState();
    const tank = addTank(state, "p1", 400, 100, 50, "reactive-armor");
    addTank(state, "p2", 700, 100); // far away, no blast
    const ctx = makeCtx(state);

    applyStepEvent(ctx, {
      kind: "shield-explode",
      projectileId: "proj-1",
      targetId: "p1",
      x: 400,
      y: TERRAIN_HEIGHT - 50,
      piercedHull: 0,
      weapon: dummyWeapon,
      ownerId: "p2",
    }, [], "p2");

    expect(tank.shieldHp).toBe(0);
    expect(tank.shieldId).toBe("");
  });

  it("reactive blast damages tank at explosion center", () => {
    const state = new MatchState();
    const tank = addTank(state, "p1", 400, 100, 50, "reactive-armor");
    const ctx = makeCtx(state);

    applyStepEvent(ctx, {
      kind: "shield-explode",
      projectileId: "proj-1",
      targetId: "p1",
      x: tank.x,
      y: tank.y,
      piercedHull: 0,
      weapon: dummyWeapon,
      ownerId: "p2",
    }, [], "p2");

    // Tank was at blast center: hull damage = 40 (REACTIVE_BLAST.damage at dist=0)
    expect(tank.hp).toBe(60);
  });

  it("reactive blast does not damage tank far away (>60px)", () => {
    const state = new MatchState();
    const blastTarget = addTank(state, "p1", 400, 100, 50, "reactive-armor");
    const farTank = addTank(state, "p2", 700, 100); // 300px away
    const ctx = makeCtx(state);

    applyStepEvent(ctx, {
      kind: "shield-explode",
      projectileId: "proj-1",
      targetId: "p1",
      x: blastTarget.x,
      y: blastTarget.y,
      piercedHull: 0,
      weapon: dummyWeapon,
      ownerId: "p2",
    }, [], "p2");

    expect(farTank.hp).toBe(100); // untouched
  });

  it("applies piercedHull damage on top of blast damage", () => {
    const state = new MatchState();
    const tank = addTank(state, "p1", 400, 100, 50, "reactive-armor");
    const ctx = makeCtx(state);

    applyStepEvent(ctx, {
      kind: "shield-explode",
      projectileId: "proj-1",
      targetId: "p1",
      x: tank.x,
      y: tank.y,
      piercedHull: 10,
      weapon: dummyWeapon,
      ownerId: "p2",
    }, [], "p2");

    // blast damage 40 at center + piercedHull 10 = 50 total
    expect(tank.hp).toBe(50);
  });

  it("broadcasts explosion and shield-hit events", () => {
    const state = new MatchState();
    addTank(state, "p1", 400, 100, 50, "reactive-armor");
    const ctx = makeCtx(state);

    applyStepEvent(ctx, {
      kind: "shield-explode",
      projectileId: "proj-1",
      targetId: "p1",
      x: 400,
      y: 300,
      piercedHull: 0,
      weapon: dummyWeapon,
      ownerId: "p2",
    }, [], "p2");

    expect(ctx.broadcast).toHaveBeenCalledWith("explosion", {
      x: 400,
      y: 300,
      radius: REACTIVE_BLAST.radius,
      weaponId: "reactive-armor",
    });
    expect(ctx.broadcast).toHaveBeenCalledWith("shield-hit", {
      targetId: "p1",
      type: "explode",
    });
  });

  it("nearby tank within 60px takes blast damage", () => {
    const state = new MatchState();
    const blastTank = addTank(state, "p1", 400, 100, 50, "reactive-armor");
    const nearbyTank = addTank(state, "p2", 440, 100); // 40px away, inside radius=60
    const ctx = makeCtx(state);

    applyStepEvent(ctx, {
      kind: "shield-explode",
      projectileId: "proj-1",
      targetId: "p1",
      x: blastTank.x,
      y: blastTank.y,
      piercedHull: 0,
      weapon: dummyWeapon,
      ownerId: "p2",
    }, [], "p2");

    // nearbyTank at 40px: amount = floor(40 * (1 - 0.4*40/60)) = floor(40 * 0.7333) = floor(29.33) = 29
    expect(nearbyTank.hp).toBeLessThan(100);
    expect(nearbyTank.hp).toBeGreaterThan(0);
  });
});
