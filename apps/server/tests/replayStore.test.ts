import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { storeReplay, getReplay } from "../src/rooms/replayStore.js";

describe("replayStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns stored replay by matchId", () => {
    const replay = { version: 1 as const, matchId: "m1", recordedAt: Date.now(), rounds: [] };
    storeReplay("m1", replay);
    expect(getReplay("m1")).toEqual(replay);
  });

  it("returns undefined for unknown matchId", () => {
    expect(getReplay("nope")).toBeUndefined();
  });

  it("expires after TTL_MS", () => {
    const replay = { version: 1 as const, matchId: "m2", recordedAt: Date.now(), rounds: [] };
    storeReplay("m2", replay);
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(getReplay("m2")).toBeUndefined();
  });
});
