import {
  DAMAGE_REWARD_RATE,
  KILL_REWARD,
  SURVIVAL_BONUS,
} from "@se/shared";

export interface RoundEarnings {
  damageReward: number;
  killReward: number;
  survivalBonus: number;
  total: number;
}

export interface ShopWeaponEntry {
  id: string;
  price: number;
  packSize: number;
}

export function computeRoundEarnings(
  damageDealt: number,
  kills: number,
  survived: boolean,
): RoundEarnings {
  const damageReward = Math.round(damageDealt) * DAMAGE_REWARD_RATE;
  const killReward = kills * KILL_REWARD;
  const survivalBonus = survived ? SURVIVAL_BONUS : 0;
  return {
    damageReward,
    killReward,
    survivalBonus,
    total: damageReward + killReward + survivalBonus,
  };
}

export type PurchaseResult =
  | { ok: true; newCash: number; newInventory: Map<string, number> }
  | { ok: false; reason: "insufficient_funds" | "unknown_weapon" };

export function validatePurchase(
  weaponId: string,
  currentCash: number,
  currentInventory: Map<string, number>,
  registry: ShopWeaponEntry[],
): PurchaseResult {
  const entry = registry.find((e) => e.id === weaponId && e.packSize > 0);
  if (!entry) return { ok: false, reason: "unknown_weapon" };
  if (currentCash < entry.price) return { ok: false, reason: "insufficient_funds" };

  const newInventory = new Map(currentInventory);
  newInventory.set(weaponId, (newInventory.get(weaponId) ?? 0) + entry.packSize);

  return { ok: true, newCash: currentCash - entry.price, newInventory };
}
