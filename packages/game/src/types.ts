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

export interface DepositShape {
  halfWidth: number;
  height: number;
  spray?: boolean;
}

export interface BurnOnImpact {
  width: number;
  damage: number;
  turnsLeft: number;
}

export interface WeaponDef {
  id: string;
  radius: number;
  damage: number;
  windImmune: boolean;
  split?: SplitDef;
  price: number;      // $ cost per purchase; 0 = free
  packSize: number;   // units granted per purchase; 0 = not sold in shop (sub-munitions)
  // Phase 4 extensions
  shieldPierce?: number;       // 0–1: fraction of damage bypassing shield. Default 0.
  laser?: boolean;             // Instant straight-line; no arc simulation.
  plasmaWave?: boolean;        // Horizontal expansion at impact y.
  rollOnImpact?: boolean;      // Converts to surface-rolling on terrain hit.
  leapCount?: number;          // Bounces N times at 70% velocity before final impact.
  burrow?: boolean;            // Carves vertical tunnel on terrain hit.
  terrainDeposit?: DepositShape; // Raises heightmap on impact (no damage).
  burnOnImpact?: BurnOnImpact;   // Enqueues a burn-zone PendingEffect on impact.
  smokeOnImpact?: { width: number; turnsLeft: number }; // Enqueues smoke-zone.
  tracerMode?: boolean;        // Fires no-damage shell; returns full path; no terrain carve.
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
  ceiling?: Int16Array;
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
  // Phase 4 extensions
  bounceCount?: number;  // Leapfrog — incremented each bounce
  isRolling?: boolean;   // Roller — rolling along terrain surface
  rollDir?: 1 | -1;      // Roller — direction of roll (+1 right, -1 left)
  isBurrowing?: boolean; // Sandhog/Tunneler — currently boring downward
}

export interface StepTankInfo {
  sessionId: string;
  x: number;
  y: number;
  shieldHp: number;
  shieldMaxHp: number;
  shieldRadius: number;
  shieldType: "absorb" | "bend" | "";
}

export interface StepInput {
  projectiles: LiveProjectile[];
  tanks: StepTankInfo[];
  terrain: Int16Array;
  ceiling?: Int16Array;
  terrainWidth: number;
  terrainHeight: number;
  wind: number;
  gravity: number;
  dt: number;
  wallMode: WallMode;
}

export type StepEvent =
  | { kind: "terrain-impact"; projectileId: string; x: number; y: number; weapon: WeaponDef; ownerId: string; layer?: "floor" | "ceiling" }
  | { kind: "shield-absorb"; projectileId: string; targetId: string;
      hpBefore: number; hpAfter: number; absorbed: number; overflow: number;
      ownerId: string }
  | { kind: "shield-bend";    projectileId: string; targetId: string; impulseX: number; impulseY: number }
  | { kind: "out-of-bounds";  projectileId: string }
  | { kind: "mirv-split";     projectileId: string; x: number; y: number; children: LiveProjectile[] }
  | { kind: "patriot-intercept"; patriotId: string; targetId: string; x: number; y: number }
  // Phase 4
  | { kind: "leapfrog-bounce";  projectileId: string; x: number; y: number; weapon: WeaponDef; bounceNum: number; ownerId: string }
  | { kind: "roller-roll";      projectileId: string; x: number; y: number }
  | { kind: "roller-hit";       projectileId: string; x: number; y: number; weapon: WeaponDef; ownerId: string }
  | { kind: "laser-beam";       projectileId: string; fromX: number; fromY: number; toX: number; toY: number; damages: DamageEntry[]; ownerId: string }
  | { kind: "plasma-wave";      projectileId: string; x: number; y: number; weapon: WeaponDef; ownerId: string }
  | { kind: "terrain-deposit";  projectileId: string; centerX: number; shape: DepositShape; ownerId: string }
  | { kind: "burrow-complete";  projectileId: string; x: number; tunnelTopY: number; tunnelBottomY: number; weapon: WeaponDef; ownerId: string }
  | { kind: "tracer-complete";  projectileId: string; path: Array<TrajectorySample>; ownerId: string }
  | { kind: "smoke-deployed";   projectileId: string; x: number; width: number; turnsLeft: number; ownerId: string }
  | { kind: "burn-deployed";    projectileId: string; x: number; width: number; damage: number; turnsLeft: number; ownerId: string };

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
