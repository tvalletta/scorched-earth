import { describe, it, expect } from "vitest";
import { ReplayRecorder } from "../src/rooms/ReplayRecorder.js";

// Minimal MatchState-like objects for testing (no Colyseus dependency needed)
function makeState(opts: {
  round?: number;
  terrainSeed?: string;
  terrainType?: string;
  terrainOpsLength?: number;
}) {
  return {
    round: opts.round ?? 1,
    terrainSeed: opts.terrainSeed ?? "seed1",
    terrainType: opts.terrainType ?? "hills",
    tanks: new Map(),
    wind: 0,
    terrainOps: Array.from({ length: opts.terrainOpsLength ?? 0 }, (_, i) => ({
      x: i * 10, y: 100, radius: 20, tick: i,
    })),
  };
}

describe("ReplayRecorder", () => {
  it("serializes a match with one round and one fire intent", () => {
    const rec = new ReplayRecorder();
    const state1 = makeState({ round: 1, terrainOpsLength: 0 });
    rec.captureRoundStart(1, state1 as never);
    rec.captureIntent("player1", "fire", { angle: 45, power: 500 });

    const state1End = makeState({ round: 1, terrainOpsLength: 2 });
    rec.captureRoundEnd(state1End as never);

    const replay = rec.serialize("room-abc");
    expect(replay.matchId).toBe("room-abc");
    expect(replay.version).toBe(1);
    expect(replay.rounds).toHaveLength(1);
    expect(replay.rounds[0]!.roundNumber).toBe(1);
    expect(replay.rounds[0]!.intents).toHaveLength(1);
    expect(replay.rounds[0]!.intents[0]!.kind).toBe("fire");
    expect(replay.rounds[0]!.carveOps).toHaveLength(2);
  });

  it("captures only this round's carve ops (slice by index)", () => {
    const rec = new ReplayRecorder();

    // Round 1: 3 carve ops
    rec.captureRoundStart(1, makeState({ terrainOpsLength: 0 }) as never);
    rec.captureRoundEnd(makeState({ terrainOpsLength: 3 }) as never);

    // Round 2: 2 more carve ops (total 5)
    rec.captureRoundStart(2, makeState({ round: 2, terrainOpsLength: 3 }) as never);
    rec.captureRoundEnd(makeState({ round: 2, terrainOpsLength: 5 }) as never);

    const replay = rec.serialize("room-xyz");
    expect(replay.rounds[0]!.carveOps).toHaveLength(3);
    expect(replay.rounds[1]!.carveOps).toHaveLength(2);
  });
});
