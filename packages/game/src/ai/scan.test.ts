import { describe, it, expect } from "vitest";
import { createPrng } from "../rng/prng";
import { BABY_MISSILE } from "../weapons/baby-missile";
import { simulateProjectile } from "../physics/simulate";
import { scanBestShot } from "./scan";
import { AI_PROFILES } from "./profiles";

const W = 1600;
const H = 900;
const FLAT = new Int16Array(W).fill(700);

describe("scanBestShot", () => {
  it("moron — returns angle [0,180] and power [100,900]", () => {
    const result = scanBestShot({
      origin: { x: 400, y: 700 },
      targets: [{ x: 1200, y: 700 }],
      terrain: FLAT, terrainWidth: W, terrainHeight: H,
      wallMode: "none", wind: 0, gravity: 250,
      weaponDef: BABY_MISSILE, profile: AI_PROFILES.moron,
      prng: createPrng("moron-seed"),
    });
    expect(result.angle).toBeGreaterThanOrEqual(0);
    expect(result.angle).toBeLessThanOrEqual(180);
    expect(result.power).toBeGreaterThanOrEqual(100);
    expect(result.power).toBeLessThanOrEqual(900);
  });

  it("moron — different seeds produce different results", () => {
    const r1 = scanBestShot({
      origin: { x: 400, y: 700 }, targets: [{ x: 1200, y: 700 }],
      terrain: FLAT, terrainWidth: W, terrainHeight: H,
      wallMode: "none", wind: 0, gravity: 250,
      weaponDef: BABY_MISSILE, profile: AI_PROFILES.moron,
      prng: createPrng("seed-A"),
    });
    const r2 = scanBestShot({
      origin: { x: 400, y: 700 }, targets: [{ x: 1200, y: 700 }],
      terrain: FLAT, terrainWidth: W, terrainHeight: H,
      wallMode: "none", wind: 0, gravity: 250,
      weaponDef: BABY_MISSILE, profile: AI_PROFILES.moron,
      prng: createPrng("seed-B"),
    });
    expect(r1.angle !== r2.angle || r1.power !== r2.power).toBe(true);
  });

  it("cyborg — trajectory passes within 150px of target (no wind, flat terrain)", () => {
    const target = { x: 800, y: 700 };
    const result = scanBestShot({
      origin: { x: 200, y: 700 }, targets: [target],
      terrain: FLAT, terrainWidth: W, terrainHeight: H,
      wallMode: "none", wind: 0, gravity: 250,
      weaponDef: BABY_MISSILE, profile: AI_PROFILES.cyborg,
      prng: createPrng("cyborg-aim"),
    });
    // Verify the selected angle/power produces a trajectory near the target
    const traj = simulateProjectile({
      weapon: BABY_MISSILE,
      origin: { x: 200, y: 700 },
      angle: result.angle, power: result.power,
      wind: 0, gravity: 250,
      terrain: FLAT, terrainWidth: W, terrainHeight: H,
      wallMode: "none", targets: [],
    });
    let minDist = Infinity;
    for (const s of traj.samples) {
      const dx = s.x - target.x;
      const dy = s.y - target.y;
      minDist = Math.min(minDist, Math.sqrt(dx * dx + dy * dy));
    }
    expect(minDist).toBeLessThan(150);
  });

  it("is deterministic — same seed same result", () => {
    const opts = {
      origin: { x: 300, y: 700 }, targets: [{ x: 900, y: 700 }],
      terrain: FLAT, terrainWidth: W, terrainHeight: H,
      wallMode: "none" as const, wind: 0, gravity: 250,
      weaponDef: BABY_MISSILE, profile: AI_PROFILES.shooter,
    };
    const r1 = scanBestShot({ ...opts, prng: createPrng("det") });
    const r2 = scanBestShot({ ...opts, prng: createPrng("det") });
    expect(r1.angle).toBeCloseTo(r2.angle);
    expect(r1.power).toBeCloseTo(r2.power);
  });
});
