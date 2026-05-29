import { COLORS, HATS, type TankColor, type TankHat, type MatchState } from "@se/shared";

/**
 * Apply a lobby identity edit (nickname / color / hat) to the caller's tank.
 * No-op unless the room is in the lobby phase and the caller owns a tank.
 * Pure over MatchState so it can be unit-tested without a live room.
 */
export function applySetIdentity(
  state: MatchState,
  sessionId: string,
  msg: { nickname?: string; color?: string; hat?: string },
): void {
  if (state.phase !== "lobby") return;
  const tank = state.tanks.get(sessionId);
  if (!tank) return;
  if (typeof msg?.nickname === "string") {
    const n = msg.nickname.trim().slice(0, 24);
    if (n.length > 0) tank.nickname = n;
  }
  if (typeof msg?.color === "string" && (COLORS as readonly string[]).includes(msg.color)) {
    tank.color = msg.color as TankColor;
  }
  if (typeof msg?.hat === "string" && (HATS as readonly string[]).includes(msg.hat)) {
    tank.hat = msg.hat as TankHat;
  }
}
