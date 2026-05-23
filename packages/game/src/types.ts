export interface Point {
  x: number;
  y: number;
}

export interface TerrainOptions {
  seed: string;
  type: "random"; // Phase 5 adds more types
  width: number;
  height: number;
}

export interface CarveOp {
  x: number;
  y: number;
  radius: number;
  tick: number;
}

export interface WeaponDef {
  id: string;
  radius: number;          // explosion radius in pixels
  damage: number;          // max damage at impact center
  windImmune: boolean;     // if true, wind doesn't accelerate this projectile
}

export interface TargetInfo {
  playerId: string;
  x: number;
  y: number;
  shieldHp: number; // Phase 1: always 0
}

export interface DamageEntry {
  playerId: string;
  amount: number;
  shieldDamage: number; // Phase 1: always 0
  hullDamage: number;
}

export interface SimInput {
  weapon: WeaponDef;
  origin: Point;
  angle: number;          // degrees, 0..180 (0=left, 90=up, 180=right)
  power: number;          // 0..1000
  wind: number;           // -10..+10
  gravity: number;        // px/s^2; default 9.8 * GRAVITY_SCALE
  terrain: Int16Array;    // heightmap, length = TERRAIN_WIDTH
  terrainWidth: number;
  terrainHeight: number;
  walls: "none";          // Phase 5 adds more
  targets: TargetInfo[];
}

export interface TrajectorySample {
  x: number;
  y: number;
  t: number; // ms since shot start
}

export interface TrajectoryResult {
  samples: TrajectorySample[];
  impact: Point | null; // null if projectile exited bounds without hitting
  durationMs: number;
  carveOp: CarveOp | null; // null if no impact
  damages: DamageEntry[]; // empty if no impact
}
