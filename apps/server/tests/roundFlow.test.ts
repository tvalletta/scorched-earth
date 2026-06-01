import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import appConfig from "../src/appConfig";

let colyseus: ColyseusTestServer;

beforeAll(async () => { colyseus = await boot(appConfig); });
afterAll(async () => { await colyseus.shutdown(); });
beforeEach(async () => { await colyseus.cleanup(); });

async function twoPlayerMatch(code: string) {
  const a = await colyseus.sdk.joinOrCreate("match", { code, nickname: "Alice", color: "red" });
  const b = await colyseus.sdk.joinOrCreate("match", { code, nickname: "Bob", color: "blue" });
  await new Promise((r) => setTimeout(r, 50));
  return { a, b };
}

describe("maxRounds configure", () => {
  it("host can set maxRounds 1-20", async () => {
    const { a, b } = await twoPlayerMatch("RND001");
    a.send("configure", { maxRounds: 3 });
    await new Promise((r) => setTimeout(r, 50));
    expect(a.state.maxRounds).toBe(3);
    await a.leave(); await b.leave();
  });

  it("non-host configure maxRounds is ignored", async () => {
    const { a, b } = await twoPlayerMatch("RND002");
    b.send("configure", { maxRounds: 10 });
    await new Promise((r) => setTimeout(r, 50));
    expect(a.state.maxRounds).toBe(5); // default
    await a.leave(); await b.leave();
  });

  it("clamps maxRounds to 1-20", async () => {
    const { a, b } = await twoPlayerMatch("RND003");
    a.send("configure", { maxRounds: 99 });
    await new Promise((r) => setTimeout(r, 50));
    expect(a.state.maxRounds).toBe(5); // rejected — stays at default
    await a.leave(); await b.leave();
  });
});

describe("buy intent", () => {
  it("buy is rejected outside shopping phase", async () => {
    const { a, b } = await twoPlayerMatch("RND010");
    a.send("buy", { weaponId: "missile" });
    await new Promise((r) => setTimeout(r, 50));
    const tank = a.state.tanks.get(a.sessionId)!;
    expect(tank.cash).toBe(10_000); // unchanged
    await a.leave(); await b.leave();
  });

  it("a DEAD player can buy during shopping (they respawn next round)", async () => {
    const { a, b } = await twoPlayerMatch("RND011");
    const room = colyseus.getRoomById(a.roomId) as any;
    // Simulate the post-round shopping state with this player eliminated last round.
    room.state.phase = "shopping";
    const serverTank = room.state.tanks.get(a.sessionId);
    serverTank.alive = false;
    serverTank.cash = 10_000;
    await new Promise((r) => setTimeout(r, 30));

    a.send("buy", { weaponId: "missile" }); // price 2000, packSize 5
    await new Promise((r) => setTimeout(r, 80));

    expect(serverTank.cash).toBe(8_000);
    expect(serverTank.inventory.get("missile")).toBe(5);
    await a.leave(); await b.leave();
  });
});

describe("tracer keep-turn (fix #3 — Part C)", () => {
  it("manually-fired tracer keeps the same player's turn", async () => {
    const { a, b } = await twoPlayerMatch("TRACER001");
    const room = colyseus.getRoomById(a.roomId) as any;

    // Disable turn timer so it can never auto-fire (avoids timeout path)
    a.send("configure", { turnTimerMs: 120_000 });
    await new Promise((r) => setTimeout(r, 30));

    // Start the match
    a.send("ready", {});
    // Wait until we're in "playing" phase
    const deadline = Date.now() + 5_000;
    while (a.state.phase !== "playing" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(a.state.phase).toBe("playing");

    const activeId = a.state.currentTurnPlayerId as string;

    // Give the active player a tracer in their inventory and select it
    const serverTank = room.state.tanks.get(activeId);
    serverTank.inventory.set("tracer", 5);
    serverTank.weaponId = "tracer";

    // Record who the active player is (should remain theirs after tracer lands)
    const beforeTurnPlayer = a.state.currentTurnPlayerId;

    // Fire the tracer with low power (straight up, low power = quick arc back down)
    a.send("fire", { angle: 90, power: 50 });

    // Wait for the shot to resolve: phase transitions resolving → playing (same player keeps turn)
    // First wait for resolving to start
    const resolvingDeadline = Date.now() + 3_000;
    while (a.state.phase !== "resolving" && Date.now() < resolvingDeadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
    // Then wait for it to return to playing
    const playingDeadline = Date.now() + 8_000;
    while (a.state.phase !== "playing" && Date.now() < playingDeadline) {
      await new Promise((r) => setTimeout(r, 20));
    }

    expect(a.state.phase).toBe("playing");
    // Same player still has the turn
    expect(a.state.currentTurnPlayerId).toBe(beforeTurnPlayer);

    await a.leave(); await b.leave();
  }, 15_000);

  it("normal (non-tracer) weapon advances the turn", async () => {
    const { a, b } = await twoPlayerMatch("TRACER002");
    const room = colyseus.getRoomById(a.roomId) as any;

    a.send("configure", { turnTimerMs: 120_000 });
    await new Promise((r) => setTimeout(r, 30));

    a.send("ready", {});
    const deadline = Date.now() + 5_000;
    while (a.state.phase !== "playing" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(a.state.phase).toBe("playing");

    const beforeTurnPlayer = a.state.currentTurnPlayerId as string;

    // Ensure baby-missile is equipped (default) and fire
    const serverTank = room.state.tanks.get(beforeTurnPlayer);
    serverTank.weaponId = "baby-missile";
    a.send("fire", { angle: 90, power: 50 });

    // Wait for resolving to start
    const resolvingDeadline2 = Date.now() + 3_000;
    while (a.state.phase !== "resolving" && Date.now() < resolvingDeadline2) {
      await new Promise((r) => setTimeout(r, 20));
    }
    // Wait for turn to advance (phase returns to playing AND player changed)
    const playingDeadline2 = Date.now() + 8_000;
    while (
      (a.state.phase !== "playing" || a.state.currentTurnPlayerId === beforeTurnPlayer) &&
      Date.now() < playingDeadline2
    ) {
      await new Promise((r) => setTimeout(r, 20));
    }

    expect(a.state.currentTurnPlayerId).not.toBe(beforeTurnPlayer);

    await a.leave(); await b.leave();
  }, 15_000);
});

describe("startMatch sets round=1 and cash", () => {
  it("all tanks start with DEFAULT_STARTING_CASH", async () => {
    const { a, b } = await twoPlayerMatch("RND020");
    a.send("ready");
    await new Promise((r) => setTimeout(r, 100));
    for (const [, tank] of a.state.tanks) {
      expect(tank.cash).toBe(10_000);
    }
    await a.leave(); await b.leave();
  });

  it("state.round is 1 after match start", async () => {
    const { a, b } = await twoPlayerMatch("RND021");
    a.send("ready");
    await new Promise((r) => setTimeout(r, 100));
    expect(a.state.round).toBe(1);
    await a.leave(); await b.leave();
  });
});
