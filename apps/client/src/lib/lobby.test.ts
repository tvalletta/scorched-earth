import { describe, it, expect } from "vitest";
import { parseRoomCode, inviteLink, buildLobbyView } from "./lobby";

describe("parseRoomCode", () => {
  it("extracts a 6-char code from the path, uppercased", () => {
    expect(parseRoomCode("/k7p2qx")).toBe("K7P2QX");
    expect(parseRoomCode("/ABC123")).toBe("ABC123");
  });
  it("returns null for non-code paths", () => {
    expect(parseRoomCode("/")).toBeNull();
    expect(parseRoomCode("/toolong12")).toBeNull();
    expect(parseRoomCode("/abc")).toBeNull();
  });
});

describe("inviteLink", () => {
  it("joins origin and code with a slash", () => {
    expect(inviteLink("http://localhost:5183", "K7P2QX")).toBe("http://localhost:5183/K7P2QX");
    expect(inviteLink("https://scorched.earth", "ABC123")).toBe("https://scorched.earth/ABC123");
  });
});

describe("buildLobbyView", () => {
  const baseState = () => ({
    hostId: "host",
    roomCode: "K7P2QX",
    maxRounds: 5,
    loadoutId: "standard",
    tanks: new Map<string, any>([
      ["host", { sessionId: "host", nickname: "ChaosEagle", color: "red", hat: "none", connected: true }],
      ["g1", { sessionId: "g1", nickname: "SilentWolf", color: "blue", hat: "none", connected: true }],
    ]),
    aiSlots: [{ sessionId: "ai-0", nickname: "Sgt. Boom", difficulty: "shooter" }],
    observers: [{ sessionId: "obs1", nickname: "LateLarry" }],
  });

  it("marks the local client as host and YOU", () => {
    const v = buildLobbyView(baseState(), "host");
    expect(v.isHost).toBe(true);
    expect(v.isSpectator).toBe(false);
    const me = v.combatants.find((c) => c.sessionId === "host")!;
    expect(me.isHost).toBe(true);
    expect(me.isYou).toBe(true);
    expect(me.kind).toBe("human");
  });

  it("lists humans then AI, with combatant count and capacity", () => {
    const v = buildLobbyView(baseState(), "g1");
    expect(v.isHost).toBe(false);
    expect(v.combatants.map((c) => c.sessionId)).toEqual(["host", "g1", "ai-0"]);
    expect(v.combatantCount).toBe(3);
    expect(v.isFull).toBe(false);
    const ai = v.combatants.find((c) => c.kind === "ai")!;
    expect(ai.difficulty).toBe("shooter");
  });

  it("flags isFull at 10 combatants", () => {
    const s = baseState();
    for (let i = 0; i < 8; i++) {
      s.tanks.set("x" + i, { sessionId: "x" + i, nickname: "X" + i, color: "lime", hat: "none", connected: true });
    }
    // 10 human tanks + 1 AI = 11 combatants -> isFull
    const v = buildLobbyView(s, "host");
    expect(v.isFull).toBe(true);
  });

  it("detects spectator when local id is only in observers", () => {
    const v = buildLobbyView(baseState(), "obs1");
    expect(v.isSpectator).toBe(true);
    expect(v.spectators.map((o) => o.nickname)).toContain("LateLarry");
  });
});
