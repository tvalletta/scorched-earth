import { describe, it, expect } from "vitest";
import { DIRT_CLOD, DIRT_BALL, LIQUID_DIRT, SANDHOG, TUNNELER } from "./group3-terrain";

describe("group3 terrain weapons", () => {
  it("DIRT_CLOD has terrainDeposit", () =>
    expect(DIRT_CLOD).toMatchObject({ id: "dirt-clod", damage: 0, terrainDeposit: { halfWidth: 20, height: 40 } }));
  it("DIRT_BALL has larger deposit", () =>
    expect(DIRT_BALL).toMatchObject({ id: "dirt-ball", terrainDeposit: { halfWidth: 40, height: 60 } }));
  it("LIQUID_DIRT has spray deposit", () =>
    expect(LIQUID_DIRT.terrainDeposit?.spray).toBe(true));
  it("SANDHOG has burrow true and zero damage", () =>
    expect(SANDHOG).toMatchObject({ id: "sandhog", burrow: true, damage: 0, price: 7_500 }));
  it("TUNNELER has burrow true and non-zero damage", () =>
    expect(TUNNELER).toMatchObject({ id: "tunneler", burrow: true, damage: 30, price: 9_000 }));
});
