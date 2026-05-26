import {
  MatchState, CarveOp,
  POST_PLAYBACK_BUFFER_MS,
  ROUND_SUMMARY_DURATION_MS,
  TERRAIN_WIDTH, TERRAIN_HEIGHT,
  clampAngle, clampPower,
} from "@se/shared";
import {
  simulateProjectile,
  generateTerrain,
  carveInPlace,
  BABY_MISSILE,
  WEAPON_REGISTRY,
  DEATH_EXPLOSION,
  computeDamage,
  computeRoundEarnings,
  type TargetInfo,
  type TrajectoryResult,
  type WeaponDef,
  type DamageEntry,
} from "@se/game";
import { nextTurnPlayerId } from "./turnController";

export interface ResolveContext {
  state: MatchState;
  broadcast: (event: string, payload: unknown) => void;
  schedule: (delayMs: number, fn: () => void) => void;
  terrain: Int16Array;
  onTurnReady?: () => void;
  onRoundEnd?: () => void;
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

  const currentCount = tank.inventory.get(tank.weaponId) ?? -1;
  if (currentCount > 0) {
    tank.inventory.set(tank.weaponId, currentCount - 1);
  } else if (currentCount === 0) {
    // Depleted — guard; select-weapon should prevent this
    tank.weaponId = "baby-missile";
  }
  // Resolve weapon AFTER potential reset
  const weaponDef: WeaponDef = WEAPON_REGISTRY.get(tank.weaponId) ?? BABY_MISSILE;

  const targets: TargetInfo[] = Array.from(state.tanks.values())
    .filter((t) => t.alive && t.sessionId !== sessionId)
    .map((t) => ({ playerId: t.sessionId, x: t.x, y: t.y, shieldHp: 0 }));

  const result = simulateProjectile({
    weapon: weaponDef,
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

  const totalDuration = calcTotalDuration(result);

  broadcast("trajectory-resolved", {
    samples: result.samples,
    splitAt: result.splitAt ?? null,
    children: (result.children ?? []).map((c) => ({
      samples: c.samples,
      impact: c.impact,
      durationMs: c.durationMs,
      weaponId: weaponDef.split?.child.id ?? weaponDef.id,
    })),
    impact: result.impact,
    weaponId: weaponDef.id,
    ownerId: sessionId,
    durationMs: totalDuration,
  });

  schedule(totalDuration + POST_PLAYBACK_BUFFER_MS, () => {
    commitResolution(ctx, result, sessionId);
  });
}

function calcTotalDuration(result: TrajectoryResult): number {
  if (!result.children?.length) return result.durationMs;
  const splitTime = result.splitAt?.t ?? 0;
  return splitTime + Math.max(...result.children.map(calcTotalDuration));
}

function collectLeafDamages(result: TrajectoryResult): DamageEntry[] {
  if (!result.children?.length) return result.damages;
  return result.children.flatMap(collectLeafDamages);
}

function applyAllCarves(ctx: ResolveContext, result: TrajectoryResult): void {
  if (result.carveOp) {
    const { state, terrain } = ctx;
    const op = new CarveOp();
    op.x = result.carveOp.x;
    op.y = result.carveOp.y;
    op.radius = result.carveOp.radius;
    op.tick = state.tick + 1;
    state.terrainOps.push(op);
    state.terrainVersion++;
    carveInPlace(terrain, op, { terrainHeight: TERRAIN_HEIGHT });
  }
  for (const child of result.children ?? []) {
    applyAllCarves(ctx, child);
  }
}

// Exported for testing
export function applyDamagesWithChainKills(
  ctx: ResolveContext,
  damages: DamageEntry[],
  depth: number,
): void {
  if (depth >= 10 || damages.length === 0) return;
  const { state, broadcast } = ctx;
  const events: Array<{ playerId: string; before: number; after: number }> = [];
  const newlyDeadPositions: Array<{ x: number; y: number }> = [];

  for (const d of damages) {
    const t = state.tanks.get(d.playerId);
    if (!t || !t.alive) continue;
    const before = t.hp;
    t.hp = Math.max(0, t.hp - d.hullDamage);
    events.push({ playerId: d.playerId, before, after: t.hp });
    if (t.hp <= 0) {
      t.alive = false;
      newlyDeadPositions.push({ x: t.x, y: t.y });
    }
  }

  if (events.length > 0) {
    broadcast("damage-applied", { damages: events, wave: depth });
  }

  for (const pos of newlyDeadPositions) {
    const deathDamages = computeDamage(
      pos,
      DEATH_EXPLOSION,
      Array.from(state.tanks.values())
        .filter((t) => t.alive)
        .map((t) => ({ playerId: t.sessionId, x: t.x, y: t.y, shieldHp: 0 })),
    );
    applyDamagesWithChainKills(ctx, deathDamages, depth + 1);
  }
}

export function commitResolution(
  ctx: ResolveContext,
  result: TrajectoryResult,
  firingSessionId?: string,
): void {
  const { state, terrain } = ctx;

  // Snapshot alive set before applying damage (to count kills)
  const aliveBefore = new Set(
    Array.from(state.tanks.values()).filter((t) => t.alive).map((t) => t.sessionId),
  );

  applyAllCarves(ctx, result);

  const allDamages = collectLeafDamages(result);
  applyDamagesWithChainKills(ctx, allDamages, 0);

  // Credit damage dealt and kills to the firing tank
  if (firingSessionId) {
    const firingTank = state.tanks.get(firingSessionId);
    if (firingTank) {
      const directHullDamage = allDamages.reduce((sum, d) => sum + d.hullDamage, 0);
      firingTank.damageDealtThisRound += directHullDamage;

      const aliveAfter = new Set(
        Array.from(state.tanks.values()).filter((t) => t.alive).map((t) => t.sessionId),
      );
      for (const id of aliveBefore) {
        if (!aliveAfter.has(id) && id !== firingSessionId) {
          firingTank.killsThisRound += 1;
        }
      }
    }
  }

  // Settle alive tanks on terrain
  for (const t of state.tanks.values()) {
    if (!t.alive) continue;
    const x = Math.max(0, Math.min(TERRAIN_WIDTH - 1, Math.round(t.x)));
    const surface = terrain[x] ?? 0;
    if (t.y < surface) t.y = surface;
  }

  state.tick++;

  const alive = Array.from(state.tanks.values()).filter((t) => t.alive);
  if (alive.length <= 1) {
    endRound(ctx, alive[0]?.sessionId ?? "");
    return;
  }

  const next = nextTurnPlayerId(
    Array.from(state.tanks.values()),
    state.currentTurnPlayerId,
  );
  state.currentTurnPlayerId = next;
  state.phase = "playing";
  state.turnDeadlineMs = Date.now() + state.turnTimerMs;
  ctx.onTurnReady?.();
}

export function endRound(ctx: ResolveContext, roundWinnerId: string): void {
  const { state, broadcast } = ctx;

  // Compute rank before this round (by roundsWon desc, then cash desc)
  const rankBefore = computeRanks(state);

  // Award rounds won
  if (roundWinnerId) {
    state.roundsWon.set(
      roundWinnerId,
      (state.roundsWon.get(roundWinnerId) ?? 0) + 1,
    );
  }

  // Compute earnings once per tank, award cash, accumulate totals
  const earningsMap = new Map<string, ReturnType<typeof computeRoundEarnings>>();
  for (const tank of state.tanks.values()) {
    const earnings = computeRoundEarnings(
      tank.damageDealtThisRound,
      tank.killsThisRound,
      tank.alive,
    );
    earningsMap.set(tank.sessionId, earnings);
    tank.cash += earnings.total;
    tank.totalDamageDealt += tank.damageDealtThisRound;
    tank.totalKills += tank.killsThisRound;
  }

  // Compute rank after
  const rankAfter = computeRanks(state);

  // Build summary payload (earnings breakdown included for ShopScene)
  const players = Array.from(state.tanks.values()).map((tank) => {
    const e = earningsMap.get(tank.sessionId)!;
    return {
      sessionId: tank.sessionId,
      nickname: tank.nickname,
      damageDealt: tank.damageDealtThisRound,
      kills: tank.killsThisRound,
      survived: tank.alive,
      earned: e.total,
      damageReward: e.damageReward,
      killReward: e.killReward,
      survivalBonus: e.survivalBonus,
      totalCash: tank.cash,
      roundsWon: state.roundsWon.get(tank.sessionId) ?? 0,
      previousRank: rankBefore.get(tank.sessionId) ?? 1,
      newRank: rankAfter.get(tank.sessionId) ?? 1,
    };
  });

  broadcast("round-summary", {
    round: state.round,
    maxRounds: state.maxRounds,
    roundWinnerId,
    players,
  });

  state.phase = "round-summary";
  state.summaryDeadlineMs = Date.now() + ROUND_SUMMARY_DURATION_MS;

  ctx.onRoundEnd?.();
}

function computeRanks(state: MatchState): Map<string, number> {
  const entries = Array.from(state.tanks.values()).map((t) => ({
    sessionId: t.sessionId,
    roundsWon: state.roundsWon.get(t.sessionId) ?? 0,
    cash: t.cash,
  }));
  entries.sort((a, b) =>
    b.roundsWon !== a.roundsWon ? b.roundsWon - a.roundsWon : b.cash - a.cash,
  );
  const ranks = new Map<string, number>();
  entries.forEach((e, i) => ranks.set(e.sessionId, i + 1));
  return ranks;
}
