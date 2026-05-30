import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { MatchState, Tank } from "@se/shared";
import { applySetIdentity } from "../src/rooms/identity";
import appConfig from "../src/appConfig";

let colyseus: ColyseusTestServer;

beforeAll(async () => { colyseus = await boot(appConfig); });
afterAll(async () => { await colyseus.shutdown(); });
beforeEach(async () => { await colyseus.cleanup(); });

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("applySetIdentity (pure)", () => {
  function lobbyStateWithHost(): MatchState {
    const state = new MatchState();
    state.phase = "lobby";
    const tank = new Tank();
    tank.sessionId = "host";
    tank.nickname = "Host";
    tank.color = "red";
    tank.hat = "none";
    state.tanks.set("host", tank);
    return state;
  }

  it("updates nickname/color/hat for the caller's tank during lobby", () => {
    const state = lobbyStateWithHost();
    applySetIdentity(state, "host", { nickname: "  Boom  ", color: "cyan", hat: "viking" });
    const t = state.tanks.get("host")!;
    expect(t.nickname).toBe("Boom");
    expect(t.color).toBe("cyan");
    expect(t.hat).toBe("viking");
  });

  it("ignores unknown color/hat", () => {
    const state = lobbyStateWithHost();
    applySetIdentity(state, "host", { color: "chartreuse", hat: "fedora" });
    const t = state.tanks.get("host")!;
    expect(t.color).toBe("red");
    expect(t.hat).toBe("none");
  });

  it("ignores empty/whitespace nickname", () => {
    const state = lobbyStateWithHost();
    applySetIdentity(state, "host", { nickname: "   " });
    expect(state.tanks.get("host")!.nickname).toBe("Host");
  });

  it("is a no-op when phase != lobby", () => {
    const state = lobbyStateWithHost();
    state.phase = "playing";
    applySetIdentity(state, "host", { nickname: "TooLate", color: "blue" });
    const t = state.tanks.get("host")!;
    expect(t.nickname).toBe("Host");
    expect(t.color).toBe("red");
  });

  it("is a no-op for a session without a tank", () => {
    const state = lobbyStateWithHost();
    expect(() => applySetIdentity(state, "ghost", { nickname: "X" })).not.toThrow();
    expect(state.tanks.has("ghost")).toBe(false);
  });
});

describe("MatchRoom set-identity (integration)", () => {
  it("propagates a host's identity edit into shared state", async () => {
    const a = await colyseus.sdk.joinOrCreate("match", { code: "IDENT1", nickname: "Alice", color: "red" });
    await wait(40);
    a.send("set-identity", { nickname: "Captain", color: "magenta", hat: "tophat" });
    await wait(60);
    const me = a.state.tanks.get(a.sessionId)!;
    expect(me.nickname).toBe("Captain");
    expect(me.color).toBe("magenta");
    expect(me.hat).toBe("tophat");
    await a.leave();
  });
});

describe("MatchRoom observers (spectators)", () => {
  it("a joiner over the combatant cap becomes a tracked spectator and is removed on leave", async () => {
    // Host + 9 AI = 10 combatants (cap), using only one client connection.
    const host = await colyseus.sdk.joinOrCreate("match", { code: "SPEC01", nickname: "Host", color: "red" });
    await wait(40);
    for (let i = 0; i < 9; i++) host.send("add-ai", { difficulty: "shooter" });
    await wait(120);
    expect(host.state.tanks.size + host.state.aiSlots.length).toBe(10);

    const watcher = await colyseus.sdk.joinOrCreate("match", { code: "SPEC01", nickname: "Watcher", color: "blue" });
    await wait(80);
    // watcher must not have become a combatant
    expect(host.state.tanks.has(watcher.sessionId)).toBe(false);
    expect(host.state.observers.length).toBe(1);
    expect(host.state.observers[0]!.nickname).toBe("Watcher");

    await watcher.leave();
    await wait(80);
    expect(host.state.observers.length).toBe(0);
    await host.leave();
  });

  it("a mid-match joiner becomes a spectator", async () => {
    const host = await colyseus.sdk.joinOrCreate("match", { code: "SPEC02", nickname: "Host", color: "red" });
    await wait(40);
    host.send("ready", {});                 // start the match → phase leaves "lobby"
    await wait(120);
    expect(host.state.phase).not.toBe("lobby");

    const late = await colyseus.sdk.joinOrCreate("match", { code: "SPEC02", nickname: "LateLarry", color: "green" });
    await wait(80);
    expect(host.state.tanks.has(late.sessionId)).toBe(false);
    expect(host.state.observers.some((o: { nickname: string }) => o.nickname === "LateLarry")).toBe(true);
    await late.leave();
    await host.leave();
  });
});
