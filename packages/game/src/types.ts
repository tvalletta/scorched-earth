export interface Point { x: number; y: number; }

export interface TerrainOptions {
  seed: string;
  type: "random";
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
  walls: "none";
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
