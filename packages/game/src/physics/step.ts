import type { LiveProjectile, StepInput, StepResult, StepEvent } from "../types";
import { PLAY_CEILING_Y, PLAY_FLOOR_MARGIN, MAGNETIC_FORCE_CONST, MAGNETIC_DRAIN_HP_PER_SEC } from "@se/shared";

const WIND_ACCEL_SCALE = 5.0;
const ROLLER_SPEED = 200; // px/s
const TANK_HIT_RADIUS = 18; // hull half-width for direct-hit detection (px)

/** Squared distance from point P to line segment AB. */
function pointToSegmentDistSq(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const abx = bx - ax, aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) {
    // Degenerate segment — just measure to point A
    const dx = px - ax, dy = py - ay;
    return dx * dx + dy * dy;
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
  const cx = ax + t * abx, cy = ay + t * aby;
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy;
}

export function initialVelocityFromAnglePower(angle: number, power: number): { vx: number; vy: number } {
  const a = (angle * Math.PI) / 180;
  return { vx: -Math.cos(a) * power, vy: -Math.sin(a) * power };
}

function heightAt(terrain: Int16Array, x: number): number {
  const i = Math.floor(x);
  if (i < 0 || i >= terrain.length) return Number.POSITIVE_INFINITY;
  return terrain[i] as number;
}

function spawnMirvChildren(parent: LiveProjectile, x: number, y: number): LiveProjectile[] {
  const split = parent.weapon.split;
  if (!split) return [];
  const children: LiveProjectile[] = [];
  const LIFT = 60; // small constant upward lift so the flat fan arcs before raining down
  for (let i = 0; i < split.count; i++) {
    let ejVx: number;
    let ejVy: number;
    if (split.spreadDeg >= 360) {
      // Full ring (kept for any weapon that wants an all-directions burst).
      const rad = (i * (360 / split.count) * Math.PI) / 180;
      ejVx = Math.cos(rad) * split.ejectionSpeed + (split.inheritVelocity ? parent.vx : 0);
      ejVy = Math.sin(rad) * split.ejectionSpeed + (split.inheritVelocity ? parent.vy : 0);
    } else {
      // Flat horizontal fan: vx spread evenly across [-speed .. +speed], slight lift.
      const frac = split.count === 1 ? 0.5 : i / (split.count - 1);
      ejVx = (-1 + 2 * frac) * split.ejectionSpeed + (split.inheritVelocity ? parent.vx : 0);
      ejVy = -LIFT + (split.inheritVelocity ? parent.vy * 0.3 : 0);
    }
    children.push({
      id: `${parent.id}-child-${i}`,
      x, y,
      vx: ejVx, vy: ejVy,
      weapon: split.child,
      ownerId: parent.ownerId,
      apexReached: false,
    });
  }
  return children;
}

export function stepProjectiles(input: StepInput): StepResult {
  const { projectiles, tanks, terrain, terrainWidth, terrainHeight, wind, gravity, dt, wallMode } = input;
  const SOFT_BOTTOM = terrainHeight + PLAY_FLOOR_MARGIN;

  const survivors: LiveProjectile[] = [];
  const spawned: LiveProjectile[] = [];
  const events: StepEvent[] = [];
  const shieldDrains: Array<{ sessionId: string; hpDrain: number }> = [];
  const intercepted = new Set<string>();

  for (const p of projectiles) {
    // 0. Rolling projectile — surface-hugging movement (skip normal physics)
    if (p.isRolling) {
      const rollerDir = p.rollDir ?? 1;
      p.x += rollerDir * ROLLER_SPEED * dt;
      const rollerSurfaceY = heightAt(terrain, p.x);
      p.y = rollerSurfaceY;

      // Out of bounds
      if (p.x < 0 || p.x >= terrainWidth) {
        events.push({ kind: "out-of-bounds", projectileId: p.id });
        continue;
      }

      // Check tank collision
      let hitTank = false;
      for (const tank of tanks) {
        const dx = p.x - tank.x;
        const dy = p.y - tank.y;
        if (Math.sqrt(dx * dx + dy * dy) < p.weapon.radius + 10) {
          events.push({ kind: "roller-hit", projectileId: p.id, x: p.x, y: p.y, weapon: p.weapon, ownerId: p.ownerId });
          hitTank = true;
          break;
        }
      }
      if (!hitTank) survivors.push(p);
      continue; // skip normal physics for rolling projectile
    }

    // 1. Apply physics — capture prevVy/prevX/prevY before integration
    // Accelerations are per-second (scaled by dt); velocities are per-tick (applied directly)
    const prevVy = p.vy;
    const prevX = p.x;
    const prevY = p.y;
    const windAccel = p.weapon.windImmune ? 0 : wind * WIND_ACCEL_SCALE;
    p.vx += windAccel * dt;
    p.vy += gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // 2 & 3. Patriot homing + intercept
    if (p.isPatriot) {
      const target = projectiles.find(t => t.id === p.targetId && !t.isPatriot);
      if (!target) continue; // target gone — remove patriot

      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 15) {
        events.push({ kind: "patriot-intercept", patriotId: p.id, targetId: target.id, x: p.x, y: p.y });
        intercepted.add(target.id);
        continue; // patriot consumed
      }

      const speed = 600; // px/s
      p.vx = (dx / dist) * speed;
      p.vy = (dy / dist) * speed;
      survivors.push(p);
      continue;
    }

    // 3. MIRV apex split
    if (p.weapon.split && p.weapon.split.trigger === "apex" && !p.apexReached) {
      if (prevVy < 0 && p.vy >= 0) {
        p.apexReached = true;
        const children = spawnMirvChildren(p, p.x, p.y);
        spawned.push(...children);
        events.push({ kind: "mirv-split", projectileId: p.id, x: p.x, y: p.y, children });
        continue; // parent consumed
      }
    }

    // 4. Out-of-bounds — top/soft-bottom always remove; left/right use wallMode
    if (p.y < PLAY_CEILING_Y) {
      events.push({ kind: "out-of-bounds", projectileId: p.id });
      continue;
    }
    if (p.y > SOFT_BOTTOM) {
      events.push({ kind: "out-of-bounds", projectileId: p.id });
      continue;
    }
    if (p.x < 0 || p.x >= terrainWidth) {
      if (wallMode === "wrap") {
        p.x = ((p.x % terrainWidth) + terrainWidth) % terrainWidth;
        // projectile continues — fall through to terrain/shield checks
      } else if (wallMode === "reflect") {
        p.vx = -p.vx;
        p.x = p.x < 0 ? 0 : terrainWidth - 1;
        // projectile continues
      } else if (wallMode === "absorb") {
        const edgeX = p.x < 0 ? 0 : terrainWidth - 1;
        events.push({ kind: "terrain-impact", projectileId: p.id,
                      x: edgeX, y: p.y, weapon: p.weapon, ownerId: p.ownerId });
        continue;
      } else {
        // "none" and any unknown mode — remove projectile
        events.push({ kind: "out-of-bounds", projectileId: p.id });
        continue;
      }
    }

    // 5. Shield check (May-26 model: absorb/deflect/bend/explode + universal pierce)
    let shielded = false;
    let deflectedBySessionId: string | undefined;
    for (const tank of tanks) {
      if (tank.sessionId === p.ownerId) continue; // owner's own shield never blocks
      if (tank.shieldHp <= 0) continue;
      if (!tank.shieldType) continue;
      const dx = p.x - tank.x;
      const dy = p.y - tank.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= tank.shieldRadius) continue;

      const nx = dist > 1e-6 ? dx / dist : 1;
      const ny = dist > 1e-6 ? dy / dist : 0;

      const pierce = p.weapon.shieldPierce ?? 0;
      const piercedHull = p.weapon.damage * pierce;
      const shieldedDamage = p.weapon.damage * (1 - pierce);

      if (tank.shieldType === "absorb") {
        const hpBefore = tank.shieldHp;
        const hpAfter = Math.max(0, hpBefore - shieldedDamage * tank.hpCostFraction);
        tank.shieldHp = hpAfter;
        events.push({ kind: "shield-absorb", projectileId: p.id, targetId: tank.sessionId, hpBefore, hpAfter, piercedHull, ownerId: p.ownerId });
        shielded = true;
        break;
      }
      if (tank.shieldType === "deflect") {
        // Incoming-only guard: dot product of velocity with outward normal.
        // nx/ny points from tank center toward projectile (outward), so a
        // projectile moving toward the shield has dot < 0.  If dot >= 0 the
        // projectile is already moving away — skip to avoid oscillation.
        const dot = p.vx * nx + p.vy * ny;
        if (dot >= 0) continue;
        const hpBefore = tank.shieldHp;
        const hpAfter = Math.max(0, hpBefore - shieldedDamage * tank.hpCostFraction);
        tank.shieldHp = hpAfter;
        p.vx = p.vx - 2 * dot * nx;
        p.vy = p.vy - 2 * dot * ny;
        deflectedBySessionId = tank.sessionId;
        events.push({ kind: "shield-deflect", projectileId: p.id, targetId: tank.sessionId, newVx: p.vx, newVy: p.vy, hpBefore, hpAfter, piercedHull, ownerId: p.ownerId });
        break;
      }
      if (tank.shieldType === "explode") {
        events.push({ kind: "shield-explode", projectileId: p.id, targetId: tank.sessionId, x: p.x, y: p.y, piercedHull, weapon: p.weapon, ownerId: p.ownerId });
        tank.shieldHp = 0;
        shielded = true;
        break;
      }
      if (tank.shieldType === "bend") {
        const strength = MAGNETIC_FORCE_CONST / Math.max(1, dist * dist);
        const impulseX = nx * strength * dt;
        const impulseY = ny * strength * dt;
        p.vx += impulseX;
        p.vy += impulseY;
        events.push({ kind: "shield-bend", projectileId: p.id, targetId: tank.sessionId, impulseX, impulseY });
        const existing = shieldDrains.find(d => d.sessionId === tank.sessionId);
        if (existing) existing.hpDrain = Math.max(existing.hpDrain, MAGNETIC_DRAIN_HP_PER_SEC * dt);
        else shieldDrains.push({ sessionId: tank.sessionId, hpDrain: MAGNETIC_DRAIN_HP_PER_SEC * dt });
        break;
      }
    }

    if (shielded) continue;

    // 5b. Hull collision — "normal" projectiles explode on direct tank contact.
    // Only applies to weapons without special impact mechanics.
    const isNormalImpact =
      !p.weapon.rollOnImpact &&
      !p.weapon.plasmaWave &&
      !p.weapon.tracerMode &&
      !p.weapon.terrainDeposit &&
      !p.weapon.burrow &&
      p.weapon.leapCount === undefined;

    if (isNormalImpact) {
      // Update arming: snapshot armed state before potentially arming this tick.
      // The hull check uses the pre-update armed flag so that a shell that JUST left
      // the owner's hull this tick doesn't immediately re-hit the owner on the same tick.
      const wasArmed = p.armed ?? false;
      if (!p.armed) {
        for (const tank of tanks) {
          if (tank.sessionId !== p.ownerId) continue;
          const dx = p.x - tank.x;
          const dy = p.y - tank.y;
          if (Math.sqrt(dx * dx + dy * dy) > TANK_HIT_RADIUS + 4) {
            p.armed = true;
          }
          break;
        }
      }

      // Swept hull check using point-to-segment distance.
      // For the owner: only collide if it was ALREADY armed before this tick.
      // Skip the tank that deflected this projectile this tick (prevent instant re-hit).
      let hullHit = false;
      for (const tank of tanks) {
        if (tank.sessionId === p.ownerId && !wasArmed) continue;
        if (deflectedBySessionId && tank.sessionId === deflectedBySessionId) continue;
        const distSq = pointToSegmentDistSq(tank.x, tank.y, prevX, prevY, p.x, p.y);
        if (distSq < TANK_HIT_RADIUS * TANK_HIT_RADIUS) {
          events.push({ kind: "terrain-impact", projectileId: p.id, x: p.x, y: p.y, weapon: p.weapon, ownerId: p.ownerId });
          hullHit = true;
          break;
        }
      }
      if (hullHit) continue;
    }

    // 5c. Cave ceiling collision (dual-heightmap; solid for y <= ceiling[x])
    if (input.ceiling) {
      const ci = Math.max(0, Math.min(input.ceiling.length - 1, Math.floor(p.x)));
      if (p.y <= (input.ceiling[ci] as number)) {
        events.push({ kind: "terrain-impact", projectileId: p.id, x: p.x, y: p.y, weapon: p.weapon, ownerId: p.ownerId, layer: "ceiling" });
        continue;
      }
    }

    // 6. Terrain collision
    const surfaceY = heightAt(terrain, p.x);
    if (p.y >= surfaceY) {
      // Leapfrog bounce: reflect and decay up to leapCount times before final impact
      if (p.weapon.leapCount !== undefined && (p.bounceCount ?? 0) < p.weapon.leapCount) {
        p.vx *= 0.7;
        p.vy = -Math.abs(p.vy) * 0.7;
        const bounceNum = (p.bounceCount ?? 0) + 1;
        p.bounceCount = bounceNum;
        p.y = surfaceY - 1; // push above terrain
        events.push({ kind: "leapfrog-bounce", projectileId: p.id, x: p.x, y: surfaceY,
                      weapon: p.weapon, bounceNum, ownerId: p.ownerId });
        survivors.push(p);
        continue; // keep projectile alive, skip terrain-impact
      }
      // Roller: convert to surface-rolling on first terrain hit
      if (p.weapon.rollOnImpact && !p.isRolling) {
        p.isRolling = true;
        p.rollDir = p.vx >= 0 ? 1 : -1;
        p.vx = p.rollDir * ROLLER_SPEED;
        p.vy = 0;
        p.y = surfaceY; // snap to surface
        survivors.push(p);
        continue; // don't emit terrain-impact
      }

      // Plasma Wave: horizontal sweep on impact — emit plasma-wave instead of terrain-impact
      if (p.weapon.plasmaWave) {
        events.push({ kind: "plasma-wave", projectileId: p.id, x: p.x, y: surfaceY, weapon: p.weapon, ownerId: p.ownerId });
        continue;
      }

      // Tracer: emit path complete, no carve, no damage
      if (p.weapon.tracerMode) {
        events.push({ kind: "tracer-complete", projectileId: p.id,
                      path: [{ x: p.x, y: p.y, t: 0 }], ownerId: p.ownerId });
        continue;
      }

      // Terrain deposit (Dirt weapons): raise heightmap, no damage
      if (p.weapon.terrainDeposit) {
        events.push({ kind: "terrain-deposit", projectileId: p.id,
                      centerX: p.x, shape: p.weapon.terrainDeposit, ownerId: p.ownerId });
        continue;
      }

      // Burrow (Sandhog/Tunneler): carve tunnel to bottom
      if (p.weapon.burrow) {
        events.push({ kind: "burrow-complete", projectileId: p.id, x: p.x,
                      tunnelTopY: surfaceY, tunnelBottomY: terrainHeight,
                      weapon: p.weapon, ownerId: p.ownerId });
        continue;
      }

      // Ground-trigger MIRV split (e.g. FUNKY_BOMB): spawn children on terrain contact
      if (p.weapon.split && p.weapon.split.trigger === "ground") {
        const children = spawnMirvChildren(p, p.x, surfaceY);
        spawned.push(...children);
        events.push({ kind: "mirv-split", projectileId: p.id, x: p.x, y: surfaceY, children });
        continue; // parent consumed — no terrain carve, no damage
      }

      // Smoke on impact
      if (p.weapon.smokeOnImpact) {
        const s = p.weapon.smokeOnImpact;
        events.push({ kind: "smoke-deployed", projectileId: p.id, x: p.x,
                      width: s.width, turnsLeft: s.turnsLeft, ownerId: p.ownerId });
        continue;
      }

      // Burn on impact (Napalm, Fireball): regular impact + enqueue burn zone
      if (p.weapon.burnOnImpact) {
        const b = p.weapon.burnOnImpact;
        events.push({ kind: "burn-deployed", projectileId: p.id, x: p.x,
                      width: b.width, damage: b.damage, turnsLeft: b.turnsLeft, ownerId: p.ownerId });
        // Fall through to normal terrain-impact for the blast damage
      }

      // Normal terrain-impact (or leapfrog bounces exhausted)
      events.push({ kind: "terrain-impact", projectileId: p.id, x: p.x, y: p.y, weapon: p.weapon, ownerId: p.ownerId });
      continue;
    }

    survivors.push(p);
  }

  return {
    survivors: survivors.filter(p => !intercepted.has(p.id)),
    spawned,
    events,
    shieldDrains,
  };
}
