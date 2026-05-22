import type { SimInput, TrajectoryResult, TrajectorySample } from "../types";
import { computeDamage } from "./damage";

const DT_MS = 1000 / 60;
const MAX_DURATION_MS = 8000;
const VELOCITY_SCALE = 0.6;
const WIND_ACCEL_SCALE = 5.0;
const MAX_SAMPLES = 100;

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function initialVelocity(angle: number, power: number): { vx: number; vy: number } {
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

export function simulateProjectile(input: SimInput): TrajectoryResult {
  const {
    weapon, origin, angle, power, wind, gravity,
    terrain, terrainWidth, terrainHeight, walls, targets,
  } = input;

  const SOFT_BOTTOM = terrainHeight + 200;
  void walls; // walls === "none" in Phase 1

  let { vx, vy } = initialVelocity(angle, power);
  const dtSec = DT_MS / 1000;
  const windAccel = weapon.windImmune ? 0 : wind * WIND_ACCEL_SCALE;

  let x = origin.x;
  let y = origin.y;
  let t = 0;

  const rawSamples: TrajectorySample[] = [{ x, y, t: 0 }];
  let impact: { x: number; y: number } | null = null;

  while (t < MAX_DURATION_MS) {
    vx += windAccel * dtSec;
    vy += gravity * dtSec;
    x += vx * dtSec;
    y += vy * dtSec;
    t += DT_MS;

    if (x < 0 || x >= terrainWidth) {
      rawSamples.push({ x, y, t });
      break;
    }
    if (y > SOFT_BOTTOM) {
      rawSamples.push({ x, y, t });
      break;
    }

    const surfaceY = heightAt(terrain, x);
    if (y >= surfaceY) {
      const prev = rawSamples[rawSamples.length - 1]!;
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        const sx = prev.x + (x - prev.x) * mid;
        const sy = prev.y + (y - prev.y) * mid;
        const sSurface = heightAt(terrain, sx);
        if (sy >= sSurface) hi = mid;
        else lo = mid;
      }
      const t0 = prev.t;
      const finalX = prev.x + (x - prev.x) * hi;
      const finalY = prev.y + (y - prev.y) * hi;
      const finalT = t0 + (t - t0) * hi;
      rawSamples.push({ x: finalX, y: finalY, t: finalT });
      impact = { x: finalX, y: finalY };
      t = finalT;
      break;
    }

    rawSamples.push({ x, y, t });
  }

  let samples: TrajectorySample[];
  if (rawSamples.length <= MAX_SAMPLES) {
    samples = rawSamples;
  } else {
    samples = [rawSamples[0]!];
    const interior = MAX_SAMPLES - 2;
    for (let i = 1; i <= interior; i++) {
      const idx = Math.round((i / (interior + 1)) * (rawSamples.length - 1));
      samples.push(rawSamples[idx]!);
    }
    samples.push(rawSamples[rawSamples.length - 1]!);
  }

  const carveOp = impact
    ? {
        x: Math.round(impact.x),
        y: Math.round(impact.y),
        radius: weapon.radius,
        tick: 0,
      }
    : null;

  const damages = impact ? computeDamage(impact, weapon, targets) : [];
  const durationMs = samples[samples.length - 1]!.t;

  return { samples, impact, durationMs, carveOp, damages };
}
