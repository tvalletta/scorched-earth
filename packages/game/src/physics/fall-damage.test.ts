import { describe, it, expect } from "vitest";
import { computeFallDamage } from "./fall-damage";

describe("computeFallDamage", () => {
  it("returns no damage for fall under 20px threshold", () => {
    expect(computeFallDamage({ sessionId: "a", tankY: 90, surfaceY: 108, hasParachute: false }))
      .toEqual({ damage: 0, parachuteConsumed: false });
  });

  it("returns no damage for fall exactly at threshold boundary (19px)", () => {
    expect(computeFallDamage({ sessionId: "a", tankY: 100, surfaceY: 119, hasParachute: false }))
      .toEqual({ damage: 0, parachuteConsumed: false });
  });

  it("returns damage for fall >= 20px", () => {
    expect(computeFallDamage({ sessionId: "a", tankY: 80, surfaceY: 120, hasParachute: false }))
      .toEqual({ damage: 20, parachuteConsumed: false });
  });

  it("floors fractional damage", () => {
    // fallDistance = 21, floor(21 * 0.5) = 10
    expect(computeFallDamage({ sessionId: "a", tankY: 100, surfaceY: 121, hasParachute: false }))
      .toEqual({ damage: 10, parachuteConsumed: false });
  });

  it("large fall: 200px → damage 100", () => {
    expect(computeFallDamage({ sessionId: "a", tankY: 0, surfaceY: 200, hasParachute: false }))
      .toEqual({ damage: 100, parachuteConsumed: false });
  });

  it("parachute zeroes damage and is consumed for fall >= 20px", () => {
    expect(computeFallDamage({ sessionId: "a", tankY: 80, surfaceY: 120, hasParachute: true }))
      .toEqual({ damage: 0, parachuteConsumed: true });
  });

  it("parachute is NOT consumed for fall under threshold", () => {
    expect(computeFallDamage({ sessionId: "a", tankY: 90, surfaceY: 108, hasParachute: true }))
      .toEqual({ damage: 0, parachuteConsumed: false });
  });
});
