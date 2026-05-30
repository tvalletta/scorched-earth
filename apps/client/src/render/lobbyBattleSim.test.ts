import { describe, it, expect } from "vitest";
import { stepProjectile, aimAt, shouldReset, type SimProjectile } from "./lobbyBattleSim";

describe("stepProjectile", () => {
  it("applies gravity to vertical velocity over dt", () => {
    const p: SimProjectile = { x: 0, y: 0, vx: 100, vy: 0 };
    const next = stepProjectile(p, { gravity: 300, wind: 0, dt: 0.1 });
    expect(next.vy).toBeCloseTo(30, 5); // 300 * 0.1
    expect(next.x).toBeCloseTo(10, 5); // 100 * 0.1
  });
  it("nudges horizontal velocity by wind", () => {
    const p: SimProjectile = { x: 0, y: 0, vx: 0, vy: 0 };
    const next = stepProjectile(p, { gravity: 0, wind: 50, dt: 0.1 });
    expect(next.vx).toBeGreaterThan(0);
  });
});

describe("aimAt", () => {
  it("returns vx toward the target's horizontal direction", () => {
    expect(aimAt({ x: 0, y: 0 }, { x: 500, y: 0 }, 0).vx).toBeGreaterThan(0);
    expect(aimAt({ x: 500, y: 0 }, { x: 0, y: 0 }, 0).vx).toBeLessThan(0);
  });
  it("always launches upward (negative vy in screen space)", () => {
    expect(aimAt({ x: 0, y: 0 }, { x: 200, y: 0 }, 0).vy).toBeLessThan(0);
  });
});

describe("shouldReset", () => {
  it("resets when one or fewer tanks are alive", () => {
    expect(shouldReset({ aliveCount: 1, elapsedMs: 0, maxMs: 25000 })).toBe(true);
    expect(shouldReset({ aliveCount: 0, elapsedMs: 0, maxMs: 25000 })).toBe(true);
  });
  it("resets when elapsed exceeds maxMs", () => {
    expect(shouldReset({ aliveCount: 4, elapsedMs: 26000, maxMs: 25000 })).toBe(true);
  });
  it("does not reset mid-battle", () => {
    expect(shouldReset({ aliveCount: 3, elapsedMs: 1000, maxMs: 25000 })).toBe(false);
  });
});
