import type { TerrainType, WallMode } from "@se/shared";

export interface Point { x: number; y: number; }

export interface TerrainOptions {
  seed: string;
  type: TerrainType;
  width: number;
  height: number;
}

export interface CarveOp { x: number; y: number; radius: number; tick: number; }

export interface SplitDef {
  trigger: "apex";           // fires when vy crosses from negative to non-negative
  count: number;             // sub-projectile count
  spreadDeg: number;         // 360 = full radial circle; <360 = fan
  centerDeg: number;         // screen-space fan center; 90 = straight down
  inheritVelocity: boolean;  // add parent vx/vy to each child's ejection velocity
  ejectionSpeed: number;     // px/s radial push per child
  child: WeaponDef;          // weapon applied to every sub-munition
}

export interface WeaponDef {
  id: string;
  radius: number;
  damage: number;
  windImmune: boolean;
  split?: SplitDef;
  price: number;      // $ cost per purchase; 0 = free
  packSize: number;   // units granted per purchase; 0 = not sold in shop (sub-munitions)
}

export interface TargetInfo {
  playerId: string;
  x: number;
  y: number;
  shieldHp: number;
}

export interface DamageEntry {
  playerId: string;
  amount: number;
  shieldDamage: number;
  hullDamage: number;
}

export interface SimInput {
  weapon: WeaponDef;
  origin: Point;
  angle: number;
  power: number;
  wind: number;
  gravity: number;
  terrain: Int16Array;
  terrainWidth: number;
  terrainHeight: number;
  wallMode: WallMode;
  targets: TargetInfo[];
  initialVelocity?: { vx: number; vy: number }; // overrides angle+power when set
}

export interface TrajectorySample { x: number; y: number; t: number; }

export interface TrajectoryResult {
  samples: TrajectorySample[];
  impact: Point | null;
  durationMs: number;
  carveOp: CarveOp | null;
  damages: DamageEntry[];
  splitAt?: TrajectorySample;
  children?: TrajectoryResult[];
}

// Phase 4 — tick-stream physics

export interface LiveProjectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  weapon: WeaponDef;
  ownerId: string;
  apexReached: boolean;
  isPatriot?: true;
  targetId?: string;
}

export interface StepTankInfo {
  sessionId: string;
  x: number;
  y: number;
  shieldHp: number;
  shieldMaxHp: number;
  shieldRadius: number;
  shieldType: "absorb" | "deflect" | "bend" | "explode" | "";
  hpCostFraction: number;
}

export interface StepInput {
  projectiles: LiveProjectile[];
  tanks: StepTankInfo[];
  terrain: Int16Array;
  terrainWidth: number;
  terrainHeight: number;
  wind: number;
  gravity: number;
  dt: number;
  wallMode: WallMode;
}

export type StepEvent =
  | { kind: "terrain-impact"; projectileId: string; x: number; y: number; weapon: WeaponDef; ownerId: string }
  | { kind: "shield-absorb";  projectileId: string; targetId: string; hpBefore: number; hpAfter: number }
  | { kind: "shield-deflect"; projectileId: string; targetId: string; newVx: number; newVy: number; hpBefore: number; hpAfter: number }
  | { kind: "shield-bend";    projectileId: string; targetId: string; impulseX: number; impulseY: number }
  | { kind: "shield-explode"; projectileId: string; targetId: string; x: number; y: number }
  | { kind: "out-of-bounds";  projectileId: string }
  | { kind: "mirv-split";     projectileId: string; x: number; y: number; children: LiveProjectile[] }
  | { kind: "patriot-intercept"; patriotId: string; targetId: string; x: number; y: number };

export interface StepResult {
  survivors: LiveProjectile[];
  spawned: LiveProjectile[];
  events: StepEvent[];
  shieldDrains: Array<{ sessionId: string; hpDrain: number }>;
}

export interface FallDamageInput {
  sessionId: string;
  tankY: number;
  surfaceY: number;
  hasParachute: boolean;
}

export interface FallDamageResult {
  damage: number;
  parachuteConsumed: boolean;
}
