import { describe, it, expect } from "vitest";
import { resolveLaserBeam } from "./laser";

describe("resolveLaserBeam", () => {
  it("hits a tank on the beam path (firing right at angle 0°)", () => {
    const terrain = new Int16Array(1600).fill(900); // terrain far below
    const result = resolveLaserBeam({
      originX: 100, originY: 500, angleDeg: 0,
      targets: [{ playerId: "p1", x: 400, y: 500, shieldHp: 0 }],
      damage: 80, terrain, terrainWidth: 1600, terrainHeight: 900,
    });
    expect(result.damages.find(d => d.playerId === "p1")).toBeDefined();
  });

  it("does not hit a tank beyond blocking terrain", () => {
    const terrain = new Int16Array(1600).fill(900);
    // Terrain wall at x=200-300, surface at y=490 (beam at y=500 would be below this)
    for (let x = 200; x < 300; x++) terrain[x] = 490;
    const result = resolveLaserBeam({
      originX: 100, originY: 500, angleDeg: 0,
      targets: [{ playerId: "p1", x: 400, y: 500, shieldHp: 0 }],
      damage: 80, terrain, terrainWidth: 1600, terrainHeight: 900,
    });
    expect(result.damages.find(d => d.playerId === "p1")).toBeUndefined();
  });

  it("hits multiple tanks on the line", () => {
    const terrain = new Int16Array(1600).fill(900);
    const result = resolveLaserBeam({
      originX: 100, originY: 500, angleDeg: 0,
      targets: [
        { playerId: "p1", x: 300, y: 500, shieldHp: 0 },
        { playerId: "p2", x: 600, y: 500, shieldHp: 0 },
      ],
      damage: 80, terrain, terrainWidth: 1600, terrainHeight: 900,
    });
    expect(result.damages).toHaveLength(2);
  });
});
