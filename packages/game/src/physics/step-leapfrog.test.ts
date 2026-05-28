import { describe, it, expect } from "vitest";
import { stepProjectiles } from "./step";
import { LEAPFROG } from "../weapons/group2-physics";
import type { StepInput } from "../types";

function makeInput(overrides: Partial<StepInput> = {}): StepInput {
  const terrain = new Int16Array(1600).fill(900);
  return {
    projectiles: [], tanks: [], terrain,
    terrainWidth: 1600, terrainHeight: 900,
    wind: 0, gravity: 0, dt: 1 / 60, wallMode: "none",
    ...overrides,
  };
}

describe("Leapfrog bounce physics", () => {
  it("emits leapfrog-bounce on terrain hit (bounce 1 of 3)", () => {
    // y=500 == surfaceY; after applying vy*dt projectile moves into terrain, triggering bounce
    const terrain = new Int16Array(1600).fill(500);
    const result = stepProjectiles(makeInput({
      terrain,
      projectiles: [{ id: "l1", x: 400, y: 500, vx: 50, vy: 10,
                      weapon: LEAPFROG, ownerId: "p1", apexReached: true, bounceCount: 0 }],
    }));
    const bounce = result.events.find(e => e.kind === "leapfrog-bounce");
    expect(bounce).toBeDefined();
    expect(result.survivors).toHaveLength(1); // still alive after bounce 1
    expect(result.survivors[0].bounceCount).toBe(1);
  });

  it("emits terrain-impact on 4th hit (exhausted bounces)", () => {
    // bounceCount=3 == leapCount; next hit falls through to terrain-impact
    const terrain = new Int16Array(1600).fill(500);
    const result = stepProjectiles(makeInput({
      terrain,
      projectiles: [{ id: "l1", x: 400, y: 500, vx: 50, vy: 10,
                      weapon: LEAPFROG, ownerId: "p1", apexReached: true, bounceCount: 3 }],
    }));
    expect(result.events.find(e => e.kind === "terrain-impact")).toBeDefined();
    expect(result.survivors).toHaveLength(0);
  });
});
