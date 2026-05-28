import { describe, it, expect } from "vitest";
import { stepProjectiles } from "./step";
import { ROLLER } from "../weapons/group2-physics";

const ROLLER_SPEED = 200; // px/s

describe("Roller physics", () => {
  it("converts to rolling on terrain hit", () => {
    const terrain = new Int16Array(1600).fill(500);
    const result = stepProjectiles({
      projectiles: [{ id: "r1", x: 400, y: 501, vx: 100, vy: 20,
                      weapon: ROLLER, ownerId: "p1", apexReached: true }],
      tanks: [], terrain, terrainWidth: 1600, terrainHeight: 900,
      wind: 0, gravity: 0, dt: 1/60, wallMode: "none",
    });
    expect(result.survivors).toHaveLength(1);
    expect(result.survivors[0].isRolling).toBe(true);
    // No terrain-impact yet — still rolling
    expect(result.events.find(e => e.kind === "terrain-impact")).toBeUndefined();
  });

  it("emits roller-hit when rolling projectile reaches a tank", () => {
    const terrain = new Int16Array(1600).fill(500);
    const result = stepProjectiles({
      projectiles: [{ id: "r1", x: 398, y: 500, vx: 0, vy: 0,
                      weapon: ROLLER, ownerId: "p1", apexReached: true,
                      isRolling: true, rollDir: 1 }],
      tanks: [{ sessionId: "p2", x: 400, y: 500, shieldHp: 0, shieldMaxHp: 0, shieldRadius: 0, shieldType: "" }],
      terrain, terrainWidth: 1600, terrainHeight: 900,
      wind: 0, gravity: 0, dt: 1/60, wallMode: "none",
    });
    expect(result.events.find(e => e.kind === "roller-hit")).toBeDefined();
  });
});
