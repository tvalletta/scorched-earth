import type { SimInput, TrajectoryResult, TrajectorySample, SplitDef } from "../types";
import { computeDamage } from "./damage";

const DT_MS = 1000 / 60;
const MAX_DURATION_MS = 8000;
const VELOCITY_SCALE = 0.6;
const WIND_ACCEL_SCALE = 5.0;
const MAX_SAMPLES = 100;

function degToRad(deg: number): number { return (deg * Math.PI) / 180; }

function initialVelocityFromAnglePower(angle: number, power: number): { vx: number; vy: number } {
  const a = degToRad(angle);
  return {
    vx: -Math.cos(a) * power * VELOCITY_SCALE,
    vy: -Math.sin(a) * power * VELOCITY_SCALE,
  };
}

function heightAt(terrain: Int16Array, x: number): number {
  const i = Math.floor(x);
  if (i < 0 || i >= terrain.length) return Number.POSITIVE_INFINITY;
  return terrain[i] as number;
}

function downsample(rawSamples: TrajectorySample[]): TrajectorySample[] {
  if (rawSamples.length <= MAX_SAMPLES) return rawSamples;
  const out = [rawSamples[0]!];
  const interior = MAX_SAMPLES - 2;
  for (let i = 1; i <= interior; i++) {
    const idx = Math.round((i / (interior + 1)) * (rawSamples.length - 1));
    out.push(rawSamples[idx]!);
  }
  out.push(rawSamples[rawSamples.length - 1]!);
  return out;
}

function childVelocities(
  split: SplitDef,
  parentVx: number,
  parentVy: number,
): Array<{ vx: number; vy: number }> {
  const { count, spreadDeg, centerDeg, inheritVelocity, ejectionSpeed } = split;
  const result: Array<{ vx: number; vy: number }> = [];
  for (let i = 0; i < count; i++) {
    const deg =
      spreadDeg >= 360
        ? i * (360 / count)
        : count === 1
        ? centerDeg
        : centerDeg - spreadDeg / 2 + i * (spreadDeg / (count - 1));
    const rad = degToRad(deg);
    result.push({
      vx: Math.cos(rad) * ejectionSpeed + (inheritVelocity ? parentVx : 0),
      vy: Math.sin(rad) * ejectionSpeed + (inheritVelocity ? parentVy : 0),
    });
  }
  return result;
}

export function simulateProjectile(input: SimInput): TrajectoryResult {
  const {
    weapon, origin, angle, power, wind, gravity,
    terrain, terrainWidth, terrainHeight, walls, targets,
    initialVelocity,
  } = input;

  const SOFT_BOTTOM = terrainHeight + 200;
  void walls;

  let { vx, vy } = initialVelocity ?? initialVelocityFromAnglePower(angle, power);
  const dtSec = DT_MS / 1000;
  const windAccel = weapon.windImmune ? 0 : wind * WIND_ACCEL_SCALE;

  let x = origin.x;
  let y = origin.y;
  let t = 0;

  const rawSamples: TrajectorySample[] = [{ x, y, t: 0 }];
  let impact: { x: number; y: number } | null = null;

  while (t < MAX_DURATION_MS) {
    const prevVy = vy;
    vx += windAccel * dtSec;
    vy += gravity * dtSec;
    x += vx * dtSec;
    y += vy * dtSec;
    t += DT_MS;

    // Apex-split detection (must happen before out-of-bounds / terrain checks)
    if (weapon.split && weapon.split.trigger === "apex" && prevVy < 0 && vy >= 0) {
      const splitAt: TrajectorySample = { x, y, t };
      rawSamples.push(splitAt);
      const vels = childVelocities(weapon.split, vx, vy);
      const children = vels.map((vel) =>
        simulateProjectile({
          ...input,
          weapon: weapon.split!.child,
          origin: { x, y },
          initialVelocity: vel,
        }),
      );
      return {
        samples: downsample(rawSamples),
        impact: null,
        durationMs: rawSamples[rawSamples.length - 1]!.t,
        carveOp: null,
        damages: [],
        splitAt,
        children,
      };
    }

    if (x < 0 || x >= terrainWidth) { rawSamples.push({ x, y, t }); break; }
    if (y > SOFT_BOTTOM) { rawSamples.push({ x, y, t }); break; }

    const surfaceY = heightAt(terrain, x);
    if (y >= surfaceY) {
      const prev = rawSamples[rawSamples.length - 1]!;
      let lo = 0, hi = 1;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        const sx = prev.x + (x - prev.x) * mid;
        const sy = prev.y + (y - prev.y) * mid;
        if (sy >= heightAt(terrain, sx)) hi = mid; else lo = mid;
      }
      const finalX = prev.x + (x - prev.x) * hi;
      const finalY = prev.y + (y - prev.y) * hi;
      const finalT = prev.t + (t - prev.t) * hi;
      rawSamples.push({ x: finalX, y: finalY, t: finalT });
      impact = { x: finalX, y: finalY };
      t = finalT;
      break;
    }

    rawSamples.push({ x, y, t });
  }

  const carveOp = impact
    ? { x: Math.round(impact.x), y: Math.round(impact.y), radius: weapon.radius, tick: 0 }
    : null;
  const damages = impact ? computeDamage(impact, weapon, targets) : [];
  const samples = downsample(rawSamples);
  const durationMs = samples[samples.length - 1]!.t;

  return { samples, impact, durationMs, carveOp, damages };
}
