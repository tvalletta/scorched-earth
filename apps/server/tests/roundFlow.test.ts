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
