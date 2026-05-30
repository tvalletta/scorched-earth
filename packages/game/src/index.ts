export { createPrng } from "./rng/prng";
export type { Prng } from "./rng/prng";
export type { TerrainType, WallMode } from "@se/shared";
export { ALL_TERRAIN_TYPES, ALL_WALL_MODES, parsePool } from "@se/shared";
export type {
  Point, TerrainOptions, CarveOp, WeaponDef, SplitDef, TargetInfo,
  DamageEntry, SimInput, TrajectorySample, TrajectoryResult,
} from "./types";
export { generateTerrain, generateUnderside, generateCeiling } from "./terrain/generate";
export { carveInPlace, applyCarve, carveCeilingInPlace } from "./terrain/carve";
export {
  BABY_MISSILE, MISSILE, BABY_NUKE, NUKE, FUNKY_BOMB, MIRV,
  DEATHS_HEAD, DEATHS_KNELL, TRIPLE_WARHEAD, PINEAPPLE, FUNKY_NUKE, PLASMA_BALL, PLASMA_BLAST,
  LEAPFROG, ROLLER, HEAVY_ROLLER, LASER, PLASMA_WAVE, TRACER, SMOKE,
  DIRT_CLOD, DIRT_BALL, LIQUID_DIRT, SANDHOG, TUNNELER,
  NAPALM, HOT_NAPALM, FIREBALL,
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
export { think, shopForAi, scanBestShot, AI_PROFILES, AI_NAME_POOLS } from "./ai";
export type { ThinkInput, ThinkStateSnapshot, AiTankSnapshot, AiIntent, ShopInput, ShopPurchase } from "./ai";
