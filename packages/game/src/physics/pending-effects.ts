export interface PendingEffectData {
  kind: "burn-zone" | "smoke-zone";
  x: number;
  width: number;
  damage: number;
  turnsLeft: number;
}

export interface TankSnapshot { sessionId: string; x: number; hp: number; }
export interface BurnDamage   { sessionId: string; amount: number; }
export interface EffectResult {
  damages: BurnDamage[];
  survivors: PendingEffectData[];
}

export function processPendingEffects(
  effects: PendingEffectData[],
  tanks: TankSnapshot[],
): EffectResult {
  const damages: BurnDamage[] = [];
  const survivors: PendingEffectData[] = [];

  for (const effect of effects) {
    if (effect.kind === "burn-zone" && effect.damage > 0) {
      const half = effect.width / 2;
      for (const tank of tanks) {
        if (Math.abs(tank.x - effect.x) <= half) {
          damages.push({ sessionId: tank.sessionId, amount: effect.damage });
        }
      }
    }
    const next: PendingEffectData = { ...effect, turnsLeft: effect.turnsLeft - 1 };
    if (next.turnsLeft > 0) survivors.push(next);
  }

  return { damages, survivors };
}
