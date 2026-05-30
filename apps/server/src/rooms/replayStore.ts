export interface ReplayFile {
  version: 1;
  matchId: string;
  recordedAt: number;
  rounds: RoundRecord[];
}

export interface RoundRecord {
  roundNumber: number;
  snapshot: Record<string, unknown>;
  intents: IntentRecord[];
  carveOps: SerializedCarveOp[];
}

export interface IntentRecord {
  ts: number;
  playerId: string;
  kind: string;
  payload: unknown;
}

export interface SerializedCarveOp {
  x: number;
  y: number;
  radius: number;
  tick: number;
  layer?: string;
}

const TTL_MS = 10 * 60 * 1000;
const store = new Map<string, ReplayFile>();

export function storeReplay(matchId: string, replay: ReplayFile): void {
  store.set(matchId, replay);
  setTimeout(() => store.delete(matchId), TTL_MS);
}

export function getReplay(matchId: string): ReplayFile | undefined {
  return store.get(matchId);
}
