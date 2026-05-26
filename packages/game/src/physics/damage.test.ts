import { describe, it, expect } from "vitest";
import { computeDamage } from "./damage";
import { BABY_MISSILE } from "../weapons/baby-missile";

describe("computeDamage", () => {
  it("returns empty array when no targets are in range", () => {
    const result = computeDamage(
      { x: 100, y: 100 },
      BABY_MISSILE,
      [{ playerId: "p1", x: 500, y: 500, shieldHp: 0 }],
    );
    expect(result).toEqual([]);
  });

  it("returns max damage for a direct hit", () => {
    const result = computeDamage(
      { x: 100, y: 100 },
      BABY_MISSILE,
      [{ playerId: "p1", x: 100, y: 100, shieldHp: 0 }],
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.playerId).toBe("p1");
    expect(result[0]!.amount).toBe(50);
    expect(result[0]!.hullDamage).toBe(50);
  });

  it("applies linear falloff", () => {
    // distance = 10, radius = 20 → 50% of 50 = 25 (floor)
    const result = computeDamage(
      { x: 100, y: 100 },
      BABY_MISSILE,
      [{ playerId: "p1", x: 110, y: 100, shieldHp: 0 }],
    );
    expect(result[0]!.amount).toBe(25);
  });

  it("treats edge of radius as 0 damage", () => {
    const result = computeDamage(
      { x: 100, y: 100 },
      BABY_MISSILE,
      [{ playerId: "p1", x: 120, y: 100, shieldHp: 0 }],
    );
    expect(result).toEqual([]);
  });

  it("damages multiple targets in range independently", () => {
    const result = computeDamage(
      { x: 100, y: 100 },
      BABY_MISSILE,
      [
        { playerId: "p1", x: 100, y: 100, shieldHp: 0 },
        { playerId: "p2", x: 100, y: 110, shieldHp: 0 },
        { playerId: "p3", x: 1000, y: 1000, shieldHp: 0 },
      ],
    );
    expect(result).toHaveLength(2);
    expect(result.find((d) => d.playerId === "p1")?.amount).toBe(50);
    expect(result.find((d) => d.playerId === "p2")?.amount).toBe(25);
    expect(result.find((d) => d.playerId === "p3")).toBeUndefined();
  });
});
