export const TERRAIN_WIDTH = 1600;
export const TERRAIN_HEIGHT = 900;
export const MAX_PLAYERS = 10;
export const DEFAULT_TURN_TIMER_MS = 30_000;
export const RECONNECT_GRACE_SEC = 60;
export const POST_PLAYBACK_BUFFER_MS = 200;
export const COLORS = [
  "red", "blue", "green", "yellow", "cyan",
  "magenta", "orange", "white", "pink", "lime",
] as const;
export type TankColor = typeof COLORS[number];

export const HATS = ["none", "helm", "chef", "tophat", "beanie", "cowboy", "party", "viking", "santa"] as const;
export type TankHat = typeof HATS[number];

// Vertical projectile play bounds (relative to the terrain). Generous so high
// lobs and low passes stay in play longer; the cosmetic floating-island
// underside fills the space below the surface.
export const PLAY_CEILING_Y = -600;       // remove projectiles that rise above this y
export const PLAY_FLOOR_MARGIN = 500;     // soft bottom = terrainHeight + this

export const DEFAULT_MAX_ROUNDS = 5;
export const DEFAULT_STARTING_CASH = 10_000;
export const ROUND_SUMMARY_DURATION_MS = 5_000;
export const SHOP_DURATION_MS = 45_000;
export const DAMAGE_REWARD_RATE = 100;   // $ per damage point dealt
export const KILL_REWARD = 1_000;        // $ per kill
export const SURVIVAL_BONUS = 500;       // $ for surviving the round

// Phase 5 — terrain variety & walls
export type TerrainType =
  | "mountains" | "hills" | "valleys" | "cliffs" | "crater"
  | "sky-high"  | "plateau" | "flat"  | "random";

export const ALL_TERRAIN_TYPES: TerrainType[] = [
  "mountains", "hills", "valleys", "cliffs", "crater",
  "sky-high", "plateau", "flat", "random",
];

export const ALL_WALL_MODES = ["none", "wrap", "reflect", "absorb"] as const;
export type WallMode = typeof ALL_WALL_MODES[number];

export function parsePool<T extends string>(
  pool: string,
  all: readonly T[],
): T[] {
  if (!pool || pool === "all") return [...all];
  return pool
    .split(",")
    .map((s) => s.trim() as T)
    .filter((s) => (all as readonly string[]).includes(s));
}

// Phase 7 — AI opponents
export type AiDifficulty = "moron" | "shooter" | "pyro" | "cyborg" | "bouncer";
export const ALL_AI_DIFFICULTIES: AiDifficulty[] = ["moron", "shooter", "pyro", "cyborg", "bouncer"];
