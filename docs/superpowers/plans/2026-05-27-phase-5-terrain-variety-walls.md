# Phase 5 — Terrain Variety & Walls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 9 terrain types, 4 wall-boundary modes, host-configurable pools, HUD pill, and trajectory preview to the Scorched Earth web game.

**Architecture:** Terrain type and wall mode are picked at round start from host-configured pools (comma-delimited state strings). `TerrainType` and `WallMode` live in `@se/shared` so both server and client can import them without circular deps. Wall mode logic is added to both `stepProjectiles` (server physics) and `simulateProjectile` (client aim preview), sharing the same switch structure. Lobby pool pickers live in `AimControls.ts` alongside existing host lobby controls (loadout, max-rounds).

**Tech Stack:** TypeScript, Vitest (TDD for `@se/game`), Colyseus schema, PixiJS v8, pnpm workspaces

---

## File Map

| File | Status | Change |
|---|---|---|
| `packages/shared/src/constants.ts` | Modify | Add `TerrainType`, `WallMode`, `ALL_TERRAIN_TYPES`, `ALL_WALL_MODES`, `parsePool` |
| `packages/shared/src/intents.ts` | Modify | Add `terrainTypePool?`, `wallModePool?` to configure intent |
| `packages/shared/src/index.ts` | Modify | Export new types (already does `export * from "./constants"`) |
| `packages/shared/src/schema/MatchState.ts` | Modify | Add `wallMode`, `terrainTypePool`, `wallModePool` fields |
| `packages/game/src/rng/prng.ts` | Modify | Add `pick<T>` to `Prng` interface and `createPrng` return |
| `packages/game/src/rng/prng.test.ts` | Modify | Add `pick` tests |
| `packages/game/src/types.ts` | Modify | Import `TerrainType`, update `TerrainOptions.type`, add `wallMode` to `StepInput`; change `SimInput.walls` → `SimInput.wallMode` |
| `packages/game/src/terrain/generate.ts` | Modify | Dispatcher + 8 new generators (keeping `genRandom`) |
| `packages/game/src/terrain/generate.test.ts` | Modify | 9 smoke tests (one per type) |
| `packages/game/src/physics/step.ts` | Modify | Wall-mode dispatcher replacing flat OOB check |
| `packages/game/src/physics/step.test.ts` | Modify | 4 wall-mode tests |
| `packages/game/src/physics/simulate.ts` | Modify | Wall-mode logic for trajectory preview |
| `packages/game/src/index.ts` | Modify | Export `TerrainType`, `WallMode`, `ALL_TERRAIN_TYPES` |
| `apps/server/src/rooms/MatchRoom.ts` | Modify | Configure handler additions; `startMatch`/`startNextRound` pool draw |
| `apps/server/tests/MatchRoom.test.ts` | Modify | Pool configure + round start tests |
| `apps/client/src/render/Terrain.ts` | Modify | Accept `TerrainType` in constructor |
| `apps/client/src/scenes/MatchScene.ts` | Modify | Listen `terrainType`/`wallMode`; wire `RoundInfo`; add trajectory preview |
| `apps/client/src/hud/RoundInfo.ts` | Create | Terrain type + wall mode HUD pill |
| `apps/client/src/render/TrajectoryOverlay.ts` | Create | Dotted aim line overlay |
| `apps/client/src/input/AimControls.ts` | Modify | Pool picker checkboxes (lobby host section); aim-change callback |

---

## Task 1: Prng.pick<T>

**Files:**
- Modify: `packages/game/src/rng/prng.ts`
- Modify: `packages/game/src/rng/prng.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `packages/game/src/rng/prng.test.ts` after the last `it` block inside `describe("createPrng", ...)`:

```typescript
  it("pick returns an element from the array", () => {
    const p = createPrng("pick-test");
    const arr = ["a", "b", "c", "d"];
    for (let i = 0; i < 200; i++) {
      const v = p.pick(arr);
      expect(arr).toContain(v);
    }
  });

  it("pick covers all elements given enough draws", () => {
    const p = createPrng("pick-coverage");
    const arr = [1, 2, 3, 4, 5];
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(p.pick(arr));
    expect(seen.size).toBe(5);
  });

  it("pick throws on empty array", () => {
    const p = createPrng("pick-empty");
    expect(() => p.pick([])).toThrow("pick: empty array");
  });

  it("pick is deterministic — same seed same sequence", () => {
    const a = createPrng("pick-det");
    const b = createPrng("pick-det");
    const arr = ["x", "y", "z"];
    for (let i = 0; i < 50; i++) {
      expect(a.pick(arr)).toBe(b.pick(arr));
    }
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/valletta/dev/scorched-earth
pnpm --filter @se/game exec vitest run src/rng/prng.test.ts
```
Expected: FAIL — `pick is not a function`

- [ ] **Step 3: Implement pick in the Prng interface**

In `packages/game/src/rng/prng.ts`, update the interface:

```typescript
export interface Prng {
  nextFloat(): number;
  nextInt(min: number, max: number): number;
  pick<T>(arr: T[]): T;
}
```

- [ ] **Step 4: Add pick to the createPrng return object**

In the `return { ... }` block at the end of `createPrng`, add after `nextInt`:

```typescript
    pick<T>(arr: T[]): T {
      if (arr.length === 0) throw new Error("pick: empty array");
      return arr[Math.floor(this.nextFloat() * arr.length)]!;
    },
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @se/game exec vitest run src/rng/prng.test.ts
```
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add packages/game/src/rng/prng.ts packages/game/src/rng/prng.test.ts
git commit -m "feat(game): add pick<T> to Prng interface and createPrng"
```

---

## Task 2: Shared Constants — TerrainType, WallMode, pools, parsePool

**Files:**
- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/intents.ts`

- [ ] **Step 1: Add constants to packages/shared/src/constants.ts**

Append to the bottom of the file:

```typescript
// Phase 5 — terrain variety & walls
export type TerrainType =
  | "mountains" | "hills" | "valleys" | "cliffs" | "crater"
  | "sky-high"  | "plateau" | "flat"  | "random";

export const ALL_TERRAIN_TYPES: TerrainType[] = [
  "mountains", "hills", "valleys", "cliffs", "crater",
  "sky-high", "plateau", "flat", "random",
];

export const ALL_WALL_MODES = ["none", "wrap", "reflect", "absorb"] as const;
export type WallMode = typeof ALL_WALL_MODES[number];

export function parsePool<T extends string>(
  pool: string,
  all: readonly T[],
): T[] {
  if (!pool || pool === "all") return [...all];
  return pool
    .split(",")
    .map((s) => s.trim() as T)
    .filter((s) => (all as readonly string[]).includes(s));
}
```

- [ ] **Step 2: Update configure intent in packages/shared/src/intents.ts**

Replace the existing `configure` line:

```typescript
  | { kind: "configure"; turnTimerMs?: number; loadoutId?: string; maxRounds?: number }
```

with:

```typescript
  | { kind: "configure"; turnTimerMs?: number; loadoutId?: string; maxRounds?: number;
      terrainTypePool?: string; wallModePool?: string }
```

- [ ] **Step 3: Verify shared package compiles**

```bash
pnpm --filter @se/shared exec tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/constants.ts packages/shared/src/intents.ts
git commit -m "feat(shared): add TerrainType, WallMode, ALL_TERRAIN_TYPES, ALL_WALL_MODES, parsePool"
```

---

## Task 3: MatchState Schema Additions

**Files:**
- Modify: `packages/shared/src/schema/MatchState.ts`

- [ ] **Step 1: Add three new fields to MatchState**

After `@type("string") terrainType = "random";` and before `@type("number") terrainVersion = 0;`, insert:

```typescript
  // Phase 5 — terrain variety & walls
  @type("string") wallMode = "none";
  @type("string") terrainTypePool = "all";
  @type("string") wallModePool = "all";
```

- [ ] **Step 2: Verify shared package compiles**

```bash
pnpm --filter @se/shared exec tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/schema/MatchState.ts
git commit -m "feat(shared): add wallMode, terrainTypePool, wallModePool to MatchState"
```

---

## Task 4: Game Types Update

**Files:**
- Modify: `packages/game/src/types.ts`

`TerrainOptions.type` currently is the literal `"random"`. `SimInput.walls` is a `"none"` literal. `StepInput` is missing `wallMode`.

- [ ] **Step 1: Update types.ts**

Replace the `TerrainOptions` interface:

```typescript
import type { TerrainType, WallMode } from "@se/shared";

export interface TerrainOptions {
  seed: string;
  type: TerrainType;
  width: number;
  height: number;
}
```

Add `import type { TerrainType, WallMode } from "@se/shared";` at the top of the file (after the existing `export interface Point` comment if any, or as the first line).

In `SimInput`, change `walls: "none"` to `wallMode: WallMode`:

```typescript
export interface SimInput {
  weapon: WeaponDef;
  origin: Point;
  angle: number;
  power: number;
  wind: number;
  gravity: number;
  terrain: Int16Array;
  terrainWidth: number;
  terrainHeight: number;
  wallMode: WallMode;
  targets: TargetInfo[];
  initialVelocity?: { vx: number; vy: number };
}
```

Add `wallMode: WallMode` to `StepInput` (after `dt: number`):

```typescript
export interface StepInput {
  projectiles: LiveProjectile[];
  tanks: StepTankInfo[];
  terrain: Int16Array;
  terrainWidth: number;
  terrainHeight: number;
  wind: number;
  gravity: number;
  dt: number;
  wallMode: WallMode;
}
```

- [ ] **Step 2: Fix compile errors from type changes**

The test at `apps/server/tests/resolveTurn.test.ts:95` passes `walls: "none"`. Find it and change to `wallMode: "none"`.

```bash
grep -n "walls:" /Users/valletta/dev/scorched-earth/apps/server/tests/resolveTurn.test.ts
```

Open that file and change `walls: "none"` → `wallMode: "none"`.

- [ ] **Step 3: Verify the game package compiles**

```bash
pnpm --filter @se/game exec tsc --noEmit
```
Expected: no errors (generate.ts and step.ts callers of TerrainOptions will also need `wallMode` added, but those are fixed in later tasks — for now TypeScript errors in those files are expected)

- [ ] **Step 4: Commit**

```bash
git add packages/game/src/types.ts apps/server/tests/resolveTurn.test.ts
git commit -m "feat(game): update TerrainOptions, StepInput, SimInput types for Phase 5"
```

---

## Task 5: Terrain Generators

**Files:**
- Modify: `packages/game/src/terrain/generate.ts`
- Modify: `packages/game/src/terrain/generate.test.ts`

- [ ] **Step 1: Write the failing smoke tests**

Replace `packages/game/src/terrain/generate.test.ts` entirely:

```typescript
import { describe, it, expect } from "vitest";
import { generateTerrain } from "./generate";
import type { TerrainType } from "@se/shared";

const W = 1600;
const H = 900;

const ALL_TYPES: TerrainType[] = [
  "mountains", "hills", "valleys", "cliffs", "crater",
  "sky-high", "plateau", "flat", "random",
];

describe("generateTerrain", () => {
  for (const type of ALL_TYPES) {
    describe(type, () => {
      it("returns an Int16Array of length width", () => {
        const t = generateTerrain({ seed: "abc", type, width: W, height: H });
        expect(t).toBeInstanceOf(Int16Array);
        expect(t.length).toBe(W);
      });

      it("all heights are within [0, height]", () => {
        const t = generateTerrain({ seed: "bounds", type, width: W, height: H });
        for (let i = 0; i < t.length; i++) {
          expect(t[i]).toBeGreaterThanOrEqual(0);
          expect(t[i]).toBeLessThanOrEqual(H);
        }
      });

      it("is deterministic — same seed same output", () => {
        const a = generateTerrain({ seed: "det", type, width: W, height: H });
        const b = generateTerrain({ seed: "det", type, width: W, height: H });
        expect(Array.from(a)).toEqual(Array.from(b));
      });
    });
  }

  it("different seeds produce different outputs (random)", () => {
    const a = generateTerrain({ seed: "seed-A", type: "random", width: W, height: H });
    const b = generateTerrain({ seed: "seed-B", type: "random", width: W, height: H });
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it("flat terrain is uniform", () => {
    const t = generateTerrain({ seed: "s", type: "flat", width: W, height: H });
    const first = t[0];
    for (let i = 1; i < t.length; i++) expect(t[i]).toBe(first);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @se/game exec vitest run src/terrain/generate.test.ts
```
Expected: FAIL on all non-"random" types — `generateTerrain` currently returns `genRandom` for everything

- [ ] **Step 3: Rewrite generate.ts with dispatcher and all generators**

Replace `packages/game/src/terrain/generate.ts` entirely:

```typescript
import { createPrng } from "../rng/prng";
import type { TerrainOptions } from "../types";
import type { TerrainType } from "@se/shared";

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function buildOctave(seed: string, freq: number, count: number): Float64Array {
  const prng = createPrng(seed);
  const samples = Math.ceil(count / freq) + 1;
  const points = new Float64Array(samples);
  for (let i = 0; i < samples; i++) {
    points[i] = prng.nextFloat() * 2 - 1;
  }
  const out = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const fi = i / freq;
    const i0 = Math.floor(fi);
    const i1 = i0 + 1;
    const t = smoothstep(fi - i0);
    out[i] = lerp(points[i0] as number, points[i1] as number, t);
  }
  return out;
}

function clampHeight(v: number, height: number): number {
  return Math.max(0, Math.min(height, Math.round(v)));
}

function genRandom(opts: TerrainOptions): Int16Array {
  const { seed, width, height } = opts;
  const o1 = buildOctave(seed + "-o1", 200, width);
  const o2 = buildOctave(seed + "-o2", 100, width);
  const o3 = buildOctave(seed + "-o3", 50, width);
  const o4 = buildOctave(seed + "-o4", 25, width);
  const out = new Int16Array(width);
  const baseline = height * 0.65;
  const amplitude = height * 0.20;
  for (let x = 0; x < width; x++) {
    const noise =
      (o1[x] as number) * 0.50 +
      (o2[x] as number) * 0.25 +
      (o3[x] as number) * 0.15 +
      (o4[x] as number) * 0.10;
    out[x] = clampHeight(baseline + noise * amplitude, height);
  }
  return out;
}

function genMountains(opts: TerrainOptions): Int16Array {
  const { seed, width, height } = opts;
  const prng = createPrng(seed + "-peaks");
  const numPeaks = prng.nextInt(2, 4);
  const peaks: Array<{ cx: number; sigma: number; amp: number }> = [];
  for (let i = 0; i < numPeaks; i++) {
    peaks.push({
      cx: (0.10 + prng.nextFloat() * 0.80) * width,
      sigma: (0.05 + prng.nextFloat() * 0.07) * width,
      amp: 0.60 + prng.nextFloat() * 0.40,
    });
  }
  const ridge = buildOctave(seed + "-ridge", 50, width);
  const out = new Int16Array(width);
  for (let x = 0; x < width; x++) {
    let elev = 0;
    for (const p of peaks) {
      const dx = (x - p.cx) / p.sigma;
      elev += p.amp * Math.exp(-dx * dx);
    }
    elev += (ridge[x] as number) * 0.08;
    out[x] = clampHeight(height * 0.85 - elev * height * 0.75, height);
  }
  return out;
}

function genHills(opts: TerrainOptions): Int16Array {
  const { seed, width, height } = opts;
  const prng = createPrng(seed + "-hills");
  const numH = prng.nextInt(2, 3);
  const harmonics: Array<{ freq: number; phase: number; amp: number }> = [];
  for (let i = 0; i < numH; i++) {
    harmonics.push({
      freq: 2 + prng.nextFloat() * 4,
      phase: prng.nextFloat() * Math.PI * 2,
      amp: i === 0 ? 1.0 : 0.40 + prng.nextFloat() * 0.40,
    });
  }
  const totalAmp = harmonics.reduce((s, h) => s + h.amp, 0);
  const out = new Int16Array(width);
  for (let x = 0; x < width; x++) {
    const t = x / (width - 1);
    let elev = 0;
    for (const h of harmonics) {
      elev += (h.amp / totalAmp) * Math.sin(h.freq * Math.PI * 2 * t + h.phase);
    }
    out[x] = clampHeight(height * 0.60 - elev * height * 0.25, height);
  }
  return out;
}

function genValleys(opts: TerrainOptions): Int16Array {
  const { seed, width, height } = opts;
  const noise = buildOctave(seed + "-noise", 100, width);
  const out = new Int16Array(width);
  for (let x = 0; x < width; x++) {
    const t = x / (width - 1);
    const bowl = (2 * t - 1) ** 2;
    out[x] = clampHeight(
      height * (0.30 + bowl * 0.45) + (noise[x] as number) * height * 0.06,
      height,
    );
  }
  return out;
}

function genCliffs(opts: TerrainOptions): Int16Array {
  const { seed, width, height } = opts;
  const prng = createPrng(seed + "-cliffs");
  const numBreaks = prng.nextInt(2, 3);
  const breakXs: number[] = [];
  for (let i = 0; i < numBreaks; i++) {
    breakXs.push(Math.round((0.15 + prng.nextFloat() * 0.70) * width));
  }
  breakXs.sort((a, b) => a - b);
  const levels: number[] = [];
  for (let i = 0; i <= numBreaks; i++) {
    levels.push(Math.round(height * (0.20 + prng.nextFloat() * 0.55)));
  }
  const rampLen = prng.nextInt(6, 10);
  const jitter = buildOctave(seed + "-jitter", 200, width);
  const out = new Int16Array(width);
  for (let x = 0; x < width; x++) {
    // Count how many ramps we've completely passed
    let seg = 0;
    for (const bx of breakXs) {
      if (x > bx + rampLen) seg++;
    }
    let y = levels[seg] as number;
    // Override with ramp interpolation if inside a transition
    for (let bi = 0; bi < breakXs.length; bi++) {
      const bx = breakXs[bi] as number;
      if (x > bx && x <= bx + rampLen) {
        const t = (x - bx) / rampLen;
        y = (levels[bi] as number) + ((levels[bi + 1] as number) - (levels[bi] as number)) * t;
        break;
      }
    }
    // Jitter on plateaus only
    const inRamp = breakXs.some((bx) => x > bx && x <= bx + rampLen);
    if (!inRamp) y += (jitter[x] as number) * 3;
    out[x] = clampHeight(y, height);
  }
  return out;
}

function genCrater(opts: TerrainOptions): Int16Array {
  const { seed, width, height } = opts;
  const prng = createPrng(seed + "-crater");
  const craterRadius = (0.30 + prng.nextFloat() * 0.10) * width;
  const cx = width / 2;
  const noise = buildOctave(seed + "-jitter", 200, width);
  const out = new Int16Array(width);
  for (let x = 0; x < width; x++) {
    const d = Math.abs(x - cx) / craterRadius;
    let y: number;
    if (d >= 1) {
      y = height * 0.28 + (noise[x] as number) * height * 0.03;
    } else {
      y = height * 0.28 + (1 - d * d) * height * 0.47;
    }
    out[x] = clampHeight(y, height);
  }
  return out;
}

function genSkyHigh(opts: TerrainOptions): Int16Array {
  const { seed, width, height } = opts;
  const prng = createPrng(seed + "-spires");
  const numSpires = prng.nextInt(3, 5);
  const spires: Array<{ cx: number; sigma: number }> = [];
  for (let i = 0; i < numSpires; i++) {
    spires.push({
      cx: (0.08 + prng.nextFloat() * 0.84) * width,
      sigma: (0.03 + prng.nextFloat() * 0.03) * width,
    });
  }
  const floorY = height * 0.80;
  const out = new Int16Array(width);
  for (let x = 0; x < width; x++) {
    let totalSpire = 0;
    for (const s of spires) {
      const dx = (x - s.cx) / s.sigma;
      totalSpire += Math.exp(-dx * dx);
    }
    const spireHeight = Math.min(totalSpire * height * 0.75, floorY - 1);
    out[x] = clampHeight(floorY - spireHeight, height);
  }
  return out;
}

function genPlateau(opts: TerrainOptions): Int16Array {
  const { seed, width, height } = opts;
  const prng = createPrng(seed + "-plateau");
  const leftEdge = Math.round((0.12 + prng.nextFloat() * 0.06) * width);
  const rightEdge = Math.round((1 - 0.12 - prng.nextFloat() * 0.06) * width);
  const plateauY = Math.round(height * (0.18 + prng.nextFloat() * 0.07));
  const floorY = Math.round(height * 0.72);
  const noise = buildOctave(seed + "-top", 200, width);
  const out = new Int16Array(width);
  for (let x = 0; x < width; x++) {
    let y: number;
    if (x <= leftEdge) {
      const t = x / leftEdge;
      y = floorY + (plateauY - floorY) * t;
    } else if (x >= rightEdge) {
      const last = width - 1 - rightEdge;
      const t = last > 0 ? (x - rightEdge) / last : 1;
      y = plateauY + (floorY - plateauY) * t;
    } else {
      y = plateauY + (noise[x] as number) * 2;
    }
    out[x] = clampHeight(y, height);
  }
  return out;
}

function genFlat(opts: TerrainOptions): Int16Array {
  const { width, height } = opts;
  return new Int16Array(width).fill(Math.round(height * 0.65));
}

const generators: Record<TerrainType, (opts: TerrainOptions) => Int16Array> = {
  mountains: genMountains,
  hills: genHills,
  valleys: genValleys,
  cliffs: genCliffs,
  crater: genCrater,
  "sky-high": genSkyHigh,
  plateau: genPlateau,
  flat: genFlat,
  random: genRandom,
};

export function generateTerrain(opts: TerrainOptions): Int16Array {
  const gen = generators[opts.type] ?? genRandom;
  return gen(opts);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @se/game exec vitest run src/terrain/generate.test.ts
```
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/game/src/terrain/generate.ts packages/game/src/terrain/generate.test.ts
git commit -m "feat(game): 9 terrain generators — mountains, hills, valleys, cliffs, crater, sky-high, plateau, flat, random"
```

---

## Task 6: Wall Modes in stepProjectiles

**Files:**
- Modify: `packages/game/src/physics/step.ts`
- Modify: `packages/game/src/physics/step.test.ts`

- [ ] **Step 1: Write the failing wall-mode tests**

Append to `packages/game/src/physics/step.test.ts` (add a new `describe` block after any existing ones):

```typescript
describe("stepProjectiles — wall modes", () => {
  const WIDE = 1600;
  const BASE = {
    terrain: new Int16Array(WIDE).fill(800),
    terrainWidth: WIDE,
    terrainHeight: 900,
    wind: 0,
    gravity: 0, // no gravity so position is predictable
    dt: 1 / 60,
    tanks: NO_TANKS,
  };

  function flyingLeft(): LiveProjectile {
    return makeProjectile({ x: 2, y: 100, vx: -600, vy: 0 }); // will exit left
  }

  function flyingRight(): LiveProjectile {
    return makeProjectile({ x: WIDE - 2, y: 100, vx: 600, vy: 0 }); // will exit right
  }

  it("none — projectile that exits left emits out-of-bounds", () => {
    const result = stepProjectiles({ ...BASE, wallMode: "none", projectiles: [flyingLeft()] });
    const oob = result.events.find((e) => e.kind === "out-of-bounds");
    expect(oob).toBeDefined();
    expect(result.survivors).toHaveLength(0);
  });

  it("wrap — projectile exiting right reappears at left with same vx", () => {
    const p = flyingRight();
    const origVx = p.vx;
    const result = stepProjectiles({ ...BASE, wallMode: "wrap", projectiles: [p] });
    expect(result.survivors).toHaveLength(1);
    expect(result.survivors[0]!.vx).toBeCloseTo(origVx);
    expect(result.survivors[0]!.x).toBeGreaterThanOrEqual(0);
    expect(result.survivors[0]!.x).toBeLessThan(WIDE);
    expect(result.events.find((e) => e.kind === "out-of-bounds")).toBeUndefined();
  });

  it("reflect — projectile exiting left has vx negated", () => {
    const p = flyingLeft();
    const origVx = p.vx;
    const result = stepProjectiles({ ...BASE, wallMode: "reflect", projectiles: [p] });
    expect(result.survivors).toHaveLength(1);
    expect(result.survivors[0]!.vx).toBeCloseTo(-origVx);
    expect(result.survivors[0]!.x).toBeGreaterThanOrEqual(0);
  });

  it("absorb — projectile exiting right emits terrain-impact at edge", () => {
    const result = stepProjectiles({ ...BASE, wallMode: "absorb", projectiles: [flyingRight()] });
    const impact = result.events.find((e) => e.kind === "terrain-impact");
    expect(impact).toBeDefined();
    if (impact && impact.kind === "terrain-impact") {
      expect(impact.x).toBe(WIDE - 1);
    }
    expect(result.survivors).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @se/game exec vitest run src/physics/step.test.ts
```
Expected: FAIL — TypeScript error (`wallMode` not in `StepInput` is already fixed in Task 4; runtime: wall modes not implemented)

- [ ] **Step 3: Replace the OOB check in step.ts with wall-mode dispatcher**

In `packages/game/src/physics/step.ts`, find the import and function signature. Add `WallMode` import at the top:

```typescript
import type { LiveProjectile, StepInput, StepResult, StepEvent, WallMode } from "../types";
```

Find line (current line 96):
```typescript
    // 4. Out-of-bounds (width or soft bottom)
    if (p.x < 0 || p.x >= terrainWidth || p.y > SOFT_BOTTOM) {
      events.push({ kind: "out-of-bounds", projectileId: p.id });
      continue;
    }
```

Replace with:

```typescript
    // 4. Out-of-bounds — top and soft-bottom always remove; left/right use wallMode
    if (p.y < -200) {
      events.push({ kind: "out-of-bounds", projectileId: p.id });
      continue;
    }
    if (p.y > SOFT_BOTTOM) {
      events.push({ kind: "out-of-bounds", projectileId: p.id });
      continue;
    }
    if (p.x < 0 || p.x >= terrainWidth) {
      const wm: WallMode = (input as StepInput).wallMode;
      if (wm === "wrap") {
        p.x = ((p.x % terrainWidth) + terrainWidth) % terrainWidth;
        // projectile continues — fall through to terrain/shield checks
      } else if (wm === "reflect") {
        p.vx = -p.vx;
        p.x = p.x < 0 ? 0 : terrainWidth - 1;
        // projectile continues
      } else if (wm === "absorb") {
        const edgeX = p.x < 0 ? 0 : terrainWidth - 1;
        events.push({ kind: "terrain-impact", projectileId: p.id,
                      x: edgeX, y: p.y, weapon: p.weapon, ownerId: p.ownerId });
        continue;
      } else {
        // "none" — remove projectile
        events.push({ kind: "out-of-bounds", projectileId: p.id });
        continue;
      }
    }
```

Also update the `stepProjectiles` function signature to destructure `wallMode` from input:

```typescript
export function stepProjectiles(input: StepInput): StepResult {
  const { projectiles, tanks, terrain, terrainWidth, terrainHeight, wind, gravity, dt, wallMode } = input;
```

Remove `const wm: WallMode = (input as StepInput).wallMode;` from the check and just use `wallMode` directly:

```typescript
    if (p.x < 0 || p.x >= terrainWidth) {
      if (wallMode === "wrap") {
        p.x = ((p.x % terrainWidth) + terrainWidth) % terrainWidth;
      } else if (wallMode === "reflect") {
        p.vx = -p.vx;
        p.x = p.x < 0 ? 0 : terrainWidth - 1;
      } else if (wallMode === "absorb") {
        const edgeX = p.x < 0 ? 0 : terrainWidth - 1;
        events.push({ kind: "terrain-impact", projectileId: p.id,
                      x: edgeX, y: p.y, weapon: p.weapon, ownerId: p.ownerId });
        continue;
      } else {
        events.push({ kind: "out-of-bounds", projectileId: p.id });
        continue;
      }
    }
```

Also remove `WallMode` from the import since it's now on `StepInput` type (already imported via `StepInput`). The import line becomes:

```typescript
import type { LiveProjectile, StepInput, StepResult, StepEvent } from "../types";
```

- [ ] **Step 4: Fix all existing step.test.ts calls that are missing wallMode**

The existing `BASE_INPUT` in step.test.ts doesn't have `wallMode`. Add it:

```typescript
const BASE_INPUT = {
  terrain: FLAT_TERRAIN,
  terrainWidth: 1600,
  terrainHeight: 900,
  wind: 0,
  gravity: 250,
  dt: 1 / 60,
  wallMode: "none" as const,
};
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @se/game exec vitest run src/physics/step.test.ts
```
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add packages/game/src/physics/step.ts packages/game/src/physics/step.test.ts
git commit -m "feat(game): wall-mode dispatcher in stepProjectiles — none/wrap/reflect/absorb"
```

---

## Task 7: Wall Modes in simulateProjectile

**Files:**
- Modify: `packages/game/src/physics/simulate.ts`

The trajectory simulator is used for the aim dotted-line preview. Update the OOB check to apply the same wall-mode logic so the preview correctly reflects wrap/reflect/absorb behavior.

- [ ] **Step 1: Update SimInput usage and add wall-mode logic**

In `packages/game/src/physics/simulate.ts`, find the destructuring on line ~64:

```typescript
  const {
    weapon, origin, angle, power, wind, gravity,
    terrain, terrainWidth, terrainHeight, walls, targets,
    initialVelocity,
  } = input;
```

Change `walls` to `wallMode`:

```typescript
  const {
    weapon, origin, angle, power, wind, gravity,
    terrain, terrainWidth, terrainHeight, wallMode, targets,
    initialVelocity,
  } = input;
```

Find `void walls;` on the next line and remove it entirely.

Find the OOB check (current line ~114):
```typescript
    if (x < 0 || x >= terrainWidth) { rawSamples.push({ x, y, t }); break; }
```

Replace with:

```typescript
    if (x < 0 || x >= terrainWidth) {
      if (wallMode === "wrap") {
        x = ((x % terrainWidth) + terrainWidth) % terrainWidth;
        rawSamples.push({ x, y, t });
        // continue simulation — projectile wraps
      } else if (wallMode === "reflect") {
        vx = -vx;
        x = x < 0 ? 0 : terrainWidth - 1;
        rawSamples.push({ x, y, t });
        // continue simulation — projectile bounces
      } else if (wallMode === "absorb") {
        const edgeX = x < 0 ? 0 : terrainWidth - 1;
        rawSamples.push({ x: edgeX, y, t });
        impact = { x: edgeX, y };
        break;
      } else {
        // "none" — trajectory ends at edge
        rawSamples.push({ x, y, t });
        break;
      }
    }
```

Also update the recursive `simulateProjectile` call for MIRV children (line ~96). Find:
```typescript
        const children = vels.map((vel) =>
          simulateProjectile({
            ...input,
            weapon: weapon.split!.child,
            origin: { x, y },
            initialVelocity: vel,
          }),
        );
```
This spreads `...input` which already includes `wallMode`, so no change needed.

- [ ] **Step 2: Verify the game package compiles**

```bash
pnpm --filter @se/game exec tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Run full game test suite**

```bash
pnpm --filter @se/game exec vitest run
```
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add packages/game/src/physics/simulate.ts
git commit -m "feat(game): wall-mode awareness in simulateProjectile for trajectory preview"
```

---

## Task 8: Game Package Exports

**Files:**
- Modify: `packages/game/src/index.ts`

- [ ] **Step 1: Add new exports**

In `packages/game/src/index.ts`, add to the existing exports:

After `export type { Prng } from "./rng/prng";`, add:
```typescript
export type { TerrainType, WallMode } from "@se/shared";
export { ALL_TERRAIN_TYPES, ALL_WALL_MODES, parsePool } from "@se/shared";
```

Also add `StepInput` to the existing step types export line so callers get `wallMode` typing:
The current line is:
```typescript
export type { LiveProjectile, StepTankInfo, StepEvent, StepInput, StepResult } from "./types";
```
This already exports `StepInput` — no change needed.

- [ ] **Step 2: Run the full test suite**

```bash
pnpm -r test
```
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add packages/game/src/index.ts
git commit -m "feat(game): re-export TerrainType, WallMode, ALL_TERRAIN_TYPES, ALL_WALL_MODES, parsePool"
```

---

## Task 9: Server — Configure Handler and Round-Start Pool Logic

**Files:**
- Modify: `apps/server/src/rooms/MatchRoom.ts`

- [ ] **Step 1: Update imports in MatchRoom.ts**

Find the existing import from `@se/shared`:
```typescript
import { MatchState, CarveOp, TERRAIN_WIDTH, TERRAIN_HEIGHT, SHIELD_DEFS } from "@se/shared";
```

Add `parsePool`, `ALL_TERRAIN_TYPES`, `ALL_WALL_MODES`, `type WallMode`, `type TerrainType`:
```typescript
import {
  MatchState, CarveOp, TERRAIN_WIDTH, TERRAIN_HEIGHT, SHIELD_DEFS,
  parsePool, ALL_TERRAIN_TYPES, ALL_WALL_MODES,
  type WallMode, type TerrainType,
} from "@se/shared";
```

- [ ] **Step 2: Update the configure handler**

Find the `this.onMessage("configure", ...)` handler (around line 49):

```typescript
    this.onMessage("configure", (client, msg: { turnTimerMs?: number; loadoutId?: string; maxRounds?: number }) => {
      if (client.sessionId !== this.state.hostId) return;
      if (this.state.phase !== "lobby") return;
      if (typeof msg?.turnTimerMs === "number") {
        const v = Number(msg.turnTimerMs);
        if (Number.isFinite(v) && v >= 0 && v <= 5 * 60_000) {
          this.state.turnTimerMs = v;
        }
      }
      if (typeof msg?.loadoutId === "string" && LOADOUT_MAP.has(msg.loadoutId)) {
        this.state.loadoutId = msg.loadoutId;
      }
      if (typeof msg?.maxRounds === "number") {
        const v = Math.round(msg.maxRounds);
        if (v >= 1 && v <= 20) {
          this.state.maxRounds = v;
        }
      }
    });
```

Replace with:

```typescript
    this.onMessage("configure", (client, msg: {
      turnTimerMs?: number; loadoutId?: string; maxRounds?: number;
      terrainTypePool?: string; wallModePool?: string;
    }) => {
      if (client.sessionId !== this.state.hostId) return;
      if (this.state.phase !== "lobby") return;
      if (typeof msg?.turnTimerMs === "number") {
        const v = Number(msg.turnTimerMs);
        if (Number.isFinite(v) && v >= 0 && v <= 5 * 60_000) {
          this.state.turnTimerMs = v;
        }
      }
      if (typeof msg?.loadoutId === "string" && LOADOUT_MAP.has(msg.loadoutId)) {
        this.state.loadoutId = msg.loadoutId;
      }
      if (typeof msg?.maxRounds === "number") {
        const v = Math.round(msg.maxRounds);
        if (v >= 1 && v <= 20) {
          this.state.maxRounds = v;
        }
      }
      if (typeof msg?.terrainTypePool === "string") {
        // Validate: parse and only accept if at least one valid entry
        const parsed = parsePool(msg.terrainTypePool, ALL_TERRAIN_TYPES);
        if (parsed.length > 0) this.state.terrainTypePool = msg.terrainTypePool;
      }
      if (typeof msg?.wallModePool === "string") {
        const parsed = parsePool(msg.wallModePool, ALL_WALL_MODES);
        if (parsed.length > 0) this.state.wallModePool = msg.wallModePool;
      }
    });
```

- [ ] **Step 3: Add a helper to pick terrain type and wall mode from pools**

Anywhere before `startMatch` in the class, add a private helper:

```typescript
  private drawRoundParams(seed: string): void {
    const prng = createPrng(seed + "_pools");
    const typesPool = parsePool(this.state.terrainTypePool, ALL_TERRAIN_TYPES);
    const modesPool = parsePool(this.state.wallModePool, ALL_WALL_MODES);
    this.state.terrainType = prng.pick(typesPool) as string;
    this.state.wallMode = prng.pick(modesPool) as string;
  }
```

- [ ] **Step 4: Call drawRoundParams in startMatch**

Find `private startMatch()` (around line 347). After `this.state.terrainSeed = this.matchSeed + "_r1";`, add:

```typescript
    this.drawRoundParams(this.state.terrainSeed);
```

Then update the `generateTerrain` call to use `state.terrainType`:

```typescript
    const terrain = generateTerrain({
      seed: this.state.terrainSeed,
      type: this.state.terrainType as TerrainType,
      width: TERRAIN_WIDTH,
      height: TERRAIN_HEIGHT,
    });
```

- [ ] **Step 5: Call drawRoundParams in startNextRound**

Find `private startNextRound()` (around line 443). After `state.terrainSeed = this.matchSeed + "_r" + state.round;`, add:

```typescript
    this.drawRoundParams(state.terrainSeed);
```

Update the `generateTerrain` call:

```typescript
    const terrain = generateTerrain({
      seed: state.terrainSeed,
      type: state.terrainType as TerrainType,
      width: TERRAIN_WIDTH,
      height: TERRAIN_HEIGHT,
    });
```

- [ ] **Step 6: Verify server compiles**

```bash
pnpm --filter @se/server exec tsc --noEmit
```
Expected: no errors (tickLoop will still error on `wallMode` until Task 10)

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/rooms/MatchRoom.ts
git commit -m "feat(server): configure handler pools; startMatch/startNextRound draw terrainType and wallMode from pools"
```

---

## Task 10: Server — Pass wallMode Through tickLoop

**Files:**
- Modify: `apps/server/src/rooms/MatchRoom.ts`

The `tickLoop` method calls `stepProjectiles` without `wallMode`. Fix it.

- [ ] **Step 1: Update tickLoop to pass wallMode**

Find `private tickLoop()` (around line 204). Find the `stepProjectiles` call:

```typescript
    const result = stepProjectiles({
      projectiles: this.liveProjectiles,
      tanks: buildStepTanks(this.state),
      terrain: this.terrain,
      terrainWidth: TERRAIN_WIDTH,
      terrainHeight: TERRAIN_HEIGHT,
      wind: this.state.wind,
      gravity: this.state.gravity,
      dt: 1 / 60,
    });
```

Add `wallMode`:

```typescript
    const result = stepProjectiles({
      projectiles: this.liveProjectiles,
      tanks: buildStepTanks(this.state),
      terrain: this.terrain,
      terrainWidth: TERRAIN_WIDTH,
      terrainHeight: TERRAIN_HEIGHT,
      wind: this.state.wind,
      gravity: this.state.gravity,
      dt: 1 / 60,
      wallMode: this.state.wallMode as WallMode,
    });
```

- [ ] **Step 2: Verify the full project compiles**

```bash
pnpm -r exec tsc --noEmit 2>&1 | grep -v "^$"
```
Expected: no TypeScript errors

- [ ] **Step 3: Run all tests**

```bash
pnpm -r test
```
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/rooms/MatchRoom.ts
git commit -m "feat(server): pass wallMode to stepProjectiles in tickLoop"
```

---

## Task 11: Server Integration Tests

**Files:**
- Modify: `apps/server/tests/MatchRoom.test.ts`

- [ ] **Step 1: Write failing integration tests**

Append to `apps/server/tests/MatchRoom.test.ts` inside the `describe("MatchRoom", ...)` block:

```typescript
  it("host configure updates terrainTypePool", async () => {
    const a = await joinMatch({ code: "TEST10", nickname: "A", color: "red" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("configure", { terrainTypePool: "mountains,hills,flat" });
    await new Promise((r) => setTimeout(r, 50));
    expect(a.state.terrainTypePool).toBe("mountains,hills,flat");
    await a.leave();
  });

  it("host configure updates wallModePool", async () => {
    const a = await joinMatch({ code: "TEST11", nickname: "A", color: "red" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("configure", { wallModePool: "wrap,reflect" });
    await new Promise((r) => setTimeout(r, 50));
    expect(a.state.wallModePool).toBe("wrap,reflect");
    await a.leave();
  });

  it("configure with invalid pool values is rejected", async () => {
    const a = await joinMatch({ code: "TEST12", nickname: "A", color: "red" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("configure", { terrainTypePool: "bogus,invalid" });
    await new Promise((r) => setTimeout(r, 50));
    expect(a.state.terrainTypePool).toBe("all"); // unchanged
    await a.leave();
  });

  it("startMatch sets terrainType to a value in the default pool", async () => {
    const a = await joinMatch({ code: "TEST13", nickname: "A", color: "red" });
    const b = await joinMatch({ code: "TEST13", nickname: "B", color: "blue" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("ready", {});
    await new Promise((r) => setTimeout(r, 100));
    const validTypes = ["mountains","hills","valleys","cliffs","crater","sky-high","plateau","flat","random"];
    expect(validTypes).toContain(a.state.terrainType);
    await a.leave();
    await b.leave();
  });

  it("startMatch sets wallMode to a value in the default pool", async () => {
    const a = await joinMatch({ code: "TEST14", nickname: "A", color: "red" });
    const b = await joinMatch({ code: "TEST14", nickname: "B", color: "blue" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("ready", {});
    await new Promise((r) => setTimeout(r, 100));
    const validModes = ["none", "wrap", "reflect", "absorb"];
    expect(validModes).toContain(a.state.wallMode);
    await a.leave();
    await b.leave();
  });

  it("startMatch with custom pool only picks from that pool", async () => {
    const a = await joinMatch({ code: "TEST15", nickname: "A", color: "red" });
    const b = await joinMatch({ code: "TEST15", nickname: "B", color: "blue" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("configure", { terrainTypePool: "flat" });
    await new Promise((r) => setTimeout(r, 50));
    a.send("ready", {});
    await new Promise((r) => setTimeout(r, 100));
    expect(a.state.terrainType).toBe("flat");
    await a.leave();
    await b.leave();
  });
```

- [ ] **Step 2: Run the server tests to verify the new tests pass**

```bash
pnpm --filter @se/server exec vitest run
```
Expected: All PASS (including new tests)

- [ ] **Step 3: Commit**

```bash
git add apps/server/tests/MatchRoom.test.ts
git commit -m "test(server): MatchRoom integration tests for pool configure and round-start draw"
```

---

## Task 12: Client — TerrainRenderer Accepts TerrainType

**Files:**
- Modify: `apps/client/src/render/Terrain.ts`
- Modify: `apps/client/src/scenes/MatchScene.ts`

- [ ] **Step 1: Update TerrainRenderer to accept type**

In `apps/client/src/render/Terrain.ts`, add import at top:
```typescript
import type { TerrainType } from "@se/shared";
```

Change the constructor signature from:
```typescript
  constructor(seed: string) {
```
to:
```typescript
  constructor(seed: string, type: TerrainType = "random") {
```

Change the `generateTerrain` call in the constructor from:
```typescript
    this.heightmap = generateTerrain({
      seed,
      type: "random",
      width: TERRAIN_WIDTH,
      height: TERRAIN_HEIGHT,
    });
```
to:
```typescript
    this.heightmap = generateTerrain({
      seed,
      type,
      width: TERRAIN_WIDTH,
      height: TERRAIN_HEIGHT,
    });
```

- [ ] **Step 2: Update MatchScene to pass terrainType and listen for changes**

In `apps/client/src/scenes/MatchScene.ts`, find the `buildTerrain` function inside `onFirstState`:

```typescript
    const buildTerrain = (seed: string) => {
      if (!seed) return;
      if (this.terrain) this.terrain.removeFromParent();
      const t = new TerrainRenderer(seed);
      this.world.addChildAt(t, 1);
      this.terrain = t;
    };
```

Update to pass `state.terrainType`:

```typescript
    const buildTerrain = (seed: string) => {
      if (!seed) return;
      if (this.terrain) this.terrain.removeFromParent();
      const t = new TerrainRenderer(seed, state.terrainType as TerrainType);
      this.world.addChildAt(t, 1);
      this.terrain = t;
    };
```

Add import at top of `MatchScene.ts`:
```typescript
import type { TerrainType } from "@se/shared";
```

After the existing `$(state).listen("terrainSeed", ...)` listener, add:
```typescript
    $(state).listen("terrainType", () => buildTerrain(state.terrainSeed));
```

- [ ] **Step 3: Verify client compiles**

```bash
pnpm --filter @se/client exec tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/render/Terrain.ts apps/client/src/scenes/MatchScene.ts
git commit -m "feat(client): TerrainRenderer accepts TerrainType; MatchScene rebuilds on terrainType change"
```

---

## Task 13: Client — RoundInfo HUD Pill

**Files:**
- Create: `apps/client/src/hud/RoundInfo.ts`
- Modify: `apps/client/src/scenes/MatchScene.ts`

- [ ] **Step 1: Create RoundInfo.ts**

Create `apps/client/src/hud/RoundInfo.ts`:

```typescript
const TERRAIN_LABELS: Record<string, string> = {
  mountains: "Mountains", hills: "Hills", valleys: "Valleys",
  cliffs: "Cliffs", crater: "Crater", "sky-high": "Sky High",
  plateau: "Plateau", flat: "Flat", random: "Random",
};

const WALL_LABELS: Record<string, string> = {
  none: "No Walls", wrap: "Wrap", reflect: "Reflect", absorb: "Absorb",
};

export class RoundInfo {
  private el: HTMLDivElement;

  constructor() {
    this.el = document.createElement("div");
    this.el.style.cssText =
      "position:fixed;top:12px;left:12px;" +
      "background:rgba(0,0,0,0.72);color:#e6edf3;" +
      "font:11px 'Courier New',monospace;padding:4px 10px;" +
      "border-radius:6px;z-index:100;opacity:0;" +
      "transition:opacity 0.3s;pointer-events:none;" +
      "letter-spacing:1px;";
    document.getElementById("ui")!.appendChild(this.el);
  }

  update(terrainType: string, wallMode: string): void {
    const typeLabel = TERRAIN_LABELS[terrainType] ?? terrainType;
    const modeLabel = WALL_LABELS[wallMode] ?? wallMode;
    this.el.textContent = `${typeLabel}  ·  ${modeLabel}`;
    this.el.style.opacity = "1";
  }

  hide(): void {
    this.el.style.opacity = "0";
  }

  dispose(): void {
    this.el.remove();
  }
}
```

- [ ] **Step 2: Wire RoundInfo in MatchScene**

In `apps/client/src/scenes/MatchScene.ts`, add import:
```typescript
import { RoundInfo } from "../hud/RoundInfo";
```

Add private field to the class:
```typescript
  private roundInfo!: RoundInfo;
```

In `onFirstState`, after the other listener setup, add:
```typescript
    this.roundInfo = new RoundInfo();

    $(state).listen("terrainType", (type) => {
      this.roundInfo.update(type, state.wallMode);
    });
    $(state).listen("wallMode", (mode) => {
      this.roundInfo.update(state.terrainType, mode);
    });
```

In `onPhaseChange`, hide the pill when entering lobby or shopping:

In the `else` block that handles non-lobby phases, when phase transitions to "playing" or "round-summary", we want the pill visible. When transitioning to "lobby" (after match reset), hide it:

After `this.lastPhase = phase;` (around line 219), add:
```typescript
    if (phase === "lobby") this.roundInfo?.hide();
```

- [ ] **Step 3: Verify client compiles**

```bash
pnpm --filter @se/client exec tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/hud/RoundInfo.ts apps/client/src/scenes/MatchScene.ts
git commit -m "feat(client): RoundInfo HUD pill shows terrain type and wall mode each round"
```

---

## Task 14: Client — Trajectory Preview (TrajectoryOverlay)

**Files:**
- Create: `apps/client/src/render/TrajectoryOverlay.ts`
- Modify: `apps/client/src/scenes/MatchScene.ts`
- Modify: `apps/client/src/input/AimControls.ts`

The aim trajectory dotted line is a PixiJS Graphics overlay drawn on the world container. `AimControls` fires an `onAimChange` callback with the current angle/power; `MatchScene` computes the trajectory using `simulateProjectile` and redraws the overlay.

- [ ] **Step 1: Create TrajectoryOverlay.ts**

Create `apps/client/src/render/TrajectoryOverlay.ts`:

```typescript
import { Container, Graphics } from "pixi.js";
import type { TrajectorySample } from "@se/game";

const DOT_RADIUS = 2.5;
const DOT_INTERVAL = 8; // every N samples
const DOT_COLOR = 0xfbbf24; // amber

export class TrajectoryOverlay extends Container {
  private g: Graphics;

  constructor() {
    super();
    this.g = new Graphics();
    this.addChild(this.g);
  }

  draw(samples: TrajectorySample[]): void {
    this.g.clear();
    for (let i = 0; i < samples.length; i += DOT_INTERVAL) {
      const s = samples[i]!;
      const alpha = 1 - (i / samples.length) * 0.7;
      this.g
        .circle(s.x, s.y, DOT_RADIUS)
        .fill({ color: DOT_COLOR, alpha });
    }
  }

  clear(): void {
    this.g.clear();
  }
}
```

- [ ] **Step 2: Add onAimChange callback to AimControls**

In `apps/client/src/input/AimControls.ts`, add a private field and a public setter after the existing private fields:

```typescript
  private onAimChange?: (angle: number, power: number) => void;

  setAimChangeCallback(cb: (angle: number, power: number) => void): void {
    this.onAimChange = cb;
  }
```

In `setAngle` and `setPower` private methods, call the callback at the end:

```typescript
  private setAngle(v: number) {
    this.angle = clampAngle(v);
    this.angleSlider.value = String(this.angle);
    this.localTank?.setAngle(this.angle);
    this.redrawAngle();
    this.onAimChange?.(this.angle, this.power);
  }

  private setPower(v: number) {
    this.power = clampPower(v);
    this.powerSlider.value = String(this.power);
    this.redrawPower();
    this.onAimChange?.(this.angle, this.power);
  }
```

Also add a method to get current aim values (needed by MatchScene to trigger an initial draw):

```typescript
  getAim(): { angle: number; power: number } {
    return { angle: this.angle, power: this.power };
  }
```

- [ ] **Step 3: Wire TrajectoryOverlay in MatchScene**

In `apps/client/src/scenes/MatchScene.ts`, add imports:
```typescript
import { TrajectoryOverlay } from "../render/TrajectoryOverlay";
import { simulateProjectile } from "@se/game";
import type { WallMode } from "@se/shared";
```

Add private field:
```typescript
  private trajectoryOverlay!: TrajectoryOverlay;
```

In `onFirstState`, after creating the `TerrainRenderer`, add:
```typescript
    this.trajectoryOverlay = new TrajectoryOverlay();
    this.world.addChild(this.trajectoryOverlay);
```

Wire the aim-change callback after `this.aim` is set up:
```typescript
    this.aim.setAimChangeCallback((angle, power) => {
      this.updateTrajectory(angle, power);
    });
```

Add the `updateTrajectory` private method to the class:
```typescript
  private updateTrajectory(angle: number, power: number): void {
    const state = this.room.state;
    if (state.phase !== "playing") { this.trajectoryOverlay.clear(); return; }
    if (state.currentTurnPlayerId !== this.room.sessionId) { this.trajectoryOverlay.clear(); return; }
    const tank = state.tanks.get(this.room.sessionId);
    if (!tank || !this.terrain) { this.trajectoryOverlay.clear(); return; }

    const weapon = (() => {
      // Find the active weapon def from the tank's selected weapon
      // Fall back to baby missile if not found
      try {
        const { WEAPON_REGISTRY } = require("@se/game") as typeof import("@se/game");
        return WEAPON_REGISTRY.get(tank.selectedWeaponId) ?? null;
      } catch { return null; }
    })();
    if (!weapon) { this.trajectoryOverlay.clear(); return; }

    const result = simulateProjectile({
      weapon,
      origin: { x: tank.x, y: tank.y },
      angle,
      power,
      wind: state.wind,
      gravity: state.gravity,
      terrain: this.terrain.getHeightmap(),
      terrainWidth: 1600,
      terrainHeight: 900,
      wallMode: state.wallMode as WallMode,
      targets: [],
    });

    this.trajectoryOverlay.draw(result.samples);
  }
```

Also expose `getHeightmap()` from `TerrainRenderer` (needed above).

- [ ] **Step 4: Add getHeightmap() to TerrainRenderer**

In `apps/client/src/render/Terrain.ts`, add after `heightAt`:

```typescript
  getHeightmap(): Int16Array {
    return this.heightmap;
  }
```

- [ ] **Step 5: Add weapon lookup and clear trajectory on phase change**

The `require` approach above is fragile. Instead, import `WEAPON_REGISTRY` at the top of `MatchScene.ts`:

```typescript
import { simulateProjectile, WEAPON_REGISTRY } from "@se/game";
```

Update `updateTrajectory` to use the direct import:

```typescript
  private updateTrajectory(angle: number, power: number): void {
    const state = this.room.state;
    if (state.phase !== "playing") { this.trajectoryOverlay.clear(); return; }
    if (state.currentTurnPlayerId !== this.room.sessionId) { this.trajectoryOverlay.clear(); return; }
    const tank = state.tanks.get(this.room.sessionId);
    if (!tank || !this.terrain) { this.trajectoryOverlay.clear(); return; }
    const weapon = WEAPON_REGISTRY.get(tank.selectedWeaponId);
    if (!weapon) { this.trajectoryOverlay.clear(); return; }

    const result = simulateProjectile({
      weapon,
      origin: { x: tank.x, y: tank.y },
      angle,
      power,
      wind: state.wind,
      gravity: state.gravity,
      terrain: this.terrain.getHeightmap(),
      terrainWidth: 1600,
      terrainHeight: 900,
      wallMode: state.wallMode as WallMode,
      targets: [],
    });

    this.trajectoryOverlay.draw(result.samples);
  }
```

Also check if `Tank` has a `selectedWeaponId` field. If not, use the first available weapon. Check:

```bash
grep -n "selectedWeaponId\|selectedWeapon" /Users/valletta/dev/scorched-earth/packages/shared/src/schema/Tank.ts
```

If `selectedWeaponId` doesn't exist, use `"baby-missile"` as a fallback key, or add the field. (Check before coding — adjust accordingly.)

In `onPhaseChange`, clear the overlay:

```typescript
    if (phase !== "playing") this.trajectoryOverlay?.clear();
```

- [ ] **Step 6: Verify client compiles**

```bash
pnpm --filter @se/client exec tsc --noEmit
```
Expected: no errors (adjust if `selectedWeaponId` field discovery changes the approach)

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/render/TrajectoryOverlay.ts apps/client/src/render/Terrain.ts \
        apps/client/src/scenes/MatchScene.ts apps/client/src/input/AimControls.ts
git commit -m "feat(client): trajectory preview dotted line with wall-mode awareness"
```

---

## Task 15: Client — Pool Picker in AimControls (Lobby)

**Files:**
- Modify: `apps/client/src/input/AimControls.ts`

The lobby host section already has `loadoutSection`, `maxRoundsSection`, and `inviteSection`. Add a `poolSection` following the same pattern.

- [ ] **Step 1: Add pool picker fields and build DOM**

In `AimControls`, add private fields:
```typescript
  private poolSection!: HTMLDivElement;
  private terrainPoolChecks: Array<{ id: string; el: HTMLInputElement }> = [];
  private wallPoolChecks: Array<{ id: string; el: HTMLInputElement }> = [];
```

Add a `buildPoolSection()` helper called from `buildDOM`:

Add after the `inviteSection` setup and before the `el.append(...)` call:

```typescript
    // ── Pool pickers (host-only, lobby) ───────────────────────────────────
    this.poolSection = mkDiv("pointer-events:auto;display:none;flex-direction:column;align-items:flex-start;gap:6px;");

    const terrainTypes = [
      { id: "mountains", label: "Mountains" }, { id: "hills", label: "Hills" },
      { id: "valleys", label: "Valleys" }, { id: "cliffs", label: "Cliffs" },
      { id: "crater", label: "Crater" }, { id: "sky-high", label: "Sky High" },
      { id: "plateau", label: "Plateau" }, { id: "flat", label: "Flat" },
      { id: "random", label: "Random" },
    ];
    const wallModes = [
      { id: "none", label: "No Walls" }, { id: "wrap", label: "Wrap" },
      { id: "reflect", label: "Reflect" }, { id: "absorb", label: "Absorb" },
    ];

    const terrainGroup = mkDiv("display:flex;flex-direction:column;gap:3px;");
    terrainGroup.appendChild(mkLabel("TERRAIN TYPES"));
    const terrainRow = mkDiv("display:flex;flex-wrap:wrap;gap:4px;");
    for (const tt of terrainTypes) {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.id = "pool-t-" + tt.id;
      cb.style.cssText = "accent-color:#3b82f6;";
      const lbl = document.createElement("label");
      lbl.htmlFor = cb.id;
      lbl.textContent = tt.label;
      lbl.style.cssText = "color:#94a3b8;font:9px 'Courier New',monospace;cursor:pointer;";
      const wrap = mkDiv("display:flex;align-items:center;gap:2px;");
      wrap.append(cb, lbl);
      terrainRow.appendChild(wrap);
      cb.onchange = () => this.sendPoolUpdate();
      this.terrainPoolChecks.push({ id: tt.id, el: cb });
    }
    terrainGroup.appendChild(terrainRow);

    const wallGroup = mkDiv("display:flex;flex-direction:column;gap:3px;");
    wallGroup.appendChild(mkLabel("WALL MODES"));
    const wallRow = mkDiv("display:flex;gap:8px;");
    for (const wm of wallModes) {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.id = "pool-w-" + wm.id;
      cb.style.cssText = "accent-color:#3b82f6;";
      const lbl = document.createElement("label");
      lbl.htmlFor = cb.id;
      lbl.textContent = wm.label;
      lbl.style.cssText = "color:#94a3b8;font:9px 'Courier New',monospace;cursor:pointer;";
      const wrap = mkDiv("display:flex;align-items:center;gap:2px;");
      wrap.append(cb, lbl);
      wallRow.appendChild(wrap);
      cb.onchange = () => this.sendPoolUpdate();
      this.wallPoolChecks.push({ id: wm.id, el: cb });
    }
    wallGroup.appendChild(wallRow);

    this.poolSection.append(terrainGroup, wallGroup);
```

Update the final `el.append(...)` call to include `this.poolSection`:
```typescript
    this.el.append(angleSection, powerSection, actionSection, this.loadoutSection, this.maxRoundsSection, this.poolSection, this.inviteSection, this.loadoutDisplay);
```

- [ ] **Step 2: Add sendPoolUpdate method**

```typescript
  private sendPoolUpdate(): void {
    const terrainTypePool = this.terrainPoolChecks
      .filter((c) => c.el.checked)
      .map((c) => c.id)
      .join(",") || "all";
    const wallModePool = this.wallPoolChecks
      .filter((c) => c.el.checked)
      .map((c) => c.id)
      .join(",") || "all";
    this.room.send("configure", { terrainTypePool, wallModePool });
  }
```

- [ ] **Step 3: Show/hide poolSection in refreshChrome**

In `refreshChrome`, inside the `if (inLobby)` block, add:
```typescript
      this.poolSection.style.display = isHost ? "flex" : "none";
```

In the `else` block (non-lobby), add:
```typescript
      this.poolSection.style.display = "none";
```

- [ ] **Step 4: Sync non-host state display from room state**

Non-host players should see disabled checkboxes reflecting the host's configured pools. In `refreshChrome`, when `!isHost && inLobby`, sync the checkboxes from `state.terrainTypePool` and `state.wallModePool`:

```typescript
      if (!isHost && inLobby) {
        const tPool = this.room.state.terrainTypePool;
        const wPool = this.room.state.wallModePool;
        for (const c of this.terrainPoolChecks) {
          c.el.checked = tPool === "all" || tPool.split(",").includes(c.id);
          c.el.disabled = true;
        }
        for (const c of this.wallPoolChecks) {
          c.el.checked = wPool === "all" || wPool.split(",").includes(c.id);
          c.el.disabled = true;
        }
        this.poolSection.style.display = "flex";
      }
```

- [ ] **Step 5: Verify client compiles**

```bash
pnpm --filter @se/client exec tsc --noEmit
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/input/AimControls.ts
git commit -m "feat(client): terrain type and wall mode pool pickers in lobby host controls"
```

---

## Task 16: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
pnpm -r test
```
Expected: All PASS, no failures

- [ ] **Step 2: TypeScript check across all packages**

```bash
pnpm -r exec tsc --noEmit 2>&1 | grep -v "^$"
```
Expected: no errors

- [ ] **Step 3: Start the dev server and smoke test**

```bash
pnpm dev
```

Open the game, create a match, verify:
1. Lobby shows terrain type + wall mode pool pickers (host view)
2. Start the match — terrain generates (any type from pool)
3. RoundInfo pill appears top-left showing terrain type and wall mode
4. Aim trajectory dotted line appears when it's your turn
5. Fire a shot near a wall edge — wall mode behavior is visible:
   - `none`: projectile disappears
   - `wrap`: projectile reappears on opposite side
   - `reflect`: projectile bounces
   - `absorb`: projectile explodes at edge

- [ ] **Step 4: Commit any fixes found during smoke test**

---

## Self-Review

**Spec coverage check:**
- [x] 9 terrain generators → Task 5
- [x] 4 wall-boundary modes → Tasks 6, 7
- [x] `wallMode`, `terrainTypePool`, `wallModePool` schema → Task 3
- [x] Host lobby controls (pool picker) → Task 15
- [x] Round-start randomization from pools → Task 9
- [x] In-game HUD pill → Task 13
- [x] Trajectory preview reflects wall mode → Task 14
- [x] `Prng.pick<T>` → Task 1
- [x] Shared constants (`ALL_TERRAIN_TYPES`, `ALL_WALL_MODES`, `parsePool`) → Task 2
- [x] `TerrainType` union in shared → Task 2
- [x] `TerrainOptions.type` expanded → Task 4
- [x] `StepInput.wallMode` → Tasks 4, 10
- [x] `SimInput.wallMode` (was `walls`) → Tasks 4, 7
- [x] `MatchScene` rebuilds terrain on `terrainType` change → Task 12
- [x] Server integration tests → Task 11

**Placeholder scan:** No TBDs. Task 14 Step 5 requires a runtime check of `selectedWeaponId` field presence — that step is self-directed with a bash command to discover the truth.

**Type consistency:**
- `TerrainType` defined once in shared, imported everywhere
- `WallMode` defined once in shared, imported everywhere
- `parsePool` generic, consistent signature across all uses
- `Prng.pick<T>` signature matches implementation
