export { createPrng } from "./rng/prng";
export type { Prng } from "./rng/prng";
export type {
  Point, TerrainOptions, CarveOp, WeaponDef, TargetInfo,
  DamageEntry, SimInput, TrajectorySample, TrajectoryResult,
} from "./types";
export { generateTerrain } from "./terrain/generate";
export { carveInPlace, applyCarve } from "./terrain/carve";
export { BABY_MISSILE } from "./weapons/baby-missile";
