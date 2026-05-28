import { describe, it, expect } from "vitest";
import { DEATHS_HEAD, DEATHS_KNELL, TRIPLE_WARHEAD, PINEAPPLE, FUNKY_NUKE, PLASMA_BALL, PLASMA_BLAST } from "./group1-variants";

describe("group1 variant weapons", () => {
  it("DEATHS_HEAD has correct stats", () =>
    expect(DEATHS_HEAD).toMatchObject({ id: "deaths-head", radius: 80, damage: 150, price: 75_000, packSize: 1 }));
  it("DEATHS_KNELL has correct stats", () =>
    expect(DEATHS_KNELL).toMatchObject({ id: "deaths-knell", radius: 70, damage: 130, price: 50_000, packSize: 1 }));
  it("TRIPLE_WARHEAD splits into 3 children", () => {
    expect(TRIPLE_WARHEAD.split?.count).toBe(3);
    expect(TRIPLE_WARHEAD.split?.child.radius).toBe(40);
  });
  it("PINEAPPLE splits into 9 children", () =>
    expect(PINEAPPLE.split?.count).toBe(9));
  it("FUNKY_NUKE splits into 8 baby-nuke children", () => {
    expect(FUNKY_NUKE.split?.count).toBe(8);
    expect(FUNKY_NUKE.split?.child.id).toBe("baby-nuke");
  });
  it("PLASMA_BALL has shieldPierce 0.5", () =>
    expect(PLASMA_BALL).toMatchObject({ id: "plasma-ball", shieldPierce: 0.5, radius: 35, damage: 70, price: 5_000, packSize: 3 }));
  it("PLASMA_BLAST has shieldPierce 0.5", () =>
    expect(PLASMA_BLAST).toMatchObject({ id: "plasma-blast", shieldPierce: 0.5, radius: 50, damage: 110, price: 10_000, packSize: 2 }));
});
