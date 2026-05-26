export { createPrng } from "./rng/prng";
export type { Prng } from "./rng/prng";
export type {
  Point, TerrainOptions, CarveOp, WeaponDef, SplitDef, TargetInfo,
  DamageEntry, SimInput, TrajectorySample, TrajectoryResult,
} from "./types";
export { generateTerrain } from "./terrain/generate";
export { carveInPlace, applyCarve } from "./terrain/carve";
export {
  BABY_MISSILE, MISSILE, BABY_NUKE, NUKE, FUNKY_BOMB, MIRV,
  WEAPON_REGISTRY,
} from "./weapons/index";
export { DEATH_EXPLOSION } from "./weapons/death-explosion";
export { ITEM_REGISTRY, type ItemDef } from "./items/index";
export { computeDamage } from "./physics/damage";
export { simulateProjectile } from "./physics/simulate";
export { computeRoundEarnings, validatePurchase } from "./economy";
export type { RoundEarnings, PurchaseResult, ShopWeaponEntry } from "./economy";
