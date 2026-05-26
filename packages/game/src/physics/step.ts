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
  const { projectiles, terrain, terrainWidth, terrainHeight, wind, gravity, dt } = input;
  const SOFT_BOTTOM = terrainHeight + 200;

  const survivors: LiveProjectile[] = [];
  const spawned: LiveProjectile[] = [];
  const events: StepEvent[] = [];
  const shieldDrains: Array<{ sessionId: string; hpDrain: number }> = [];

  for (const p of projectiles) {
    // 1. Apply physics — capture prevVy before gravity so apex detection is correct
    // Accelerations are per-second (scaled by dt); velocities are per-tick (applied directly)
    const prevVy = p.vy;
    const windAccel = p.weapon.windImmune ? 0 : wind * WIND_ACCEL_SCALE;
    p.vx += windAccel * dt;
    p.vy += gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // 2. Patriot homing + intercept (handled in Task 10)
    if (p.isPatriot) {
      // placeholder — filled in Task 10
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

    // 4. Out-of-bounds (width or soft bottom)
    if (p.x < 0 || p.x >= terrainWidth || p.y > SOFT_BOTTOM) {
      events.push({ kind: "out-of-bounds", projectileId: p.id });
      continue;
    }

    // 5. Shield check (handled in Tasks 6–9)
    // placeholder — filled in later tasks

    // 6. Terrain collision
    const surfaceY = heightAt(terrain, p.x);
    if (p.y >= surfaceY) {
      events.push({ kind: "terrain-impact", projectileId: p.id, x: p.x, y: p.y, weapon: p.weapon, ownerId: p.ownerId });
      continue;
    }

    survivors.push(p);
  }

  return {
    survivors,
    spawned,
    events,
    shieldDrains,
  };
}
