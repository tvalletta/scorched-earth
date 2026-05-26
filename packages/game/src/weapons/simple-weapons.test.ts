import { describe, it, expect } from "vitest";
import { MISSILE } from "./missile";
import { BABY_NUKE } from "./baby-nuke";
import { NUKE } from "./nuke";
import { DEATH_EXPLOSION } from "./death-explosion";

describe("simple weapon definitions", () => {
  it("MISSILE", () => {
    expect(MISSILE).toMatchObject({ id: "missile", radius: 30, damage: 50, windImmune: false });
    expect(MISSILE.split).toBeUndefined();
  });
  it("BABY_NUKE", () => {
    expect(BABY_NUKE).toMatchObject({ id: "baby-nuke", radius: 45, damage: 75, windImmune: false });
    expect(BABY_NUKE.split).toBeUndefined();
  });
  it("NUKE", () => {
    expect(NUKE).toMatchObject({ id: "nuke", radius: 60, damage: 100, windImmune: false });
    expect(NUKE.split).toBeUndefined();
  });
  it("DEATH_EXPLOSION is wind-immune with no split", () => {
    expect(DEATH_EXPLOSION).toMatchObject({ id: "death-explosion", radius: 40, damage: 30, windImmune: true });
    expect(DEATH_EXPLOSION.split).toBeUndefined();
  });
});
