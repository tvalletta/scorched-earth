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
});
