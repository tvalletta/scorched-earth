import type { MatchState } from "@se/shared";
import type { ReplayFile, RoundRecord, IntentRecord, SerializedCarveOp } from "./replayStore.js";

export class ReplayRecorder {
  private rounds: RoundRecord[] = [];
  private currentIntents: IntentRecord[] = [];
  private roundCarveStartIdx = 0;
  private readonly matchStart = Date.now();
  private _pendingRoundNumber = 1;
  private _pendingSnapshot: Record<string, unknown> = {};

  captureRoundStart(roundNumber: number, state: MatchState): void {
    this.currentIntents = [];
    this.roundCarveStartIdx = state.terrainOps.length;
    this._pendingRoundNumber = roundNumber;
    this._pendingSnapshot = this.snapshotState(state);
  }

  captureIntent(playerId: string, kind: string, payload: unknown): void {
    this.currentIntents.push({
      ts: Date.now() - this.matchStart,
      playerId,
      kind,
      payload,
    });
  }

  captureRoundEnd(state: MatchState): void {
    const carveOps: SerializedCarveOp[] = [];
    const ops = state.terrainOps;
    for (let i = this.roundCarveStartIdx; i < ops.length; i++) {
      const op = ops[i]!;
      carveOps.push({ x: op.x, y: op.y, radius: op.radius, tick: op.tick, layer: op.layer });
    }
    this.rounds.push({
      roundNumber: this._pendingRoundNumber,
      snapshot: this._pendingSnapshot,
      intents: [...this.currentIntents],
      carveOps,
    });
  }

  serialize(matchId: string): ReplayFile {
    return {
      version: 1,
      matchId,
      recordedAt: this.matchStart,
      rounds: this.rounds,
    };
  }

  private snapshotState(state: MatchState): Record<string, unknown> {
    return JSON.parse(JSON.stringify({
      terrainSeed: state.terrainSeed,
      terrainType: state.terrainType,
      hasCeiling: state.hasCeiling,
      ceilingSeed: state.ceilingSeed,
      wind: state.wind,
      tanks: Object.fromEntries(
        Array.from(state.tanks.entries()).map(([id, t]) => [
          id,
          {
            x: t.x, y: t.y, hp: t.hp, alive: t.alive,
            nickname: t.nickname, color: t.color, hat: t.hat,
            angle: t.angle, power: t.power,
          },
        ])
      ),
    }));
  }
}
