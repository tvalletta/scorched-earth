import { describe, it, expect } from "vitest";
import { checkMatchInvariants, checkCameraFinite } from "./invariants";

const baseTank = { sessionId: "a", hp: 100, alive: true, x: 10, y: 20, angle: 90, power: 500 };
const baseState = {
  phase: "playing", round: 1, maxRounds: 5, currentTurnPlayerId: "a",
  tanks: [baseTank],
};

describe("checkMatchInvariants", () => {
  it("passes a healthy state", () => {
    expect(checkMatchInvariants(baseState)).toEqual([]);
  });
  it("flags hp out of range", () => {
    const v = checkMatchInvariants({ ...baseState, tanks: [{ ...baseTank, hp: 140 }] });
    expect(v.map((x) => x.name)).toContain("hp-range");
  });
  it("flags alive/hp inconsistency", () => {
    const v = checkMatchInvariants({ ...baseState, tanks: [{ ...baseTank, hp: 0, alive: true }] });
    expect(v.map((x) => x.name)).toContain("alive-consistency");
  });
  it("flags NaN position", () => {
    const v = checkMatchInvariants({ ...baseState, tanks: [{ ...baseTank, x: NaN }] });
    expect(v.map((x) => x.name)).toContain("finite-position");
  });
  it("flags a turn pointer that is not a live tank during playing", () => {
    const v = checkMatchInvariants({ ...baseState, currentTurnPlayerId: "ghost" });
    expect(v.map((x) => x.name)).toContain("turn-pointer");
  });
});

describe("checkCameraFinite", () => {
  it("flags non-finite scale", () => {
    expect(checkCameraFinite({ x: 0, y: 0, scale: NaN }).map((v) => v.name)).toContain("camera-finite");
  });
});
