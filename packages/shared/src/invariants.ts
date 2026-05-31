export interface Violation { name: string; detail: string; }

export interface TankLike {
  sessionId: string; hp: number; alive: boolean;
  x: number; y: number; angle: number; power: number;
}
export interface MatchStateLike {
  phase: string; round: number; maxRounds: number;
  currentTurnPlayerId: string;
  tanks: TankLike[];
}

const finite = (n: number) => Number.isFinite(n);

export function checkMatchInvariants(s: MatchStateLike): Violation[] {
  const v: Violation[] = [];
  for (const t of s.tanks) {
    if (t.hp < 0 || t.hp > 100) v.push({ name: "hp-range", detail: `${t.sessionId} hp=${t.hp}` });
    if (t.alive !== (t.hp > 0)) v.push({ name: "alive-consistency", detail: `${t.sessionId} alive=${t.alive} hp=${t.hp}` });
    if (![t.x, t.y, t.angle, t.power].every(finite))
      v.push({ name: "finite-position", detail: `${t.sessionId} x=${t.x} y=${t.y} a=${t.angle} p=${t.power}` });
  }
  if (s.round < 1 || s.round > s.maxRounds) v.push({ name: "round-range", detail: `round=${s.round}/${s.maxRounds}` });
  if (s.phase === "playing") {
    const turn = s.tanks.find((t) => t.sessionId === s.currentTurnPlayerId);
    if (!turn || !turn.alive) v.push({ name: "turn-pointer", detail: `turn=${s.currentTurnPlayerId}` });
  }
  return v;
}

export function checkCameraFinite(cam: { x: number; y: number; scale: number }): Violation[] {
  return finite(cam.x) && finite(cam.y) && finite(cam.scale)
    ? []
    : [{ name: "camera-finite", detail: `x=${cam.x} y=${cam.y} scale=${cam.scale}` }];
}
