import type { FallDamageInput, FallDamageResult } from "../types";

export function computeFallDamage(input: FallDamageInput): FallDamageResult {
  const { tankY, surfaceY, hasParachute } = input;
  const fallDistance = surfaceY - tankY;
  if (fallDistance < 20) return { damage: 0, parachuteConsumed: false };
  if (hasParachute) return { damage: 0, parachuteConsumed: true };
  return { damage: Math.floor(fallDistance * 0.5), parachuteConsumed: false };
}
