import type { AiDifficulty, WallMode } from "@se/shared";
import type { Prng } from "../rng/prng";
import { WEAPON_REGISTRY } from "../weapons/index";
import { AI_PROFILES } from "./profiles";
import { scanBestShot } from "./scan";

// Lightweight snapshot of match state — avoids importing Colyseus schema into game package
export interface AiTankSnapshot {
  sessionId: string;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  inventory: Map<string, number>;
}

export interface ThinkStateSnapshot {
  tanks: AiTankSnapshot[];
  aiSlots: Array<{ sessionId: string; difficulty: string }>;
  wallMode: string;
  wind: number;
  gravity: number;
}

export interface ThinkInput {
  state: ThinkStateSnapshot;
  terrain: Int16Array;
  sessionId: string;
  prng: Prng;
}

export interface AiIntent {
  weaponId: string;
  angle: number;
  power: number;
}

export function think(input: ThinkInput): AiIntent {
  const { state, terrain, sessionId, prng } = input;

  const slot = state.aiSlots.find(s => s.sessionId === sessionId);
  const difficulty = (slot?.difficulty ?? "shooter") as AiDifficulty;
  const profile = AI_PROFILES[difficulty];

  const myTank = state.tanks.find(t => t.sessionId === sessionId);
  if (!myTank) return { weaponId: "baby-missile", angle: 90, power: 500 };

  const enemies = state.tanks.filter(t => t.alive && t.sessionId !== sessionId);

  if (enemies.length === 0) {
    // No targets — fire harmlessly at terrain center
    const weaponId = pickWeapon(profile.preferredWeaponIds, myTank.inventory);
    return { weaponId, angle: 90, power: 300 };
  }

  // Target lowest-HP enemy; tie-break by nearest x-distance
  const target = enemies.reduce((best, t) => {
    if (t.hp < best.hp) return t;
    if (t.hp === best.hp && Math.abs(t.x - myTank.x) < Math.abs(best.x - myTank.x)) return t;
    return best;
  });

  const weaponId = pickWeapon(profile.preferredWeaponIds, myTank.inventory);
  const weaponDef = WEAPON_REGISTRY.get(weaponId)!;

  const scanResult = scanBestShot({
    origin: { x: myTank.x, y: myTank.y },
    targets: [{ x: target.x, y: target.y }],
    terrain,
    terrainWidth: 1600,
    terrainHeight: 900,
    wallMode: state.wallMode as WallMode,
    wind: state.wind,
    gravity: state.gravity,
    weaponDef,
    profile,
    prng,
  });

  return { weaponId, angle: scanResult.angle, power: scanResult.power };
}

function pickWeapon(preferredIds: string[], inventory: Map<string, number>): string {
  for (const id of preferredIds) {
    const count = inventory.get(id) ?? 0;
    if (count > 0) return id;
  }
  // Fallback: first available weapon in registry order
  for (const id of WEAPON_REGISTRY.keys()) {
    const count = inventory.get(id) ?? 0;
    if (count > 0) return id;
  }
  return "baby-missile";
}
