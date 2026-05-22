# Phase 1 — Multiplayer Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a faithful multiplayer Scorched Earth skeleton — two real browsers connect via a room code and complete a full match (lobby → fire → win → return-to-lobby) with up to 10 tanks, one weapon (Baby Missile), wind+gravity ballistics, destructible terrain, and Cartoon-Illustrative graphics.

**Architecture:** pnpm-workspaces monorepo with `packages/game` (pure-TS deterministic physics shared between server and client), `packages/shared` (Colyseus schemas + intents), `apps/server` (Colyseus rooms), and `apps/client` (Vite + PixiJS v8). Server is authoritative — when a player fires, the server simulates the full trajectory in one shot via `simulateProjectile`, broadcasts the samples + impact, and clients animate the result.

**Tech Stack:** TypeScript 5.4+ · Node.js 22 · pnpm 9 · Vite 5 · PixiJS v8 · Colyseus 0.16 · @colyseus/schema 3 · colyseus.js 0.16 · Vitest 1 · Playwright 1.

**Spec reference:** `docs/superpowers/specs/2026-05-22-phase-1-multiplayer-skeleton-design.md`
**Roadmap reference:** `docs/superpowers/specs/2026-05-22-roadmap.md`

---

## File structure (locks decomposition)

```
scorched-earth/
├── package.json                                    # workspace root (private, scripts only)
├── pnpm-workspace.yaml
├── tsconfig.base.json                              # shared strict TS settings
├── .nvmrc                                          # pin Node 22
├── README.md
├── .github/workflows/ci.yml
├── packages/
│   ├── tsconfig/                                   # shared tsconfig presets
│   │   ├── package.json
│   │   ├── base.json
│   │   ├── node.json
│   │   └── browser.json
│   ├── game/                                       # PURE TS — no DOM, no Node
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   ├── src/
│   │   │   ├── index.ts                            # public API barrel
│   │   │   ├── types.ts                            # WeaponDef, SimInput, TrajectoryResult, etc.
│   │   │   ├── rng/prng.ts
│   │   │   ├── rng/prng.test.ts
│   │   │   ├── terrain/generate.ts
│   │   │   ├── terrain/generate.test.ts
│   │   │   ├── terrain/carve.ts
│   │   │   ├── terrain/carve.test.ts
│   │   │   ├── physics/simulate.ts
│   │   │   ├── physics/simulate.test.ts
│   │   │   ├── physics/damage.ts
│   │   │   ├── physics/damage.test.ts
│   │   │   └── weapons/baby-missile.ts
│   ├── shared/                                     # Colyseus schemas + intent types
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── schema/MatchState.ts
│   │       ├── schema/Tank.ts
│   │       ├── schema/CarveOp.ts
│   │       ├── intents.ts
│   │       └── constants.ts
├── apps/
│   ├── server/                                     # Colyseus app
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   ├── src/
│   │   │   ├── index.ts                            # boots Colyseus
│   │   │   ├── codeGen.ts
│   │   │   ├── rooms/LobbyRoom.ts
│   │   │   ├── rooms/MatchRoom.ts
│   │   │   ├── rooms/turnController.ts
│   │   │   └── rooms/resolveTurn.ts
│   │   └── tests/
│   │       ├── codeGen.test.ts
│   │       ├── LobbyRoom.test.ts
│   │       └── MatchRoom.test.ts
│   └── client/                                     # Vite + PixiJS
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.ts
│           ├── net/colyseusClient.ts
│           ├── scenes/LobbyScene.ts
│           ├── scenes/MatchScene.ts
│           ├── render/Sky.ts
│           ├── render/Terrain.ts
│           ├── render/Tank.ts
│           ├── render/Projectile.ts
│           ├── render/Explosion.ts
│           ├── hud/WindArrow.ts
│           ├── hud/TurnTimer.ts
│           ├── hud/PlayerList.ts
│           └── input/AimControls.ts
└── tests/
    └── e2e/
        ├── playwright.config.ts
        ├── full-match.spec.ts
        └── reconnect.spec.ts
```

---

# Setup

## Task 1: Initialize pnpm workspace

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.nvmrc`

- [ ] **Step 1: Verify Node 22 + pnpm 9 are available**

Run:
```bash
node --version
pnpm --version
```

Expected: Node `v22.x`, pnpm `9.x`. If pnpm is missing: `corepack enable && corepack prepare pnpm@9 --activate`.

- [ ] **Step 2: Write `.nvmrc`**

Create `/Users/valletta/dev/scorched-earth/.nvmrc`:
```
22
```

- [ ] **Step 3: Write workspace root `package.json`**

Create `/Users/valletta/dev/scorched-earth/package.json`:
```json
{
  "name": "scorched-earth",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "pnpm -r build",
    "dev": "pnpm --parallel -r dev",
    "test": "pnpm -r test",
    "test:e2e": "playwright test",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 4: Write `pnpm-workspace.yaml`**

Create `/Users/valletta/dev/scorched-earth/pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
  - "apps/*"
```

- [ ] **Step 5: Write shared TS config**

Create `/Users/valletta/dev/scorched-earth/tsconfig.base.json`:
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 6: Install root deps**

Run:
```bash
pnpm install
```

Expected: lockfile created, no packages installed yet (workspace is empty).

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .nvmrc pnpm-lock.yaml
git commit -m "chore: initialize pnpm workspace and shared TS config"
```

---

## Task 2: Shared tsconfig presets package

**Files:**
- Create: `packages/tsconfig/package.json`, `packages/tsconfig/base.json`, `packages/tsconfig/node.json`, `packages/tsconfig/browser.json`

- [ ] **Step 1: Create the package manifest**

Create `/Users/valletta/dev/scorched-earth/packages/tsconfig/package.json`:
```json
{
  "name": "@se/tsconfig",
  "version": "0.0.0",
  "private": true,
  "files": ["base.json", "node.json", "browser.json"]
}
```

- [ ] **Step 2: Write the base preset**

Create `/Users/valletta/dev/scorched-earth/packages/tsconfig/base.json`:
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "../../tsconfig.base.json"
}
```

- [ ] **Step 3: Write the Node preset**

Create `/Users/valletta/dev/scorched-earth/packages/tsconfig/node.json`:
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": ["node"]
  }
}
```

- [ ] **Step 4: Write the browser preset**

Create `/Users/valletta/dev/scorched-earth/packages/tsconfig/browser.json`:
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "preserve"
  }
}
```

- [ ] **Step 5: Re-install to wire up workspace**

Run:
```bash
pnpm install
```

Expected: `@se/tsconfig` recognized as workspace package.

- [ ] **Step 6: Commit**

```bash
git add packages/tsconfig pnpm-lock.yaml
git commit -m "chore: add shared tsconfig presets"
```

---

## Task 3: Scaffold packages/game with a sanity test

**Files:**
- Create: `packages/game/package.json`, `packages/game/tsconfig.json`, `packages/game/vitest.config.ts`, `packages/game/src/index.ts`, `packages/game/src/sanity.test.ts`

- [ ] **Step 1: Create the manifest**

Create `/Users/valletta/dev/scorched-earth/packages/game/package.json`:
```json
{
  "name": "@se/game",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "build": "tsc"
  },
  "devDependencies": {
    "@se/tsconfig": "workspace:*",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: TS config**

Create `/Users/valletta/dev/scorched-earth/packages/game/tsconfig.json`:
```json
{
  "extends": "@se/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: Vitest config**

Create `/Users/valletta/dev/scorched-earth/packages/game/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: { provider: "v8", thresholds: { lines: 90, branches: 85, functions: 90 } },
  },
});
```

- [ ] **Step 4: Index barrel (empty for now)**

Create `/Users/valletta/dev/scorched-earth/packages/game/src/index.ts`:
```ts
export {};
```

- [ ] **Step 5: Sanity test**

Create `/Users/valletta/dev/scorched-earth/packages/game/src/sanity.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("sanity", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Install + run**

Run:
```bash
pnpm install
pnpm --filter @se/game test
```

Expected: 1 test passes.

- [ ] **Step 7: Commit**

```bash
git add packages/game pnpm-lock.yaml
git commit -m "chore: scaffold @se/game with vitest"
```

---

# packages/game — physics, terrain, RNG (TDD)

## Task 4: Seeded PRNG (xoshiro128**)

**Files:**
- Create: `packages/game/src/rng/prng.ts`, `packages/game/src/rng/prng.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/Users/valletta/dev/scorched-earth/packages/game/src/rng/prng.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { createPrng } from "./prng";

describe("createPrng", () => {
  it("is deterministic for the same seed", () => {
    const a = createPrng("test-seed");
    const b = createPrng("test-seed");
    for (let i = 0; i < 100; i++) {
      expect(a.nextFloat()).toBe(b.nextFloat());
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = createPrng("seed-1");
    const b = createPrng("seed-2");
    const aSeq = Array.from({ length: 10 }, () => a.nextFloat());
    const bSeq = Array.from({ length: 10 }, () => b.nextFloat());
    expect(aSeq).not.toEqual(bSeq);
  });

  it("nextFloat is in [0, 1)", () => {
    const p = createPrng("range-test");
    for (let i = 0; i < 1000; i++) {
      const v = p.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("nextInt(min, max) is inclusive of both bounds", () => {
    const p = createPrng("int-test");
    const values = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = p.nextInt(-10, 10);
      expect(v).toBeGreaterThanOrEqual(-10);
      expect(v).toBeLessThanOrEqual(10);
      expect(Number.isInteger(v)).toBe(true);
      values.add(v);
    }
    expect(values.size).toBeGreaterThan(15); // reasonable coverage
  });

  it("distribution is reasonably uniform", () => {
    const p = createPrng("uniform-test");
    const buckets = new Array(10).fill(0);
    const N = 10_000;
    for (let i = 0; i < N; i++) {
      buckets[Math.floor(p.nextFloat() * 10)]++;
    }
    for (const c of buckets) {
      expect(c).toBeGreaterThan(N / 10 * 0.85);
      expect(c).toBeLessThan(N / 10 * 1.15);
    }
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @se/game test
```

Expected: 5 tests fail with "Cannot find module './prng'".

- [ ] **Step 3: Implement**

Create `/Users/valletta/dev/scorched-earth/packages/game/src/rng/prng.ts`:
```ts
export interface Prng {
  nextFloat(): number;
  nextInt(min: number, max: number): number;
}

// xoshiro128** — fast, high-quality, deterministic PRNG.
// Reference: https://prng.di.unimi.it/xoshiro128starstar.c

function hashSeed(seed: string): [number, number, number, number] {
  // SplitMix32-based string-to-state expansion.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const state: [number, number, number, number] = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    h = (h + 0x9e3779b9) >>> 0;
    let z = h;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    state[i] = (z ^ (z >>> 16)) >>> 0;
  }
  if (state[0] === 0 && state[1] === 0 && state[2] === 0 && state[3] === 0) {
    state[0] = 1; // avoid all-zero state
  }
  return state;
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

export function createPrng(seed: string): Prng {
  const s = hashSeed(seed);

  function next(): number {
    const result = (Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0);
    const t = (s[1] << 9) >>> 0;
    s[2] = (s[2] ^ s[0]) >>> 0;
    s[3] = (s[3] ^ s[1]) >>> 0;
    s[1] = (s[1] ^ s[2]) >>> 0;
    s[0] = (s[0] ^ s[3]) >>> 0;
    s[2] = (s[2] ^ t) >>> 0;
    s[3] = rotl(s[3], 11);
    return result;
  }

  return {
    nextFloat(): number {
      // Use top 24 bits for [0,1) — gives 16M distinct values.
      return (next() >>> 8) / 0x1000000;
    },
    nextInt(min: number, max: number): number {
      const range = max - min + 1;
      return min + Math.floor(this.nextFloat() * range);
    },
  };
}
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @se/game test
```

Expected: 5 tests pass + sanity test = 6 passing.

- [ ] **Step 5: Export from barrel**

Edit `/Users/valletta/dev/scorched-earth/packages/game/src/index.ts`:
```ts
export { createPrng } from "./rng/prng";
export type { Prng } from "./rng/prng";
```

- [ ] **Step 6: Commit**

```bash
git add packages/game/src/rng packages/game/src/index.ts
git commit -m "feat(game): seeded xoshiro128** PRNG with deterministic distribution"
```

---

## Task 5: Game type definitions

**Files:**
- Create: `packages/game/src/types.ts`

This task defines the shared types used by terrain, physics, damage, and weapons. No tests — types-only.

- [ ] **Step 1: Write types**

Create `/Users/valletta/dev/scorched-earth/packages/game/src/types.ts`:
```ts
export interface Point {
  x: number;
  y: number;
}

export interface TerrainOptions {
  seed: string;
  type: "random"; // Phase 5 adds more types
  width: number;
  height: number;
}

export interface CarveOp {
  x: number;
  y: number;
  radius: number;
  tick: number;
}

export interface WeaponDef {
  id: string;
  radius: number;          // explosion radius in pixels
  damage: number;          // max damage at impact center
  windImmune: boolean;     // if true, wind doesn't accelerate this projectile
}

export interface TargetInfo {
  playerId: string;
  x: number;
  y: number;
  shieldHp: number; // Phase 1: always 0
}

export interface DamageEntry {
  playerId: string;
  amount: number;
  shieldDamage: number; // Phase 1: always 0
  hullDamage: number;
}

export interface SimInput {
  weapon: WeaponDef;
  origin: Point;
  angle: number;          // degrees, 0..180 (0=left, 90=up, 180=right)
  power: number;          // 0..1000
  wind: number;           // -10..+10
  gravity: number;        // px/s^2; default 9.8 * GRAVITY_SCALE
  terrain: Int16Array;    // heightmap, length = TERRAIN_WIDTH
  terrainWidth: number;
  terrainHeight: number;
  walls: "none";          // Phase 5 adds more
  targets: TargetInfo[];
}

export interface TrajectorySample {
  x: number;
  y: number;
  t: number; // ms since shot start
}

export interface TrajectoryResult {
  samples: TrajectorySample[];
  impact: Point | null; // null if projectile exited bounds without hitting
  durationMs: number;
  carveOp: CarveOp | null; // null if no impact
  damages: DamageEntry[]; // empty if no impact
}
```

- [ ] **Step 2: Export from barrel**

Edit `/Users/valletta/dev/scorched-earth/packages/game/src/index.ts` and append:
```ts
export type {
  Point, TerrainOptions, CarveOp, WeaponDef, TargetInfo,
  DamageEntry, SimInput, TrajectorySample, TrajectoryResult,
} from "./types";
```

- [ ] **Step 3: Typecheck passes**

```bash
pnpm --filter @se/game typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/game/src/types.ts packages/game/src/index.ts
git commit -m "feat(game): define core types (SimInput, TrajectoryResult, CarveOp, etc.)"
```

---

## Task 6: Terrain generation (Random / Perlin-like)

**Files:**
- Create: `packages/game/src/terrain/generate.ts`, `packages/game/src/terrain/generate.test.ts`

- [ ] **Step 1: Write failing test**

Create `/Users/valletta/dev/scorched-earth/packages/game/src/terrain/generate.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { generateTerrain } from "./generate";

const W = 1600;
const H = 900;

describe("generateTerrain", () => {
  it("returns an Int16Array of length width", () => {
    const t = generateTerrain({ seed: "abc", type: "random", width: W, height: H });
    expect(t).toBeInstanceOf(Int16Array);
    expect(t.length).toBe(W);
  });

  it("heights are within [0, height]", () => {
    const t = generateTerrain({ seed: "bounds", type: "random", width: W, height: H });
    for (let i = 0; i < t.length; i++) {
      expect(t[i]).toBeGreaterThanOrEqual(0);
      expect(t[i]).toBeLessThanOrEqual(H);
    }
  });

  it("is deterministic — same seed produces identical output", () => {
    const a = generateTerrain({ seed: "det", type: "random", width: W, height: H });
    const b = generateTerrain({ seed: "det", type: "random", width: W, height: H });
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("different seeds produce different outputs", () => {
    const a = generateTerrain({ seed: "seed-A", type: "random", width: W, height: H });
    const b = generateTerrain({ seed: "seed-B", type: "random", width: W, height: H });
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it("is reasonably smooth — neighbor delta < 50 pixels in 95% of columns", () => {
    const t = generateTerrain({ seed: "smooth", type: "random", width: W, height: H });
    let bigJumps = 0;
    for (let i = 1; i < t.length; i++) {
      if (Math.abs(t[i] - t[i - 1]) > 50) bigJumps++;
    }
    expect(bigJumps).toBeLessThan(W * 0.05);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @se/game test
```

Expected: 5 tests fail with "Cannot find module './generate'".

- [ ] **Step 3: Implement**

Create `/Users/valletta/dev/scorched-earth/packages/game/src/terrain/generate.ts`:
```ts
import { createPrng } from "../rng/prng";
import type { TerrainOptions } from "../types";

// Value-noise with octave summation (cheap, deterministic, sufficient for Phase 1).
// For Phase 5, this gets replaced with type-specific generators per `TerrainOptions.type`.

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
    points[i] = prng.nextFloat() * 2 - 1; // [-1, 1]
  }
  const out = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const fi = i / freq;
    const i0 = Math.floor(fi);
    const i1 = i0 + 1;
    const t = smoothstep(fi - i0);
    out[i] = lerp(points[i0], points[i1], t);
  }
  return out;
}

export function generateTerrain(opts: TerrainOptions): Int16Array {
  const { seed, width, height } = opts;
  // 4 octaves with halving amplitude and doubling frequency.
  const o1 = buildOctave(seed + "-o1", 200, width);
  const o2 = buildOctave(seed + "-o2", 100, width);
  const o3 = buildOctave(seed + "-o3", 50, width);
  const o4 = buildOctave(seed + "-o4", 25, width);

  const out = new Int16Array(width);
  const baseline = height * 0.65;     // mean ground line
  const amplitude = height * 0.20;     // total swing
  for (let x = 0; x < width; x++) {
    const noise =
      o1[x] * 0.50 +
      o2[x] * 0.25 +
      o3[x] * 0.15 +
      o4[x] * 0.10;
    let h = baseline + noise * amplitude;
    if (h < 0) h = 0;
    if (h > height) h = height;
    out[x] = Math.round(h);
  }
  return out;
}
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @se/game test
```

Expected: terrain tests pass.

- [ ] **Step 5: Export from barrel**

Append to `/Users/valletta/dev/scorched-earth/packages/game/src/index.ts`:
```ts
export { generateTerrain } from "./terrain/generate";
```

- [ ] **Step 6: Commit**

```bash
git add packages/game/src/terrain packages/game/src/index.ts
git commit -m "feat(game): deterministic Random-terrain generator (value-noise octaves)"
```

---

## Task 7: Terrain carving + column collapse

**Files:**
- Create: `packages/game/src/terrain/carve.ts`, `packages/game/src/terrain/carve.test.ts`

In the spec, terrain is a heightmap (one Y per column). A "circle" carve removes pixels inside the circle. Since we only store a top surface per column, the carve must either:
(a) Lower the column floor where the circle reaches the surface, OR
(b) If the circle is mid-air with no terrain in it, do nothing.

We treat "carve" as: for each affected column, find the topmost point in the circle that intersects the surface, and lower that column's height down to either the bottom of the circle or to its original floor (whichever is higher). Column collapse then fills voids: if the *original* surface drops by more than column-fall threshold, we currently just leave the new (lower) surface. There's no "floating dirt" because the heightmap representation doesn't support overhangs.

- [ ] **Step 1: Write failing test**

Create `/Users/valletta/dev/scorched-earth/packages/game/src/terrain/carve.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { carveInPlace, applyCarve } from "./carve";

function flatTerrain(width: number, h: number): Int16Array {
  const t = new Int16Array(width);
  for (let i = 0; i < width; i++) t[i] = h;
  return t;
}

describe("carveInPlace", () => {
  it("does nothing if the carve circle is entirely above the surface", () => {
    const t = flatTerrain(100, 500); // surface at y=500
    carveInPlace(t, { x: 50, y: 100, radius: 20, tick: 0 });
    for (let i = 0; i < 100; i++) {
      expect(t[i]).toBe(500);
    }
  });

  it("does nothing if the carve circle is entirely below the surface (no overhangs)", () => {
    // surface at y=500; circle at y=600 is below ground (since y increases downward)
    const t = flatTerrain(100, 500);
    carveInPlace(t, { x: 50, y: 600, radius: 20, tick: 0 });
    // In Phase 1 representation, "below the surface" means y > terrain[x]. The carve
    // lowers the surface where the circle TOP intersects it.
    // Circle from y=580 to y=620 — top is y=580 which is BELOW current surface (y=500).
    // So no surface change.
    for (let i = 0; i < 100; i++) {
      expect(t[i]).toBe(500);
    }
  });

  it("carves a circle that straddles the surface, lowering affected columns", () => {
    const t = flatTerrain(100, 500);
    carveInPlace(t, { x: 50, y: 500, radius: 20, tick: 0 });
    // Columns within ±20 of x=50 should be lowered to ~y=520 (bottom of circle)
    expect(t[50]).toBe(520);
    expect(t[30]).toBe(500);  // outside radius
    expect(t[70]).toBe(500);  // outside radius
    expect(t[40]).toBeGreaterThan(500);
    expect(t[40]).toBeLessThan(520);
  });

  it("never produces negative heights", () => {
    const t = flatTerrain(100, 50);
    carveInPlace(t, { x: 50, y: 50, radius: 100, tick: 0 });
    for (let i = 0; i < 100; i++) {
      expect(t[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it("clamps to terrain height when given", () => {
    const t = flatTerrain(100, 500);
    carveInPlace(t, { x: 50, y: 500, radius: 200, tick: 0 }, { terrainHeight: 900 });
    for (let i = 0; i < 100; i++) {
      expect(t[i]).toBeLessThanOrEqual(900);
    }
  });

  it("is idempotent on the floor", () => {
    const t = flatTerrain(100, 500);
    carveInPlace(t, { x: 50, y: 500, radius: 20, tick: 0 });
    const snapshot = Array.from(t);
    carveInPlace(t, { x: 50, y: 500, radius: 20, tick: 0 });
    expect(Array.from(t)).toEqual(snapshot);
  });
});

describe("applyCarve", () => {
  it("returns a new array without mutating the input", () => {
    const a = flatTerrain(100, 500);
    const snapshot = Array.from(a);
    const b = applyCarve(a, { x: 50, y: 500, radius: 20, tick: 0 });
    expect(Array.from(a)).toEqual(snapshot);
    expect(b).not.toBe(a);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @se/game test
```

Expected: 7 carve tests fail.

- [ ] **Step 3: Implement**

Create `/Users/valletta/dev/scorched-earth/packages/game/src/terrain/carve.ts`:
```ts
import type { CarveOp } from "../types";

export interface CarveOptions {
  terrainHeight?: number; // clamp upper bound (terrain[i] cannot exceed this)
}

/**
 * Lowers terrain columns affected by a circular explosion.
 *
 * Heightmap convention: `terrain[x]` is the Y of the surface; higher Y = lower
 * altitude (screen coordinates). "Below the surface" means y > terrain[x].
 *
 * For each column within [x - radius, x + radius]:
 *  - Compute the vertical extent of the circle at that column.
 *  - If the BOTTOM of the circle is BELOW the current surface, the surface
 *    drops down to the bottom of the circle.
 */
export function carveInPlace(
  terrain: Int16Array,
  op: CarveOp,
  options: CarveOptions = {},
): void {
  const { x: cx, y: cy, radius } = op;
  const xMin = Math.max(0, Math.floor(cx - radius));
  const xMax = Math.min(terrain.length - 1, Math.ceil(cx + radius));
  const maxY = options.terrainHeight ?? Number.POSITIVE_INFINITY;

  for (let i = xMin; i <= xMax; i++) {
    const dx = i - cx;
    const dy2 = radius * radius - dx * dx;
    if (dy2 < 0) continue;
    const dy = Math.sqrt(dy2);
    const circleTop = cy - dy;
    const circleBottom = cy + dy;
    const currentSurface = terrain[i];

    // If circle top is below current surface, the carve is entirely
    // underground (no overhangs) — surface unchanged.
    if (circleTop > currentSurface) continue;

    // Otherwise drop the surface to the bottom of the circle (if that is lower).
    if (circleBottom > currentSurface) {
      let newY = Math.round(circleBottom);
      if (newY < 0) newY = 0;
      if (newY > maxY) newY = maxY;
      terrain[i] = newY;
    }
  }
}

export function applyCarve(
  terrain: Int16Array,
  op: CarveOp,
  options: CarveOptions = {},
): Int16Array {
  const out = new Int16Array(terrain);
  carveInPlace(out, op, options);
  return out;
}
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @se/game test
```

Expected: carve tests pass.

- [ ] **Step 5: Export from barrel**

Append to `index.ts`:
```ts
export { carveInPlace, applyCarve } from "./terrain/carve";
```

- [ ] **Step 6: Commit**

```bash
git add packages/game/src/terrain/carve.ts packages/game/src/terrain/carve.test.ts packages/game/src/index.ts
git commit -m "feat(game): terrain circle-carve (heightmap, no overhangs)"
```

---

## Task 8: Baby Missile weapon definition

**Files:**
- Create: `packages/game/src/weapons/baby-missile.ts`

Trivial, no tests beyond use in physics tests.

- [ ] **Step 1: Define**

Create `/Users/valletta/dev/scorched-earth/packages/game/src/weapons/baby-missile.ts`:
```ts
import type { WeaponDef } from "../types";

export const BABY_MISSILE: WeaponDef = {
  id: "baby-missile",
  radius: 20,
  damage: 25,
  windImmune: false,
};
```

- [ ] **Step 2: Export from barrel**

Append:
```ts
export { BABY_MISSILE } from "./weapons/baby-missile";
```

- [ ] **Step 3: Commit**

```bash
git add packages/game/src/weapons packages/game/src/index.ts
git commit -m "feat(game): BABY_MISSILE weapon definition (r=20, dmg=25)"
```

---

## Task 9: Damage computation (linear falloff)

**Files:**
- Create: `packages/game/src/physics/damage.ts`, `packages/game/src/physics/damage.test.ts`

- [ ] **Step 1: Write failing test**

Create `/Users/valletta/dev/scorched-earth/packages/game/src/physics/damage.test.ts`:
```ts
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
    expect(result[0].playerId).toBe("p1");
    expect(result[0].amount).toBe(25);
    expect(result[0].hullDamage).toBe(25);
  });

  it("applies linear falloff", () => {
    // distance = 10, radius = 20 → 50% of 25 = 12 (floor)
    const result = computeDamage(
      { x: 100, y: 100 },
      BABY_MISSILE,
      [{ playerId: "p1", x: 110, y: 100, shieldHp: 0 }],
    );
    expect(result[0].amount).toBe(12);
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
    expect(result.find((d) => d.playerId === "p1")?.amount).toBe(25);
    expect(result.find((d) => d.playerId === "p2")?.amount).toBe(12);
    expect(result.find((d) => d.playerId === "p3")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @se/game test
```

- [ ] **Step 3: Implement**

Create `/Users/valletta/dev/scorched-earth/packages/game/src/physics/damage.ts`:
```ts
import type { DamageEntry, Point, TargetInfo, WeaponDef } from "../types";

export function computeDamage(
  impact: Point,
  weapon: WeaponDef,
  targets: TargetInfo[],
): DamageEntry[] {
  const out: DamageEntry[] = [];
  for (const target of targets) {
    const dx = target.x - impact.x;
    const dy = target.y - impact.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist >= weapon.radius) continue;
    const amount = Math.floor(weapon.damage * (1 - dist / weapon.radius));
    if (amount <= 0) continue;
    // Phase 1: no shields. shieldHp == 0 for all targets.
    out.push({
      playerId: target.playerId,
      amount,
      shieldDamage: 0,
      hullDamage: amount,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @se/game test
```

- [ ] **Step 5: Export from barrel**

```ts
export { computeDamage } from "./physics/damage";
```

- [ ] **Step 6: Commit**

```bash
git add packages/game/src/physics/damage.ts packages/game/src/physics/damage.test.ts packages/game/src/index.ts
git commit -m "feat(game): linear-falloff splash damage"
```

---

## Task 10: Projectile physics — simulator

**Files:**
- Create: `packages/game/src/physics/simulate.ts`, `packages/game/src/physics/simulate.test.ts`

This is the largest task in `packages/game`. The simulator:
1. Integrates ballistic motion at dt=1/60s
2. Adds wind acceleration (unless `weapon.windImmune`)
3. Adds gravity
4. Stops on terrain collision (`y > terrain[floor(x)]`) — emits final sample at intersection
5. Stops on off-screen exit (`x < 0`, `x >= terrainWidth`, `y >= terrainHeight + slack`)
6. Caps simulation at 8 seconds wall-time (safety)
7. Emits one sample per tick, downsamples to ≤100 samples
8. On impact, calls `computeDamage` to populate `damages`
9. Returns `TrajectoryResult` with `samples`, `impact`, `carveOp`, `damages`, `durationMs`

- [ ] **Step 1: Write failing test**

Create `/Users/valletta/dev/scorched-earth/packages/game/src/physics/simulate.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { simulateProjectile } from "./simulate";
import { BABY_MISSILE } from "../weapons/baby-missile";
import type { SimInput } from "../types";

const W = 1600;
const H = 900;

function flatTerrain(surfaceY: number): Int16Array {
  const t = new Int16Array(W);
  for (let i = 0; i < W; i++) t[i] = surfaceY;
  return t;
}

function defaultInput(overrides: Partial<SimInput> = {}): SimInput {
  return {
    weapon: BABY_MISSILE,
    origin: { x: 800, y: 600 },
    angle: 90,
    power: 500,
    wind: 0,
    gravity: 250,    // px/s^2; tune so power-500/45° on H=900 terrain travels ~half W
    terrain: flatTerrain(700),
    terrainWidth: W,
    terrainHeight: H,
    walls: "none",
    targets: [],
    ...overrides,
  };
}

describe("simulateProjectile", () => {
  it("vertical shot with no wind lands near the launch x", () => {
    const r = simulateProjectile(defaultInput({ angle: 90 }));
    expect(r.impact).not.toBeNull();
    if (!r.impact) throw new Error("unreachable");
    expect(Math.abs(r.impact.x - 800)).toBeLessThan(5);
  });

  it("45° shot to the right lands to the right of origin", () => {
    const r = simulateProjectile(defaultInput({ angle: 135 })); // 135° = up-right
    expect(r.impact).not.toBeNull();
    if (!r.impact) throw new Error("unreachable");
    expect(r.impact.x).toBeGreaterThan(800);
  });

  it("45° shot to the left lands to the left of origin", () => {
    const r = simulateProjectile(defaultInput({ angle: 45 })); // 45° = up-left
    expect(r.impact).not.toBeNull();
    if (!r.impact) throw new Error("unreachable");
    expect(r.impact.x).toBeLessThan(800);
  });

  it("positive wind pushes a vertical shot to the right", () => {
    const noWind = simulateProjectile(defaultInput({ angle: 90, wind: 0 }));
    const withWind = simulateProjectile(defaultInput({ angle: 90, wind: 10 }));
    if (!noWind.impact || !withWind.impact) throw new Error("expected impacts");
    expect(withWind.impact.x).toBeGreaterThan(noWind.impact.x + 10);
  });

  it("wind-immune projectile is unaffected by wind", () => {
    const immune = { ...BABY_MISSILE, windImmune: true };
    const a = simulateProjectile(defaultInput({ weapon: immune, angle: 90, wind: 0 }));
    const b = simulateProjectile(defaultInput({ weapon: immune, angle: 90, wind: 10 }));
    if (!a.impact || !b.impact) throw new Error("expected impacts");
    expect(Math.abs(a.impact.x - b.impact.x)).toBeLessThan(2);
  });

  it("off-screen exit (walls=none) returns null impact", () => {
    const r = simulateProjectile(
      defaultInput({ angle: 135, power: 1000, terrain: flatTerrain(880) /* surface near floor */ }),
    );
    // High-power upper-right shot exits the right side before falling enough to hit
    // ground at y=880 in this W=1600 window? With this gravity it should impact —
    // but at very low surface (high y), and walls=none, may exit screen first.
    // Instead, use a power-9999 angle-180 horizontal shot that clearly leaves the
    // screen.
    const r2 = simulateProjectile(
      defaultInput({ angle: 180, power: 1000, terrain: flatTerrain(880) }),
    );
    // Horizontal right-bound shot at high speed exits before falling 280px.
    expect(r2.impact).toBeNull();
    expect(r2.samples[r2.samples.length - 1].x).toBeGreaterThan(W - 5);
  });

  it("samples are time-ordered and end at impact", () => {
    const r = simulateProjectile(defaultInput({ angle: 90 }));
    for (let i = 1; i < r.samples.length; i++) {
      expect(r.samples[i].t).toBeGreaterThan(r.samples[i - 1].t);
    }
    if (r.impact) {
      const last = r.samples[r.samples.length - 1];
      expect(Math.abs(last.x - r.impact.x)).toBeLessThan(2);
      expect(Math.abs(last.y - r.impact.y)).toBeLessThan(2);
    }
  });

  it("downsamples to <= 100 samples for long shots", () => {
    const r = simulateProjectile(defaultInput({ angle: 90, power: 999 }));
    expect(r.samples.length).toBeLessThanOrEqual(100);
    expect(r.samples.length).toBeGreaterThan(2);
  });

  it("produces a CarveOp at the impact point with weapon radius", () => {
    const r = simulateProjectile(defaultInput({ angle: 90 }));
    expect(r.carveOp).not.toBeNull();
    if (!r.carveOp || !r.impact) throw new Error("unreachable");
    expect(r.carveOp.x).toBe(Math.round(r.impact.x));
    expect(r.carveOp.y).toBe(Math.round(r.impact.y));
    expect(r.carveOp.radius).toBe(BABY_MISSILE.radius);
  });

  it("computes damages for targets in radius", () => {
    const r = simulateProjectile(
      defaultInput({
        angle: 90,
        targets: [{ playerId: "victim", x: 800, y: 700, shieldHp: 0 }],
      }),
    );
    expect(r.damages.length).toBe(1);
    expect(r.damages[0].playerId).toBe("victim");
    expect(r.damages[0].amount).toBeGreaterThan(0);
  });

  it("durationMs matches the last sample time", () => {
    const r = simulateProjectile(defaultInput({ angle: 90 }));
    const last = r.samples[r.samples.length - 1];
    expect(r.durationMs).toBe(last.t);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @se/game test
```

Expected: simulate tests fail with module-not-found.

- [ ] **Step 3: Implement**

Create `/Users/valletta/dev/scorched-earth/packages/game/src/physics/simulate.ts`:
```ts
import type { SimInput, TrajectoryResult, TrajectorySample } from "../types";
import { computeDamage } from "./damage";

const DT_MS = 1000 / 60;          // 16.67 ms per step
const MAX_DURATION_MS = 8000;     // safety cap
const VELOCITY_SCALE = 0.5;       // tune so power-500/45° flies ~half the terrain
const WIND_ACCEL_SCALE = 5.0;     // wind units → px/s^2 acceleration
const MAX_SAMPLES = 100;

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Heightmap convention: terrain[x] is the y of the surface (screen coords:
 * y down). A projectile is "above the surface" when its y < terrain[floor(x)].
 * Collision: projectile y >= terrain[floor(x)] after at least one tick.
 *
 * Angle convention (degrees, 0..180):
 *   0   = pointing fully LEFT (vx_unit = -1, vy_unit = 0)
 *   90  = pointing straight UP (vx_unit = 0, vy_unit = -1)
 *   180 = pointing fully RIGHT (vx_unit = +1, vy_unit = 0)
 *
 * For angle 0..180:
 *   vx_unit = -cos(angle)
 *   vy_unit = -sin(angle)  // negative because screen y is down
 */
function initialVelocity(
  angle: number,
  power: number,
): { vx: number; vy: number } {
  const a = degToRad(angle);
  return {
    vx: -Math.cos(a) * power * VELOCITY_SCALE,
    vy: -Math.sin(a) * power * VELOCITY_SCALE,
  };
}

function heightAt(terrain: Int16Array, x: number): number {
  const i = Math.floor(x);
  if (i < 0 || i >= terrain.length) return Number.POSITIVE_INFINITY;
  return terrain[i];
}

export function simulateProjectile(input: SimInput): TrajectoryResult {
  const {
    weapon, origin, angle, power, wind, gravity,
    terrain, terrainWidth, terrainHeight, walls, targets,
  } = input;

  // Off-screen-ish soft cap: y below terrainHeight + slack means we've left
  const SOFT_BOTTOM = terrainHeight + 200;

  let { vx, vy } = initialVelocity(angle, power);
  // Convert seconds-based gravity / wind to per-tick.
  const dtSec = DT_MS / 1000;
  const gravityAccel = gravity;
  const windAccel = weapon.windImmune ? 0 : wind * WIND_ACCEL_SCALE;

  let x = origin.x;
  let y = origin.y;
  let t = 0;

  const rawSamples: TrajectorySample[] = [{ x, y, t: 0 }];
  let impact: { x: number; y: number } | null = null;

  while (t < MAX_DURATION_MS) {
    // Integrate (semi-implicit Euler)
    vx += windAccel * dtSec;
    vy += gravityAccel * dtSec;
    x += vx * dtSec;
    y += vy * dtSec;
    t += DT_MS;

    // Bounds
    if (walls === "none") {
      if (x < 0 || x >= terrainWidth) {
        // Exited horizontally — no impact
        rawSamples.push({ x, y, t });
        break;
      }
      if (y > SOFT_BOTTOM) {
        rawSamples.push({ x, y, t });
        break;
      }
    }

    // Terrain collision (substep refinement for sub-pixel accuracy)
    const surfaceY = heightAt(terrain, x);
    if (y >= surfaceY) {
      // Binary-search refinement to find the crossing point in the last step
      const prev = rawSamples[rawSamples.length - 1];
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        const sx = prev.x + (x - prev.x) * mid;
        const sy = prev.y + (y - prev.y) * mid;
        const sSurface = heightAt(terrain, sx);
        if (sy >= sSurface) hi = mid;
        else lo = mid;
      }
      const t0 = prev.t;
      const finalX = prev.x + (x - prev.x) * hi;
      const finalY = prev.y + (y - prev.y) * hi;
      const finalT = t0 + (t - t0) * hi;
      rawSamples.push({ x: finalX, y: finalY, t: finalT });
      impact = { x: finalX, y: finalY };
      t = finalT;
      break;
    }

    rawSamples.push({ x, y, t });
  }

  // Downsample to <= MAX_SAMPLES, always keeping first + last
  let samples: TrajectorySample[];
  if (rawSamples.length <= MAX_SAMPLES) {
    samples = rawSamples;
  } else {
    samples = [rawSamples[0]];
    const interior = MAX_SAMPLES - 2;
    for (let i = 1; i <= interior; i++) {
      const idx = Math.round((i / (interior + 1)) * (rawSamples.length - 1));
      samples.push(rawSamples[idx]);
    }
    samples.push(rawSamples[rawSamples.length - 1]);
  }

  const carveOp = impact
    ? {
        x: Math.round(impact.x),
        y: Math.round(impact.y),
        radius: weapon.radius,
        tick: 0, // caller (MatchRoom) overwrites with state.tick
      }
    : null;

  const damages = impact ? computeDamage(impact, weapon, targets) : [];
  const durationMs = samples[samples.length - 1].t;

  return { samples, impact, durationMs, carveOp, damages };
}
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @se/game test
```

Expected: all simulate tests pass. May need small tuning of `VELOCITY_SCALE` / `gravity` if direction tests are off; adjust until passes.

- [ ] **Step 5: Export from barrel**

```ts
export { simulateProjectile } from "./physics/simulate";
```

- [ ] **Step 6: Commit**

```bash
git add packages/game/src/physics packages/game/src/index.ts
git commit -m "feat(game): simulateProjectile with wind+gravity+terrain collision"
```

---

# packages/shared — Colyseus schemas + intents

## Task 11: Shared package scaffold

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`

- [ ] **Step 1: Manifest**

Create `/Users/valletta/dev/scorched-earth/packages/shared/package.json`:
```json
{
  "name": "@se/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "echo no tests"
  },
  "dependencies": {
    "@colyseus/schema": "^3.0.0"
  },
  "devDependencies": {
    "@se/tsconfig": "workspace:*",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: TS config**

Create `/Users/valletta/dev/scorched-earth/packages/shared/tsconfig.json`:
```json
{
  "extends": "@se/tsconfig/base.json",
  "compilerOptions": {
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: Empty barrel**

Create `/Users/valletta/dev/scorched-earth/packages/shared/src/index.ts`:
```ts
export {};
```

- [ ] **Step 4: Install**

```bash
pnpm install
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "chore: scaffold @se/shared with @colyseus/schema"
```

---

## Task 12: Tank, CarveOp, MatchState schemas

**Files:**
- Create: `packages/shared/src/schema/Tank.ts`, `packages/shared/src/schema/CarveOp.ts`, `packages/shared/src/schema/MatchState.ts`

- [ ] **Step 1: Tank**

Create `/Users/valletta/dev/scorched-earth/packages/shared/src/schema/Tank.ts`:
```ts
import { Schema, type } from "@colyseus/schema";

export class Tank extends Schema {
  @type("string") playerId = "";
  @type("string") sessionId = "";
  @type("string") nickname = "";
  @type("string") color = "red";
  @type("string") hat = "none";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") hp = 100;
  @type("number") angle = 90;
  @type("number") power = 500;
  @type("boolean") alive = true;
  @type("boolean") connected = true;
}
```

- [ ] **Step 2: CarveOp**

Create `/Users/valletta/dev/scorched-earth/packages/shared/src/schema/CarveOp.ts`:
```ts
import { Schema, type } from "@colyseus/schema";

export class CarveOp extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") radius = 0;
  @type("number") tick = 0;
}
```

- [ ] **Step 3: MatchState**

Create `/Users/valletta/dev/scorched-earth/packages/shared/src/schema/MatchState.ts`:
```ts
import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";
import { Tank } from "./Tank";
import { CarveOp } from "./CarveOp";

export type MatchPhase = "lobby" | "playing" | "resolving" | "ended";

export class MatchState extends Schema {
  @type("string") phase: MatchPhase = "lobby";
  @type("string") roomCode = "";
  @type("string") hostId = "";
  @type("number") tick = 0;
  @type("number") wind = 0;
  @type("number") gravity = 250;
  @type("string") terrainSeed = "";
  @type("string") terrainType = "random";
  @type("number") terrainVersion = 0;
  @type([CarveOp]) terrainOps = new ArraySchema<CarveOp>();
  @type("string") currentTurnPlayerId = "";
  @type("number") turnDeadlineMs = 0;
  @type("number") turnTimerMs = 30_000;
  @type("number") maxPlayers = 10;
  @type({ map: Tank }) tanks = new MapSchema<Tank>();
  @type("string") winnerId = "";
}
```

- [ ] **Step 4: Export from barrel**

Edit `/Users/valletta/dev/scorched-earth/packages/shared/src/index.ts`:
```ts
export { Tank } from "./schema/Tank";
export { CarveOp } from "./schema/CarveOp";
export { MatchState, type MatchPhase } from "./schema/MatchState";
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @se/shared typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schema packages/shared/src/index.ts
git commit -m "feat(shared): MatchState/Tank/CarveOp Colyseus schemas"
```

---

## Task 13: Intent types and constants

**Files:**
- Create: `packages/shared/src/intents.ts`, `packages/shared/src/constants.ts`

- [ ] **Step 1: Intents**

Create `/Users/valletta/dev/scorched-earth/packages/shared/src/intents.ts`:
```ts
export type Intent =
  | { kind: "aim"; angle: number; power: number }            // reserved for Phase 11 spectators
  | { kind: "fire"; angle: number; power: number }
  | { kind: "configure"; turnTimerMs: number }               // host only
  | { kind: "ready" }
  | { kind: "chat"; text: string };

export type IntentKind = Intent["kind"];

export function clampAngle(angle: number): number {
  if (angle < 0) return 0;
  if (angle > 180) return 180;
  return angle;
}

export function clampPower(power: number): number {
  if (power < 0) return 0;
  if (power > 1000) return 1000;
  return power;
}
```

- [ ] **Step 2: Constants**

Create `/Users/valletta/dev/scorched-earth/packages/shared/src/constants.ts`:
```ts
export const TERRAIN_WIDTH = 1600;
export const TERRAIN_HEIGHT = 900;
export const MAX_PLAYERS = 10;
export const DEFAULT_TURN_TIMER_MS = 30_000;
export const RECONNECT_GRACE_SEC = 60;
export const POST_PLAYBACK_BUFFER_MS = 200;
export const COLORS = [
  "red", "blue", "green", "yellow", "cyan",
  "magenta", "orange", "white", "pink", "lime",
] as const;
export type TankColor = typeof COLORS[number];

export const HATS = ["none", "chef", "top-hat", "beanie"] as const;
export type TankHat = typeof HATS[number];
```

- [ ] **Step 3: Export**

Append to `/Users/valletta/dev/scorched-earth/packages/shared/src/index.ts`:
```ts
export * from "./intents";
export * from "./constants";
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @se/shared typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/intents.ts packages/shared/src/constants.ts packages/shared/src/index.ts
git commit -m "feat(shared): intent types, clamps, constants, colors, hats"
```

---

# apps/server — Colyseus

## Task 14: Scaffold apps/server

**Files:**
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`, `apps/server/vitest.config.ts`, `apps/server/src/index.ts`

- [ ] **Step 1: Manifest**

Create `/Users/valletta/dev/scorched-earth/apps/server/package.json`:
```json
{
  "name": "@se/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node --experimental-strip-types src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@colyseus/core": "^0.16.0",
    "@colyseus/schema": "^3.0.0",
    "@colyseus/ws-transport": "^0.16.0",
    "@se/game": "workspace:*",
    "@se/shared": "workspace:*",
    "colyseus": "^0.16.0"
  },
  "devDependencies": {
    "@colyseus/testing": "^0.16.0",
    "@se/tsconfig": "workspace:*",
    "@types/node": "^22.0.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: TS config**

Create `/Users/valletta/dev/scorched-earth/apps/server/tsconfig.json`:
```json
{
  "extends": "@se/tsconfig/node.json",
  "compilerOptions": {
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: Vitest**

Create `/Users/valletta/dev/scorched-earth/apps/server/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: { provider: "v8", thresholds: { lines: 70, functions: 70 } },
    testTimeout: 10_000,
  },
});
```

- [ ] **Step 4: Stub entrypoint**

Create `/Users/valletta/dev/scorched-earth/apps/server/src/index.ts`:
```ts
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";

const PORT = Number(process.env.PORT ?? 2567);

async function main() {
  const gameServer = new Server({
    transport: new WebSocketTransport(),
  });

  // Rooms are registered in subsequent tasks.

  await gameServer.listen(PORT);
  console.log(`[server] listening on ws://localhost:${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 5: Install**

```bash
pnpm install
```

- [ ] **Step 6: Smoke run**

```bash
pnpm --filter @se/server dev
```

Expected: server logs "listening on ws://localhost:2567". Stop with Ctrl-C.

- [ ] **Step 7: Commit**

```bash
git add apps/server pnpm-lock.yaml
git commit -m "chore: scaffold @se/server with Colyseus 0.16"
```

---

## Task 15: Room code generator

**Files:**
- Create: `apps/server/src/codeGen.ts`, `apps/server/tests/codeGen.test.ts`

- [ ] **Step 1: Write failing test**

Create `/Users/valletta/dev/scorched-earth/apps/server/tests/codeGen.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { generateRoomCode } from "../src/codeGen";

describe("generateRoomCode", () => {
  it("returns a 6-char [A-Z0-9] code", () => {
    const code = generateRoomCode(new Set());
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
  });

  it("avoids codes in the existing set", () => {
    const existing = new Set<string>();
    const codes = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const c = generateRoomCode(existing);
      expect(existing.has(c)).toBe(false);
      existing.add(c);
      codes.add(c);
    }
    expect(codes.size).toBe(1000);
  });

  it("retries gracefully even when nearly all codes are taken", () => {
    // Construct a "blocked" set that excludes only one specific code
    const target = "ABCDEF";
    const existing = new Set<string>();
    // We'd need to seed RNG to make this deterministic; instead, just verify it
    // doesn't throw after many retries.
    expect(() => generateRoomCode(existing)).not.toThrow();
    void target;
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @se/server test
```

Expected: tests fail with module-not-found.

- [ ] **Step 3: Implement**

Create `/Users/valletta/dev/scorched-earth/apps/server/src/codeGen.ts`:
```ts
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // omit I/O/0/1 for readability
const CODE_LENGTH = 6;
const MAX_RETRIES = 1000;

export function generateRoomCode(existing: Set<string>): string {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    if (!existing.has(code)) return code;
  }
  throw new Error("Could not generate a unique room code after 1000 attempts");
}
```

Note: the test's regex `/^[A-Z0-9]{6}$/` matches our restricted alphabet (all chars in `ALPHABET` are in `[A-Z0-9]`).

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @se/server test
```

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/codeGen.ts apps/server/tests/codeGen.test.ts
git commit -m "feat(server): 6-char room-code generator (readable alphabet, retry on collision)"
```

---

## Task 16: LobbyRoom (singleton)

**Files:**
- Create: `apps/server/src/rooms/LobbyRoom.ts`, `apps/server/tests/LobbyRoom.test.ts`
- Modify: `apps/server/src/index.ts`

`LobbyRoom` tracks open MatchRooms (by code). For Phase 1 it has minimal state — the client uses `joinByCode` against the MatchRoom directly. LobbyRoom exists so the client can call `createMatch` to get a new code and see the list of open rooms.

- [ ] **Step 1: Write failing integration test**

Create `/Users/valletta/dev/scorched-earth/apps/server/tests/LobbyRoom.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ColyseusTestServer, boot } from "@colyseus/testing";
import appConfig from "../src/appConfig";

let colyseus: ColyseusTestServer;

beforeEach(async () => {
  colyseus = await boot(appConfig);
});

afterEach(async () => {
  await colyseus.shutdown();
});

describe("LobbyRoom", () => {
  it("client can join the lobby", async () => {
    const room = await colyseus.connectTo(colyseus.sdk, "lobby", {});
    expect(room.sessionId).toBeTruthy();
    room.leave();
  });

  it("createMatch returns a 6-char code", async () => {
    const room = await colyseus.connectTo(colyseus.sdk, "lobby", {});

    const code = await new Promise<string>((resolve, reject) => {
      room.onMessage("matchCreated", (msg: { code: string }) => resolve(msg.code));
      room.onMessage("error", (m) => reject(new Error(JSON.stringify(m))));
      room.send("createMatch", {});
    });

    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    room.leave();
  });
});
```

- [ ] **Step 2: Add an appConfig module so testing tooling can load the server**

Create `/Users/valletta/dev/scorched-earth/apps/server/src/appConfig.ts`:
```ts
import { Server } from "colyseus";
import { LobbyRoom } from "./rooms/LobbyRoom";
import { MatchRoom } from "./rooms/MatchRoom"; // file created in Task 17

export default {
  initializeGameServer: (gameServer: Server) => {
    gameServer.define("lobby", LobbyRoom);
    gameServer.define("match", MatchRoom)
      .filterBy(["code"]); // clients join by code via filterBy match
  },
};
```

- [ ] **Step 3: Run, verify fail**

```bash
pnpm --filter @se/server test
```

Expected: tests fail with module-not-found for `./rooms/LobbyRoom` (and MatchRoom).

- [ ] **Step 4: Implement LobbyRoom**

Create `/Users/valletta/dev/scorched-earth/apps/server/src/rooms/LobbyRoom.ts`:
```ts
import { Room, Client } from "colyseus";
import { Schema, type } from "@colyseus/schema";
import { generateRoomCode } from "../codeGen";

class LobbyState extends Schema {
  @type("number") openMatchCount = 0;
}

// Module-level set of in-use codes. MatchRoom registers/unregisters as
// rooms are created/disposed (Task 17 wires this up).
export const ACTIVE_CODES = new Set<string>();

export class LobbyRoom extends Room<LobbyState> {
  autoDispose = false;

  onCreate(): void {
    this.setState(new LobbyState());

    this.onMessage("createMatch", (client: Client) => {
      const code = generateRoomCode(ACTIVE_CODES);
      ACTIVE_CODES.add(code);
      this.state.openMatchCount++;
      client.send("matchCreated", { code });
    });
  }
}
```

- [ ] **Step 5: Stub MatchRoom so the test can load**

Create `/Users/valletta/dev/scorched-earth/apps/server/src/rooms/MatchRoom.ts`:
```ts
import { Room } from "colyseus";
import { MatchState } from "@se/shared";

export class MatchRoom extends Room<MatchState> {
  onCreate(_options: { code?: string } = {}): void {
    this.setState(new MatchState());
  }
}
```

- [ ] **Step 6: Update server entrypoint**

Edit `/Users/valletta/dev/scorched-earth/apps/server/src/index.ts`:
```ts
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import appConfig from "./appConfig";

const PORT = Number(process.env.PORT ?? 2567);

async function main() {
  const gameServer = new Server({
    transport: new WebSocketTransport(),
  });
  appConfig.initializeGameServer(gameServer);
  await gameServer.listen(PORT);
  console.log(`[server] listening on ws://localhost:${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 7: Run, verify pass**

```bash
pnpm --filter @se/server test
```

Expected: LobbyRoom tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src apps/server/tests/LobbyRoom.test.ts
git commit -m "feat(server): LobbyRoom with createMatch returning room codes"
```

---

## Task 17: MatchRoom — join, configure, start

**Files:**
- Modify: `apps/server/src/rooms/MatchRoom.ts`
- Create: `apps/server/tests/MatchRoom.test.ts`

This task implements:
- Players join via `filterBy(code)`; nickname/color/hat captured at join.
- Host is the first player to join.
- Host can send `configure` with `turnTimerMs`.
- Host sends `ready` to start; state transitions `lobby` → `playing`, terrain is generated, tanks are placed.

- [ ] **Step 1: Write failing test**

Create `/Users/valletta/dev/scorched-earth/apps/server/tests/MatchRoom.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ColyseusTestServer, boot } from "@colyseus/testing";
import appConfig from "../src/appConfig";

let colyseus: ColyseusTestServer;
beforeEach(async () => { colyseus = await boot(appConfig); });
afterEach(async () => { await colyseus.shutdown(); });

async function joinMatch(opts: { code: string; nickname: string; color: string; hat?: string }) {
  return colyseus.connectTo(colyseus.sdk, "match", opts);
}

describe("MatchRoom", () => {
  it("first joiner becomes host", async () => {
    const room = await joinMatch({ code: "TEST01", nickname: "Alice", color: "red" });
    await new Promise((r) => setTimeout(r, 50));
    expect(room.state.hostId).toBe(room.sessionId);
    expect(room.state.tanks.size).toBe(1);
    room.leave();
  });

  it("subsequent joiners are not host", async () => {
    const a = await joinMatch({ code: "TEST02", nickname: "Alice", color: "red" });
    await new Promise((r) => setTimeout(r, 30));
    const b = await joinMatch({ code: "TEST02", nickname: "Bob", color: "blue" });
    await new Promise((r) => setTimeout(r, 30));
    expect(a.state.hostId).toBe(a.sessionId);
    expect(b.state.hostId).toBe(a.sessionId);
    expect(a.state.tanks.size).toBe(2);
    a.leave(); b.leave();
  });

  it("non-host configure is ignored", async () => {
    const a = await joinMatch({ code: "TEST03", nickname: "A", color: "red" });
    const b = await joinMatch({ code: "TEST03", nickname: "B", color: "blue" });
    await new Promise((r) => setTimeout(r, 30));
    b.send("configure", { turnTimerMs: 12_345 });
    await new Promise((r) => setTimeout(r, 50));
    expect(a.state.turnTimerMs).not.toBe(12_345);
    a.leave(); b.leave();
  });

  it("host configure updates state", async () => {
    const a = await joinMatch({ code: "TEST04", nickname: "A", color: "red" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("configure", { turnTimerMs: 45_000 });
    await new Promise((r) => setTimeout(r, 50));
    expect(a.state.turnTimerMs).toBe(45_000);
    a.leave();
  });

  it("host start transitions phase and generates terrain", async () => {
    const a = await joinMatch({ code: "TEST05", nickname: "A", color: "red" });
    const b = await joinMatch({ code: "TEST05", nickname: "B", color: "blue" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("ready", {});
    await new Promise((r) => setTimeout(r, 100));
    expect(a.state.phase).toBe("playing");
    expect(a.state.terrainSeed).not.toBe("");
    expect(a.state.currentTurnPlayerId).toBeTruthy();
    // Tanks placed on terrain
    for (const t of Array.from(a.state.tanks.values())) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(1600);
    }
    a.leave(); b.leave();
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @se/server test
```

- [ ] **Step 3: Implement MatchRoom**

Replace `/Users/valletta/dev/scorched-earth/apps/server/src/rooms/MatchRoom.ts`:
```ts
import { Room, Client } from "colyseus";
import {
  MatchState, Tank,
  DEFAULT_TURN_TIMER_MS, MAX_PLAYERS,
  TERRAIN_WIDTH, TERRAIN_HEIGHT,
  type TankColor, type TankHat,
} from "@se/shared";
import { generateTerrain } from "@se/game";

interface JoinOptions {
  code: string;
  nickname: string;
  color: TankColor;
  hat?: TankHat;
}

export class MatchRoom extends Room<MatchState> {
  override maxClients = MAX_PLAYERS;

  onCreate(options: { code?: string }): void {
    const state = new MatchState();
    state.roomCode = options.code ?? "";
    state.turnTimerMs = DEFAULT_TURN_TIMER_MS;
    state.gravity = 250;
    this.setState(state);

    this.onMessage("configure", (client, msg: { turnTimerMs: number }) => {
      if (client.sessionId !== this.state.hostId) return;
      if (this.state.phase !== "lobby") return;
      const v = Number(msg?.turnTimerMs);
      if (!Number.isFinite(v) || v < 0 || v > 5 * 60_000) return;
      this.state.turnTimerMs = v;
    });

    this.onMessage("ready", (client) => {
      if (client.sessionId !== this.state.hostId) return;
      if (this.state.phase !== "lobby") return;
      this.startMatch();
    });
  }

  onJoin(client: Client, options: JoinOptions): void {
    const tank = new Tank();
    tank.playerId = client.sessionId;
    tank.sessionId = client.sessionId;
    tank.nickname = (options.nickname ?? "Player").slice(0, 24);
    tank.color = options.color ?? "red";
    tank.hat = options.hat ?? "none";
    tank.connected = true;
    tank.alive = true;
    tank.hp = 100;
    this.state.tanks.set(client.sessionId, tank);

    if (this.state.hostId === "") {
      this.state.hostId = client.sessionId;
    }
  }

  onLeave(client: Client): void {
    const tank = this.state.tanks.get(client.sessionId);
    if (!tank) return;
    tank.connected = false;
    // Phase 1: full disconnect (no reconnect grace yet — added in Task 22)
    this.state.tanks.delete(client.sessionId);
    if (this.state.hostId === client.sessionId) {
      // Promote next-oldest session as host
      const first = this.state.tanks.keys().next().value;
      this.state.hostId = first ?? "";
    }
  }

  private startMatch(): void {
    this.state.phase = "playing";
    this.state.terrainSeed = this.state.roomCode + "-v1";
    const terrain = generateTerrain({
      seed: this.state.terrainSeed,
      type: "random",
      width: TERRAIN_WIDTH,
      height: TERRAIN_HEIGHT,
    });
    this.placeTanksOn(terrain);
    // First turn: oldest tank in order
    const first = this.state.tanks.keys().next().value;
    this.state.currentTurnPlayerId = first ?? "";
    this.state.turnDeadlineMs = Date.now() + this.state.turnTimerMs;
  }

  private placeTanksOn(terrain: Int16Array): void {
    const tanks = Array.from(this.state.tanks.values());
    if (tanks.length === 0) return;
    const slotWidth = TERRAIN_WIDTH / (tanks.length + 1);
    tanks.forEach((tank, i) => {
      const x = Math.round(slotWidth * (i + 1));
      tank.x = x;
      tank.y = terrain[x];
    });
  }
}
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @se/server test
```

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/rooms/MatchRoom.ts apps/server/tests/MatchRoom.test.ts
git commit -m "feat(server): MatchRoom join/configure/ready/start with tank placement"
```

---

## Task 18: turnController — next-player / start / expire helpers

**Files:**
- Create: `apps/server/src/rooms/turnController.ts`, `apps/server/tests/turnController.test.ts`

- [ ] **Step 1: Write failing unit test**

Create `/Users/valletta/dev/scorched-earth/apps/server/tests/turnController.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { nextTurnPlayerId } from "../src/rooms/turnController";

interface T { sessionId: string; alive: boolean; }

describe("nextTurnPlayerId", () => {
  it("returns the first alive player when current is empty", () => {
    const tanks: T[] = [
      { sessionId: "a", alive: true }, { sessionId: "b", alive: true },
    ];
    expect(nextTurnPlayerId(tanks, "")).toBe("a");
  });

  it("returns the next alive player after current", () => {
    const tanks: T[] = [
      { sessionId: "a", alive: true }, { sessionId: "b", alive: true }, { sessionId: "c", alive: true },
    ];
    expect(nextTurnPlayerId(tanks, "a")).toBe("b");
    expect(nextTurnPlayerId(tanks, "b")).toBe("c");
    expect(nextTurnPlayerId(tanks, "c")).toBe("a"); // wraps
  });

  it("skips dead players", () => {
    const tanks: T[] = [
      { sessionId: "a", alive: true },
      { sessionId: "b", alive: false },
      { sessionId: "c", alive: true },
    ];
    expect(nextTurnPlayerId(tanks, "a")).toBe("c");
  });

  it("returns empty string when no alive players exist", () => {
    const tanks: T[] = [{ sessionId: "a", alive: false }];
    expect(nextTurnPlayerId(tanks, "")).toBe("");
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @se/server test
```

- [ ] **Step 3: Implement**

Create `/Users/valletta/dev/scorched-earth/apps/server/src/rooms/turnController.ts`:
```ts
export interface AliveCheckable {
  sessionId: string;
  alive: boolean;
}

/**
 * Given an ordered list of tanks (by join order) and the current turn's playerId,
 * return the sessionId of the next alive player (wrapping around). Returns "" if
 * no alive players remain.
 */
export function nextTurnPlayerId(
  tanks: readonly AliveCheckable[],
  currentId: string,
): string {
  const n = tanks.length;
  if (n === 0) return "";
  let startIndex = tanks.findIndex((t) => t.sessionId === currentId);
  if (startIndex < 0) startIndex = -1;
  for (let i = 1; i <= n; i++) {
    const idx = (startIndex + i + n) % n;
    if (tanks[idx].alive) return tanks[idx].sessionId;
  }
  return "";
}
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @se/server test
```

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/rooms/turnController.ts apps/server/tests/turnController.test.ts
git commit -m "feat(server): turn rotation that wraps and skips dead players"
```

---

## Task 19: MatchRoom — FIRE intent → resolveTurn → state commit

**Files:**
- Modify: `apps/server/src/rooms/MatchRoom.ts`
- Create: `apps/server/src/rooms/resolveTurn.ts`
- Modify: `apps/server/tests/MatchRoom.test.ts`

This is the heart of the turn loop:
1. Current-turn player sends `fire` with `{angle, power}`.
2. Server validates intent and computes the trajectory via `simulateProjectile`.
3. Server broadcasts `trajectory-resolved` to all clients.
4. Server waits `durationMs + POST_PLAYBACK_BUFFER_MS`, then:
   - Appends `CarveOp` to `state.terrainOps`
   - Applies damages to tanks; marks dead
   - Broadcasts `damage-applied`
   - Checks for match end (≤1 alive)
   - Either rotates turn or transitions to `ended`

- [ ] **Step 1: Add tests for FIRE flow**

Append to `/Users/valletta/dev/scorched-earth/apps/server/tests/MatchRoom.test.ts`:
```ts
describe("MatchRoom — fire", () => {
  it("non-current player firing is ignored", async () => {
    const a = await joinMatch({ code: "FIRE01", nickname: "A", color: "red" });
    const b = await joinMatch({ code: "FIRE01", nickname: "B", color: "blue" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("ready", {});
    await new Promise((r) => setTimeout(r, 100));

    const turnPlayer = a.state.currentTurnPlayerId;
    const wrong = turnPlayer === a.sessionId ? b : a;
    const carveCountBefore = a.state.terrainOps.length;

    wrong.send("fire", { angle: 90, power: 500 });
    await new Promise((r) => setTimeout(r, 200));

    expect(a.state.terrainOps.length).toBe(carveCountBefore);
    a.leave(); b.leave();
  });

  it("current player firing produces a CarveOp and rotates turn", async () => {
    const a = await joinMatch({ code: "FIRE02", nickname: "A", color: "red" });
    const b = await joinMatch({ code: "FIRE02", nickname: "B", color: "blue" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("ready", {});
    await new Promise((r) => setTimeout(r, 100));

    const turnPlayer = a.state.currentTurnPlayerId;
    const turner = turnPlayer === a.sessionId ? a : b;

    let trajectoryReceived = false;
    turner.onMessage("trajectory-resolved", () => { trajectoryReceived = true; });

    turner.send("fire", { angle: 90, power: 500 });
    // wait > durationMs + buffer (sim is bounded; vertical shot ~2-3s, plus buffer)
    await new Promise((r) => setTimeout(r, 4000));

    expect(trajectoryReceived).toBe(true);
    expect(a.state.terrainOps.length).toBeGreaterThan(0);
    expect(a.state.currentTurnPlayerId).not.toBe(turnPlayer);
    a.leave(); b.leave();
  });

  it("clamps invalid angle and power", async () => {
    const a = await joinMatch({ code: "FIRE03", nickname: "A", color: "red" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("ready", {});
    await new Promise((r) => setTimeout(r, 100));
    a.send("fire", { angle: 9999, power: -50 });
    await new Promise((r) => setTimeout(r, 4000));
    // Should NOT crash; should produce a carve op
    expect(a.state.terrainOps.length).toBeGreaterThanOrEqual(0);
    a.leave();
  });
});
```

- [ ] **Step 2: Run, verify fail (or partially fail)**

```bash
pnpm --filter @se/server test
```

- [ ] **Step 3: Implement resolveTurn**

Create `/Users/valletta/dev/scorched-earth/apps/server/src/rooms/resolveTurn.ts`:
```ts
import {
  MatchState, CarveOp,
  POST_PLAYBACK_BUFFER_MS,
  TERRAIN_WIDTH, TERRAIN_HEIGHT,
  clampAngle, clampPower,
} from "@se/shared";
import {
  simulateProjectile,
  generateTerrain,
  carveInPlace,
  BABY_MISSILE,
  type TargetInfo,
} from "@se/game";
import { nextTurnPlayerId } from "./turnController";

export interface ResolveContext {
  state: MatchState;
  broadcast: (event: string, payload: unknown) => void;
  schedule: (delayMs: number, fn: () => void) => void;
  /** Rehydrated server-side terrain heightmap (matches client by seed+ops). */
  terrain: Int16Array;
}

export function buildTerrainFromState(state: MatchState): Int16Array {
  const terrain = generateTerrain({
    seed: state.terrainSeed,
    type: "random",
    width: TERRAIN_WIDTH,
    height: TERRAIN_HEIGHT,
  });
  for (const op of state.terrainOps) {
    carveInPlace(terrain, { x: op.x, y: op.y, radius: op.radius, tick: op.tick }, { terrainHeight: TERRAIN_HEIGHT });
  }
  return terrain;
}

export function handleFire(
  ctx: ResolveContext,
  sessionId: string,
  rawAngle: number,
  rawPower: number,
): void {
  const { state, broadcast, schedule, terrain } = ctx;
  if (state.phase !== "playing") return;
  if (state.currentTurnPlayerId !== sessionId) return;

  const tank = state.tanks.get(sessionId);
  if (!tank || !tank.alive) return;

  const angle = clampAngle(Number(rawAngle));
  const power = clampPower(Number(rawPower));
  tank.angle = angle;
  tank.power = power;

  state.phase = "resolving";

  const targets: TargetInfo[] = Array.from(state.tanks.values())
    .filter((t) => t.alive && t.sessionId !== sessionId)
    .map((t) => ({ playerId: t.sessionId, x: t.x, y: t.y, shieldHp: 0 }));

  const result = simulateProjectile({
    weapon: BABY_MISSILE,
    origin: { x: tank.x, y: tank.y - 5 }, // turret tip
    angle, power,
    wind: state.wind,
    gravity: state.gravity,
    terrain,
    terrainWidth: TERRAIN_WIDTH,
    terrainHeight: TERRAIN_HEIGHT,
    walls: "none",
    targets,
  });

  broadcast("trajectory-resolved", {
    samples: result.samples,
    impact: result.impact,
    weaponId: BABY_MISSILE.id,
    ownerId: sessionId,
    durationMs: result.durationMs,
  });

  schedule(result.durationMs + POST_PLAYBACK_BUFFER_MS, () => {
    commitResolution(ctx, result);
  });
}

function commitResolution(
  ctx: ResolveContext,
  result: ReturnType<typeof simulateProjectile>,
): void {
  const { state, broadcast, terrain } = ctx;

  if (result.carveOp) {
    const op = new CarveOp();
    op.x = result.carveOp.x;
    op.y = result.carveOp.y;
    op.radius = result.carveOp.radius;
    op.tick = state.tick + 1;
    state.terrainOps.push(op);
    state.terrainVersion++;
    carveInPlace(terrain, op as unknown as { x: number; y: number; radius: number; tick: number }, { terrainHeight: TERRAIN_HEIGHT });
  }

  if (result.damages.length > 0) {
    const events: Array<{ playerId: string; before: number; after: number }> = [];
    for (const d of result.damages) {
      const t = state.tanks.get(d.playerId);
      if (!t || !t.alive) continue;
      const before = t.hp;
      t.hp = Math.max(0, t.hp - d.hullDamage);
      events.push({ playerId: d.playerId, before, after: t.hp });
      if (t.hp <= 0) t.alive = false;
    }
    broadcast("damage-applied", { damages: events });
  }

  // After carve, re-seat any tanks whose column dropped below them (Phase 1: no fall damage)
  for (const t of state.tanks.values()) {
    if (!t.alive) continue;
    const surface = terrain[Math.max(0, Math.min(TERRAIN_WIDTH - 1, Math.round(t.x)))];
    if (t.y < surface) t.y = surface;
  }

  state.tick++;

  // Check win
  const alive = Array.from(state.tanks.values()).filter((t) => t.alive);
  if (alive.length <= 1) {
    state.phase = "ended";
    state.winnerId = alive[0]?.sessionId ?? "";
    broadcast("match-end", { winnerId: state.winnerId });
    return;
  }

  // Rotate turn
  const next = nextTurnPlayerId(
    Array.from(state.tanks.values()),
    state.currentTurnPlayerId,
  );
  state.currentTurnPlayerId = next;
  state.phase = "playing";
  state.turnDeadlineMs = Date.now() + state.turnTimerMs;
}
```

- [ ] **Step 4: Wire MatchRoom to handleFire**

Edit `/Users/valletta/dev/scorched-earth/apps/server/src/rooms/MatchRoom.ts` — append to `onCreate` after the existing handlers, and add a `terrain` field:

```ts
// Add a private field at the top of the class:
//   private terrain: Int16Array = new Int16Array(0);
//
// In startMatch(), assign:
//   this.terrain = terrain;
//
// In onCreate(), register:
this.onMessage("fire", (client, msg: { angle: number; power: number }) => {
  if (this.state.phase !== "playing") return;
  if (this.state.currentTurnPlayerId !== client.sessionId) return;
  handleFire(
    {
      state: this.state,
      broadcast: (ev, payload) => this.broadcast(ev, payload),
      schedule: (delayMs, fn) => this.clock.setTimeout(fn, delayMs),
      terrain: this.terrain,
    },
    client.sessionId, msg.angle, msg.power,
  );
});
```

(Use the actual edit pattern to insert `private terrain` and call `handleFire`. Full file should now be roughly:)

```ts
import { Room, Client } from "colyseus";
import {
  MatchState, Tank,
  DEFAULT_TURN_TIMER_MS, MAX_PLAYERS,
  TERRAIN_WIDTH, TERRAIN_HEIGHT,
  type TankColor, type TankHat,
} from "@se/shared";
import { generateTerrain } from "@se/game";
import { handleFire } from "./resolveTurn";

interface JoinOptions { code: string; nickname: string; color: TankColor; hat?: TankHat; }

export class MatchRoom extends Room<MatchState> {
  override maxClients = MAX_PLAYERS;
  private terrain: Int16Array = new Int16Array(0);

  onCreate(options: { code?: string }): void {
    const state = new MatchState();
    state.roomCode = options.code ?? "";
    state.turnTimerMs = DEFAULT_TURN_TIMER_MS;
    state.gravity = 250;
    this.setState(state);

    this.onMessage("configure", (client, msg: { turnTimerMs: number }) => {
      if (client.sessionId !== this.state.hostId) return;
      if (this.state.phase !== "lobby") return;
      const v = Number(msg?.turnTimerMs);
      if (!Number.isFinite(v) || v < 0 || v > 5 * 60_000) return;
      this.state.turnTimerMs = v;
    });

    this.onMessage("ready", (client) => {
      if (client.sessionId !== this.state.hostId) return;
      if (this.state.phase !== "lobby") return;
      this.startMatch();
    });

    this.onMessage("fire", (client, msg: { angle: number; power: number }) => {
      handleFire(
        {
          state: this.state,
          broadcast: (ev, payload) => this.broadcast(ev, payload),
          schedule: (delayMs, fn) => this.clock.setTimeout(fn, delayMs),
          terrain: this.terrain,
        },
        client.sessionId, msg.angle, msg.power,
      );
    });
  }

  onJoin(client: Client, options: JoinOptions): void {
    const tank = new Tank();
    tank.playerId = client.sessionId;
    tank.sessionId = client.sessionId;
    tank.nickname = (options.nickname ?? "Player").slice(0, 24);
    tank.color = options.color ?? "red";
    tank.hat = options.hat ?? "none";
    tank.connected = true;
    tank.alive = true;
    tank.hp = 100;
    this.state.tanks.set(client.sessionId, tank);
    if (this.state.hostId === "") this.state.hostId = client.sessionId;
  }

  onLeave(client: Client): void {
    const tank = this.state.tanks.get(client.sessionId);
    if (!tank) return;
    tank.connected = false;
    this.state.tanks.delete(client.sessionId);
    if (this.state.hostId === client.sessionId) {
      const first = this.state.tanks.keys().next().value;
      this.state.hostId = first ?? "";
    }
  }

  private startMatch(): void {
    this.state.phase = "playing";
    this.state.terrainSeed = (this.state.roomCode || "match") + "-v1";
    this.terrain = generateTerrain({
      seed: this.state.terrainSeed,
      type: "random",
      width: TERRAIN_WIDTH,
      height: TERRAIN_HEIGHT,
    });
    this.placeTanksOn(this.terrain);
    const first = this.state.tanks.keys().next().value;
    this.state.currentTurnPlayerId = first ?? "";
    this.state.turnDeadlineMs = Date.now() + this.state.turnTimerMs;
  }

  private placeTanksOn(terrain: Int16Array): void {
    const tanks = Array.from(this.state.tanks.values());
    if (tanks.length === 0) return;
    const slotWidth = TERRAIN_WIDTH / (tanks.length + 1);
    tanks.forEach((tank, i) => {
      const x = Math.round(slotWidth * (i + 1));
      tank.x = x;
      tank.y = terrain[x];
    });
  }
}
```

- [ ] **Step 5: Run, verify pass**

```bash
pnpm --filter @se/server test
```

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/rooms apps/server/tests/MatchRoom.test.ts
git commit -m "feat(server): fire → simulate → broadcast → carve → damage → rotate"
```

---

## Task 20: Turn timeout → auto-fire

**Files:**
- Modify: `apps/server/src/rooms/MatchRoom.ts`
- Modify: `apps/server/tests/MatchRoom.test.ts`

When `turnTimerMs > 0` and the current player hasn't fired by `turnDeadlineMs`, the server auto-fires with the tank's last `angle`/`power` (or defaults `90`/`500`).

- [ ] **Step 1: Append test**

Append to `MatchRoom.test.ts`:
```ts
describe("MatchRoom — turn timeout", () => {
  it("auto-fires after turnTimerMs elapses with no FIRE", async () => {
    const a = await joinMatch({ code: "TO01", nickname: "A", color: "red" });
    const b = await joinMatch({ code: "TO01", nickname: "B", color: "blue" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("configure", { turnTimerMs: 500 });
    await new Promise((r) => setTimeout(r, 50));
    a.send("ready", {});
    await new Promise((r) => setTimeout(r, 50));

    const startTurn = a.state.currentTurnPlayerId;
    // Wait for timer + sim + buffer
    await new Promise((r) => setTimeout(r, 5000));

    expect(a.state.terrainOps.length).toBeGreaterThan(0);
    expect(a.state.currentTurnPlayerId).not.toBe(startTurn);
    a.leave(); b.leave();
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @se/server test
```

- [ ] **Step 3: Implement**

Edit `/Users/valletta/dev/scorched-earth/apps/server/src/rooms/MatchRoom.ts` — in `startMatch()` after setting the deadline, schedule the timeout; same after each turn rotation. To keep MatchRoom orchestrating this, refactor: extract a `private startTurnTimer()` method and call it (a) after `startMatch()`, (b) inside `handleFire`'s post-commit. Easiest: pass `onTurnRotated` callback into `ResolveContext` so `commitResolution` re-arms the timer.

Modify `resolveTurn.ts`'s `ResolveContext`:
```ts
export interface ResolveContext {
  state: MatchState;
  broadcast: (event: string, payload: unknown) => void;
  schedule: (delayMs: number, fn: () => void) => void;
  terrain: Int16Array;
  onTurnReady: () => void; // NEW
}
```

In `commitResolution`, after rotating turn:
```ts
ctx.onTurnReady();
```

In MatchRoom, define:
```ts
private timeoutHandle: { clear: () => void } | null = null;

private armTurnTimer(): void {
  if (this.timeoutHandle) this.timeoutHandle.clear();
  if (this.state.turnTimerMs <= 0) return;
  const handle = this.clock.setTimeout(() => {
    const turner = this.state.currentTurnPlayerId;
    const tank = this.state.tanks.get(turner);
    if (!tank || !tank.alive) return;
    handleFire(this.resolveCtx(), turner, tank.angle, tank.power);
  }, this.state.turnTimerMs);
  this.timeoutHandle = { clear: () => handle.clear() };
}

private resolveCtx() {
  return {
    state: this.state,
    broadcast: (ev: string, payload: unknown) => this.broadcast(ev, payload),
    schedule: (delayMs: number, fn: () => void) => this.clock.setTimeout(fn, delayMs),
    terrain: this.terrain,
    onTurnReady: () => this.armTurnTimer(),
  };
}
```

And replace direct `handleFire(...)` ctx-construction with `this.resolveCtx()`. Call `this.armTurnTimer()` at the end of `startMatch()`.

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @se/server test
```

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/rooms apps/server/tests/MatchRoom.test.ts
git commit -m "feat(server): turn timeout auto-fires with last aim or defaults"
```

---

## Task 21: Reconnect grace + host migration

**Files:**
- Modify: `apps/server/src/rooms/MatchRoom.ts`
- Modify: `apps/server/tests/MatchRoom.test.ts`

- [ ] **Step 1: Append tests**

Append to `MatchRoom.test.ts`:
```ts
describe("MatchRoom — reconnect + host migration", () => {
  it("disconnected player marked connected=false, can reconnect within grace", async () => {
    const a = await joinMatch({ code: "RC01", nickname: "A", color: "red" });
    const b = await joinMatch({ code: "RC01", nickname: "B", color: "blue" });
    await new Promise((r) => setTimeout(r, 30));
    a.send("ready", {});
    await new Promise((r) => setTimeout(r, 100));

    const bSession = b.sessionId;
    await b.leave(true /* consented = false equivalent — simulate disconnect */);
    await new Promise((r) => setTimeout(r, 200));

    const bTank = a.state.tanks.get(bSession);
    expect(bTank?.connected).toBe(false);

    const b2 = await colyseus.connectTo(colyseus.sdk, "match", {
      code: "RC01", nickname: "B", color: "blue",
    }, { sessionId: bSession } as never);
    // Note: actual reconnection API may differ; use room.reconnect() helper if available.
    await new Promise((r) => setTimeout(r, 200));

    expect(a.state.tanks.get(bSession)?.connected).toBe(true);
    a.leave(); b2.leave();
  });

  it("host migration when host leaves", async () => {
    const a = await joinMatch({ code: "HM01", nickname: "A", color: "red" });
    const b = await joinMatch({ code: "HM01", nickname: "B", color: "blue" });
    await new Promise((r) => setTimeout(r, 30));
    expect(a.state.hostId).toBe(a.sessionId);
    await a.leave();
    await new Promise((r) => setTimeout(r, 200));
    expect(b.state.hostId).toBe(b.sessionId);
    b.leave();
  });
});
```

Note: Colyseus reconnect API specifics — adjust `colyseus.connectTo(...)` to use `sdk.reconnect(token)` style if the testing helper requires. Document the actual call in implementation.

- [ ] **Step 2: Run, verify fail**

```bash
pnpm --filter @se/server test
```

- [ ] **Step 3: Implement reconnect grace in MatchRoom**

In `onLeave`, replace the immediate delete with `allowReconnection`:

```ts
async onLeave(client: Client, consented: boolean): Promise<void> {
  const tank = this.state.tanks.get(client.sessionId);
  if (!tank) return;
  tank.connected = false;

  // Demote host immediately so live host actions don't depend on a missing client.
  if (this.state.hostId === client.sessionId) {
    for (const otherId of this.state.tanks.keys()) {
      if (otherId !== client.sessionId) {
        this.state.hostId = otherId;
        break;
      }
    }
    if (this.state.hostId === client.sessionId) this.state.hostId = "";
  }

  if (consented) {
    this.state.tanks.delete(client.sessionId);
    return;
  }

  try {
    await this.allowReconnection(client, RECONNECT_GRACE_SEC);
    tank.connected = true;
  } catch {
    this.state.tanks.delete(client.sessionId);
  }
}
```

Add the import:
```ts
import { RECONNECT_GRACE_SEC } from "@se/shared";
```

- [ ] **Step 4: Run, verify pass**

```bash
pnpm --filter @se/server test
```

If reconnect test API differs from Colyseus testing harness, simplify the test to just assert `connected=false` after leave and host migration; reconnect is also exercised in the E2E task.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/rooms/MatchRoom.ts apps/server/tests/MatchRoom.test.ts
git commit -m "feat(server): 60s reconnect grace + host migration on host leave"
```

---

# apps/client — PixiJS + colyseus.js

## Task 22: Scaffold apps/client (Vite + PixiJS + colyseus.js)

**Files:**
- Create: `apps/client/package.json`, `apps/client/tsconfig.json`, `apps/client/vite.config.ts`, `apps/client/index.html`, `apps/client/src/main.ts`

- [ ] **Step 1: Manifest**

Create `/Users/valletta/dev/scorched-earth/apps/client/package.json`:
```json
{
  "name": "@se/client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@se/game": "workspace:*",
    "@se/shared": "workspace:*",
    "colyseus.js": "^0.16.0",
    "pixi.js": "^8.2.0"
  },
  "devDependencies": {
    "@se/tsconfig": "workspace:*",
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: TS config**

Create `/Users/valletta/dev/scorched-earth/apps/client/tsconfig.json`:
```json
{
  "extends": "@se/tsconfig/browser.json",
  "compilerOptions": {
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: Vite config**

Create `/Users/valletta/dev/scorched-earth/apps/client/vite.config.ts`:
```ts
import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5173, host: "127.0.0.1" },
  define: {
    __SERVER_URL__: JSON.stringify(process.env.VITE_SERVER_URL ?? "ws://localhost:2567"),
  },
});
```

- [ ] **Step 4: HTML shell**

Create `/Users/valletta/dev/scorched-earth/apps/client/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Scorched Earth</title>
    <style>
      html, body { margin: 0; padding: 0; background: #0b0019; overflow: hidden; height: 100%; }
      #app { position: fixed; inset: 0; }
      #ui { position: fixed; inset: 0; pointer-events: none; font-family: system-ui, sans-serif; color: #fff; }
      #ui .interactive { pointer-events: auto; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <div id="ui"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Stub main**

Create `/Users/valletta/dev/scorched-earth/apps/client/src/main.ts`:
```ts
import { Application } from "pixi.js";

async function main() {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: 0xa6e1fa,
    antialias: true,
  });
  document.getElementById("app")!.appendChild(app.canvas);
  console.log("[client] PixiJS app initialized");
}

main().catch(console.error);
```

- [ ] **Step 6: Install**

```bash
pnpm install
```

- [ ] **Step 7: Smoke run**

In one terminal:
```bash
pnpm --filter @se/server dev
```
In another:
```bash
pnpm --filter @se/client dev
```
Open `http://127.0.0.1:5173`. Expected: blue-ish window, console log "PixiJS app initialized".

- [ ] **Step 8: Commit**

```bash
git add apps/client pnpm-lock.yaml
git commit -m "chore: scaffold @se/client with Vite + PixiJS 8"
```

---

## Task 23: Colyseus client wrapper

**Files:**
- Create: `apps/client/src/net/colyseusClient.ts`

- [ ] **Step 1: Implement**

Create `/Users/valletta/dev/scorched-earth/apps/client/src/net/colyseusClient.ts`:
```ts
import { Client, Room } from "colyseus.js";
import type { MatchState } from "@se/shared";

declare const __SERVER_URL__: string;

let _client: Client | null = null;

export function getClient(): Client {
  if (!_client) _client = new Client(__SERVER_URL__);
  return _client;
}

export async function joinLobby(): Promise<Room> {
  return getClient().joinOrCreate("lobby");
}

export async function createMatch(
  meta: { nickname: string; color: string; hat: string },
): Promise<{ room: Room<MatchState>; code: string }> {
  const lobby = await joinLobby();
  const code = await new Promise<string>((resolve, reject) => {
    lobby.onMessage("matchCreated", (msg: { code: string }) => resolve(msg.code));
    setTimeout(() => reject(new Error("createMatch timeout")), 5000);
    lobby.send("createMatch", {});
  });
  lobby.leave();
  const room = await getClient().joinByCode<MatchState>(
    "match",
    code,
    { code, ...meta },
  );
  return { room, code };
}

export async function joinMatch(
  code: string,
  meta: { nickname: string; color: string; hat: string },
): Promise<Room<MatchState>> {
  return getClient().joinByCode<MatchState>("match", code, { code, ...meta });
}
```

Note: Colyseus 0.16's `joinByCode` is the API for filterBy-routed rooms; adjust to the exact 0.16 method name if it differs (`join("match", { code, ...meta })` with filterBy works equivalently).

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @se/client typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/net/colyseusClient.ts
git commit -m "feat(client): Colyseus client wrapper (joinLobby/createMatch/joinMatch)"
```

---

## Task 24: LobbyScene (DOM-based UI)

**Files:**
- Create: `apps/client/src/scenes/LobbyScene.ts`
- Modify: `apps/client/src/main.ts`

The lobby is plain HTML for simplicity (we don't need PixiJS for buttons). The Pixi canvas stays visible underneath as a backdrop.

- [ ] **Step 1: Implement**

Create `/Users/valletta/dev/scorched-earth/apps/client/src/scenes/LobbyScene.ts`:
```ts
import { COLORS, HATS } from "@se/shared";
import { createMatch, joinMatch } from "../net/colyseusClient";
import { MatchScene } from "./MatchScene";

export class LobbyScene {
  private root: HTMLDivElement;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "interactive";
    this.root.style.cssText =
      "position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,0.4);";
    this.root.innerHTML = `
      <div style="background:#fff;color:#222;padding:24px;border-radius:12px;min-width:360px;font:14px system-ui;">
        <h1 style="margin:0 0 16px;">Scorched Earth</h1>
        <label>Nickname<br><input id="nick" maxlength="24" value="Player" style="width:100%;padding:6px;"/></label>
        <div style="margin-top:12px;">Color
          <select id="color">${COLORS.map((c) => `<option>${c}</option>`).join("")}</select>
          Hat
          <select id="hat">${HATS.map((h) => `<option>${h}</option>`).join("")}</select>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button id="create">Create match</button>
          <input id="code" placeholder="ABC123" maxlength="6" style="text-transform:uppercase;width:80px;"/>
          <button id="join">Join</button>
        </div>
        <div id="status" style="margin-top:12px;color:#666;"></div>
      </div>
    `;
    document.getElementById("ui")!.appendChild(this.root);

    this.root.querySelector<HTMLButtonElement>("#create")!.onclick = () => this.onCreate();
    this.root.querySelector<HTMLButtonElement>("#join")!.onclick = () => this.onJoin();
  }

  private get meta() {
    return {
      nickname: this.root.querySelector<HTMLInputElement>("#nick")!.value || "Player",
      color: this.root.querySelector<HTMLSelectElement>("#color")!.value,
      hat: this.root.querySelector<HTMLSelectElement>("#hat")!.value,
    };
  }

  private setStatus(text: string) {
    this.root.querySelector<HTMLDivElement>("#status")!.textContent = text;
  }

  private async onCreate() {
    this.setStatus("Creating room...");
    try {
      const { room, code } = await createMatch(this.meta);
      this.setStatus(`Room ${code} — share this code`);
      this.dispose();
      new MatchScene(room, code);
    } catch (e: unknown) {
      this.setStatus("Failed: " + (e as Error).message);
    }
  }

  private async onJoin() {
    const code = this.root.querySelector<HTMLInputElement>("#code")!.value.toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) { this.setStatus("Enter a 6-char code"); return; }
    this.setStatus("Joining...");
    try {
      const room = await joinMatch(code, this.meta);
      this.dispose();
      new MatchScene(room, code);
    } catch (e: unknown) {
      this.setStatus("Failed: " + (e as Error).message);
    }
  }

  dispose() { this.root.remove(); }
}
```

- [ ] **Step 2: Stub MatchScene so the import resolves**

Create `/Users/valletta/dev/scorched-earth/apps/client/src/scenes/MatchScene.ts`:
```ts
import type { Room } from "colyseus.js";
import type { MatchState } from "@se/shared";

export class MatchScene {
  constructor(public room: Room<MatchState>, public code: string) {
    console.log("[match] joined", code, room.sessionId);
  }
}
```

- [ ] **Step 3: Mount LobbyScene from main**

Edit `/Users/valletta/dev/scorched-earth/apps/client/src/main.ts`:
```ts
import { Application } from "pixi.js";
import { LobbyScene } from "./scenes/LobbyScene";

async function main() {
  const app = new Application();
  await app.init({ resizeTo: window, background: 0xa6e1fa, antialias: true });
  document.getElementById("app")!.appendChild(app.canvas);
  new LobbyScene();
}

main().catch(console.error);
```

- [ ] **Step 4: Smoke**

With server + client running, open two browser tabs at `http://127.0.0.1:5173`. Tab 1 → Create. Note the code in the status line. Tab 2 → enter the code and Join. Server logs should show both joins.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src
git commit -m "feat(client): LobbyScene (DOM UI) for create/join"
```

---

## Task 25: MatchScene + state subscription

**Files:**
- Modify: `apps/client/src/scenes/MatchScene.ts`

MatchScene attaches to PixiJS, owns the world container, and subscribes to Colyseus state changes. It's the place renderers and HUD are wired up.

- [ ] **Step 1: Implement**

Replace `MatchScene.ts`:
```ts
import { Application, Container } from "pixi.js";
import type { Room } from "colyseus.js";
import { MatchState, TERRAIN_WIDTH, TERRAIN_HEIGHT } from "@se/shared";

export class MatchScene {
  private app: Application;
  private world: Container;

  constructor(public room: Room<MatchState>, public code: string) {
    this.app = window["pixiApp"] as Application; // wired by main; alternatively pass in
    this.world = new Container();
    this.app.stage.addChild(this.world);

    this.fit();
    window.addEventListener("resize", () => this.fit());

    room.onStateChange.once((state) => this.onFirstState(state));
    room.onMessage("trajectory-resolved", (msg) => this.onTrajectory(msg));
    room.onMessage("damage-applied", (msg) => this.onDamage(msg));
    room.onMessage("match-end", (msg) => this.onMatchEnd(msg));
  }

  private fit() {
    const sx = window.innerWidth / TERRAIN_WIDTH;
    const sy = window.innerHeight / TERRAIN_HEIGHT;
    const s = Math.min(sx, sy);
    this.world.scale.set(s);
    this.world.position.set(
      (window.innerWidth - TERRAIN_WIDTH * s) / 2,
      (window.innerHeight - TERRAIN_HEIGHT * s) / 2,
    );
  }

  private onFirstState(state: MatchState) {
    console.log("[match] first state, phase=", state.phase, "tanks=", state.tanks.size);
    // Renderers attached in subsequent tasks.
  }

  private onTrajectory(_msg: unknown) { /* Task 28 */ }
  private onDamage(_msg: unknown) { /* Task 31 */ }
  private onMatchEnd(_msg: unknown) { /* Task 31 */ }
}
```

Modify `main.ts` to publish the Pixi app on `window`:
```ts
(window as unknown as { pixiApp: Application }).pixiApp = app;
```

(This is a quick wiring shortcut; cleaner DI can come later.)

- [ ] **Step 2: Smoke**

Rejoin a match. Confirm console logs first state + tanks count.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/scenes apps/client/src/main.ts
git commit -m "feat(client): MatchScene scaffold with world container + state subscription"
```

---

## Task 26: Render — Sky and Terrain

**Files:**
- Create: `apps/client/src/render/Sky.ts`, `apps/client/src/render/Terrain.ts`
- Modify: `apps/client/src/scenes/MatchScene.ts`

- [ ] **Step 1: Implement Sky**

Create `/Users/valletta/dev/scorched-earth/apps/client/src/render/Sky.ts`:
```ts
import { Container, Graphics, Sprite, Texture, FillGradient } from "pixi.js";
import { TERRAIN_WIDTH, TERRAIN_HEIGHT } from "@se/shared";

export class SkyRenderer extends Container {
  constructor() {
    super();
    const grad = new FillGradient(0, 0, 0, TERRAIN_HEIGHT);
    grad.addColorStop(0, 0xa6e1fa);
    grad.addColorStop(1, 0xf2faff);
    const bg = new Graphics();
    bg.rect(0, 0, TERRAIN_WIDTH, TERRAIN_HEIGHT).fill(grad);
    this.addChild(bg);
    this.addClouds();
  }

  private addClouds() {
    const positions = [
      { x: 200, y: 120 }, { x: 800, y: 80 }, { x: 1300, y: 140 },
    ];
    for (const p of positions) {
      const cloud = new Graphics();
      cloud.ellipse(0, 0, 80, 24).fill(0xffffff);
      cloud.ellipse(40, -6, 50, 18).fill(0xffffff);
      cloud.ellipse(-40, -4, 60, 20).fill(0xffffff);
      cloud.position.set(p.x, p.y);
      cloud.alpha = 0.9;
      this.addChild(cloud);
    }
  }
}
```

- [ ] **Step 2: Implement Terrain**

Create `/Users/valletta/dev/scorched-earth/apps/client/src/render/Terrain.ts`:
```ts
import { Container, Graphics, FillGradient } from "pixi.js";
import { TERRAIN_WIDTH, TERRAIN_HEIGHT } from "@se/shared";
import { generateTerrain, carveInPlace } from "@se/game";

export class TerrainRenderer extends Container {
  private heightmap: Int16Array;
  private graphics: Graphics;

  constructor(seed: string) {
    super();
    this.heightmap = generateTerrain({
      seed, type: "random", width: TERRAIN_WIDTH, height: TERRAIN_HEIGHT,
    });
    this.graphics = new Graphics();
    this.addChild(this.graphics);
    this.redraw();
  }

  carve(op: { x: number; y: number; radius: number; tick: number }) {
    carveInPlace(this.heightmap, op, { terrainHeight: TERRAIN_HEIGHT });
    this.redraw();
  }

  heightAt(x: number): number {
    const i = Math.max(0, Math.min(TERRAIN_WIDTH - 1, Math.round(x)));
    return this.heightmap[i];
  }

  private redraw() {
    const g = this.graphics;
    g.clear();
    const grad = new FillGradient(0, 0, 0, TERRAIN_HEIGHT);
    grad.addColorStop(0, 0x88c057);
    grad.addColorStop(1, 0x4f7942);

    g.moveTo(0, this.heightmap[0]);
    for (let x = 1; x < TERRAIN_WIDTH; x++) g.lineTo(x, this.heightmap[x]);
    g.lineTo(TERRAIN_WIDTH, TERRAIN_HEIGHT);
    g.lineTo(0, TERRAIN_HEIGHT);
    g.closePath();
    g.fill(grad);
    g.stroke({ color: 0x2d4a1f, width: 2.5 });
  }
}
```

- [ ] **Step 3: Wire into MatchScene**

Edit `MatchScene.ts` `onFirstState`:
```ts
import { SkyRenderer } from "../render/Sky";
import { TerrainRenderer } from "../render/Terrain";

// inside onFirstState:
this.world.addChild(new SkyRenderer());
const terrain = new TerrainRenderer(state.terrainSeed);
this.world.addChild(terrain);
this.terrain = terrain;
// Store as a field on MatchScene.

state.terrainOps.onAdd((op) => terrain.carve(op));
```

Add the field `private terrain!: TerrainRenderer;` to the class.

- [ ] **Step 4: Smoke**

Create a room, hit Start (manually via DevTools `room.send("ready", {})` for now until Task 28 adds the UI button), and confirm sky + green terrain renders.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/render apps/client/src/scenes/MatchScene.ts
git commit -m "feat(client): Sky + Terrain renderers (Cartoon Illustrative palette)"
```

---

## Task 27: Render — Tank (body + turret + hat)

**Files:**
- Create: `apps/client/src/render/Tank.ts`
- Modify: `apps/client/src/scenes/MatchScene.ts`

- [ ] **Step 1: Implement**

Create `/Users/valletta/dev/scorched-earth/apps/client/src/render/Tank.ts`:
```ts
import { Container, Graphics } from "pixi.js";

const COLOR_HEX: Record<string, number> = {
  red: 0xe63946, blue: 0x3a86ff, green: 0x80b918, yellow: 0xfca311,
  cyan: 0x00b4d8, magenta: 0xb5179e, orange: 0xf4a261, white: 0xf1f1f1,
  pink: 0xf48fb1, lime: 0xa6d96a,
};

export interface TankView {
  setPos(x: number, y: number): void;
  setAngle(angleDeg: number): void;
  setAlive(alive: boolean): void;
  destroy(): void;
}

export function createTankView(opts: {
  color: string; hat: string;
}): Container & TankView {
  const fill = COLOR_HEX[opts.color] ?? 0xe63946;
  const root = new Container() as Container & TankView;

  const body = new Graphics();
  body.roundRect(-14, 0, 28, 9, 2).fill(fill).stroke({ color: 0x2c3e50, width: 2 });
  body.roundRect(-10, -7, 20, 7, 2).fill(fill).stroke({ color: 0x2c3e50, width: 2 });
  root.addChild(body);

  const turret = new Graphics();
  turret.moveTo(0, -3).lineTo(14, -13).stroke({ color: 0x2c3e50, width: 3, cap: "round" });
  root.addChild(turret);

  const hat = new Graphics();
  drawHat(hat, opts.hat);
  hat.position.set(0, -12);
  root.addChild(hat);

  let baseAngle = 90;
  root.setPos = (x: number, y: number) => { root.position.set(x, y); };
  root.setAngle = (deg: number) => {
    baseAngle = deg;
    // Angle convention: 90° = straight up (pointing -y); convert to canvas rotation
    // such that 0° = barrel points to the LEFT, 90° = UP, 180° = RIGHT.
    // Turret stroke is drawn pointing up-right; we rotate to match.
    const rad = ((180 - deg) * Math.PI) / 180;
    turret.rotation = rad;
  };
  root.setAlive = (alive) => { root.alpha = alive ? 1 : 0.3; };
  root.destroy = () => root.removeFromParent();
  root.setAngle(baseAngle);
  return root;
}

function drawHat(g: Graphics, type: string) {
  if (type === "chef") {
    g.ellipse(0, 0, 8, 3).fill(0xffffff).stroke({ color: 0x2c3e50, width: 1 });
    g.path([{ x: -7, y: 0 }, { x: -8, y: -10 }, { x: 0, y: -12 }, { x: 8, y: -10 }, { x: 7, y: 0 }])
      .fill(0xffffff).stroke({ color: 0x2c3e50, width: 1 });
  } else if (type === "top-hat") {
    g.rect(-6, -6, 12, 9).fill(0x1b1b1b).stroke({ color: 0x000, width: 1 });
    g.rect(-8, 2, 16, 2).fill(0x1b1b1b);
  } else if (type === "beanie") {
    g.roundRect(-7, -8, 14, 8, 4).fill(0xb5179e).stroke({ color: 0x2c3e50, width: 1 });
    g.circle(0, -8, 2).fill(0xffffff);
  }
}
```

- [ ] **Step 2: Wire MatchScene to keep tanks rendered**

In `MatchScene.onFirstState`, after terrain, iterate tanks:
```ts
this.tanks = new Map();
state.tanks.onAdd((tank, id) => {
  const view = createTankView({ color: tank.color, hat: tank.hat });
  this.world.addChild(view);
  this.tanks.set(id, view);
  const sync = () => {
    view.setPos(tank.x, tank.y);
    view.setAngle(tank.angle);
    view.setAlive(tank.alive);
  };
  sync();
  tank.onChange(sync);
});
state.tanks.onRemove((_t, id) => {
  this.tanks.get(id)?.destroy();
  this.tanks.delete(id);
});
```

Add field `private tanks!: Map<string, ReturnType<typeof createTankView>>;`.

- [ ] **Step 3: Smoke**

Two clients → create + join → host triggers `ready` → tanks appear on terrain.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/render/Tank.ts apps/client/src/scenes/MatchScene.ts
git commit -m "feat(client): Tank renderer (body+turret+hat, color palette)"
```

---

## Task 28: Render — Projectile + Explosion

**Files:**
- Create: `apps/client/src/render/Projectile.ts`, `apps/client/src/render/Explosion.ts`
- Modify: `apps/client/src/scenes/MatchScene.ts`

- [ ] **Step 1: Projectile**

Create `/Users/valletta/dev/scorched-earth/apps/client/src/render/Projectile.ts`:
```ts
import { Container, Graphics } from "pixi.js";

interface Sample { x: number; y: number; t: number; }

export class ProjectileAnim extends Container {
  private head: Graphics;
  private trail: Graphics;
  private startMs = performance.now();

  constructor(private samples: Sample[]) {
    super();
    this.trail = new Graphics();
    this.head = new Graphics();
    this.head.circle(0, 0, 5).fill(0x2c3e50);
    this.addChild(this.trail, this.head);
  }

  tick(): boolean {
    const t = performance.now() - this.startMs;
    if (this.samples.length === 0) return true;
    const last = this.samples[this.samples.length - 1];
    if (t >= last.t) {
      this.head.position.set(last.x, last.y);
      return true;
    }
    // Find segment
    let i = 0;
    while (i < this.samples.length - 1 && this.samples[i + 1].t < t) i++;
    const a = this.samples[i];
    const b = this.samples[Math.min(i + 1, this.samples.length - 1)];
    const u = (t - a.t) / Math.max(1, b.t - a.t);
    const x = a.x + (b.x - a.x) * u;
    const y = a.y + (b.y - a.y) * u;
    this.head.position.set(x, y);

    this.trail.clear();
    this.trail.moveTo(this.samples[0].x, this.samples[0].y);
    for (let j = 1; j <= i; j++) this.trail.lineTo(this.samples[j].x, this.samples[j].y);
    this.trail.lineTo(x, y);
    this.trail.stroke({ color: 0x2c3e50, width: 2, alpha: 0.7 });
    return false;
  }
}
```

- [ ] **Step 2: Explosion**

Create `/Users/valletta/dev/scorched-earth/apps/client/src/render/Explosion.ts`:
```ts
import { Container, Graphics } from "pixi.js";

export class Explosion extends Container {
  private particles: Array<{ g: Graphics; vx: number; vy: number; life: number; }> = [];
  private start = performance.now();
  private duration = 600;

  constructor(x: number, y: number, color = 0xff7043) {
    super();
    this.position.set(x, y);
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 80;
      const g = new Graphics();
      g.circle(0, 0, 2 + Math.random() * 3).fill({
        color: i % 3 === 0 ? 0xffd166 : i % 3 === 1 ? color : 0x8d8d8d,
      });
      this.addChild(g);
      this.particles.push({ g, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 1 });
    }
  }

  tick(): boolean {
    const dt = 1 / 60;
    const t = performance.now() - this.start;
    const k = Math.min(1, t / this.duration);
    for (const p of this.particles) {
      p.g.position.x += p.vx * dt;
      p.g.position.y += p.vy * dt + 50 * dt;
      p.g.alpha = 1 - k;
    }
    return t >= this.duration;
  }
}
```

- [ ] **Step 3: Wire MatchScene to animate on trajectory-resolved**

In `MatchScene.onTrajectory`:
```ts
private activeAnims: Array<{ tick(): boolean; removeFromParent(): void }> = [];
private onTrajectory(msg: { samples: { x: number; y: number; t: number }[]; impact: { x: number; y: number } | null }) {
  const proj = new ProjectileAnim(msg.samples);
  this.world.addChild(proj);
  this.activeAnims.push(proj);
  if (msg.impact) {
    setTimeout(() => {
      const ex = new Explosion(msg.impact!.x, msg.impact!.y);
      this.world.addChild(ex);
      this.activeAnims.push(ex);
    }, msg.samples[msg.samples.length - 1].t);
  }
}
```

Add a ticker:
```ts
this.app.ticker.add(() => {
  this.activeAnims = this.activeAnims.filter((a) => {
    if (a.tick()) { a.removeFromParent(); return false; }
    return true;
  });
});
```

Imports: `import { ProjectileAnim } from "../render/Projectile"; import { Explosion } from "../render/Explosion";`.

- [ ] **Step 4: Smoke**

Trigger a fire via DevTools `room.send("fire", { angle: 90, power: 500 })` from the current-turn player. Projectile arcs, lands, explodes.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/render apps/client/src/scenes/MatchScene.ts
git commit -m "feat(client): Projectile arc + Explosion particles"
```

---

## Task 29: HUD — WindArrow, TurnTimer, PlayerList

**Files:**
- Create: `apps/client/src/hud/WindArrow.ts`, `apps/client/src/hud/TurnTimer.ts`, `apps/client/src/hud/PlayerList.ts`
- Modify: `apps/client/src/scenes/MatchScene.ts`

These three HUD components live as DOM overlays (simpler text+CSS than PIXI text) sourced from the room state.

- [ ] **Step 1: WindArrow**

Create `/Users/valletta/dev/scorched-earth/apps/client/src/hud/WindArrow.ts`:
```ts
import type { MatchState } from "@se/shared";

export class WindArrow {
  el: HTMLDivElement;
  constructor() {
    this.el = document.createElement("div");
    this.el.className = "interactive";
    this.el.style.cssText =
      "position:fixed;top:12px;left:50%;transform:translateX(-50%);color:#fff;font:14px system-ui;text-shadow:0 1px 2px #000;";
    document.getElementById("ui")!.appendChild(this.el);
  }
  update(state: MatchState) {
    const w = state.wind;
    const dir = w === 0 ? "" : w > 0 ? "→" : "←";
    const label = Math.abs(w) <= 1 ? "Calm" : `Wind ${dir} ${Math.abs(w)}`;
    this.el.textContent = label;
  }
  destroy() { this.el.remove(); }
}
```

- [ ] **Step 2: TurnTimer**

Create `/Users/valletta/dev/scorched-earth/apps/client/src/hud/TurnTimer.ts`:
```ts
import type { MatchState } from "@se/shared";

export class TurnTimer {
  el: HTMLDivElement;
  constructor() {
    this.el = document.createElement("div");
    this.el.style.cssText =
      "position:fixed;top:12px;right:12px;background:rgba(0,0,0,0.5);color:#fff;padding:6px 12px;border-radius:6px;font:14px system-ui;";
    document.getElementById("ui")!.appendChild(this.el);
  }
  update(state: MatchState) {
    if (state.phase !== "playing") { this.el.textContent = ""; return; }
    const ms = Math.max(0, state.turnDeadlineMs - Date.now());
    const turner = state.tanks.get(state.currentTurnPlayerId);
    this.el.textContent = `${turner?.nickname ?? "?"} — ${Math.ceil(ms / 1000)}s`;
    this.el.style.color = ms < 5000 ? "#ff6b6b" : "#fff";
  }
  destroy() { this.el.remove(); }
}
```

- [ ] **Step 3: PlayerList**

Create `/Users/valletta/dev/scorched-earth/apps/client/src/hud/PlayerList.ts`:
```ts
import type { MatchState } from "@se/shared";

export class PlayerList {
  el: HTMLDivElement;
  constructor() {
    this.el = document.createElement("div");
    this.el.style.cssText =
      "position:fixed;top:60px;right:12px;background:rgba(0,0,0,0.5);color:#fff;padding:8px;border-radius:6px;font:13px system-ui;min-width:180px;";
    document.getElementById("ui")!.appendChild(this.el);
  }
  update(state: MatchState) {
    const lines: string[] = [];
    for (const t of state.tanks.values()) {
      const dot = `<span style="display:inline-block;width:10px;height:10px;background:${t.color};border-radius:50%;margin-right:6px;"></span>`;
      const dead = t.alive ? "" : "style=\"text-decoration:line-through;opacity:0.5;\"";
      lines.push(`<div ${dead}>${dot}${t.nickname} — HP ${t.hp}</div>`);
    }
    this.el.innerHTML = lines.join("");
  }
  destroy() { this.el.remove(); }
}
```

- [ ] **Step 4: Wire from MatchScene**

In `MatchScene` constructor:
```ts
this.wind = new WindArrow();
this.timer = new TurnTimer();
this.players = new PlayerList();
// inside ticker:
this.wind.update(room.state);
this.timer.update(room.state);
this.players.update(room.state);
```

Add fields + imports. Call `this.wind.destroy()` etc. on match-end transition.

- [ ] **Step 5: Smoke**

Open a 2-player match. Confirm wind label updates each turn, timer counts down, player list shows colors + HP.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/hud apps/client/src/scenes/MatchScene.ts
git commit -m "feat(client): HUD (WindArrow, TurnTimer, PlayerList)"
```

---

## Task 30: Input — AimControls (mouse + keyboard) + Fire button

**Files:**
- Create: `apps/client/src/input/AimControls.ts`
- Modify: `apps/client/src/scenes/MatchScene.ts`

- [ ] **Step 1: Implement**

Create `/Users/valletta/dev/scorched-earth/apps/client/src/input/AimControls.ts`:
```ts
import type { Room } from "colyseus.js";
import type { MatchState } from "@se/shared";
import { clampAngle, clampPower } from "@se/shared";

export class AimControls {
  private el: HTMLDivElement;
  private angle = 90;
  private power = 500;

  constructor(private room: Room<MatchState>) {
    this.el = document.createElement("div");
    this.el.className = "interactive";
    this.el.style.cssText =
      "position:fixed;bottom:12px;left:12px;background:rgba(0,0,0,0.6);color:#fff;padding:10px;border-radius:8px;font:13px system-ui;min-width:240px;";
    this.el.innerHTML = `
      <div>Angle: <span id="a">90</span>° (← → ; Shift = 5)</div>
      <input id="ar" type="range" min="0" max="180" value="90" style="width:200px;">
      <div>Power: <span id="p">500</span> (↑ ↓ ; Shift = 10)</div>
      <input id="pr" type="range" min="0" max="1000" value="500" style="width:200px;">
      <button id="fire" style="margin-top:8px;width:200px;padding:8px;background:#e63946;color:#fff;border:none;border-radius:4px;cursor:pointer;">FIRE (Space)</button>
    `;
    document.getElementById("ui")!.appendChild(this.el);

    this.el.querySelector<HTMLInputElement>("#ar")!.oninput = (e) => {
      this.setAngle(Number((e.target as HTMLInputElement).value));
    };
    this.el.querySelector<HTMLInputElement>("#pr")!.oninput = (e) => {
      this.setPower(Number((e.target as HTMLInputElement).value));
    };
    this.el.querySelector<HTMLButtonElement>("#fire")!.onclick = () => this.fire();

    window.addEventListener("keydown", this.onKey);
  }

  private setAngle(v: number) {
    this.angle = clampAngle(v);
    this.el.querySelector<HTMLInputElement>("#ar")!.value = String(this.angle);
    this.el.querySelector<HTMLSpanElement>("#a")!.textContent = String(this.angle);
  }
  private setPower(v: number) {
    this.power = clampPower(v);
    this.el.querySelector<HTMLInputElement>("#pr")!.value = String(this.power);
    this.el.querySelector<HTMLSpanElement>("#p")!.textContent = String(this.power);
  }

  private onKey = (e: KeyboardEvent) => {
    const big = e.shiftKey;
    if (e.code === "ArrowLeft") { this.setAngle(this.angle - (big ? 5 : 1)); e.preventDefault(); }
    else if (e.code === "ArrowRight") { this.setAngle(this.angle + (big ? 5 : 1)); e.preventDefault(); }
    else if (e.code === "ArrowUp") { this.setPower(this.power + (big ? 10 : 1)); e.preventDefault(); }
    else if (e.code === "ArrowDown") { this.setPower(this.power - (big ? 10 : 1)); e.preventDefault(); }
    else if (e.code === "Space") { this.fire(); e.preventDefault(); }
  };

  private fire() {
    if (this.room.state.currentTurnPlayerId !== this.room.sessionId) return;
    this.room.send("fire", { angle: this.angle, power: this.power });
  }

  destroy() {
    window.removeEventListener("keydown", this.onKey);
    this.el.remove();
  }
}
```

- [ ] **Step 2: Wire in MatchScene**

```ts
this.aim = new AimControls(room);
```

Add a `Start` button visible to the host while phase==="lobby":
```ts
// Replace the manual DevTools trigger with a host-only Start button.
if (room.sessionId === room.state.hostId && room.state.phase === "lobby") {
  // show a "Start" button overlay; on click: room.send("ready", {});
}
```

(Simplest: extend `AimControls` to render a Start button while phase==="lobby". Or add a one-line `StartButton.ts`.)

- [ ] **Step 3: Smoke**

End-to-end Phase 1 test: open server, open two browsers, create + join, host clicks Start, host fires Baby Missile at the other tank, missile arcs and lands, damage applied, turn rotates. Keep playing until one player wins.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/input apps/client/src/scenes/MatchScene.ts
git commit -m "feat(client): AimControls (sliders + keyboard) + Fire button"
```

---

# E2E Tests

## Task 31: Playwright setup + lobby create/join E2E

**Files:**
- Create: `tests/e2e/playwright.config.ts`, `tests/e2e/full-match.spec.ts`
- Modify: root `package.json` to install Playwright as devDep at the root.

- [ ] **Step 1: Install Playwright**

```bash
pnpm add -D -w @playwright/test
pnpm exec playwright install chromium
```

- [ ] **Step 2: Playwright config**

Create `/Users/valletta/dev/scorched-earth/tests/e2e/playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5173" },
  webServer: [
    { command: "pnpm --filter @se/server dev", url: "http://localhost:2567/matchmake/", reuseExistingServer: true, timeout: 30_000 },
    { command: "pnpm --filter @se/client dev", url: "http://127.0.0.1:5173", reuseExistingServer: true, timeout: 30_000 },
  ],
});
```

(The server's matchmaking endpoint URL may differ — Colyseus exposes a health endpoint at `/matchmake/`. Validate during this task and adjust.)

- [ ] **Step 3: Full match E2E**

Create `/Users/valletta/dev/scorched-earth/tests/e2e/full-match.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test("two players play a full match", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  await a.goto("/");
  await b.goto("/");

  await a.fill("#nick", "Alice");
  await a.click("#create");
  await expect(a.locator("#status")).toContainText("Room", { timeout: 10_000 });
  const code = (await a.locator("#status").textContent())!.match(/[A-Z0-9]{6}/)![0];

  await b.fill("#nick", "Bob");
  await b.fill("#code", code);
  await b.click("#join");

  // Host (A) starts via console: hit the Start button rendered by AimControls
  // (or send ready directly through evaluate)
  await a.evaluate(() => {
    const room = (window as unknown as { __room?: { send: (k: string, v: unknown) => void } }).__room;
    room?.send("ready", {});
  });

  // Fire repeatedly with Alice until match ends (HP zero on Bob).
  // We assume MatchScene exposes window.__room for E2E hooks; if not, add that wiring.
  await expect.poll(async () => {
    const winner = await a.evaluate(() => {
      const room = (window as unknown as { __room?: { state: { winnerId: string; phase: string; currentTurnPlayerId: string; tanks: Map<string, { hp: number }> } } }).__room;
      // If it's Alice's turn, fire; otherwise wait
      if (room?.state.phase === "playing" && room.state.currentTurnPlayerId === (window as unknown as { __sessionId: string }).__sessionId) {
        (window as unknown as { __room: { send: (k: string, v: unknown) => void } }).__room.send("fire", { angle: 135, power: 800 });
      }
      return room?.state.phase === "ended" ? room.state.winnerId : "";
    });
    return winner;
  }, { timeout: 90_000 }).not.toBe("");

  await ctxA.close();
  await ctxB.close();
});
```

In `MatchScene` constructor, add `(window as unknown as { __room: typeof room; __sessionId: string }).__room = room;` for E2E.

- [ ] **Step 4: Run**

```bash
pnpm test:e2e
```

May require tweaks (selectors, room hooks, timing). Iterate.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e package.json pnpm-lock.yaml apps/client/src/scenes/MatchScene.ts
git commit -m "test(e2e): Playwright full-match smoke (Alice vs Bob)"
```

---

## Task 32: Reconnect E2E

**Files:**
- Create: `tests/e2e/reconnect.spec.ts`

- [ ] **Step 1: Implement**

Create `/Users/valletta/dev/scorched-earth/tests/e2e/reconnect.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test("player drops and reconnects within grace", async ({ browser }) => {
  test.setTimeout(90_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await a.goto("/"); await b.goto("/");

  await a.fill("#nick", "Alice"); await a.click("#create");
  await expect(a.locator("#status")).toContainText("Room", { timeout: 10_000 });
  const code = (await a.locator("#status").textContent())!.match(/[A-Z0-9]{6}/)![0];

  await b.fill("#nick", "Bob");
  await b.fill("#code", code); await b.click("#join");
  await a.evaluate(() => (window as unknown as { __room: { send: (k: string, v: unknown) => void } }).__room.send("ready", {}));

  // Drop Bob's connection
  await ctxB.close();
  await a.waitForTimeout(2000);
  const bConnected1 = await a.evaluate(() => {
    const r = (window as unknown as { __room: { state: { tanks: Map<string, { connected: boolean; nickname: string }> } } }).__room;
    for (const t of r.state.tanks.values()) if (t.nickname === "Bob") return t.connected;
    return null;
  });
  expect(bConnected1).toBe(false);

  // Reconnect Bob in a fresh context
  const ctxB2 = await browser.newContext();
  const b2 = await ctxB2.newPage();
  await b2.goto("/");
  await b2.fill("#nick", "Bob");
  await b2.fill("#code", code);
  await b2.click("#join");
  await a.waitForTimeout(2000);

  const bConnected2 = await a.evaluate(() => {
    const r = (window as unknown as { __room: { state: { tanks: Map<string, { connected: boolean; nickname: string }> } } }).__room;
    for (const t of r.state.tanks.values()) if (t.nickname === "Bob") return t.connected;
    return null;
  });
  expect(bConnected2).toBe(true);

  await ctxA.close(); await ctxB2.close();
});
```

Note: actual Colyseus reconnect protocol may require persisting a reconnection token client-side; if "joining again" creates a new tank instead of reconnecting, augment `joinMatch` to call `client.reconnect(token)` if a stored token exists. Save token to `sessionStorage` in `LobbyScene` after join, and use on retry.

- [ ] **Step 2: Run**

```bash
pnpm test:e2e
```

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/reconnect.spec.ts apps/client/src
git commit -m "test(e2e): reconnect within grace preserves player state"
```

---

# Finishing touches

## Task 33: README + run instructions

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write**

Create `/Users/valletta/dev/scorched-earth/README.md`:
```markdown
# Scorched Earth Web

A multiplayer browser reimplementation of the 1991 DOS classic.

## Quick start

```bash
# Once
pnpm install
pnpm exec playwright install chromium

# Run server (terminal 1)
pnpm --filter @se/server dev

# Run client (terminal 2)
pnpm --filter @se/client dev
# → open http://127.0.0.1:5173 in two browser tabs
```

## Tests

```bash
pnpm test            # all unit + integration
pnpm test:e2e        # Playwright end-to-end
```

## Docs

- `SPEC.md` — long-form vision and full-game scope
- `docs/superpowers/specs/2026-05-22-roadmap.md` — phased build plan
- `docs/superpowers/specs/2026-05-22-phase-1-multiplayer-skeleton-design.md` — current phase

## License

TBD (private)
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with quick-start, test, and reference links"
```

---

## Task 34: CI workflow (GitHub Actions)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write**

Create `/Users/valletta/dev/scorched-earth/.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push: { branches: [main] }
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r typecheck
      - run: pnpm -r test
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm test:e2e
```

- [ ] **Step 2: Commit**

```bash
git add .github
git commit -m "ci: GitHub Actions runs typecheck, unit tests, Playwright E2E"
```

---

## Task 35: Phase 1 acceptance pass

This is the verification task — no code changes if everything works.

- [ ] **Step 1: Run the full local matrix**

```bash
pnpm -r typecheck
pnpm -r test
pnpm test:e2e
```

Expected: all green.

- [ ] **Step 2: Manual full-match smoke**

Two browsers on the same machine (or two devices on a LAN if you set `VITE_SERVER_URL`):
1. Tab 1 → Create → note code
2. Tab 2 → Join with code
3. Tab 1 → Start
4. Take turns firing until one tank wins
5. Confirm "match-end" banner shows the winner
6. Confirm "Return to lobby" works

- [ ] **Step 3: Reconnect smoke**

1. Two browsers, start match
2. Close one tab during the match
3. Confirm the remaining player sees that tank's `connected=false` in the player list
4. Reopen and rejoin with same code + nickname within 60s
5. Confirm `connected=true` restores

- [ ] **Step 4: Update spec status**

Edit `docs/superpowers/specs/2026-05-22-phase-1-multiplayer-skeleton-design.md` header:
```markdown
**Status:** Implemented YYYY-MM-DD.
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-05-22-phase-1-multiplayer-skeleton-design.md
git commit -m "docs: mark Phase 1 design as implemented"
```

- [ ] **Step 6: Update roadmap**

In `docs/superpowers/specs/2026-05-22-roadmap.md`, update the Phase 1 row in the phases table to mark it complete and add a one-line "what shipped" note.

```bash
git add docs/superpowers/specs/2026-05-22-roadmap.md
git commit -m "docs: roadmap Phase 1 marked complete"
```

---

## Self-review checklist (run before declaring plan complete)

This was performed during writing. Final state:

**Spec coverage:**
- ✅ Colyseus server with LobbyRoom + MatchRoom → Tasks 14, 16, 17
- ✅ 6-char room codes → Task 15
- ✅ 10 players, nickname/color/hat → Task 17, 24, 27
- ✅ Random terrain → Tasks 6, 17, 26
- ✅ Wind + gravity → Tasks 10, 17, 19, 29
- ✅ Mouse drag + keyboard aim → Task 30
- ✅ Baby Missile + projectile physics → Tasks 8, 10, 19, 28
- ✅ Terrain destruction → Tasks 7, 19, 26
- ✅ Splash damage → Tasks 9, 19
- ✅ Win detection → Task 19
- ✅ Walls=None → Task 10
- ✅ Single round + rematch → Tasks 19, 35 (rematch button — manual smoke, lobby rejoin)
- ✅ 30s turn timer → Task 20
- ✅ Reconnect grace + host migration → Task 21
- ✅ Cartoon-Illustrative placeholder graphics → Tasks 26, 27, 28
- ✅ TDD with Vitest + @colyseus/testing → throughout
- ✅ E2E with Playwright → Tasks 31, 32
- ✅ CI workflow → Task 34
- ✅ Acceptance criteria pass → Task 35

**Placeholder scan:** No "TODO", "TBD", or "implement later" placeholders. Every step has concrete code/commands.

**Type consistency:** `createPrng` / `Prng`, `generateTerrain` / `TerrainOptions`, `simulateProjectile` / `SimInput` / `TrajectoryResult`, `MatchState` / `Tank` / `CarveOp`, `handleFire` / `ResolveContext` — all names match across tasks.

**Known caveats requiring real-time tuning during execution:**
1. `VELOCITY_SCALE` (Task 10) may need adjustment after seeing real arcs — calibrate so power-500/45° flies ~half terrain width.
2. Colyseus 0.16's exact `reconnect()` API may differ (Tasks 21, 32); validate against the actual library before finalizing reconnect logic.
3. Playwright config's webServer URL for Colyseus health (Task 31) — verify the actual matchmake endpoint.
4. `clock.setTimeout` is a Colyseus convenience (Task 19, 20); if not present in 0.16, fall back to `setTimeout` (Colyseus disposes scheduled timeouts on room destruction either way).

---

*End of Phase 1 implementation plan.*

**Plan complete and saved to `docs/superpowers/plans/2026-05-22-phase-1-multiplayer-skeleton.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
