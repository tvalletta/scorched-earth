import {
  MatchState, CarveOp,
  POST_PLAYBACK_BUFFER_MS,
  TERRAIN_WIDTH, TERRAIN_HEIGHT,
  clampAngle, clampPower,
} from "@se/shared";
import {
  simulateProjectile,
  generateTerrain,
  carveInPlace,
  BABY_MISSILE,
  type TargetInfo,
  type TrajectoryResult,
} from "@se/game";
import { nextTurnPlayerId } from "./turnController";

export interface ResolveContext {
  state: MatchState;
  broadcast: (event: string, payload: unknown) => void;
  schedule: (delayMs: number, fn: () => void) => void;
  terrain: Int16Array;
}

export function buildTerrainFromState(state: MatchState): Int16Array {
  const terrain = generateTerrain({
    seed: state.terrainSeed,
    type: "random",
    width: TERRAIN_WIDTH,
    height: TERRAIN_HEIGHT,
  });
  for (const op of state.terrainOps) {
    carveInPlace(
      terrain,
      { x: op.x, y: op.y, radius: op.radius, tick: op.tick },
      { terrainHeight: TERRAIN_HEIGHT },
    );
  }
  return terrain;
}

export function handleFire(
  ctx: ResolveContext,
  sessionId: string,
  rawAngle: number,
  rawPower: number,
): void {
  const { state, broadcast, schedule, terrain } = ctx;
  if (state.phase !== "playing") return;
  if (state.currentTurnPlayerId !== sessionId) return;

  const tank = state.tanks.get(sessionId);
  if (!tank || !tank.alive) return;

  const angle = clampAngle(Number(rawAngle));
  const power = clampPower(Number(rawPower));
  tank.angle = angle;
  tank.power = power;

  state.phase = "resolving";

  const targets: TargetInfo[] = Array.from(state.tanks.values())
    .filter((t) => t.alive && t.sessionId !== sessionId)
    .map((t) => ({ playerId: t.sessionId, x: t.x, y: t.y, shieldHp: 0 }));

  const result = simulateProjectile({
    weapon: BABY_MISSILE,
    origin: { x: tank.x, y: tank.y - 5 },
    angle, power,
    wind: state.wind,
    gravity: state.gravity,
    terrain,
    terrainWidth: TERRAIN_WIDTH,
    terrainHeight: TERRAIN_HEIGHT,
    walls: "none",
    targets,
  });

  broadcast("trajectory-resolved", {
    samples: result.samples,
    impact: result.impact,
    weaponId: BABY_MISSILE.id,
    ownerId: sessionId,
    durationMs: result.durationMs,
  });

  schedule(result.durationMs + POST_PLAYBACK_BUFFER_MS, () => {
    commitResolution(ctx, result);
  });
}

function commitResolution(ctx: ResolveContext, result: TrajectoryResult): void {
  const { state, broadcast, terrain } = ctx;

  if (result.carveOp) {
    const op = new CarveOp();
    op.x = result.carveOp.x;
    op.y = result.carveOp.y;
    op.radius = result.carveOp.radius;
    op.tick = state.tick + 1;
    state.terrainOps.push(op);
    state.terrainVersion++;
    carveInPlace(
      terrain,
      { x: op.x, y: op.y, radius: op.radius, tick: op.tick },
      { terrainHeight: TERRAIN_HEIGHT },
    );
  }

  if (result.damages.length > 0) {
    const events: Array<{ playerId: string; before: number; after: number }> = [];
    for (const d of result.damages) {
      const t = state.tanks.get(d.playerId);
      if (!t || !t.alive) continue;
      const before = t.hp;
      t.hp = Math.max(0, t.hp - d.hullDamage);
      events.push({ playerId: d.playerId, before, after: t.hp });
      if (t.hp <= 0) t.alive = false;
    }
    broadcast("damage-applied", { damages: events });
  }

  for (const t of state.tanks.values()) {
    if (!t.alive) continue;
    const x = Math.max(0, Math.min(TERRAIN_WIDTH - 1, Math.round(t.x)));
    const surface = terrain[x] ?? 0;
    if (t.y < surface) t.y = surface;
  }

  state.tick++;

  const alive = Array.from(state.tanks.values()).filter((t) => t.alive);
  if (alive.length <= 1) {
    state.phase = "ended";
    state.winnerId = alive[0]?.sessionId ?? "";
    broadcast("match-end", { winnerId: state.winnerId });
    return;
  }

  const next = nextTurnPlayerId(
    Array.from(state.tanks.values()),
    state.currentTurnPlayerId,
  );
  state.currentTurnPlayerId = next;
  state.phase = "playing";
  state.turnDeadlineMs = Date.now() + state.turnTimerMs;
}
