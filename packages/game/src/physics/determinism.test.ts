/**
 * Simulation / replay determinism regression test
 *
 * Path B: run identical inputs twice through every deterministic simulation
 * entry-point and assert deep byte-identical results. Guards against PRNG
 * drift, terrain algorithm changes, physics regressions, and split-munition
 * non-determinism.
 *
 * Covers:
 *  1. PRNG — same seed → same sequence (primitive check; belt-and-suspenders)
 *  2. Terrain generation — all 9 terrain types + ceiling + underside
 *  3. simulateProjectile — straight shot, angled, wind, split-munition (MIRV apex)
 *  4. stepProjectiles — full multi-tick stream, two ticks back-to-back
 *  5. Mixed pipeline — terrain from seed, projectile launched, carveOp produced
 */

import { describe, it, expect } from "vitest";
import { createPrng } from "../rng/prng";
import { generateTerrain, generateCeiling, generateUnderside } from "../terrain/generate";
import { simulateProjectile } from "./simulate";
import { stepProjectiles, initialVelocityFromAnglePower } from "./step";
import { BABY_MISSILE } from "../weapons/baby-missile";
import { TRIPLE_WARHEAD } from "../weapons/group1-variants";
import type { SimInput, StepInput, LiveProjectile, TerrainOptions } from "../types";
import type { TerrainType } from "@se/shared";

// ─── helpers ────────────────────────────────────────────────────────────────

const W = 1600;
const H = 900;

function flatTerrain(surfaceY: number): Int16Array {
  const t = new Int16Array(W);
  for (let i = 0; i < W; i++) t[i] = surfaceY;
  return t;
}

function defaultSimInput(overrides: Partial<SimInput> = {}): SimInput {
  return {
    weapon: BABY_MISSILE,
    origin: { x: 400, y: 580 },
    angle: 60,
    power: 400,
    wind: 3,
    gravity: 250,
    terrain: flatTerrain(700),
    terrainWidth: W,
    terrainHeight: H,
    wallMode: "none",
    targets: [],
    ...overrides,
  };
}

function defaultStepInput(
  projectiles: LiveProjectile[],
  terrain = flatTerrain(700),
  overrides: Partial<StepInput> = {},
): StepInput {
  return {
    projectiles,
    tanks: [],
    terrain,
    terrainWidth: W,
    terrainHeight: H,
    wind: 2,
    gravity: 250,
    dt: 1 / 60,
    wallMode: "none",
    ...overrides,
  };
}

function makeLiveProjectile(id: string, x: number, y: number): LiveProjectile {
  const { vx, vy } = initialVelocityFromAnglePower(70, 350);
  return {
    id,
    x,
    y,
    vx,
    vy,
    weapon: BABY_MISSILE,
    ownerId: "player1",
    apexReached: false,
  };
}

// Deep-clone a LiveProjectile array so run B starts with the same state as run A
function cloneProjectiles(ps: LiveProjectile[]): LiveProjectile[] {
  return ps.map((p) => ({ ...p }));
}

// ─── 1. PRNG ─────────────────────────────────────────────────────────────────

describe("PRNG determinism", () => {
  it("same seed produces byte-identical float sequence (1 000 draws)", () => {
    const prng1 = createPrng("regression-seed-42");
    const prng2 = createPrng("regression-seed-42");
    const a = Array.from({ length: 1000 }, () => prng1.nextFloat());
    const b = Array.from({ length: 1000 }, () => prng2.nextFloat());
    expect(a).toEqual(b);
  });

  it("same seed produces byte-identical int sequence (nextInt + pick)", () => {
    const prng1 = createPrng("regression-int-seed");
    const prng2 = createPrng("regression-int-seed");
    const arr = ["north", "south", "east", "west"];
    const ints1 = Array.from({ length: 200 }, () => prng1.nextInt(-100, 100));
    const ints2 = Array.from({ length: 200 }, () => prng2.nextInt(-100, 100));
    const picks1 = Array.from({ length: 200 }, () => prng1.pick(arr));
    const picks2 = Array.from({ length: 200 }, () => prng2.pick(arr));
    expect(ints1).toEqual(ints2);
    expect(picks1).toEqual(picks2);
  });
});

// ─── 2. Terrain determinism ──────────────────────────────────────────────────

const ALL_TERRAIN_TYPES: TerrainType[] = [
  "mountains", "hills", "valleys", "cliffs", "crater",
  "sky-high", "plateau", "flat", "random",
];

describe("terrain generation determinism", () => {
  for (const type of ALL_TERRAIN_TYPES) {
    it(`generateTerrain("${type}") — identical heightmap on two calls with same seed`, () => {
      const opts: TerrainOptions = { seed: "det-terrain-2025", type, width: W, height: H };
      const run1 = generateTerrain(opts);
      const run2 = generateTerrain(opts);
      // Compare as plain arrays so assertion output is readable on failure
      expect(Array.from(run1)).toEqual(Array.from(run2));
    });
  }

  it("generateCeiling — identical ceiling on two calls with same floor + seed", () => {
    const opts: TerrainOptions = { seed: "det-cave-2025", type: "random", width: W, height: H };
    const floor = generateTerrain({ seed: "det-cave-2025", type: "flat", width: W, height: H });
    const ceil1 = generateCeiling(opts, floor);
    const ceil2 = generateCeiling(opts, floor);
    expect(Array.from(ceil1)).toEqual(Array.from(ceil2));
  });

  it("generateUnderside — identical underside on two calls with same seed", () => {
    const avgSurface = 550;
    const u1 = generateUnderside("det-under-2025", W, avgSurface);
    const u2 = generateUnderside("det-under-2025", W, avgSurface);
    expect(Array.from(u1)).toEqual(Array.from(u2));
  });

  it("different seeds produce different terrain (non-trivial uniqueness guard)", () => {
    const a = generateTerrain({ seed: "seed-A-unique", type: "random", width: W, height: H });
    const b = generateTerrain({ seed: "seed-B-unique", type: "random", width: W, height: H });
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});

// ─── 3. simulateProjectile determinism ───────────────────────────────────────

describe("simulateProjectile determinism", () => {
  it("straight vertical shot — identical trajectory + impact + carveOp", () => {
    const input = defaultSimInput({ angle: 90, power: 300, wind: 0 });
    const run1 = simulateProjectile(input);
    const run2 = simulateProjectile(input);
    expect(run1.samples).toEqual(run2.samples);
    // Non-null guard: vertical shot must land on terrain, not exit via ceiling/edge
    expect(run1.impact).not.toBeNull();
    expect(run1.impact).toEqual(run2.impact);
    expect(run1.carveOp).toEqual(run2.carveOp);
    expect(run1.durationMs).toEqual(run2.durationMs);
    expect(run1.damages).toEqual(run2.damages);
  });

  it("angled shot with wind — identical trajectory + impact + damages", () => {
    // 110° fires to the right; origin at x=800 (centre) with flat terrain at y=700
    // The shot reliably lands on terrain before reaching any edge.
    const input = defaultSimInput({
      origin: { x: 800, y: 580 },
      angle: 110,
      power: 300,
      wind: 5,
      terrain: flatTerrain(700),
      targets: [{ playerId: "opponent", x: 1000, y: 695, shieldHp: 0 }],
    });
    const run1 = simulateProjectile(input);
    const run2 = simulateProjectile(input);
    expect(run1.samples).toEqual(run2.samples);
    expect(run1.impact).toEqual(run2.impact);
    expect(run1.durationMs).toEqual(run2.durationMs);
    expect(run1.damages).toEqual(run2.damages);
    expect(run1.carveOp).toEqual(run2.carveOp);
    // Genuine: assert impact actually happened so the comparison isn't trivially null==null
    expect(run1.impact).not.toBeNull();
  });

  it("wrap wall mode — projectile wraps and lands with identical path both runs", () => {
    // Fire hard to the right so the projectile wraps around
    const input = defaultSimInput({
      origin: { x: 1550, y: 580 },
      angle: 170,
      power: 500,
      wind: 0,
      wallMode: "wrap",
    });
    const run1 = simulateProjectile(input);
    const run2 = simulateProjectile(input);
    expect(run1.samples).toEqual(run2.samples);
    // Non-null guard: wrapped shot must eventually land on terrain
    expect(run1.impact).not.toBeNull();
    expect(run1.impact).toEqual(run2.impact);
  });

  it("reflect wall mode — projectile bounces with identical path both runs", () => {
    const input = defaultSimInput({
      origin: { x: 50, y: 580 },
      angle: 30,
      power: 400,
      wind: 0,
      wallMode: "reflect",
    });
    const run1 = simulateProjectile(input);
    const run2 = simulateProjectile(input);
    expect(run1.samples).toEqual(run2.samples);
    // Non-null guard: reflected shot must eventually land on terrain
    expect(run1.impact).not.toBeNull();
    expect(run1.impact).toEqual(run2.impact);
  });

  it("cave mode (ceiling) — shot that hits ceiling is identical both runs", () => {
    const floor = flatTerrain(800);
    const opts: TerrainOptions = { seed: "cave-det", type: "flat", width: W, height: H };
    const ceiling = generateCeiling(opts, floor);
    const input = defaultSimInput({
      origin: { x: 800, y: 700 },
      angle: 90,
      power: 800,
      wind: 0,
      terrain: floor,
      ceiling,
    });
    const run1 = simulateProjectile(input);
    const run2 = simulateProjectile(input);
    // Ceiling hits don't set impact by design (documents intended behavior)
    expect(run1.impact).toBeNull();
    expect(run2.impact).toBeNull();
    // The real determinism signal: the trajectory must be non-trivial and byte-identical
    expect(run1.samples.length).toBeGreaterThan(1);
    expect(run1.samples).toEqual(run2.samples);
  });

  it("absorb wall mode — side-wall absorption produces non-null identical impact both runs", () => {
    // Fire from near the left edge hard to the left (angle 180° = pure -x direction)
    // so the projectile immediately crosses x < 0, triggering absorb.
    // simulate.ts lines 124-128: wallMode "absorb" sets impact = { x: edgeX, y } and breaks,
    // so carveOp is also derived from that impact.
    const input = defaultSimInput({
      origin: { x: 50, y: 580 },
      angle: 180,
      power: 600,
      wind: 0,
      wallMode: "absorb",
    });
    const run1 = simulateProjectile(input);
    const run2 = simulateProjectile(input);
    expect(run1.samples).toEqual(run2.samples);
    // Non-null guard: absorb must record the wall-impact point
    expect(run1.impact).not.toBeNull();
    expect(run1.impact).toEqual(run2.impact);
    expect(run1.carveOp).toEqual(run2.carveOp);
  });

  it("TRIPLE_WARHEAD (apex split MIRV) — identical split point and all child trajectories", () => {
    const input = defaultSimInput({
      weapon: TRIPLE_WARHEAD,
      origin: { x: 800, y: 600 },
      angle: 90,
      power: 400,
      wind: 0,
    });
    const run1 = simulateProjectile(input);
    const run2 = simulateProjectile(input);
    // Parent path up to split
    expect(run1.samples).toEqual(run2.samples);
    expect(run1.splitAt).toEqual(run2.splitAt);
    // Parent impact is structurally always null: apex-split returns before terrain landing
    expect(run1.impact).toBeNull();
    expect(run2.impact).toBeNull();
    // Children must be defined and identical
    expect(run1.children).toBeDefined();
    expect(run2.children).toBeDefined();
    expect(run1.children!.length).toBe(run2.children!.length);
    expect(run1.children!.length).toBeGreaterThan(0); // genuine non-trivial
    for (let i = 0; i < run1.children!.length; i++) {
      const c1 = run1.children![i]!;
      const c2 = run2.children![i]!;
      expect(c1.samples).toEqual(c2.samples);
      // Non-null guard: each child must land on terrain (child is a standard projectile)
      expect(c1.impact).not.toBeNull();
      expect(c1.impact).toEqual(c2.impact);
      expect(c1.carveOp).toEqual(c2.carveOp);
      expect(c1.durationMs).toEqual(c2.durationMs);
    }
  });
});

// ─── 4. stepProjectiles determinism ──────────────────────────────────────────

describe("stepProjectiles determinism", () => {
  it("single projectile — identical survivors/events after one tick", () => {
    const terrain = flatTerrain(700);
    const proj1 = [makeLiveProjectile("p1", 800, 500)];
    const proj2 = cloneProjectiles(proj1);

    const result1 = stepProjectiles(defaultStepInput(proj1, terrain));
    const result2 = stepProjectiles(defaultStepInput(proj2, terrain));

    expect(result1.survivors.length).toEqual(result2.survivors.length);
    expect(result1.events).toEqual(result2.events);
    expect(result1.spawned).toEqual(result2.spawned);
    expect(result1.shieldDrains).toEqual(result2.shieldDrains);
    // Unconditional guard: one tick from mid-air must not immediately destroy the projectile
    expect(result1.survivors.length).toBeGreaterThan(0);
    expect(result1.survivors[0]!.x).toEqual(result2.survivors[0]!.x);
    expect(result1.survivors[0]!.y).toEqual(result2.survivors[0]!.y);
    expect(result1.survivors[0]!.vx).toEqual(result2.survivors[0]!.vx);
    expect(result1.survivors[0]!.vy).toEqual(result2.survivors[0]!.vy);
  });

  it("multiple projectiles — identical state and events after 60 ticks", () => {
    const terrain = flatTerrain(700);
    let projs1: LiveProjectile[] = [
      makeLiveProjectile("a", 400, 400),
      makeLiveProjectile("b", 800, 350),
      makeLiveProjectile("c", 1200, 420),
    ];
    let projs2: LiveProjectile[] = cloneProjectiles(projs1);

    // Run 60 ticks (1 second of simulation)
    for (let tick = 0; tick < 60; tick++) {
      const r1 = stepProjectiles(defaultStepInput(projs1, terrain));
      const r2 = stepProjectiles(defaultStepInput(projs2, terrain));
      projs1 = r1.survivors;
      projs2 = r2.survivors;
    }

    // After 60 ticks: assert byte-identical x/y/vx/vy for all survivors
    expect(projs1.length).toEqual(projs2.length);
    for (let i = 0; i < projs1.length; i++) {
      expect(projs1[i]!.x).toEqual(projs2[i]!.x);
      expect(projs1[i]!.y).toEqual(projs2[i]!.y);
      expect(projs1[i]!.vx).toEqual(projs2[i]!.vx);
      expect(projs1[i]!.vy).toEqual(projs2[i]!.vy);
    }
  });

  it("projectile that hits terrain — identical impact event in both runs", () => {
    const terrain = flatTerrain(700);
    // Start near the surface heading downward so it definitely hits
    const { vx, vy } = initialVelocityFromAnglePower(90, 100);
    const near: LiveProjectile = {
      id: "near1",
      x: 800,
      y: 680,
      vx,
      vy: Math.abs(vy), // ensure positive (downward)
      weapon: BABY_MISSILE,
      ownerId: "player1",
      apexReached: false,
    };
    const proj1 = [near];
    const proj2 = [{ ...near }];

    let events1: ReturnType<typeof stepProjectiles>["events"] = [];
    let events2: ReturnType<typeof stepProjectiles>["events"] = [];
    let projs1 = proj1;
    let projs2 = proj2;

    // Run until both projectile lists are empty (impact removes projectile)
    for (let tick = 0; tick < 200 && (projs1.length > 0 || projs2.length > 0); tick++) {
      const r1 = stepProjectiles(defaultStepInput(projs1, terrain));
      const r2 = stepProjectiles(defaultStepInput(projs2, terrain));
      events1 = [...events1, ...r1.events];
      events2 = [...events2, ...r2.events];
      projs1 = r1.survivors;
      projs2 = r2.survivors;
    }

    const impact1 = events1.find((e) => e.kind === "terrain-impact");
    const impact2 = events2.find((e) => e.kind === "terrain-impact");

    // Genuine assertion: impact must have happened
    expect(impact1).toBeDefined();
    expect(impact2).toBeDefined();
    expect(impact1).toEqual(impact2);
  });
});

// ─── 5. Mixed pipeline — seed → terrain → launch → carveOp ───────────────────

describe("full mixed simulation pipeline determinism", () => {
  it("same seed produces identical terrain → projectile → carveOp pipeline, twice", () => {
    function runPipeline(seed: string) {
      // Step 1: derive terrain from seed
      const prng = createPrng(seed);
      const windForRound = (prng.nextFloat() - 0.5) * 20; // [-10, 10]
      const terrainTypes: TerrainType[] = ["mountains", "hills", "valleys", "cliffs"];
      const terrainType = terrainTypes[prng.nextInt(0, terrainTypes.length - 1)]!;

      const terrain = generateTerrain({ seed, type: terrainType, width: W, height: H });

      // Step 2: derive starting positions from seeded terrain — place tank in
      // the left half and fire rightward (angle 110°) so the shot reliably lands.
      const tankX = 400 + prng.nextInt(0, 100); // 400–500, keeps shot away from edges
      const tankY = (terrain[tankX] as number) - 10;

      // Step 3: simulate a shot (110° = rightward arc; stays on screen)
      const simInput: SimInput = {
        weapon: BABY_MISSILE,
        origin: { x: tankX, y: tankY },
        angle: 110,
        power: 300,
        wind: windForRound,
        gravity: 250,
        terrain,
        terrainWidth: W,
        terrainHeight: H,
        wallMode: "none",
        targets: [{ playerId: "enemy", x: tankX + 300, y: (terrain[Math.min(tankX + 300, W - 1)] as number) - 10, shieldHp: 0 }],
      };
      const result = simulateProjectile(simInput);

      return {
        terrainType,
        windForRound,
        // Snapshot a slice of the terrain (not the full 1600 elements for conciseness)
        terrainSlice: Array.from(terrain.slice(0, 200)),
        impact: result.impact,
        carveOp: result.carveOp,
        damages: result.damages,
        sampleCount: result.samples.length,
        firstSample: result.samples[0],
        lastSample: result.samples[result.samples.length - 1],
        durationMs: result.durationMs,
      };
    }

    const run1 = runPipeline("full-pipeline-seed-2025");
    const run2 = runPipeline("full-pipeline-seed-2025");

    expect(run1).toEqual(run2);

    // Genuine: ensure the simulation actually produced an impact (not vacuous)
    expect(run1.impact).not.toBeNull();
  });

  it("different seeds produce different outcomes (non-determinism guard)", () => {
    function justTerrain(seed: string) {
      return Array.from(generateTerrain({ seed, type: "random", width: W, height: H }));
    }
    const t1 = justTerrain("seed-unique-X");
    const t2 = justTerrain("seed-unique-Y");
    expect(t1).not.toEqual(t2);
  });
});
