import { MAX_PLAYERS } from "@se/shared";

export function parseRoomCode(pathname: string): string | null {
  const m = pathname.match(/^\/([A-Za-z0-9]{6})$/);
  return m ? m[1]!.toUpperCase() : null;
}

export function inviteLink(origin: string, code: string): string {
  return `${origin}/${code}`;
}

export interface CombatantVM {
  sessionId: string;
  name: string;
  color: string;
  hat: string;
  kind: "human" | "ai";
  isHost: boolean;
  isYou: boolean;
  connected: boolean;
  difficulty?: string;
}

export interface SpectatorVM {
  sessionId: string;
  nickname: string;
}

export interface LobbyView {
  isHost: boolean;
  isSpectator: boolean;
  roomCode: string;
  maxRounds: number;
  loadoutId: string;
  combatants: CombatantVM[];
  combatantCount: number;
  isFull: boolean;
  spectators: SpectatorVM[];
}

/**
 * Build the lobby render model from the live MatchState (or a plain stand-in
 * with the same shape). Pure — no DOM, no Pixi — so it can be unit-tested.
 */
export function buildLobbyView(state: any, localSessionId: string): LobbyView {
  const humans: CombatantVM[] = [];
  for (const [sid, t] of state.tanks as Map<string, any>) {
    humans.push({
      sessionId: sid,
      name: t.nickname,
      color: t.color,
      hat: t.hat,
      kind: "human",
      isHost: sid === state.hostId,
      isYou: sid === localSessionId,
      connected: t.connected !== false,
    });
  }
  const ai: CombatantVM[] = Array.from(state.aiSlots as Iterable<any>).map((s) => ({
    sessionId: s.sessionId,
    name: s.nickname || "AI",
    color: "white",
    hat: "none",
    kind: "ai" as const,
    isHost: false,
    isYou: false,
    connected: true,
    difficulty: s.difficulty,
  }));
  const combatants = [...humans, ...ai];
  const spectators: SpectatorVM[] = Array.from(state.observers as Iterable<any>).map((o) => ({
    sessionId: o.sessionId,
    nickname: o.nickname,
  }));
  const isAnyTank = (state.tanks as Map<string, any>).has(localSessionId);
  return {
    isHost: localSessionId === state.hostId,
    isSpectator: !isAnyTank && spectators.some((s) => s.sessionId === localSessionId),
    roomCode: state.roomCode,
    maxRounds: state.maxRounds,
    loadoutId: state.loadoutId,
    combatants,
    combatantCount: combatants.length,
    isFull: combatants.length >= MAX_PLAYERS,
    spectators,
  };
}
