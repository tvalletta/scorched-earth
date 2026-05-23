export interface AliveCheckable {
  sessionId: string;
  alive: boolean;
}

export function nextTurnPlayerId(
  tanks: readonly AliveCheckable[],
  currentId: string,
): string {
  const n = tanks.length;
  if (n === 0) return "";
  let startIndex = tanks.findIndex((t) => t.sessionId === currentId);
  if (startIndex < 0) startIndex = -1;
  for (let i = 1; i <= n; i++) {
    const idx = (startIndex + i + n) % n;
    if (tanks[idx]!.alive) return tanks[idx]!.sessionId;
  }
  return "";
}
