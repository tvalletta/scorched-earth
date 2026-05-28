import { describe, it, expect } from "vitest";
import { createPrng } from "../rng/prng";
import { shopForAi } from "./shop";

describe("shopForAi", () => {
  it("returns an array of purchase requests", () => {
    const purchases = shopForAi({
      cash: 10_000,
      shieldId: "",
      difficulty: "shooter",
      prng: createPrng("shop-basic"),
    });
    expect(Array.isArray(purchases)).toBe(true);
  });

  it("moron — spends all available cash (buys something)", () => {
    const purchases = shopForAi({
      cash: 10_000,
      shieldId: "",
      difficulty: "moron",
      prng: createPrng("moron-shop"),
    });
    expect(purchases.length).toBeGreaterThan(0);
  });

  it("moron — each itemId is a valid weapon or item id", async () => {
    const { WEAPON_REGISTRY } = await import("../weapons/index");
    const { ITEM_REGISTRY } = await import("../items/index");
    const allIds = new Set([...WEAPON_REGISTRY.keys(), ...ITEM_REGISTRY.keys()]);
    const purchases = shopForAi({
      cash: 50_000,
      shieldId: "",
      difficulty: "moron",
      prng: createPrng("moron-ids"),
    });
    for (const p of purchases) {
      expect(allIds.has(p.itemId)).toBe(true);
    }
  });

  it("cyborg — always buys a shield when none equipped", () => {
    const shieldIds = ["shield", "heavy-shield", "super-magnetic", "force-shield"];
    const purchases = shopForAi({
      cash: 50_000,
      shieldId: "",
      difficulty: "cyborg",
      prng: createPrng("cyborg-shield"),
    });
    const boughtShield = purchases.some(p => shieldIds.includes(p.itemId));
    expect(boughtShield).toBe(true);
  });

  it("cyborg — does not buy a second shield if one already equipped", () => {
    const shieldIds = ["shield", "heavy-shield", "super-magnetic", "force-shield"];
    const purchases = shopForAi({
      cash: 50_000,
      shieldId: "shield",      // already equipped
      difficulty: "cyborg",
      prng: createPrng("cyborg-no-shield"),
    });
    const shieldPurchases = purchases.filter(p => shieldIds.includes(p.itemId));
    expect(shieldPurchases.length).toBe(0);
  });

  it("pyro — buys at least one fire weapon when cash allows", () => {
    const fireIds = ["napalm", "hot-napalm", "fireball"];
    const purchases = shopForAi({
      cash: 50_000,
      shieldId: "",
      difficulty: "pyro",
      prng: createPrng("pyro-fire"),
    });
    const boughtFire = purchases.some(p => fireIds.includes(p.itemId));
    expect(boughtFire).toBe(true);
  });

  it("returns empty array when cash is 0", () => {
    const purchases = shopForAi({
      cash: 0,
      shieldId: "",
      difficulty: "cyborg",
      prng: createPrng("zero-cash"),
    });
    expect(purchases).toHaveLength(0);
  });

  it("is deterministic — same seed same purchases", () => {
    const opts = { cash: 20_000, shieldId: "", difficulty: "shooter" as const };
    const r1 = shopForAi({ ...opts, prng: createPrng("det") });
    const r2 = shopForAi({ ...opts, prng: createPrng("det") });
    expect(r1.map(p => p.itemId)).toEqual(r2.map(p => p.itemId));
  });
});
