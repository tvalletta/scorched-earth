import type { AiDifficulty } from "@se/shared";
import type { Prng } from "../rng/prng";
import { WEAPON_REGISTRY } from "../weapons/index";
import { ITEM_REGISTRY } from "../items/index";
import { AI_PROFILES, WEAPON_CATEGORIES } from "./profiles";

export interface ShopInput {
  cash: number;
  shieldId: string;   // "" if no shield equipped; prevents buying a second one
  difficulty: AiDifficulty;
  prng: Prng;
}

export interface ShopPurchase {
  itemId: string;
}

const SHIELD_IDS = ["shield", "heavy-shield", "super-magnetic", "force-shield"];

// Sorted cheapest to most expensive so AI can afford as many as possible
const SHIELD_OPTIONS = SHIELD_IDS.map(id => ITEM_REGISTRY.get(id)!).filter(Boolean)
  .sort((a, b) => a.price - b.price);

export function shopForAi(input: ShopInput): ShopPurchase[] {
  const { cash, shieldId, difficulty, prng } = input;
  const profile = AI_PROFILES[difficulty];
  const purchases: ShopPurchase[] = [];
  let remaining = cash;

  for (const rule of profile.shopBudgetRules) {
    let budget = Math.floor(remaining * rule.fractionOfCash);
    if (budget <= 0) continue;

    if (rule.category === "shield") {
      // Skip if already equipped or already buying one
      if (shieldId || purchases.some(p => SHIELD_IDS.includes(p.itemId))) continue;
      // Buy the best shield we can afford
      const affordable = SHIELD_OPTIONS.filter(s => s.price <= budget).reverse();
      if (affordable.length > 0) {
        const chosen = affordable[0]!;
        purchases.push({ itemId: chosen.id });
        remaining -= chosen.price;
      }
      continue;
    }

    // Build candidate list for this rule category
    const candidates: Array<{ id: string; price: number; damage: number }> = [];
    for (const [id, def] of WEAPON_REGISTRY) {
      if (def.price <= 0 || def.packSize <= 0) continue;
      const cat = WEAPON_CATEGORIES[id];
      if (rule.category === "any" || cat === rule.category) {
        candidates.push({ id, price: def.price, damage: def.damage });
      }
    }

    if (candidates.length === 0) continue;

    let spent = 0;
    const used = new Set<string>();

    while (spent < budget) {
      // Filter to affordable items not yet exhausted
      const affordable = candidates.filter(c => c.price <= budget - spent && !used.has(c.id));
      if (affordable.length === 0) break;

      let item: typeof affordable[0];
      if (difficulty === "moron") {
        item = prng.pick(affordable);
      } else {
        // Pick highest damage-per-dollar ratio
        item = affordable.reduce((best, c) =>
          c.damage / c.price > best.damage / best.price ? c : best,
        );
      }

      purchases.push({ itemId: item.id });
      spent += item.price;
      remaining -= item.price;
      // Don't buy the same weapon multiple times per rule pass to spread spend
      used.add(item.id);
    }
  }

  return purchases;
}
