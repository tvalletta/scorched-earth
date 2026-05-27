import { describe, it, expect, vi } from "vitest";
import { MatchState, Tank } from "@se/shared";
import { handleFire, commitResolution, type ResolveContext } from "../src/rooms/resolveTurn";
import { TERRAIN_WIDTH, TERRAIN_HEIGHT } from "@se/shared";
import { simulateProjectile, BABY_MISSILE } from "@se/game";

function flatTerrain(): Int16Array {
  const t = new Int16Array(TERRAIN_WIDTH);
  t.fill(TERRAIN_HEIGHT - 50);
  return t;
}

function makeCtx(state: MatchState, terrain: Int16Array): ResolveContext {
  return {
    state,
    broadcast: vi.fn(),
    schedule: vi.fn(),
    terrain,
    onTurnReady: vi.fn(),
    startTickLoop: vi.fn(),
  };
}

function addTank(state: MatchState, id: string, x: number, hp = 100): Tank {
  const t = new Tank();
  t.playerId = id;
  t.sessionId = id;
  t.nickname = id;
  t.color = "red";
  t.alive = true;
  t.hp = hp;
  t.x = x;
  t.y = TERRAIN_HEIGHT - 50;
  t.angle = 90;
  t.power = 500;
  t.weaponId = "baby-missile";
  t.inventory.set("baby-missile", -1);
  t.inventory.set("missile", 3);
  state.tanks.set(id, t);
  return t;
}

describe("handleFire — inventory", () => {
  it("decrements finite ammo by 1", () => {
    const state = new MatchState();
    state.phase = "playing";
    state.terrainSeed = "test";
    state.gravity = 250;
    state.wind = 0;
    state.turnTimerMs = 0;
    const terrain = flatTerrain();
    addTank(state, "p1", 400);
    addTank(state, "p2", 1200);
    state.currentTurnPlayerId = "p1";
    const tank = state.tanks.get("p1")!;
    tank.weaponId = "missile";
    const ctx = makeCtx(state, terrain);
    handleFire(ctx, "p1", 90, 500);
    expect(tank.inventory.get("missile")).toBe(2);
  });

  it("does not decrement infinite ammo (-1)", () => {
    const state = new MatchState();
    state.phase = "playing";
    state.terrainSeed = "test";
    state.gravity = 250;
    state.wind = 0;
    state.turnTimerMs = 0;
    const terrain = flatTerrain();
    addTank(state, "p1", 400);
    addTank(state, "p2", 1200);
    state.currentTurnPlayerId = "p1";
    const ctx = makeCtx(state, terrain);
    handleFire(ctx, "p1", 90, 500);
    expect(state.tanks.get("p1")!.inventory.get("baby-missile")).toBe(-1);
  });
});

describe("chain kill resolution", () => {
  it("death explosion kills adjacent tank", () => {
    const state = new MatchState();
    state.phase = "resolving";
    state.terrainSeed = "test";
    state.tick = 0;
    const terrain = flatTerrain();
    const t1 = addTank(state, "p1", 400, 1);   // 1 HP — dies from any damage
    const t2 = addTank(state, "p2", 430, 5);   // 30px away, within DEATH_EXPLOSION radius=40; 5hp < 7 dmg
    state.currentTurnPlayerId = "p1";
    const result = simulateProjectile({
      weapon: BABY_MISSILE,
      origin: { x: t1.x, y: t1.y - 5 },
      angle: 90, power: 1,
      wind: 0, gravity: 250,
      terrain, terrainWidth: TERRAIN_WIDTH, terrainHeight: TERRAIN_HEIGHT,
      wallMode: "none",
      targets: [{ playerId: "p1", x: t1.x, y: t1.y, shieldHp: 0 }],
    });
    const ctx = makeCtx(state, terrain);
    commitResolution(ctx, result);
    expect(t1.alive).toBe(false);
    expect(t2.alive).toBe(false); // killed by death explosion
  });
});
