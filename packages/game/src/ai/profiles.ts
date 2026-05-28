import type { AiDifficulty } from "@se/shared";

export interface ShopBudgetRule {
  category: "fire" | "direct" | "area" | "terrain" | "shield" | "any";
  fractionOfCash: number;
}

export interface AiProfile {
  difficulty: AiDifficulty;
  scanAngles: number;
  scanPowers: number;
  noiseDeg: number;
  thinkDelayMs: number;
  shieldEquipChance: number;
  preferredWeaponIds: string[];
  shopBudgetRules: ShopBudgetRule[];
}

// Maps weapon IDs to shop budget categories
export const WEAPON_CATEGORIES: Partial<Record<string, ShopBudgetRule["category"]>> = {
  "napalm": "fire", "hot-napalm": "fire", "fireball": "fire",
  "missile": "direct", "baby-nuke": "direct", "nuke": "direct", "baby-missile": "direct",
  "deaths-head": "direct", "triple-warhead": "direct", "plasma-ball": "direct", "plasma-blast": "direct",
  "leapfrog": "direct", "laser": "direct", "plasma-wave": "direct", "tracer": "direct",
  "mirv": "area", "funky-bomb": "area", "funky-nuke": "area", "pineapple": "area", "deaths-knell": "area",
  "dirt-clod": "terrain", "dirt-ball": "terrain", "liquid-dirt": "terrain",
  "sandhog": "terrain", "tunneler": "terrain",
  "roller": "area", "heavy-roller": "area",
  "smoke": "any",
};

export const AI_NAME_POOLS: Record<AiDifficulty, string[]> = {
  moron:   ["Doofus", "Blunder", "Oopsie", "Fumbles", "Wobbles"],
  shooter: ["Deadeye", "Markus", "Sniper", "Bullseye", "Crosshair"],
  pyro:    ["Inferno", "Cinders", "Blazer", "Torch", "Scorch"],
  cyborg:  ["HAL-9000", "Nexus", "ARIA", "Unit-7", "Axiom"],
  bouncer: ["Ricochet", "Phantom", "Echo", "Wraith", "Specter"],
};

export const AI_PROFILES: Record<AiDifficulty, AiProfile> = {
  moron: {
    difficulty: "moron",
    scanAngles: 0,
    scanPowers: 0,
    noiseDeg: 90,
    thinkDelayMs: 500,
    shieldEquipChance: 0,
    preferredWeaponIds: [],
    shopBudgetRules: [{ category: "any", fractionOfCash: 1 }],
  },
  shooter: {
    difficulty: "shooter",
    scanAngles: 18,
    scanPowers: 5,
    noiseDeg: 20,
    thinkDelayMs: 1000,
    shieldEquipChance: 0.25,
    preferredWeaponIds: ["missile", "baby-nuke", "nuke", "baby-missile"],
    shopBudgetRules: [
      { category: "direct", fractionOfCash: 0.6 },
      { category: "shield", fractionOfCash: 0.2 },
      { category: "any",    fractionOfCash: 0.2 },
    ],
  },
  pyro: {
    difficulty: "pyro",
    scanAngles: 18,
    scanPowers: 5,
    noiseDeg: 25,
    thinkDelayMs: 1000,
    shieldEquipChance: 0.5,
    preferredWeaponIds: ["napalm", "hot-napalm", "fireball", "funky-bomb", "baby-nuke"],
    shopBudgetRules: [
      { category: "fire",  fractionOfCash: 0.7 },
      { category: "shield", fractionOfCash: 0.15 },
      { category: "any",   fractionOfCash: 0.15 },
    ],
  },
  cyborg: {
    difficulty: "cyborg",
    scanAngles: 36,
    scanPowers: 10,
    noiseDeg: 5,
    thinkDelayMs: 1500,
    shieldEquipChance: 1,
    preferredWeaponIds: ["funky-bomb", "nuke", "mirv", "laser", "plasma-wave", "missile"],
    shopBudgetRules: [
      { category: "shield", fractionOfCash: 0.2 },
      { category: "direct", fractionOfCash: 0.4 },
      { category: "area",   fractionOfCash: 0.25 },
      { category: "any",    fractionOfCash: 0.15 },
    ],
  },
  bouncer: {
    difficulty: "bouncer",
    scanAngles: 36,
    scanPowers: 10,
    noiseDeg: 2,
    thinkDelayMs: 2000,
    shieldEquipChance: 1,
    preferredWeaponIds: ["funky-bomb", "nuke", "mirv", "roller", "leapfrog", "laser", "plasma-wave", "missile"],
    shopBudgetRules: [
      { category: "shield",  fractionOfCash: 0.25 },
      { category: "direct",  fractionOfCash: 0.35 },
      { category: "area",    fractionOfCash: 0.2 },
      { category: "terrain", fractionOfCash: 0.1 },
      { category: "any",     fractionOfCash: 0.1 },
    ],
  },
};
