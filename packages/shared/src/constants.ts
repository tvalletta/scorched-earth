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

export const HATS = ["none", "chef", "top-hat", "beanie"] as const;
export type TankHat = typeof HATS[number];

export const DEFAULT_MAX_ROUNDS = 5;
export const DEFAULT_STARTING_CASH = 10_000;
export const ROUND_SUMMARY_DURATION_MS = 5_000;
export const SHOP_DURATION_MS = 30_000;
export const DAMAGE_REWARD_RATE = 100;   // $ per damage point dealt
export const KILL_REWARD = 1_000;        // $ per kill
export const SURVIVAL_BONUS = 500;       // $ for surviving the round
