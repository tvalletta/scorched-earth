import type { DamageEntry, Point, TargetInfo, WeaponDef } from "../types";

export function computeDamage(
  impact: Point,
  weapon: WeaponDef,
  targets: TargetInfo[],
): DamageEntry[] {
  const out: DamageEntry[] = [];
  for (const target of targets) {
    const dx = target.x - impact.x;
    const dy = target.y - impact.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist >= weapon.radius) continue;
    const amount = Math.floor(weapon.damage * (1 - dist / weapon.radius));
    if (amount <= 0) continue;
    out.push({
      playerId: target.playerId,
      amount,
      shieldDamage: 0,
      hullDamage: amount,
    });
  }
  return out;
}
