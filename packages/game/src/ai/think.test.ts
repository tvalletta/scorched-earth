import { describe, it, expect } from "vitest";
import { createPrng } from "../rng/prng";
import { WEAPON_REGISTRY } from "../weapons/index";
import { think } from "./think";

const W = 1600;
const FLAT = new Int16Array(W).fill(700);

function makeState(mySessionId: string, enemySessionId: string, difficulty = "shooter") {
  return {
    tanks: [
      { sessionId: mySessionId, x: 200, y: 700, hp: 100, alive: true,
        inventory: new Map([["baby-missile", 10], ["missile", 3]]) },
      { sessionId: enemySessionId, x: 1200, y: 700, hp: 80, alive: true,
        inventory: new Map([["baby-missile", 10]]) },
    ],
    aiSlots: [{ sessionId: mySessionId, difficulty }],
    wallMode: "none",
    wind: 0,
    gravity: 250,
  };
}

describe("think", () => {
  it("returns a valid AiIntent with angle [0,180] and power [100,900]", () => {
    const state = makeState("ai-0", "player-1");
    const result = think({
      state, terrain: FLAT, sessionId: "ai-0",
      prng: createPrng("think-basic"),
    });
    expect(WEAPON_REGISTRY.has(result.weaponId)).toBe(true);
    expect(result.angle).toBeGreaterThanOrEqual(0);
    expect(result.angle).toBeLessThanOrEqual(180);
    expect(result.power).toBeGreaterThanOrEqual(100);
    expect(result.power).toBeLessThanOrEqual(900);
  });

  it("targets the lowest-HP enemy", () => {
    const state = {
      tanks: [
        { sessionId: "ai-0", x: 800, y: 700, hp: 100, alive: true,
          inventory: new Map([["baby-missile", 10]]) },
        { sessionId: "p1", x: 200, y: 700, hp: 30, alive: true,
          inventory: new Map() },   // low HP — should be targeted
        { sessionId: "p2", x: 1400, y: 700, hp: 90, alive: true,
          inventory: new Map() },
      ],
      aiSlots: [{ sessionId: "ai-0", difficulty: "cyborg" }],
      wallMode: "none",
      wind: 0,
      gravity: 250,
    };
    const result = think({
      state, terrain: FLAT, sessionId: "ai-0",
      prng: createPrng("target-low-hp"),
    });
    // Cyborg targeting p1 (x=200, left of ai-0 at x=800) should fire angle < 90
    // (angle convention: 0°=left, 90°=up, 180°=right — see simulate.test.ts)
    expect(result.angle).toBeLessThan(90);
  });

  it("falls back to baby-missile if preferred weapons not in inventory", () => {
    const state = {
      tanks: [
        { sessionId: "ai-0", x: 200, y: 700, hp: 100, alive: true,
          inventory: new Map([["baby-missile", 5]]) },  // only baby-missile
        { sessionId: "p1", x: 1200, y: 700, hp: 100, alive: true,
          inventory: new Map() },
      ],
      aiSlots: [{ sessionId: "ai-0", difficulty: "cyborg" }],
      wallMode: "none", wind: 0, gravity: 250,
    };
    const result = think({
      state, terrain: FLAT, sessionId: "ai-0",
      prng: createPrng("fallback"),
    });
    expect(result.weaponId).toBe("baby-missile");
  });

  it("handles no enemies — fires at terrain center", () => {
    const state = {
      tanks: [
        { sessionId: "ai-0", x: 400, y: 700, hp: 100, alive: true,
          inventory: new Map([["baby-missile", 5]]) },
      ],
      aiSlots: [{ sessionId: "ai-0", difficulty: "shooter" }],
      wallMode: "none", wind: 0, gravity: 250,
    };
    const result = think({
      state, terrain: FLAT, sessionId: "ai-0",
      prng: createPrng("no-enemies"),
    });
    expect(result.weaponId).toBeTruthy();
    expect(result.angle).toBeGreaterThanOrEqual(0);
    expect(result.power).toBeGreaterThan(0);
  });

  it("is deterministic — same seed same result", () => {
    const state = makeState("ai-0", "player-1");
    const r1 = think({ state, terrain: FLAT, sessionId: "ai-0", prng: createPrng("det") });
    const r2 = think({ state, terrain: FLAT, sessionId: "ai-0", prng: createPrng("det") });
    expect(r1).toEqual(r2);
  });
});
