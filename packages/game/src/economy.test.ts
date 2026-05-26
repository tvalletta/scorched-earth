import { describe, it, expect } from "vitest";
import { computeRoundEarnings, validatePurchase } from "./economy";
import type { ShopWeaponEntry } from "./economy";

const REGISTRY: ShopWeaponEntry[] = [
  { id: "baby-missile", price: 0,      packSize: 0 },
  { id: "missile",      price: 2_000,  packSize: 5 },
  { id: "baby-nuke",    price: 5_000,  packSize: 3 },
  { id: "nuke",         price: 10_000, packSize: 2 },
];

describe("computeRoundEarnings", () => {
  it("returns zero earnings for idle player", () => {
    const r = computeRoundEarnings(0, 0, false);
    expect(r.damageReward).toBe(0);
    expect(r.killReward).toBe(0);
    expect(r.survivalBonus).toBe(0);
    expect(r.total).toBe(0);
  });

  it("damage reward = 100 * damage dealt", () => {
    const r = computeRoundEarnings(175, 0, false);
    expect(r.damageReward).toBe(17_500);
    expect(r.total).toBe(17_500);
  });

  it("kill reward = 1000 * kills", () => {
    const r = computeRoundEarnings(0, 3, false);
    expect(r.killReward).toBe(3_000);
    expect(r.total).toBe(3_000);
  });

  it("survival bonus = 500 when survived", () => {
    const r = computeRoundEarnings(0, 0, true);
    expect(r.survivalBonus).toBe(500);
    expect(r.total).toBe(500);
  });

  it("no survival bonus when eliminated", () => {
    const r = computeRoundEarnings(50, 1, false);
    expect(r.survivalBonus).toBe(0);
    expect(r.total).toBe(6_000);
  });

  it("combined: 175 damage + 2 kills + survived", () => {
    const r = computeRoundEarnings(175, 2, true);
    expect(r.damageReward).toBe(17_500);
    expect(r.killReward).toBe(2_000);
    expect(r.survivalBonus).toBe(500);
    expect(r.total).toBe(20_000);
  });
});

describe("validatePurchase", () => {
  it("returns ok=false for unknown weapon", () => {
    const r = validatePurchase("unknown", 50_000, new Map(), REGISTRY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown_weapon");
  });

  it("returns ok=false for weapon with packSize 0 (not sold)", () => {
    const r = validatePurchase("baby-missile", 50_000, new Map(), REGISTRY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown_weapon");
  });

  it("returns ok=false when insufficient funds", () => {
    const r = validatePurchase("missile", 1_999, new Map(), REGISTRY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("insufficient_funds");
  });

  it("returns ok=false at exact boundary (price - 1)", () => {
    const r = validatePurchase("nuke", 9_999, new Map(), REGISTRY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("insufficient_funds");
  });

  it("succeeds when cash exactly equals price", () => {
    const r = validatePurchase("missile", 2_000, new Map(), REGISTRY);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.newCash).toBe(0);
      expect(r.newInventory.get("missile")).toBe(5);
    }
  });

  it("stacks on top of existing inventory", () => {
    const inv = new Map([["missile", 3]]);
    const r = validatePurchase("missile", 10_000, inv, REGISTRY);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.newInventory.get("missile")).toBe(8); // 3 + 5
      expect(r.newCash).toBe(8_000);
    }
  });

  it("does not mutate the original inventory map", () => {
    const inv = new Map([["missile", 2]]);
    validatePurchase("missile", 10_000, inv, REGISTRY);
    expect(inv.get("missile")).toBe(2);
  });
});
