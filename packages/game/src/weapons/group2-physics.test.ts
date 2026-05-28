import { describe, it, expect } from "vitest";
import { LEAPFROG, ROLLER, HEAVY_ROLLER, LASER, PLASMA_WAVE, TRACER, SMOKE } from "./group2-physics";

describe("group2 physics weapons", () => {
  it("LEAPFROG has leapCount 3", () =>
    expect(LEAPFROG).toMatchObject({ id: "leapfrog", leapCount: 3, radius: 25, damage: 30, price: 6_000 }));
  it("ROLLER has rollOnImpact true", () =>
    expect(ROLLER).toMatchObject({ id: "roller", rollOnImpact: true, radius: 25, damage: 40, price: 7_000 }));
  it("HEAVY_ROLLER has rollOnImpact true", () =>
    expect(HEAVY_ROLLER).toMatchObject({ id: "heavy-roller", rollOnImpact: true, radius: 35, damage: 60, price: 14_000 }));
  it("LASER has laser true", () =>
    expect(LASER).toMatchObject({ id: "laser", laser: true, radius: 0, damage: 80, price: 20_000 }));
  it("PLASMA_WAVE has plasmaWave true", () =>
    expect(PLASMA_WAVE).toMatchObject({ id: "plasma-wave", plasmaWave: true, radius: 0, damage: 90, price: 18_000 }));
  it("TRACER has tracerMode true and zero damage", () =>
    expect(TRACER).toMatchObject({ id: "tracer", tracerMode: true, damage: 0, radius: 0, price: 1_000 }));
  it("SMOKE has smokeOnImpact", () =>
    expect(SMOKE.smokeOnImpact).toMatchObject({ width: 100, turnsLeft: 3 }));
});
