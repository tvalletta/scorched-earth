import { describe, it, expect } from "vitest";
import { nextTurnPlayerId } from "../src/rooms/turnController";

interface T { sessionId: string; alive: boolean; }

describe("nextTurnPlayerId", () => {
  it("returns the first alive player when current is empty", () => {
    const tanks: T[] = [
      { sessionId: "a", alive: true }, { sessionId: "b", alive: true },
    ];
    expect(nextTurnPlayerId(tanks, "")).toBe("a");
  });

  it("returns the next alive player after current", () => {
    const tanks: T[] = [
      { sessionId: "a", alive: true }, { sessionId: "b", alive: true }, { sessionId: "c", alive: true },
    ];
    expect(nextTurnPlayerId(tanks, "a")).toBe("b");
    expect(nextTurnPlayerId(tanks, "b")).toBe("c");
    expect(nextTurnPlayerId(tanks, "c")).toBe("a");
  });

  it("skips dead players", () => {
    const tanks: T[] = [
      { sessionId: "a", alive: true },
      { sessionId: "b", alive: false },
      { sessionId: "c", alive: true },
    ];
    expect(nextTurnPlayerId(tanks, "a")).toBe("c");
  });

  it("returns empty string when no alive players exist", () => {
    const tanks: T[] = [{ sessionId: "a", alive: false }];
    expect(nextTurnPlayerId(tanks, "")).toBe("");
  });
});
