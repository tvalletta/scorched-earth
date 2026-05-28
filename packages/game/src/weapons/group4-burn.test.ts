import { describe, it, expect } from "vitest";
import { NAPALM, HOT_NAPALM, FIREBALL } from "./group4-burn";

describe("group4 burn weapons", () => {
  it("NAPALM has burnOnImpact with 2 turns", () =>
    expect(NAPALM).toMatchObject({ id: "napalm", radius: 50, damage: 60, burnOnImpact: { width: 80, damage: 15, turnsLeft: 2 } }));
  it("HOT_NAPALM has larger burn zone", () =>
    expect(HOT_NAPALM.burnOnImpact).toMatchObject({ width: 120, damage: 25, turnsLeft: 2 }));
  it("FIREBALL has 1-turn burn", () =>
    expect(FIREBALL.burnOnImpact?.turnsLeft).toBe(1));
});
