export { createPrng } from "./rng/prng";
export type { Prng } from "./rng/prng";
export type { TerrainType, WallMode } from "@se/shared";
export { ALL_TERRAIN_TYPES, ALL_WALL_MODES, parsePool } from "@se/shared";
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
export { stepProjectiles, initialVelocityFromAnglePower } from "./physics/step";
export { computeFallDamage } from "./physics/fall-damage";
export type { LiveProjectile, StepTankInfo, StepEvent, StepInput, StepResult } from "./types";
export { computeRoundEarnings, validatePurchase } from "./economy";
export type { RoundEarnings, PurchaseResult, ShopWeaponEntry } from "./economy";
export { processPendingEffects } from "./physics/pending-effects";
export type { PendingEffectData, TankSnapshot, BurnDamage } from "./physics/pending-effects";
export { resolveLaserBeam } from "./physics/laser";
export type { LaserResult, LaserInput } from "./physics/laser";
