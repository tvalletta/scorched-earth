import { describe, it, expect } from "vitest";
import { SHIELD_DEFS, MAGNETIC_DRAIN_HP_PER_SEC, REACTIVE_BLAST } from "./shields";

describe("SHIELD_DEFS (May-26 catalog)", () => {
  it("has exactly the 5 May-26 shields with correct mechanics", () => {
    expect([...SHIELD_DEFS.keys()].sort()).toEqual(
      ["auto-shield", "deflector-shield", "force-field", "magnetic-shield", "reactive-armor"].sort(),
    );
    expect(SHIELD_DEFS.get("force-field")).toMatchObject({ maxHp: 200, radius: 60, type: "absorb", hpCostFraction: 0.5, price: 1_500, packSize: 1 });
    expect(SHIELD_DEFS.get("deflector-shield")).toMatchObject({ maxHp: 500, radius: 70, type: "deflect", hpCostFraction: 0.25, price: 3_000, packSize: 1 });
    expect(SHIELD_DEFS.get("magnetic-shield")).toMatchObject({ maxHp: 600, radius: 100, type: "bend", hpCostFraction: 0, price: 3_500, packSize: 1 });
    expect(SHIELD_DEFS.get("reactive-armor")).toMatchObject({ maxHp: 1, radius: 50, type: "explode", hpCostFraction: 1, price: 2_000, packSize: 3 });
    expect(SHIELD_DEFS.get("auto-shield")).toMatchObject({ maxHp: 400, radius: 60, type: "absorb", hpCostFraction: 0.5, price: 2_500, packSize: 2 });
  });
  it("exposes magnetic + reactive constants", () => {
    expect(MAGNETIC_DRAIN_HP_PER_SEC).toBe(15);
    expect(REACTIVE_BLAST).toMatchObject({ radius: 60, damage: 40 });
  });
});
