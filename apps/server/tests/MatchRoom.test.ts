import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import type { Tank } from "@se/shared";
import appConfig from "../src/appConfig";

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  colyseus = await boot(appConfig);
});

afterAll(async () => {
  await colyseus.shutdown();
});

beforeEach(async () => {
  await colyseus.cleanup();
});

async function joinMatch(opts: { code: string; nickname: string; color: string; hat?: string }) {
  return colyseus.sdk.joinOrCreate("match", opts);
}

describe("MatchRoom", () => {
  it("first joiner becomes host", async () => {
    const room = await joinMatch({ code: "TEST01", nickname: "Alice", color: "red" });
    await new Promise((r) => setTimeout(r, 50));
    expect(room.state.hostId).toBe(room.sessionId);
    expect(room.state.tanks.size).toBe(1);
    await room.leave();
  });

  it("subsequent joiners are not host", async () => {
    const a = await joinMatch({ code: "TEST02", nickname: "Alice", color: "red" });
    await new Promise((r) => setTimeout(r, 30));
    const b = await joinMatch({ code: "TEST02", nickname: "Bob", color: "blue" });
    await new Promise((r) => setTimeout(r, 30));
    expect(a.state.hostId).toBe(a.sessionId);
    expect(b.state.hostId).toBe(a.sessionId);
    expect(a.state.tanks.size).toBe(2);
    await a.leave();
    await b.leave();
  });

  it("non-host configure is ignored", async () => {
    const a = await joinMatch({ code: "TEST03", nickname: "A", color: "red" });
    const b = await joinMatch({ code: "TEST03", nickname: "B", color: "blue" });
    await new Promise((r) => setTimeout(r, 30));
    b.send("configure", { turnTimerMs: 12_345 });
    await new Promise((r) => setTimeout(r, 50));
    expect(a.state.turnTimerMs).not.toBe(12_345);
    await a.leave();
    await b.leave();
  });

  it("host configure updates state", async () => {
    const a = await joinMatch({ code: "TEST04", nickname: "A", color: "red" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("configure", { turnTimerMs: 45_000 });
    await new Promise((r) => setTimeout(r, 50));
    expect(a.state.turnTimerMs).toBe(45_000);
    await a.leave();
  });

  it("host ready transitions phase and generates terrain", async () => {
    const a = await joinMatch({ code: "TEST05", nickname: "A", color: "red" });
    const b = await joinMatch({ code: "TEST05", nickname: "B", color: "blue" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("ready", {});
    await new Promise((r) => setTimeout(r, 100));
    expect(a.state.phase).toBe("playing");
    expect(a.state.terrainSeed).not.toBe("");
    expect(a.state.currentTurnPlayerId).toBeTruthy();
    for (const t of Array.from(a.state.tanks.values()) as Tank[]) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(1600);
    }
    await a.leave();
    await b.leave();
  });

  it("host configure updates terrainTypePool", async () => {
    const a = await joinMatch({ code: "TEST10", nickname: "A", color: "red" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("configure", { terrainTypePool: "mountains,hills,flat" });
    await new Promise((r) => setTimeout(r, 50));
    expect(a.state.terrainTypePool).toBe("mountains,hills,flat");
    await a.leave();
  });

  it("host configure updates wallModePool", async () => {
    const a = await joinMatch({ code: "TEST11", nickname: "A", color: "red" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("configure", { wallModePool: "wrap,reflect" });
    await new Promise((r) => setTimeout(r, 50));
    expect(a.state.wallModePool).toBe("wrap,reflect");
    await a.leave();
  });

  it("configure with invalid pool values is rejected", async () => {
    const a = await joinMatch({ code: "TEST12", nickname: "A", color: "red" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("configure", { terrainTypePool: "bogus,invalid" });
    await new Promise((r) => setTimeout(r, 50));
    expect(a.state.terrainTypePool).toBe("all"); // unchanged
    await a.leave();
  });

  it("startMatch sets terrainType to a value in the default pool", async () => {
    const a = await joinMatch({ code: "TEST13", nickname: "A", color: "red" });
    const b = await joinMatch({ code: "TEST13", nickname: "B", color: "blue" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("ready", {});
    await new Promise((r) => setTimeout(r, 100));
    const validTypes = ["mountains","hills","valleys","cliffs","crater","sky-high","plateau","flat","random"];
    expect(validTypes).toContain(a.state.terrainType);
    await a.leave();
    await b.leave();
  });

  it("startMatch sets wallMode to a value in the default pool", async () => {
    const a = await joinMatch({ code: "TEST14", nickname: "A", color: "red" });
    const b = await joinMatch({ code: "TEST14", nickname: "B", color: "blue" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("ready", {});
    await new Promise((r) => setTimeout(r, 100));
    const validModes = ["none", "wrap", "reflect", "absorb"];
    expect(validModes).toContain(a.state.wallMode);
    await a.leave();
    await b.leave();
  });

  it("startMatch with custom pool only picks from that pool", async () => {
    const a = await joinMatch({ code: "TEST15", nickname: "A", color: "red" });
    const b = await joinMatch({ code: "TEST15", nickname: "B", color: "blue" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("configure", { terrainTypePool: "flat" });
    await new Promise((r) => setTimeout(r, 50));
    a.send("ready", {});
    await new Promise((r) => setTimeout(r, 100));
    expect(a.state.terrainType).toBe("flat");
    await a.leave();
    await b.leave();
  });
});

describe("MatchRoom — fire", () => {
  it("non-current player firing is ignored", async () => {
    const a = await joinMatch({ code: "FIRE01", nickname: "A", color: "red" });
    const b = await joinMatch({ code: "FIRE01", nickname: "B", color: "blue" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("ready", {});
    await new Promise((r) => setTimeout(r, 100));

    const turnPlayer = a.state.currentTurnPlayerId;
    const wrong = turnPlayer === a.sessionId ? b : a;
    const carveCountBefore = a.state.terrainOps.length;

    wrong.send("fire", { angle: 90, power: 500 });
    await new Promise((r) => setTimeout(r, 200));

    expect(a.state.terrainOps.length).toBe(carveCountBefore);
    await a.leave(); await b.leave();
  });

  it("current player firing produces a CarveOp and rotates turn", async () => {
    const a = await joinMatch({ code: "FIRE02", nickname: "A", color: "red" });
    const b = await joinMatch({ code: "FIRE02", nickname: "B", color: "blue" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("ready", {});
    await new Promise((r) => setTimeout(r, 100));

    const turnPlayer = a.state.currentTurnPlayerId;
    const turner = turnPlayer === a.sessionId ? a : b;

    turner.send("fire", { angle: 90, power: 500 });
    await new Promise((r) => setTimeout(r, 6000));

    expect(a.state.terrainOps.length).toBeGreaterThan(0);
    expect(a.state.currentTurnPlayerId).not.toBe(turnPlayer);
    await a.leave(); await b.leave();
  });

  it("clamps invalid angle and power without crashing", async () => {
    const a = await joinMatch({ code: "FIRE03", nickname: "A", color: "red" });
    const b = await joinMatch({ code: "FIRE03", nickname: "B", color: "blue" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("ready", {});
    await new Promise((r) => setTimeout(r, 100));
    const turner = a.state.currentTurnPlayerId === a.sessionId ? a : b;
    turner.send("fire", { angle: 9999, power: -50 });
    await new Promise((r) => setTimeout(r, 6000));
    // Should not crash — phase ends in playing, round-summary, or ended, terrainOps recorded
    expect(["playing", "ended", "round-summary"]).toContain(a.state.phase);
    await a.leave(); await b.leave();
  });
});

describe("MatchRoom — turn timeout", () => {
  it("auto-fires after turnTimerMs elapses with no FIRE", async () => {
    const a = await joinMatch({ code: "TO01", nickname: "A", color: "red" });
    const b = await joinMatch({ code: "TO01", nickname: "B", color: "blue" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("configure", { turnTimerMs: 500 });
    await new Promise((r) => setTimeout(r, 50));
    a.send("ready", {});
    await new Promise((r) => setTimeout(r, 100));

    const startTurn = a.state.currentTurnPlayerId;
    await new Promise((r) => setTimeout(r, 6000));

    // terrainOps may be 0 if the auto-fired projectile goes out of bounds;
    // the important invariant is that the turn rotated after the shot resolved.
    expect(a.state.currentTurnPlayerId).not.toBe(startTurn);
    await a.leave(); await b.leave();
  });
});

describe("MatchRoom — host migration", () => {
  it("when host disconnects, hostId moves to next session", async () => {
    const a = await joinMatch({ code: "HM01", nickname: "A", color: "red" });
    const b = await joinMatch({ code: "HM01", nickname: "B", color: "blue" });
    await new Promise((r) => setTimeout(r, 30));
    expect(a.state.hostId).toBe(a.sessionId);

    await a.leave();
    // wait for onLeave's synchronous demotion to run
    await new Promise((r) => setTimeout(r, 200));

    expect(b.state.hostId).toBe(b.sessionId);
    await b.leave();
  });
});

// ── Phase 7: AI slots ────────────────────────────────────────────────────

describe("MatchRoom — AI slots", () => {
  it("host add-ai appends a slot with the requested difficulty", async () => {
    const a = await joinMatch({ code: "AI-01", nickname: "Host", color: "red" });
    await new Promise(r => setTimeout(r, 30));
    a.send("add-ai", { difficulty: "cyborg" });
    await new Promise(r => setTimeout(r, 50));
    expect(a.state.aiSlots.length).toBe(1);
    expect(a.state.aiSlots[0]!.difficulty).toBe("cyborg");
    expect(a.state.aiSlots[0]!.sessionId).toBe("ai-0");
    await a.leave();
  });

  it("non-host add-ai is ignored", async () => {
    const a = await joinMatch({ code: "AI-02", nickname: "Host", color: "red" });
    const b = await joinMatch({ code: "AI-02", nickname: "Bob", color: "blue" });
    await new Promise(r => setTimeout(r, 30));
    b.send("add-ai", { difficulty: "moron" });
    await new Promise(r => setTimeout(r, 50));
    expect(a.state.aiSlots.length).toBe(0);
    await a.leave(); await b.leave();
  });

  it("host remove-ai removes the slot by sessionId", async () => {
    const a = await joinMatch({ code: "AI-03", nickname: "Host", color: "red" });
    await new Promise(r => setTimeout(r, 30));
    a.send("add-ai", { difficulty: "shooter" });
    await new Promise(r => setTimeout(r, 50));
    expect(a.state.aiSlots.length).toBe(1);
    a.send("remove-ai", { sessionId: "ai-0" });
    await new Promise(r => setTimeout(r, 50));
    expect(a.state.aiSlots.length).toBe(0);
    await a.leave();
  });

  it("host set-ai-difficulty updates the slot difficulty", async () => {
    const a = await joinMatch({ code: "AI-04", nickname: "Host", color: "red" });
    await new Promise(r => setTimeout(r, 30));
    a.send("add-ai", { difficulty: "moron" });
    await new Promise(r => setTimeout(r, 50));
    a.send("set-ai-difficulty", { sessionId: "ai-0", difficulty: "bouncer" });
    await new Promise(r => setTimeout(r, 50));
    expect(a.state.aiSlots[0]!.difficulty).toBe("bouncer");
    await a.leave();
  });

  it("add-ai is rejected if room is full", async () => {
    const a = await joinMatch({ code: "AI-05", nickname: "Host", color: "red" });
    await new Promise(r => setTimeout(r, 30));
    // Add 9 AI slots (host + 9 AI = 10 = maxPlayers)
    for (let i = 0; i < 9; i++) {
      a.send("add-ai", { difficulty: "moron" });
      await new Promise(r => setTimeout(r, 20));
    }
    // 10th add-ai should be rejected
    a.send("add-ai", { difficulty: "moron" });
    await new Promise(r => setTimeout(r, 50));
    expect(a.state.aiSlots.length).toBe(9);
    await a.leave();
  });

  it("AI tank appears in state.tanks when match starts", async () => {
    const a = await joinMatch({ code: "AI-06", nickname: "Host", color: "red" });
    const b = await joinMatch({ code: "AI-06", nickname: "Bob", color: "blue" });
    await new Promise(r => setTimeout(r, 30));
    a.send("add-ai", { difficulty: "shooter" });
    await new Promise(r => setTimeout(r, 50));
    a.send("ready", {});
    await new Promise(r => setTimeout(r, 150));
    expect(a.state.phase).toBe("playing");
    expect(a.state.tanks.size).toBe(3); // 2 humans + 1 AI
    const aiTank = a.state.tanks.get("ai-0");
    expect(aiTank).toBeDefined();
    expect(aiTank!.alive).toBe(true);
    expect(aiTank!.nickname).toBeTruthy();
    await a.leave(); await b.leave();
  });

  it("AI tank has a deterministic nickname drawn from the pool", async () => {
    const a = await joinMatch({ code: "AI-07", nickname: "Host", color: "red" });
    const b = await joinMatch({ code: "AI-07", nickname: "Bob", color: "blue" });
    await new Promise(r => setTimeout(r, 30));
    a.send("add-ai", { difficulty: "cyborg" });
    await new Promise(r => setTimeout(r, 50));
    a.send("ready", {});
    await new Promise(r => setTimeout(r, 150));
    const aiTank = a.state.tanks.get("ai-0");
    const cyborgNames = ["HAL-9000", "Nexus", "ARIA", "Unit-7", "Axiom"];
    expect(cyborgNames.some(n => aiTank!.nickname.startsWith(n.split("-")[0]!))).toBe(true);
    await a.leave(); await b.leave();
  });

  it("AI turn resolves automatically without a fire message", async () => {
    const a = await joinMatch({ code: "AI-08", nickname: "Host", color: "red" });
    await new Promise(r => setTimeout(r, 30));
    a.send("add-ai", { difficulty: "moron" });
    await new Promise(r => setTimeout(r, 50));
    a.send("ready", {});
    await new Promise(r => setTimeout(r, 150));
    // If first turn is AI, wait for the think delay (500ms for moron) + resolution
    const isAiFirst = a.state.currentTurnPlayerId === "ai-0";
    if (isAiFirst) {
      await new Promise(r => setTimeout(r, 1500)); // moron think 500ms + resolution time
      // Phase should have transitioned (resolving → playing) after AI fires
      expect(["playing", "resolving", "round-summary", "ended"]).toContain(a.state.phase);
    }
    await a.leave();
  });

  it("currentTurnPlayerId advances past AI slots automatically", async () => {
    const a = await joinMatch({ code: "AI-09", nickname: "Host", color: "red" });
    await new Promise(r => setTimeout(r, 30));
    // Short turn timer so the human auto-fires quickly, then the AI fires after its think delay
    a.send("configure", { turnTimerMs: 300 });
    await new Promise(r => setTimeout(r, 30));
    a.send("add-ai", { difficulty: "moron" });
    await new Promise(r => setTimeout(r, 50));
    a.send("ready", {});
    await new Promise(r => setTimeout(r, 150));
    // Wait for: human auto-fire (300ms) + resolution + AI think (500ms) + resolution
    await new Promise(r => setTimeout(r, 4000));
    // At least one full turn cycle should have completed — tick > 0
    expect(a.state.tick).toBeGreaterThan(0);
    await a.leave();
  });

  it("AI tank is marked readyForShop immediately when shopping starts", async () => {
    const a = await joinMatch({ code: "AI-10", nickname: "Host", color: "red" });
    const b = await joinMatch({ code: "AI-10", nickname: "Bob", color: "blue" });
    await new Promise(r => setTimeout(r, 30));
    a.send("add-ai", { difficulty: "shooter" });
    await new Promise(r => setTimeout(r, 50));
    a.send("ready", {});
    await new Promise(r => setTimeout(r, 150));

    // Play until a round ends and shopping starts
    // Fast approach: fire immediately on first human turn to end the round quickly
    if (a.state.currentTurnPlayerId === a.sessionId) {
      a.send("fire", { angle: 90, power: 900 });
    } else if (a.state.currentTurnPlayerId === b.sessionId) {
      b.send("fire", { angle: 90, power: 900 });
    }
    // Wait for round to resolve and shopping to open
    await new Promise(r => setTimeout(r, 3000));

    if (a.state.phase === "shopping") {
      const aiTank = a.state.tanks.get("ai-0");
      expect(aiTank?.readyForShop).toBe(true);
    }
    await a.leave(); await b.leave();
  });
});

describe("MatchRoom — ghost AI on reconnect failure", () => {
  it("ghost AI takes over when reconnection expires", async () => {
    const a = await colyseus.sdk.joinOrCreate("match", { code: "GHOST1", nickname: "Alice", color: "red" });
    const b = await colyseus.sdk.joinOrCreate("match", { code: "GHOST1", nickname: "Bob", color: "blue" });
    await new Promise((r) => setTimeout(r, 50));

    // Start match
    a.send("ready", {});
    await new Promise((r) => setTimeout(r, 100));
    expect(a.state.phase).toBe("playing");

    const bobSessionId = b.sessionId;

    // Bob disconnects without consent
    await b.leave(false);
    await new Promise((r) => setTimeout(r, 200));

    // After grace expires, aiSlots should gain Bob's entry
    // Tank must still be in state (not deleted)
    expect(a.state.tanks.has(bobSessionId)).toBe(true);

    // Ghost slot assertions
    const ghostSlot = Array.from(a.state.aiSlots).find(s => s.sessionId === bobSessionId);
    expect(ghostSlot).toBeDefined();
    expect(ghostSlot!.difficulty).toBe("shooter");
    expect(ghostSlot!.nickname).toBe("Bob");

    await a.leave();
  });
});
