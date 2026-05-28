import { simulateProjectile } from "../physics/simulate";
import type { WeaponDef, TrajectorySample } from "../types";
import type { WallMode } from "@se/shared";
import type { Prng } from "../rng/prng";
import type { AiProfile } from "./profiles";

export interface ScanInput {
  origin: { x: number; y: number };
  targets: Array<{ x: number; y: number }>;
  terrain: Int16Array;
  terrainWidth: number;
  terrainHeight: number;
  wallMode: WallMode;
  wind: number;
  gravity: number;
  weaponDef: WeaponDef;
  profile: AiProfile;
  prng: Prng;
}

export interface ScanResult {
  angle: number;
  power: number;
}

function minDistToTargets(
  samples: TrajectorySample[],
  targets: Array<{ x: number; y: number }>,
): number {
  let best = Infinity;
  for (const s of samples) {
    for (const t of targets) {
      const dx = s.x - t.x;
      const dy = s.y - t.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < best) best = d;
    }
  }
  return best;
}

export function scanBestShot(input: ScanInput): ScanResult {
  const { origin, targets, terrain, terrainWidth, terrainHeight,
          wallMode, wind, gravity, weaponDef, profile, prng } = input;

  if (profile.scanAngles === 0) {
    return {
      angle: prng.nextInt(10, 170),
      power: prng.nextInt(100, 900),
    };
  }

  let bestScore = Infinity;
  let bestAngle = 90;
  let bestPower = 500;

  const angleStep = 170 / (profile.scanAngles - 1);
  const powerStep = 800 / (profile.scanPowers - 1);

  for (let ai = 0; ai < profile.scanAngles; ai++) {
    const angle = 10 + ai * angleStep;
    for (let pi = 0; pi < profile.scanPowers; pi++) {
      const power = 100 + pi * powerStep;
      const result = simulateProjectile({
        weapon: weaponDef,
        origin,
        angle,
        power,
        wind,
        gravity,
        terrain,
        terrainWidth,
        terrainHeight,
        wallMode,
        targets: [],
      });
      const score = minDistToTargets(result.samples, targets);
      if (score < bestScore) {
        bestScore = score;
        bestAngle = angle;
        bestPower = power;
      }
    }
  }

  const noiseDeg = (prng.nextFloat() * 2 - 1) * profile.noiseDeg;
  return {
    angle: Math.max(0, Math.min(180, bestAngle + noiseDeg)),
    power: bestPower,
  };
}
