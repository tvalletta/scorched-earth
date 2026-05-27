import type { LiveProjectile, StepInput, StepResult, StepEvent } from "../types";

const WIND_ACCEL_SCALE = 5.0;

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
  for (let i = 0; i < split.count; i++) {
    const deg =
      split.spreadDeg >= 360
        ? i * (360 / split.count)
        : split.count === 1
        ? split.centerDeg
        : split.centerDeg - split.spreadDeg / 2 + i * (split.spreadDeg / (split.count - 1));
    const rad = (deg * Math.PI) / 180;
    const ejVx = Math.cos(rad) * split.ejectionSpeed + (split.inheritVelocity ? parent.vx : 0);
    const ejVy = Math.sin(rad) * split.ejectionSpeed + (split.inheritVelocity ? parent.vy : 0);
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
  const SOFT_BOTTOM = terrainHeight + 200;

  const survivors: LiveProjectile[] = [];
  const spawned: LiveProjectile[] = [];
  const events: StepEvent[] = [];
  const shieldDrains: Array<{ sessionId: string; hpDrain: number }> = [];
  const intercepted = new Set<string>();

  for (const p of projectiles) {
    // 1. Apply physics — capture prevVy before gravity so apex detection is correct
    // Accelerations are per-second (scaled by dt); velocities are per-tick (applied directly)
    const prevVy = p.vy;
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
    if (p.y < -200) {
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

    // 5. Shield check
    let shielded = false;
    for (const tank of tanks) {
      if (tank.sessionId === p.ownerId) continue; // owner's own shield never blocks
      if (tank.shieldHp <= 0) continue;
      if (!tank.shieldType) continue;
      const dx = p.x - tank.x;
      const dy = p.y - tank.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= tank.shieldRadius) continue;

      const nx = dx / dist;
      const ny = dy / dist;

      if (tank.shieldType === "absorb") {
        const hpCost = Math.floor(p.weapon.damage * tank.hpCostFraction);
        const hpBefore = tank.shieldHp;
        const hpAfter = Math.max(0, hpBefore - hpCost);
        events.push({ kind: "shield-absorb", projectileId: p.id, targetId: tank.sessionId, hpBefore, hpAfter });
        tank.shieldHp = hpAfter;
        shielded = true;
        break;
      }

      if (tank.shieldType === "deflect") {
        const hpCost = Math.floor(p.weapon.damage * tank.hpCostFraction);
        const hpBefore = tank.shieldHp;
        const hpAfter = Math.max(0, hpBefore - hpCost);
        const dot = p.vx * nx + p.vy * ny;
        const newVx = p.vx - 2 * dot * nx;
        const newVy = p.vy - 2 * dot * ny;
        p.vx = newVx;
        p.vy = newVy;
        tank.shieldHp = hpAfter;
        events.push({ kind: "shield-deflect", projectileId: p.id, targetId: tank.sessionId, newVx, newVy, hpBefore, hpAfter });
        // deflected projectile stays alive — no shielded=true
        break;
      }

      if (tank.shieldType === "bend") {
        const strength = 8000 / (dist * dist);
        const impulseX = nx * strength * dt;
        const impulseY = ny * strength * dt;
        p.vx += impulseX;
        p.vy += impulseY;
        events.push({ kind: "shield-bend", projectileId: p.id, targetId: tank.sessionId, impulseX, impulseY });
        const existing = shieldDrains.find(d => d.sessionId === tank.sessionId);
        if (existing) {
          existing.hpDrain = Math.max(existing.hpDrain, 15 * dt);
        } else {
          shieldDrains.push({ sessionId: tank.sessionId, hpDrain: 15 * dt });
        }
        // projectile stays alive — no shielded=true
        break;
      }

      if (tank.shieldType === "explode") {
        events.push({ kind: "shield-explode", projectileId: p.id, targetId: tank.sessionId, x: p.x, y: p.y });
        tank.shieldHp = 0;
        shielded = true;
        break;
      }
    }

    if (shielded) continue;

    // 6. Terrain collision
    const surfaceY = heightAt(terrain, p.x);
    if (p.y >= surfaceY) {
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
