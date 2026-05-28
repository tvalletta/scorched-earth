import { MatchState, CarveOp, PendingEffect, TERRAIN_WIDTH, TERRAIN_HEIGHT, SHIELD_DEFS } from "@se/shared";
import {
  computeFallDamage, BABY_MISSILE,
  computeDamage, carveInPlace,
  type LiveProjectile, type StepTankInfo, type StepEvent,
} from "@se/game";
import { nextTurnPlayerId } from "./turnController";
import { endRound, applyDamagesWithChainKills } from "./resolveTurn";
import type { ResolveContext } from "./resolveTurn";

const PATRIOT_DETECT_RADIUS = 200;
const PATRIOT_CARVE_RADIUS = 30;

export function buildStepTanks(state: MatchState): StepTankInfo[] {
  return Array.from(state.tanks.values())
    .filter(t => t.alive)
    .map(t => {
      const def = t.shieldId ? SHIELD_DEFS.get(t.shieldId) : undefined;
      return {
        sessionId: t.sessionId,
        x: t.x,
        y: t.y,
        shieldHp: t.shieldHp,
        shieldMaxHp: t.shieldMaxHp,
        shieldRadius: def?.radius ?? 0,
        shieldType: (def?.type ?? "") as StepTankInfo["shieldType"],
      };
    });
}

export function applyStepEvent(
  ctx: ResolveContext,
  event: StepEvent,
  _liveProjectiles: LiveProjectile[],
  firingSessionId: string,
): void {
  const { state, broadcast, terrain } = ctx;

  if (event.kind === "terrain-impact") {
    const { x, y, weapon, ownerId } = event;
    const op = new CarveOp();
    op.x = Math.round(x); op.y = Math.round(y); op.radius = weapon.radius; op.tick = state.tick + 1;
    state.terrainOps.push(op);
    state.terrainVersion++;
    carveInPlace(terrain, op, { terrainHeight: TERRAIN_HEIGHT });

    const aliveBefore = new Set(Array.from(state.tanks.values()).filter(t => t.alive).map(t => t.sessionId));
    const targets = Array.from(state.tanks.values())
      .filter(t => t.alive)
      .map(t => ({ playerId: t.sessionId, x: t.x, y: t.y, shieldHp: t.shieldHp }));
    const damages = computeDamage({ x, y }, weapon, targets);
    applyDamagesWithChainKills(ctx, damages, 0);

    if (ownerId === firingSessionId) {
      const firingTank = state.tanks.get(firingSessionId);
      if (firingTank) {
        const directHull = damages.reduce((s, d) => s + d.hullDamage, 0);
        firingTank.damageDealtThisRound += directHull;
        const aliveAfter = new Set(Array.from(state.tanks.values()).filter(t => t.alive).map(t => t.sessionId));
        for (const id of aliveBefore) {
          if (!aliveAfter.has(id) && id !== firingSessionId) firingTank.killsThisRound += 1;
        }
      }
    }
    return;
  }

  if (event.kind === "leapfrog-bounce") {
    const { x, y, weapon, bounceNum } = event;
    const op = new CarveOp();
    op.x = Math.round(x); op.y = Math.round(y);
    op.radius = weapon.radius; op.tick = state.tick + 1;
    state.terrainOps.push(op);
    state.terrainVersion++;
    carveInPlace(terrain, op, { terrainHeight: TERRAIN_HEIGHT });

    const targets = Array.from(state.tanks.values()).filter(t => t.alive)
      .map(t => ({ playerId: t.sessionId, x: t.x, y: t.y, shieldHp: t.shieldHp }));
    const damages = computeDamage({ x, y }, weapon, targets);
    applyDamagesWithChainKills(ctx, damages, 0);
    broadcast("leapfrog-bounce", { x, y, bounceNum });
    return;
  }

  if (event.kind === "roller-hit") {
    const { x, y, weapon, ownerId } = event;
    const op = new CarveOp();
    op.x = Math.round(x); op.y = Math.round(y);
    op.radius = weapon.radius; op.tick = state.tick + 1;
    state.terrainOps.push(op);
    state.terrainVersion++;
    carveInPlace(terrain, op, { terrainHeight: TERRAIN_HEIGHT });
    const targets = Array.from(state.tanks.values()).filter(t => t.alive)
      .map(t => ({ playerId: t.sessionId, x: t.x, y: t.y, shieldHp: t.shieldHp }));
    const damages = computeDamage({ x, y }, weapon, targets);
    applyDamagesWithChainKills(ctx, damages, 0);
    broadcast("roller-hit", { x, y, ownerId });
    return;
  }

  if (event.kind === "shield-absorb") {
    const tank = state.tanks.get(event.targetId);
    if (tank) {
      // Capture shieldId before possibly clearing it
      const shieldId = tank.shieldId;
      tank.shieldHp = event.hpAfter;
      if (tank.shieldHp <= 0) tank.shieldId = "";

      // Overflow hull damage
      if (event.overflow > 0) {
        tank.hp = Math.max(0, tank.hp - event.overflow);
        if (tank.hp <= 0) tank.alive = false;
      }

      // Force Shield: reflect 25% of absorbed damage back to attacker
      const def = SHIELD_DEFS.get(shieldId);
      if (def?.reflectFraction && event.absorbed > 0) {
        const attacker = state.tanks.get(event.ownerId);
        if (attacker?.alive) {
          attacker.hp = Math.max(0, attacker.hp - Math.floor(event.absorbed * def.reflectFraction));
          if (attacker.hp <= 0) attacker.alive = false;
        }
      }
    }
    broadcast("shield-hit", {
      targetId: event.targetId, type: "absorb",
      hpBefore: event.hpBefore, hpAfter: event.hpAfter,
    });
    return;
  }

  if (event.kind === "shield-bend") {
    broadcast("shield-hit", { targetId: event.targetId, type: "bend" });
    return;
  }

  if (event.kind === "patriot-intercept") {
    const op = new CarveOp();
    op.x = Math.round(event.x); op.y = Math.round(event.y); op.radius = PATRIOT_CARVE_RADIUS; op.tick = state.tick + 1;
    state.terrainOps.push(op); state.terrainVersion++;
    carveInPlace(terrain, op, { terrainHeight: TERRAIN_HEIGHT });
    broadcast("patriot-intercept", { patriotId: event.patriotId, targetId: event.targetId, x: event.x, y: event.y });
    return;
  }

  if (event.kind === "plasma-wave") {
    const WAVE_REACH = 400;
    const targets = Array.from(state.tanks.values()).filter(t => t.alive)
      .map(t => ({ playerId: t.sessionId, x: t.x, y: t.y, shieldHp: t.shieldHp }));
    const waveTargets = targets.filter(t => Math.abs(t.x - event.x) <= WAVE_REACH);
    if (waveTargets.length > 0) {
      const aliveBefore = new Set(waveTargets.map(t => t.playerId));
      const damages = computeDamage({ x: event.x, y: event.y }, event.weapon, waveTargets);
      applyDamagesWithChainKills(ctx, damages, 0);

      // Credit kills to the firing tank
      const firingTank = state.tanks.get(event.ownerId);
      if (firingTank) {
        const directHull = damages.reduce((s, d) => s + d.hullDamage, 0);
        firingTank.damageDealtThisRound += directHull;
        const aliveAfter = new Set(Array.from(state.tanks.values()).filter(t => t.alive).map(t => t.sessionId));
        for (const id of aliveBefore) {
          if (!aliveAfter.has(id) && id !== event.ownerId) firingTank.killsThisRound += 1;
        }
      }
    }
    broadcast("plasma-wave", { x: event.x, y: event.y });
    return;
  }

  if (event.kind === "tracer-complete") {
    broadcast("tracer-path", { path: event.path, ownerId: event.ownerId });
    return;
  }

  if (event.kind === "terrain-deposit") {
    const { centerX, shape } = event;
    const half = shape.halfWidth;
    for (let col = Math.max(0, Math.round(centerX - half));
             col <= Math.min(TERRAIN_WIDTH - 1, Math.round(centerX + half)); col++) {
      const fraction = shape.spray ? Math.max(0, 1 - Math.abs(col - centerX) / half) : 1;
      const raise = Math.round(shape.height * fraction);
      // Lower Y value = higher terrain (screen coords); clamp to 0
      terrain[col] = Math.max(0, (terrain[col] ?? 0) - raise);
    }
    state.terrainVersion++;
    broadcast("terrain-deposited", { centerX, shape });
    return;
  }

  if (event.kind === "burrow-complete") {
    const TUNNEL_HALF = 10; // 20px wide total
    const x = Math.round(event.x);
    for (let col = Math.max(0, x - TUNNEL_HALF);
             col <= Math.min(TERRAIN_WIDTH - 1, x + TUNNEL_HALF); col++) {
      terrain[col] = TERRAIN_HEIGHT; // carve to bottom
    }
    state.terrainVersion++;
    // Tunneler: explode at tunnel bottom if weapon has damage
    if (event.weapon.damage > 0) {
      const targets = Array.from(state.tanks.values()).filter(t => t.alive)
        .map(t => ({ playerId: t.sessionId, x: t.x, y: t.y, shieldHp: t.shieldHp }));
      const damages = computeDamage({ x: event.x, y: TERRAIN_HEIGHT - 10 }, event.weapon, targets);
      applyDamagesWithChainKills(ctx, damages, 0);
    }
    broadcast("burrow-complete", { x: event.x, tunnelTopY: event.tunnelTopY });
    return;
  }

  if (event.kind === "burn-deployed") {
    const e = new PendingEffect();
    e.kind = "burn-zone"; e.x = event.x; e.width = event.width;
    e.damage = event.damage; e.turnsLeft = event.turnsLeft;
    state.pendingEffects.push(e);
    broadcast("burn-zone-start", { x: event.x, width: event.width, turnsLeft: event.turnsLeft });
    return;
  }

  if (event.kind === "smoke-deployed") {
    const e = new PendingEffect();
    e.kind = "smoke-zone"; e.x = event.x; e.width = event.width;
    e.damage = 0; e.turnsLeft = event.turnsLeft;
    state.pendingEffects.push(e);
    broadcast("smoke-zone-start", { x: event.x, width: event.width, turnsLeft: event.turnsLeft });
    return;
  }
}

export function checkPatriotTriggers(
  ctx: ResolveContext,
  liveProjectiles: LiveProjectile[],
): LiveProjectile[] {
  const { state, broadcast } = ctx;
  const newPatriots: LiveProjectile[] = [];
  const activePatriotOwners = new Set(liveProjectiles.filter(p => p.isPatriot).map(p => p.ownerId));

  for (const tank of state.tanks.values()) {
    if (!tank.alive) continue;
    if (activePatriotOwners.has(tank.sessionId)) continue;
    const count = tank.inventory.get("patriot") ?? 0;
    if (count <= 0) continue;

    for (const p of liveProjectiles) {
      if (p.isPatriot) continue;
      if (p.ownerId === tank.sessionId) continue;
      const dx = p.x - tank.x;
      const dy = p.y - tank.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < PATRIOT_DETECT_RADIUS) {
        tank.inventory.set("patriot", count - 1);
        const patriotId = `patriot-${tank.sessionId}-${Date.now()}`;
        newPatriots.push({
          id: patriotId,
          x: tank.x, y: tank.y - 10,
          vx: 0, vy: -100,
          weapon: BABY_MISSILE,
          ownerId: tank.sessionId,
          apexReached: false,
          isPatriot: true,
          targetId: p.id,
        });
        broadcast("patriot-launched", { ownerId: tank.sessionId, patriotId, targetProjectileId: p.id });
        break;
      }
    }
  }

  return newPatriots;
}

export function applyFallDamage(ctx: ResolveContext): void {
  const { state, terrain, broadcast } = ctx;
  for (const tank of state.tanks.values()) {
    if (!tank.alive) continue;
    const x = Math.max(0, Math.min(TERRAIN_WIDTH - 1, Math.round(tank.x)));
    const surfaceY = terrain[x] ?? 0;
    if (surfaceY <= tank.y) continue;
    const fromY = tank.y;
    const hasParachute = (tank.inventory.get("parachute") ?? 0) > 0;
    const { damage, parachuteConsumed } = computeFallDamage({
      sessionId: tank.sessionId, tankY: tank.y, surfaceY, hasParachute,
    });
    if (parachuteConsumed) tank.inventory.set("parachute", (tank.inventory.get("parachute") ?? 1) - 1);
    tank.y = surfaceY;
    if (damage > 0) {
      tank.hp = Math.max(0, tank.hp - damage);
      if (tank.hp <= 0) tank.alive = false;
    }
    broadcast("tank-fell", {
      sessionId: tank.sessionId, fromY, toY: surfaceY,
      fallDistance: surfaceY - fromY, damage, parachuteUsed: parachuteConsumed,
    });
  }
}

export function commitTurnEnd(ctx: ResolveContext): void {
  const { state } = ctx;
  state.tick++;
  const alive = Array.from(state.tanks.values()).filter(t => t.alive);
  if (alive.length <= 1) {
    endRound(ctx, alive[0]?.sessionId ?? "");
    return;
  }
  const next = nextTurnPlayerId(Array.from(state.tanks.values()), state.currentTurnPlayerId);
  state.currentTurnPlayerId = next;
  state.phase = "playing";
  state.turnDeadlineMs = Date.now() + state.turnTimerMs;
  ctx.onTurnReady?.();
}
