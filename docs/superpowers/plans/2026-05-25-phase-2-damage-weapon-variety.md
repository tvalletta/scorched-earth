# Phase 2 — Damage & Weapon Variety: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 new weapons (including 2 cluster weapons), per-player inventory, host loadout presets, HP bars, and a scrollable weapon toolbar — turning Phase 1 into a genuinely playable game with real tactical decisions.

**Architecture:** Extend `packages/game` types and simulator with a `SplitDef` for cluster weapons; the server resolves entire trajectory trees atomically and broadcasts a compound payload; the client fans out child animations at the split timestamp. Inventory lives in the `Tank` schema; the server seeds it from a named loadout preset at match start.

**Tech Stack:** TypeScript, Colyseus (`@colyseus/schema`), PixiJS v8, Vitest, Playwright.

---

## File Map

**Create:**
- `packages/game/src/weapons/missile.ts`
- `packages/game/src/weapons/baby-nuke.ts`
- `packages/game/src/weapons/nuke.ts`
- `packages/game/src/weapons/death-explosion.ts`
- `packages/game/src/weapons/funky-bomb.ts`
- `packages/game/src/weapons/mirv.ts`
- `packages/game/src/weapons/index.ts` — `WEAPON_REGISTRY`
- `packages/game/src/weapons/simple-weapons.test.ts`
- `packages/game/src/weapons/split-weapons.test.ts`
- `packages/game/src/physics/simulate-split.test.ts`
- `packages/shared/src/loadouts.ts`
- `apps/server/src/rooms/resolveTurn.test.ts`
- `apps/client/src/hud/HpBar.ts`
- `apps/client/src/hud/WeaponBar.ts`

**Modify:**
- `packages/game/src/types.ts` — `SplitDef`, `WeaponDef.split`, `TrajectoryResult.splitAt/children`, `SimInput.initialVelocity`
- `packages/game/src/physics/simulate.ts` — apex-split detection + child sims
- `packages/game/src/index.ts` — export new weapons + `WEAPON_REGISTRY`
- `packages/shared/src/schema/Tank.ts` — `weaponId`, `inventory`
- `packages/shared/src/schema/MatchState.ts` — `loadoutId`
- `packages/shared/src/intents.ts` — `select-weapon` intent; `loadoutId` on `configure`
- `packages/shared/src/index.ts` — re-export loadouts
- `apps/server/src/rooms/MatchRoom.ts` — loadout configure, select-weapon handler, inventory seeding
- `apps/server/src/rooms/resolveTurn.ts` — weapon lookup, inventory decrement, chain kills, compound trajectory
- `apps/client/src/render/Tank.ts` — attach `HpBar`, add `setHp` to `TankView`
- `apps/client/src/hud/PlayerList.ts` — HP bars + numbers
- `apps/client/src/scenes/MatchScene.ts` — compound playback, `WeaponBar` wiring
- `apps/client/src/input/AimControls.ts` — loadout picker (host) + loadout label (non-host)

---

## Task 1: Extend core types

**Files:**
- Modify: `packages/game/src/types.ts`

- [ ] **Replace the contents of `packages/game/src/types.ts`:**

```ts
export interface Point { x: number; y: number; }

export interface TerrainOptions {
  seed: string;
  type: "random";
  width: number;
  height: number;
}

export interface CarveOp { x: number; y: number; radius: number; tick: number; }

export interface SplitDef {
  trigger: "apex";           // fires when vy crosses from negative to non-negative
  count: number;             // sub-projectile count
  spreadDeg: number;         // 360 = full radial circle; <360 = fan
  centerDeg: number;         // screen-space fan center; 90 = straight down
  inheritVelocity: boolean;  // add parent vx/vy to each child's ejection velocity
  ejectionSpeed: number;     // px/s radial push per child
  child: WeaponDef;          // weapon applied to every sub-munition
}

export interface WeaponDef {
  id: string;
  radius: number;
  damage: number;
  windImmune: boolean;
  split?: SplitDef;
}

export interface TargetInfo {
  playerId: string;
  x: number;
  y: number;
  shieldHp: number;
}

export interface DamageEntry {
  playerId: string;
  amount: number;
  shieldDamage: number;
  hullDamage: number;
}

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
  walls: "none";
  targets: TargetInfo[];
  initialVelocity?: { vx: number; vy: number }; // overrides angle+power when set
}

export interface TrajectorySample { x: number; y: number; t: number; }

export interface TrajectoryResult {
  samples: TrajectorySample[];
  impact: Point | null;
  durationMs: number;
  carveOp: CarveOp | null;
  damages: DamageEntry[];
  splitAt?: TrajectorySample;
  children?: TrajectoryResult[];
}
```

- [ ] **Run existing tests to confirm no regressions:**

```bash
cd packages/game && pnpm test --run
```

Expected: all existing tests pass (type changes are additive).

- [ ] **Commit:**

```bash
git add packages/game/src/types.ts
git commit -m "feat(game): add SplitDef, WeaponDef.split, TrajectoryResult children, SimInput.initialVelocity"
```

---

## Task 2: Simple weapon defs + death explosion (TDD)

**Files:**
- Create: `packages/game/src/weapons/simple-weapons.test.ts`
- Create: `packages/game/src/weapons/missile.ts`
- Create: `packages/game/src/weapons/baby-nuke.ts`
- Create: `packages/game/src/weapons/nuke.ts`
- Create: `packages/game/src/weapons/death-explosion.ts`

- [ ] **Write the failing tests first (`packages/game/src/weapons/simple-weapons.test.ts`):**

```ts
import { describe, it, expect } from "vitest";
import { MISSILE } from "./missile";
import { BABY_NUKE } from "./baby-nuke";
import { NUKE } from "./nuke";
import { DEATH_EXPLOSION } from "./death-explosion";

describe("simple weapon definitions", () => {
  it("MISSILE", () => {
    expect(MISSILE).toMatchObject({ id: "missile", radius: 30, damage: 50, windImmune: false });
    expect(MISSILE.split).toBeUndefined();
  });
  it("BABY_NUKE", () => {
    expect(BABY_NUKE).toMatchObject({ id: "baby-nuke", radius: 45, damage: 75, windImmune: false });
    expect(BABY_NUKE.split).toBeUndefined();
  });
  it("NUKE", () => {
    expect(NUKE).toMatchObject({ id: "nuke", radius: 60, damage: 100, windImmune: false });
    expect(NUKE.split).toBeUndefined();
  });
  it("DEATH_EXPLOSION is wind-immune with no split", () => {
    expect(DEATH_EXPLOSION).toMatchObject({ id: "death-explosion", radius: 40, damage: 30, windImmune: true });
    expect(DEATH_EXPLOSION.split).toBeUndefined();
  });
});
```

- [ ] **Run to confirm failure:**

```bash
cd packages/game && pnpm test --run simple-weapons
```

Expected: FAIL — modules not found.

- [ ] **Create `packages/game/src/weapons/missile.ts`:**

```ts
import type { WeaponDef } from "../types";
export const MISSILE: WeaponDef = { id: "missile", radius: 30, damage: 50, windImmune: false };
```

- [ ] **Create `packages/game/src/weapons/baby-nuke.ts`:**

```ts
import type { WeaponDef } from "../types";
export const BABY_NUKE: WeaponDef = { id: "baby-nuke", radius: 45, damage: 75, windImmune: false };
```

- [ ] **Create `packages/game/src/weapons/nuke.ts`:**

```ts
import type { WeaponDef } from "../types";
export const NUKE: WeaponDef = { id: "nuke", radius: 60, damage: 100, windImmune: false };
```

- [ ] **Create `packages/game/src/weapons/death-explosion.ts`:**

```ts
import type { WeaponDef } from "../types";
export const DEATH_EXPLOSION: WeaponDef = { id: "death-explosion", radius: 40, damage: 30, windImmune: true };
```

- [ ] **Run to confirm pass:**

```bash
cd packages/game && pnpm test --run simple-weapons
```

Expected: 4 tests pass.

- [ ] **Commit:**

```bash
git add packages/game/src/weapons/
git commit -m "feat(game): add Missile, BabyNuke, Nuke, DeathExplosion weapon defs"
```

---

## Task 3: Split simulation (TDD)

**Files:**
- Create: `packages/game/src/physics/simulate-split.test.ts`
- Modify: `packages/game/src/physics/simulate.ts`

- [ ] **Write failing tests (`packages/game/src/physics/simulate-split.test.ts`):**

```ts
import { describe, it, expect } from "vitest";
import { simulateProjectile } from "./simulate";
import { BABY_MISSILE } from "../weapons/baby-missile";
import type { SimInput, WeaponDef } from "../types";

const W = 1600, H = 900;
function flatTerrain(y: number): Int16Array {
  const t = new Int16Array(W);
  for (let i = 0; i < W; i++) t[i] = y;
  return t;
}
function base(weapon: WeaponDef, overrides: Partial<SimInput> = {}): SimInput {
  return {
    weapon, origin: { x: 800, y: 600 },
    angle: 90, power: 500, wind: 0, gravity: 250,
    terrain: flatTerrain(800), terrainWidth: W, terrainHeight: H,
    walls: "none", targets: [],
    ...overrides,
  };
}

const RADIAL_3: WeaponDef = {
  id: "test-radial", radius: 0, damage: 0, windImmune: false,
  split: {
    trigger: "apex", count: 3, spreadDeg: 360, centerDeg: 90,
    inheritVelocity: false, ejectionSpeed: 200,
    child: { id: "test-child", radius: 15, damage: 10, windImmune: false },
  },
};

const FAN_3: WeaponDef = {
  id: "test-fan", radius: 0, damage: 0, windImmune: false,
  split: {
    trigger: "apex", count: 3, spreadDeg: 120, centerDeg: 90,
    inheritVelocity: true, ejectionSpeed: 300,
    child: { id: "test-fan-child", radius: 15, damage: 10, windImmune: false },
  },
};

describe("simulateProjectile — split weapons", () => {
  it("parent has null carveOp and no direct damages", () => {
    const r = simulateProjectile(base(RADIAL_3));
    expect(r.carveOp).toBeNull();
    expect(r.damages).toEqual([]);
  });

  it("records splitAt near the apex (above origin)", () => {
    const r = simulateProjectile(base(RADIAL_3));
    expect(r.splitAt).toBeDefined();
    expect(r.splitAt!.y).toBeLessThan(600);
  });

  it("produces correct child count", () => {
    const r = simulateProjectile(base(RADIAL_3));
    expect(r.children).toHaveLength(3);
  });

  it("each child has samples and an impact", () => {
    const r = simulateProjectile(base(RADIAL_3));
    for (const c of r.children!) {
      expect(c.samples.length).toBeGreaterThan(1);
      expect(c.impact).not.toBeNull();
    }
  });

  it("radial children spread both left and right", () => {
    const r = simulateProjectile(base(RADIAL_3));
    const left = r.children!.filter((c) => c.impact!.x < 800);
    const right = r.children!.filter((c) => c.impact!.x > 800);
    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
  });

  it("fan children all impact below the split point", () => {
    const r = simulateProjectile(base(FAN_3, { angle: 90, power: 600 }));
    for (const c of r.children!) {
      expect(c.impact!.y).toBeGreaterThan(r.splitAt!.y);
    }
  });

  it("child carveOp uses child weapon radius", () => {
    const r = simulateProjectile(base(RADIAL_3));
    for (const c of r.children!) {
      if (c.carveOp) expect(c.carveOp.radius).toBe(15);
    }
  });

  it("BABY_MISSILE (no split) is unchanged — no splitAt or children", () => {
    const r = simulateProjectile(base(BABY_MISSILE));
    expect(r.splitAt).toBeUndefined();
    expect(r.children).toBeUndefined();
    expect(r.impact).not.toBeNull();
  });

  it("initialVelocity override bypasses angle/power", () => {
    const r = simulateProjectile(base(BABY_MISSILE, {
      initialVelocity: { vx: 0, vy: -300 }, // straight up
    }));
    expect(r.impact).not.toBeNull();
    expect(Math.abs(r.impact!.x - 800)).toBeLessThan(10);
  });
});
```

- [ ] **Run to confirm failure:**

```bash
cd packages/game && pnpm test --run simulate-split
```

Expected: FAIL.

- [ ] **Replace `packages/game/src/physics/simulate.ts` with the updated version:**

```ts
import type { SimInput, TrajectoryResult, TrajectorySample, SplitDef } from "../types";
import { computeDamage } from "./damage";

const DT_MS = 1000 / 60;
const MAX_DURATION_MS = 8000;
const VELOCITY_SCALE = 0.6;
const WIND_ACCEL_SCALE = 5.0;
const MAX_SAMPLES = 100;

function degToRad(deg: number): number { return (deg * Math.PI) / 180; }

function initialVelocityFromAnglePower(angle: number, power: number): { vx: number; vy: number } {
  const a = degToRad(angle);
  return {
    vx: -Math.cos(a) * power * VELOCITY_SCALE,
    vy: -Math.sin(a) * power * VELOCITY_SCALE,
  };
}

function heightAt(terrain: Int16Array, x: number): number {
  const i = Math.floor(x);
  if (i < 0 || i >= terrain.length) return Number.POSITIVE_INFINITY;
  return terrain[i] as number;
}

function downsample(rawSamples: TrajectorySample[]): TrajectorySample[] {
  if (rawSamples.length <= MAX_SAMPLES) return rawSamples;
  const out = [rawSamples[0]!];
  const interior = MAX_SAMPLES - 2;
  for (let i = 1; i <= interior; i++) {
    const idx = Math.round((i / (interior + 1)) * (rawSamples.length - 1));
    out.push(rawSamples[idx]!);
  }
  out.push(rawSamples[rawSamples.length - 1]!);
  return out;
}

function childVelocities(
  split: SplitDef,
  parentVx: number,
  parentVy: number,
): Array<{ vx: number; vy: number }> {
  const { count, spreadDeg, centerDeg, inheritVelocity, ejectionSpeed } = split;
  const result: Array<{ vx: number; vy: number }> = [];
  for (let i = 0; i < count; i++) {
    const deg =
      spreadDeg >= 360
        ? i * (360 / count)
        : centerDeg - spreadDeg / 2 + (count === 1 ? 0 : i * (spreadDeg / (count - 1)));
    const rad = degToRad(deg);
    result.push({
      vx: Math.cos(rad) * ejectionSpeed + (inheritVelocity ? parentVx : 0),
      vy: Math.sin(rad) * ejectionSpeed + (inheritVelocity ? parentVy : 0),
    });
  }
  return result;
}

export function simulateProjectile(input: SimInput): TrajectoryResult {
  const {
    weapon, origin, angle, power, wind, gravity,
    terrain, terrainWidth, terrainHeight, walls, targets,
    initialVelocity,
  } = input;

  const SOFT_BOTTOM = terrainHeight + 200;
  void walls;

  let { vx, vy } = initialVelocity ?? initialVelocityFromAnglePower(angle, power);
  const dtSec = DT_MS / 1000;
  const windAccel = weapon.windImmune ? 0 : wind * WIND_ACCEL_SCALE;

  let x = origin.x;
  let y = origin.y;
  let t = 0;

  const rawSamples: TrajectorySample[] = [{ x, y, t: 0 }];
  let impact: { x: number; y: number } | null = null;

  while (t < MAX_DURATION_MS) {
    const prevVy = vy;
    vx += windAccel * dtSec;
    vy += gravity * dtSec;
    x += vx * dtSec;
    y += vy * dtSec;
    t += DT_MS;

    // Apex-split detection (must happen before out-of-bounds / terrain checks)
    if (weapon.split && weapon.split.trigger === "apex" && prevVy < 0 && vy >= 0) {
      const splitAt: TrajectorySample = { x, y, t };
      rawSamples.push(splitAt);
      const vels = childVelocities(weapon.split, vx, vy);
      const children = vels.map((vel) =>
        simulateProjectile({
          ...input,
          weapon: weapon.split!.child,
          origin: { x, y },
          initialVelocity: vel,
        }),
      );
      return {
        samples: downsample(rawSamples),
        impact: null,
        durationMs: rawSamples[rawSamples.length - 1]!.t,
        carveOp: null,
        damages: [],
        splitAt,
        children,
      };
    }

    if (x < 0 || x >= terrainWidth) { rawSamples.push({ x, y, t }); break; }
    if (y > SOFT_BOTTOM) { rawSamples.push({ x, y, t }); break; }

    const surfaceY = heightAt(terrain, x);
    if (y >= surfaceY) {
      const prev = rawSamples[rawSamples.length - 1]!;
      let lo = 0, hi = 1;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        const sx = prev.x + (x - prev.x) * mid;
        const sy = prev.y + (y - prev.y) * mid;
        if (sy >= heightAt(terrain, sx)) hi = mid; else lo = mid;
      }
      const finalX = prev.x + (x - prev.x) * hi;
      const finalY = prev.y + (y - prev.y) * hi;
      const finalT = prev.t + (t - prev.t) * hi;
      rawSamples.push({ x: finalX, y: finalY, t: finalT });
      impact = { x: finalX, y: finalY };
      t = finalT;
      break;
    }

    rawSamples.push({ x, y, t });
  }

  const carveOp = impact
    ? { x: Math.round(impact.x), y: Math.round(impact.y), radius: weapon.radius, tick: 0 }
    : null;
  const damages = impact ? computeDamage(impact, weapon, targets) : [];
  const samples = downsample(rawSamples);
  const durationMs = samples[samples.length - 1]!.t;

  return { samples, impact, durationMs, carveOp, damages };
}
```

- [ ] **Run split tests:**

```bash
cd packages/game && pnpm test --run simulate-split
```

Expected: all 9 tests pass.

- [ ] **Run all game tests (no regressions):**

```bash
cd packages/game && pnpm test --run
```

Expected: all tests pass.

- [ ] **Commit:**

```bash
git add packages/game/src/physics/simulate.ts packages/game/src/physics/simulate-split.test.ts
git commit -m "feat(game): apex-split simulation with child trajectory tree"
```

---

## Task 4: Funky Bomb and MIRV defs (TDD)

**Files:**
- Create: `packages/game/src/weapons/split-weapons.test.ts`
- Create: `packages/game/src/weapons/funky-bomb.ts`
- Create: `packages/game/src/weapons/mirv.ts`

- [ ] **Write failing tests (`packages/game/src/weapons/split-weapons.test.ts`):**

```ts
import { describe, it, expect } from "vitest";
import { simulateProjectile } from "../physics/simulate";
import { FUNKY_BOMB } from "./funky-bomb";
import { MIRV } from "./mirv";
import type { SimInput } from "../types";

const W = 1600, H = 900;
function flat(y: number): Int16Array { const t = new Int16Array(W); t.fill(y); return t; }
function base(overrides: Partial<SimInput> = {}): SimInput {
  return {
    weapon: FUNKY_BOMB, origin: { x: 800, y: 700 },
    angle: 90, power: 500, wind: 0, gravity: 250,
    terrain: flat(800), terrainWidth: W, terrainHeight: H,
    walls: "none", targets: [],
    ...overrides,
  };
}

describe("FUNKY_BOMB", () => {
  it("id and stats", () => {
    expect(FUNKY_BOMB.id).toBe("funky-bomb");
    expect(FUNKY_BOMB.radius).toBe(0);
    expect(FUNKY_BOMB.damage).toBe(0);
    expect(FUNKY_BOMB.split?.count).toBe(8);
    expect(FUNKY_BOMB.split?.spreadDeg).toBe(360);
    expect(FUNKY_BOMB.split?.inheritVelocity).toBe(false);
  });

  it("splits into 8 children", () => {
    const r = simulateProjectile(base());
    expect(r.children).toHaveLength(8);
  });

  it("children spread both left and right of origin", () => {
    const r = simulateProjectile(base());
    const left = r.children!.filter((c) => c.impact && c.impact.x < 800);
    const right = r.children!.filter((c) => c.impact && c.impact.x > 800);
    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
  });

  it("sub-munition carveOp radius is 18", () => {
    const r = simulateProjectile(base());
    const withImpact = r.children!.filter((c) => c.carveOp);
    expect(withImpact.length).toBeGreaterThan(0);
    for (const c of withImpact) expect(c.carveOp!.radius).toBe(18);
  });
});

describe("MIRV", () => {
  it("id and stats", () => {
    expect(MIRV.id).toBe("mirv");
    expect(MIRV.radius).toBe(0);
    expect(MIRV.split?.count).toBe(5);
    expect(MIRV.split?.spreadDeg).toBe(120);
    expect(MIRV.split?.inheritVelocity).toBe(true);
    expect(MIRV.split?.child.radius).toBe(25);
  });

  it("splits into 5 children", () => {
    const r = simulateProjectile(base({ weapon: MIRV }));
    expect(r.children).toHaveLength(5);
  });

  it("all MIRV children impact below the split point", () => {
    const r = simulateProjectile(base({ weapon: MIRV, angle: 90, power: 600 }));
    for (const c of r.children!) {
      if (c.impact) expect(c.impact.y).toBeGreaterThan(r.splitAt!.y);
    }
  });
});
```

- [ ] **Run to confirm failure:**

```bash
cd packages/game && pnpm test --run split-weapons
```

Expected: FAIL — modules not found.

- [ ] **Create `packages/game/src/weapons/funky-bomb.ts`:**

```ts
import type { WeaponDef } from "../types";

const FUNKY_BOMB_SUB: WeaponDef = {
  id: "funky-bomb-sub",
  radius: 18,
  damage: 20,
  windImmune: false,
};

export const FUNKY_BOMB: WeaponDef = {
  id: "funky-bomb",
  radius: 0,
  damage: 0,
  windImmune: false,
  split: {
    trigger: "apex",
    count: 8,
    spreadDeg: 360,
    centerDeg: 90,
    inheritVelocity: false,
    ejectionSpeed: 200,
    child: FUNKY_BOMB_SUB,
  },
};
```

- [ ] **Create `packages/game/src/weapons/mirv.ts`:**

```ts
import type { WeaponDef } from "../types";

const MIRV_SUB: WeaponDef = {
  id: "mirv-sub",
  radius: 25,
  damage: 35,
  windImmune: false,
};

export const MIRV: WeaponDef = {
  id: "mirv",
  radius: 0,
  damage: 0,
  windImmune: false,
  split: {
    trigger: "apex",
    count: 5,
    spreadDeg: 120,
    centerDeg: 90,
    inheritVelocity: true,
    ejectionSpeed: 300,
    child: MIRV_SUB,
  },
};
```

- [ ] **Run split weapon tests:**

```bash
cd packages/game && pnpm test --run split-weapons
```

Expected: all tests pass.

- [ ] **Commit:**

```bash
git add packages/game/src/weapons/
git commit -m "feat(game): Funky Bomb and MIRV weapon defs with split simulation"
```

---

## Task 5: WEAPON_REGISTRY + update package exports

**Files:**
- Create: `packages/game/src/weapons/index.ts`
- Modify: `packages/game/src/index.ts`

- [ ] **Create `packages/game/src/weapons/index.ts`:**

```ts
import type { WeaponDef } from "../types";
import { BABY_MISSILE } from "./baby-missile";
import { MISSILE } from "./missile";
import { BABY_NUKE } from "./baby-nuke";
import { NUKE } from "./nuke";
import { FUNKY_BOMB } from "./funky-bomb";
import { MIRV } from "./mirv";

export { BABY_MISSILE, MISSILE, BABY_NUKE, NUKE, FUNKY_BOMB, MIRV };

// Player-selectable weapons in display order. Sub-munition defs are NOT registered.
export const WEAPON_REGISTRY = new Map<string, WeaponDef>([
  [BABY_MISSILE.id, BABY_MISSILE],
  [MISSILE.id, MISSILE],
  [BABY_NUKE.id, BABY_NUKE],
  [NUKE.id, NUKE],
  [FUNKY_BOMB.id, FUNKY_BOMB],
  [MIRV.id, MIRV],
]);
```

- [ ] **Replace `packages/game/src/index.ts`:**

```ts
export { createPrng } from "./rng/prng";
export type { Prng } from "./rng/prng";
export type {
  Point, TerrainOptions, CarveOp, WeaponDef, SplitDef, TargetInfo,
  DamageEntry, SimInput, TrajectorySample, TrajectoryResult,
} from "./types";
export { generateTerrain } from "./terrain/generate";
export { carveInPlace, applyCarve } from "./terrain/carve";
export {
  BABY_MISSILE, MISSILE, BABY_NUKE, NUKE, FUNKY_BOMB, MIRV,
  WEAPON_REGISTRY,
} from "./weapons/index";
export { DEATH_EXPLOSION } from "./weapons/death-explosion";
export { computeDamage } from "./physics/damage";
export { simulateProjectile } from "./physics/simulate";
```

- [ ] **Run all game tests:**

```bash
cd packages/game && pnpm test --run
```

Expected: all pass.

- [ ] **Commit:**

```bash
git add packages/game/src/weapons/index.ts packages/game/src/index.ts
git commit -m "feat(game): WEAPON_REGISTRY and updated package exports"
```

---

## Task 6: Loadout presets in shared package

**Files:**
- Create: `packages/shared/src/loadouts.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Create `packages/shared/src/loadouts.ts`:**

```ts
export interface LoadoutDef {
  id: string;
  label: string;
  weapons: Record<string, number>; // weaponId → count; -1 = infinite
}

export const LOADOUTS: LoadoutDef[] = [
  {
    id: "starter",
    label: "Starter",
    weapons: { "baby-missile": -1, "missile": 5 },
  },
  {
    id: "standard",
    label: "Standard",
    weapons: {
      "baby-missile": -1,
      "missile": 5,
      "baby-nuke": 3,
      "nuke": 2,
      "funky-bomb": 2,
      "mirv": 1,
    },
  },
  {
    id: "bonanza",
    label: "Bonanza",
    weapons: {
      "baby-missile": -1,
      "missile": 10,
      "baby-nuke": 6,
      "nuke": 4,
      "funky-bomb": 5,
      "mirv": 3,
    },
  },
];

export const LOADOUT_MAP = new Map(LOADOUTS.map((l) => [l.id, l]));
export const DEFAULT_LOADOUT_ID = "standard";
```

- [ ] **Update `packages/shared/src/index.ts`:**

```ts
export { Tank } from "./schema/Tank";
export { CarveOp } from "./schema/CarveOp";
export { MatchState, type MatchPhase } from "./schema/MatchState";
export * from "./intents";
export * from "./constants";
export * from "./loadouts";
```

- [ ] **Commit:**

```bash
git add packages/shared/src/loadouts.ts packages/shared/src/index.ts
git commit -m "feat(shared): LoadoutDef type and named loadout presets"
```

---

## Task 7: Extend Tank + MatchState schemas; add select-weapon intent

**Files:**
- Modify: `packages/shared/src/schema/Tank.ts`
- Modify: `packages/shared/src/schema/MatchState.ts`
- Modify: `packages/shared/src/intents.ts`

- [ ] **Replace `packages/shared/src/schema/Tank.ts`:**

```ts
import { Schema, MapSchema, type } from "@colyseus/schema";

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
  @type("string") weaponId = "baby-missile";
  @type({ map: "number" }) inventory = new MapSchema<number>();
}
```

- [ ] **Add `loadoutId` to `packages/shared/src/schema/MatchState.ts`:**

```ts
// Add after winnerId:
@type("string") loadoutId = "standard";
```

Full file after edit:

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
  @type("string") loadoutId = "standard";
}
```

- [ ] **Replace `packages/shared/src/intents.ts`:**

```ts
export type Intent =
  | { kind: "aim"; angle: number; power: number }
  | { kind: "fire"; angle: number; power: number }
  | { kind: "configure"; turnTimerMs?: number; loadoutId?: string }
  | { kind: "ready" }
  | { kind: "chat"; text: string }
  | { kind: "select-weapon"; weaponId: string };

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

- [ ] **Run typecheck across the monorepo:**

```bash
cd /path/to/scorched-earth && pnpm -r typecheck 2>&1 | head -40
```

Expected: no type errors.

- [ ] **Commit:**

```bash
git add packages/shared/src/schema/ packages/shared/src/intents.ts
git commit -m "feat(shared): Tank inventory+weaponId, MatchState loadoutId, select-weapon intent"
```

---

## Task 8: Server — loadout seeding + configure loadoutId

**Files:**
- Modify: `apps/server/src/rooms/MatchRoom.ts`

- [ ] **Add imports at the top of `MatchRoom.ts`:**

```ts
import { LOADOUT_MAP, DEFAULT_LOADOUT_ID } from "@se/shared";
```

- [ ] **Update the `configure` message handler** (replace existing):

```ts
this.onMessage("configure", (client, msg: { turnTimerMs?: number; loadoutId?: string }) => {
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
});
```

- [ ] **Add `seedInventory` private method and call it from `startMatch`:**

```ts
private seedInventory(): void {
  const loadout =
    LOADOUT_MAP.get(this.state.loadoutId) ?? LOADOUT_MAP.get(DEFAULT_LOADOUT_ID)!;
  for (const tank of this.state.tanks.values()) {
    tank.inventory.clear();
    for (const [weaponId, count] of Object.entries(loadout.weapons)) {
      tank.inventory.set(weaponId, count);
    }
    tank.weaponId = "baby-missile";
  }
}
```

In `startMatch`, add `this.seedInventory();` after `this.placeTanksOn(terrain);`.

- [ ] **Add `select-weapon` message handler** (inside `onCreate`, after the `configure` handler):

```ts
this.onMessage("select-weapon", (client, msg: { weaponId?: string }) => {
  if (this.state.phase !== "playing") return;
  const tank = this.state.tanks.get(client.sessionId);
  if (!tank) return;
  const weaponId = String(msg?.weaponId ?? "");
  const count = tank.inventory.get(weaponId) ?? null;
  if (count === null || count === 0) return;
  tank.weaponId = weaponId;
});
```

- [ ] **Commit:**

```bash
git add apps/server/src/rooms/MatchRoom.ts
git commit -m "feat(server): loadout seeding at match start, configure loadoutId, select-weapon handler"
```

---

## Task 9: Server — update handleFire + chain kill resolution (TDD)

**Files:**
- Create: `apps/server/src/rooms/resolveTurn.test.ts`
- Modify: `apps/server/src/rooms/resolveTurn.ts`

- [ ] **Write failing server tests (`apps/server/src/rooms/resolveTurn.test.ts`):**

```ts
import { describe, it, expect, vi } from "vitest";
import { MatchState, Tank } from "@se/shared";
import { handleFire, commitResolution, type ResolveContext } from "./resolveTurn";
import { TERRAIN_WIDTH, TERRAIN_HEIGHT } from "@se/shared";
import { generateTerrain } from "@se/game";

function flatTerrain(): Int16Array {
  const t = new Int16Array(TERRAIN_WIDTH);
  t.fill(TERRAIN_HEIGHT - 50);
  return t;
}

function makeCtx(state: MatchState, terrain: Int16Array): ResolveContext {
  return {
    state,
    broadcast: vi.fn(),
    schedule: vi.fn(),
    terrain,
    onTurnReady: vi.fn(),
  };
}

function addTank(state: MatchState, id: string, x: number, hp = 100): Tank {
  const t = new Tank();
  t.playerId = id;
  t.sessionId = id;
  t.nickname = id;
  t.color = "red";
  t.alive = true;
  t.hp = hp;
  t.x = x;
  t.y = TERRAIN_HEIGHT - 50;
  t.angle = 90;
  t.power = 500;
  t.weaponId = "baby-missile";
  t.inventory.set("baby-missile", -1);
  t.inventory.set("missile", 3);
  state.tanks.set(id, t);
  return t;
}

describe("handleFire — inventory", () => {
  it("decrements finite ammo by 1", () => {
    const state = new MatchState();
    state.phase = "playing";
    state.terrainSeed = "test";
    state.gravity = 250;
    state.wind = 0;
    state.turnTimerMs = 0;
    const terrain = flatTerrain();
    addTank(state, "p1", 400);
    addTank(state, "p2", 1200);
    state.currentTurnPlayerId = "p1";
    const tank = state.tanks.get("p1")!;
    tank.weaponId = "missile";
    const ctx = makeCtx(state, terrain);
    handleFire(ctx, "p1", 90, 500);
    expect(tank.inventory.get("missile")).toBe(2);
  });

  it("does not decrement infinite ammo (-1)", () => {
    const state = new MatchState();
    state.phase = "playing";
    state.terrainSeed = "test";
    state.gravity = 250;
    state.wind = 0;
    state.turnTimerMs = 0;
    const terrain = flatTerrain();
    addTank(state, "p1", 400);
    addTank(state, "p2", 1200);
    state.currentTurnPlayerId = "p1";
    const ctx = makeCtx(state, terrain);
    handleFire(ctx, "p1", 90, 500);
    expect(state.tanks.get("p1")!.inventory.get("baby-missile")).toBe(-1);
  });
});

describe("chain kill resolution", () => {
  it("death explosion kills adjacent tank", () => {
    const state = new MatchState();
    state.phase = "resolving";
    state.terrainSeed = "test";
    state.tick = 0;
    const terrain = flatTerrain();
    const t1 = addTank(state, "p1", 400, 1);   // 1 HP — dies from any damage
    const t2 = addTank(state, "p2", 430, 100);  // 30px away, within DEATH_EXPLOSION radius=40
    state.currentTurnPlayerId = "p1";
    // Build a result that kills p1 directly
    const { simulateProjectile, BABY_MISSILE } = await import("@se/game");
    const result = simulateProjectile({
      weapon: BABY_MISSILE,
      origin: { x: t1.x, y: t1.y - 5 },
      angle: 90, power: 1,
      wind: 0, gravity: 250,
      terrain, terrainWidth: TERRAIN_WIDTH, terrainHeight: TERRAIN_HEIGHT,
      walls: "none",
      targets: [{ playerId: "p1", x: t1.x, y: t1.y, shieldHp: 0 }],
    });
    const ctx = makeCtx(state, terrain);
    commitResolution(ctx, result);
    expect(t1.alive).toBe(false);
    expect(t2.alive).toBe(false); // killed by death explosion
  });
});
```

Note: the chain kill test uses a dynamic import to avoid circular resolution in test setup. If your test runner supports top-level await, move the import to the top. Otherwise keep it async:

```ts
it("death explosion kills adjacent tank", async () => {
  // ... (mark test as async, use await import)
```

- [ ] **Run to confirm failure:**

```bash
cd apps/server && pnpm test --run resolveTurn 2>&1 | head -30
```

Expected: FAIL — `commitResolution` not exported, or wrong behavior.

- [ ] **Replace `apps/server/src/rooms/resolveTurn.ts`:**

```ts
import {
  MatchState, CarveOp,
  POST_PLAYBACK_BUFFER_MS,
  TERRAIN_WIDTH, TERRAIN_HEIGHT,
  clampAngle, clampPower,
  type DamageEntry,
} from "@se/shared";
import {
  simulateProjectile,
  generateTerrain,
  carveInPlace,
  BABY_MISSILE,
  WEAPON_REGISTRY,
  DEATH_EXPLOSION,
  computeDamage,
  type TargetInfo,
  type TrajectoryResult,
  type WeaponDef,
} from "@se/game";
import { nextTurnPlayerId } from "./turnController";

export interface ResolveContext {
  state: MatchState;
  broadcast: (event: string, payload: unknown) => void;
  schedule: (delayMs: number, fn: () => void) => void;
  terrain: Int16Array;
  onTurnReady?: () => void;
}

export function buildTerrainFromState(state: MatchState): Int16Array {
  const terrain = generateTerrain({
    seed: state.terrainSeed,
    type: "random",
    width: TERRAIN_WIDTH,
    height: TERRAIN_HEIGHT,
  });
  for (const op of state.terrainOps) {
    carveInPlace(
      terrain,
      { x: op.x, y: op.y, radius: op.radius, tick: op.tick },
      { terrainHeight: TERRAIN_HEIGHT },
    );
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

  // Resolve weapon from inventory
  const weaponDef: WeaponDef = WEAPON_REGISTRY.get(tank.weaponId) ?? BABY_MISSILE;
  const currentCount = tank.inventory.get(tank.weaponId) ?? -1;
  if (currentCount > 0) {
    tank.inventory.set(tank.weaponId, currentCount - 1);
  } else if (currentCount === 0) {
    // Depleted — guard; select-weapon should prevent this
    tank.weaponId = "baby-missile";
  }

  const targets: TargetInfo[] = Array.from(state.tanks.values())
    .filter((t) => t.alive && t.sessionId !== sessionId)
    .map((t) => ({ playerId: t.sessionId, x: t.x, y: t.y, shieldHp: 0 }));

  const result = simulateProjectile({
    weapon: weaponDef,
    origin: { x: tank.x, y: tank.y - 5 },
    angle, power,
    wind: state.wind,
    gravity: state.gravity,
    terrain,
    terrainWidth: TERRAIN_WIDTH,
    terrainHeight: TERRAIN_HEIGHT,
    walls: "none",
    targets,
  });

  const totalDuration = calcTotalDuration(result);

  broadcast("trajectory-resolved", {
    samples: result.samples,
    splitAt: result.splitAt ?? null,
    children: (result.children ?? []).map((c) => ({
      samples: c.samples,
      impact: c.impact,
      durationMs: c.durationMs,
      weaponId: weaponDef.split?.child.id ?? weaponDef.id,
    })),
    impact: result.impact,
    weaponId: weaponDef.id,
    ownerId: sessionId,
    durationMs: totalDuration,
  });

  schedule(totalDuration + POST_PLAYBACK_BUFFER_MS, () => {
    commitResolution(ctx, result);
  });
}

function calcTotalDuration(result: TrajectoryResult): number {
  if (!result.children?.length) return result.durationMs;
  const splitTime = result.splitAt?.t ?? 0;
  return splitTime + Math.max(...result.children.map(calcTotalDuration));
}

function collectLeafDamages(result: TrajectoryResult): DamageEntry[] {
  if (!result.children?.length) return result.damages;
  return result.children.flatMap(collectLeafDamages);
}

function applyAllCarves(ctx: ResolveContext, result: TrajectoryResult): void {
  if (result.carveOp) {
    const { state, terrain } = ctx;
    const op = new CarveOp();
    op.x = result.carveOp.x;
    op.y = result.carveOp.y;
    op.radius = result.carveOp.radius;
    op.tick = state.tick + 1;
    state.terrainOps.push(op);
    state.terrainVersion++;
    carveInPlace(terrain, op, { terrainHeight: TERRAIN_HEIGHT });
  }
  for (const child of result.children ?? []) {
    applyAllCarves(ctx, child);
  }
}

// Exported for testing
export function applyDamagesWithChainKills(
  ctx: ResolveContext,
  damages: DamageEntry[],
  depth: number,
): void {
  if (depth > 10 || damages.length === 0) return;
  const { state, broadcast } = ctx;
  const events: Array<{ playerId: string; before: number; after: number }> = [];
  const newlyDeadPositions: Array<{ x: number; y: number }> = [];

  for (const d of damages) {
    const t = state.tanks.get(d.playerId);
    if (!t || !t.alive) continue;
    const before = t.hp;
    t.hp = Math.max(0, t.hp - d.hullDamage);
    events.push({ playerId: d.playerId, before, after: t.hp });
    if (t.hp <= 0) {
      t.alive = false;
      newlyDeadPositions.push({ x: t.x, y: t.y });
    }
  }

  if (events.length > 0) {
    broadcast("damage-applied", { damages: events, wave: depth });
  }

  for (const pos of newlyDeadPositions) {
    const deathDamages = computeDamage(
      pos,
      DEATH_EXPLOSION,
      Array.from(state.tanks.values())
        .filter((t) => t.alive)
        .map((t) => ({ playerId: t.sessionId, x: t.x, y: t.y, shieldHp: 0 })),
    );
    applyDamagesWithChainKills(ctx, deathDamages, depth + 1);
  }
}

export function commitResolution(ctx: ResolveContext, result: TrajectoryResult): void {
  const { state, broadcast, terrain } = ctx;

  applyAllCarves(ctx, result);

  const allDamages = collectLeafDamages(result);
  applyDamagesWithChainKills(ctx, allDamages, 0);

  // Settle alive tanks on terrain
  for (const t of state.tanks.values()) {
    if (!t.alive) continue;
    const x = Math.max(0, Math.min(TERRAIN_WIDTH - 1, Math.round(t.x)));
    const surface = terrain[x] ?? 0;
    if (t.y < surface) t.y = surface;
  }

  state.tick++;

  const alive = Array.from(state.tanks.values()).filter((t) => t.alive);
  if (alive.length <= 1) {
    state.phase = "ended";
    state.winnerId = alive[0]?.sessionId ?? "";
    broadcast("match-end", { winnerId: state.winnerId });
    return;
  }

  const next = nextTurnPlayerId(
    Array.from(state.tanks.values()),
    state.currentTurnPlayerId,
  );
  state.currentTurnPlayerId = next;
  state.phase = "playing";
  state.turnDeadlineMs = Date.now() + state.turnTimerMs;
  ctx.onTurnReady?.();
}
```

- [ ] **Run server tests:**

```bash
cd apps/server && pnpm test --run resolveTurn
```

Expected: inventory and chain kill tests pass.

- [ ] **Run all tests:**

```bash
pnpm -r test --run
```

Expected: all pass.

- [ ] **Commit:**

```bash
git add apps/server/src/rooms/resolveTurn.ts apps/server/src/rooms/resolveTurn.test.ts
git commit -m "feat(server): weapon lookup, inventory decrement, chain kill resolution, compound trajectory broadcast"
```

---

## Task 10: Client — HpBar + TankView update

**Files:**
- Create: `apps/client/src/hud/HpBar.ts`
- Modify: `apps/client/src/render/Tank.ts`

- [ ] **Create `apps/client/src/hud/HpBar.ts`:**

```ts
import { Graphics } from "pixi.js";

const BAR_W = 32;
const BAR_H = 5;
const BAR_OFFSET_Y = -26; // px above tank pivot

export class HpBar extends Graphics {
  redraw(hp: number, maxHp = 100): void {
    this.clear();
    const pct = Math.max(0, Math.min(1, hp / maxHp));
    const color = hp > 50 ? 0x22c55e : hp > 25 ? 0xf59e0b : 0xef4444;
    this.rect(-BAR_W / 2, 0, BAR_W, BAR_H).fill({ color: 0x000000, alpha: 0.5 });
    if (pct > 0) {
      this.rect(-BAR_W / 2, 0, Math.round(BAR_W * pct), BAR_H).fill({ color, alpha: 1 });
    }
    this.position.set(0, BAR_OFFSET_Y);
  }
}
```

- [ ] **Update `apps/client/src/render/Tank.ts`:**

Add `setHp` to `TankView` interface and attach an `HpBar` child.

```ts
import { Container, Graphics } from "pixi.js";
import { HpBar } from "../hud/HpBar";

// ... COLOR_HEX unchanged ...

export interface TankView {
  setPos(x: number, y: number): void;
  setAngle(angleDeg: number): void;
  setAlive(alive: boolean): void;
  setHp(hp: number): void;
  destroy(): void;
}

export function createTankView(opts: { color: string; hat: string }): Container & TankView {
  const fill = COLOR_HEX[opts.color] ?? 0xe63946;
  const root = new Container() as Container & TankView;

  // ... body, turret, hat unchanged ...

  const hpBar = new HpBar();
  hpBar.redraw(100);
  root.addChild(hpBar);

  root.setPos = (x, y) => root.position.set(x, y);
  root.setAngle = (deg) => {
    turret.rotation = Math.PI + (deg * Math.PI) / 180 - Math.atan2(-10, 14);
  };
  root.setAlive = (alive) => {
    root.alpha = alive ? 1 : 0.3;
    hpBar.visible = alive;
  };
  root.setHp = (hp) => hpBar.redraw(hp);
  root.destroy = () => root.removeFromParent();
  root.setAngle(90);
  return root;
}

// drawHat unchanged
```

- [ ] **Update `MatchScene.ts` `onFirstState` sync callback** to call `setHp`:

In the `$(state).tanks.onAdd` block, update the `sync` function:

```ts
const sync = () => {
  view.setPos(tank.x, tank.y);
  view.setAngle(tank.angle);
  view.setAlive(tank.alive);
  view.setHp(tank.hp);
};
```

- [ ] **Run typecheck:**

```bash
pnpm -r typecheck
```

Expected: no errors.

- [ ] **Commit:**

```bash
git add apps/client/src/hud/HpBar.ts apps/client/src/render/Tank.ts apps/client/src/scenes/MatchScene.ts
git commit -m "feat(client): HpBar above each tank, TankView.setHp, sync on state change"
```

---

## Task 11: Client — PlayerList HP bars

**Files:**
- Modify: `apps/client/src/hud/PlayerList.ts`

- [ ] **Replace `PlayerList.update` method:**

```ts
update(state: MatchState) {
  if (!state?.tanks) return;
  const lines: string[] = [];
  for (const t of state.tanks.values()) {
    const dot = `<span style="display:inline-block;width:10px;height:10px;background:${t.color};border-radius:50%;margin-right:6px;"></span>`;
    const dead = t.alive ? "" : `style="text-decoration:line-through;opacity:0.5;"`;
    const hpColor = t.hp > 50 ? "#22c55e" : t.hp > 25 ? "#f59e0b" : "#ef4444";
    const hpPct = Math.max(0, Math.min(100, t.hp));
    const bar = `<div style="width:100%;height:4px;background:rgba(255,255,255,0.15);border-radius:2px;margin:2px 0 3px;"><div style="width:${hpPct}%;height:100%;background:${hpColor};border-radius:2px;transition:width 0.15s;"></div></div>`;
    lines.push(`<div ${dead}>${dot}${t.nickname}<br>${bar}<span style="font-size:10px;color:#aaa;">${t.hp} HP</span></div>`);
  }
  this.el.innerHTML = lines.join("");
}
```

- [ ] **Commit:**

```bash
git add apps/client/src/hud/PlayerList.ts
git commit -m "feat(client): HP bar and numeric HP in PlayerList sidebar"
```

---

## Task 12: Client — WeaponBar

**Files:**
- Create: `apps/client/src/hud/WeaponBar.ts`
- Modify: `apps/client/src/scenes/MatchScene.ts`

- [ ] **Create `apps/client/src/hud/WeaponBar.ts`:**

```ts
import type { Room } from "colyseus.js";
import type { MatchState } from "@se/shared";
import { WEAPON_REGISTRY } from "@se/game";
import { getStateCallbacks } from "colyseus.js";

const LABELS: Record<string, string> = {
  "baby-missile": "BABY MSL",
  "missile": "MISSILE",
  "baby-nuke": "B.NUKE",
  "nuke": "NUKE",
  "funky-bomb": "FUNKY",
  "mirv": "MIRV",
};

const ICONS: Record<string, string> = {
  "baby-missile": `<svg viewBox="0 0 20 20" width="20" height="20"><line x1="5" y1="15" x2="15" y2="5" stroke="#60a5fa" stroke-width="2" stroke-linecap="round"/><polygon points="15,5 11,6 14,9" fill="#93c5fd"/><circle cx="5.5" cy="14.5" r="2" fill="#3b82f6" opacity="0.7"/></svg>`,
  "missile": `<svg viewBox="0 0 20 20" width="20" height="20"><line x1="4" y1="16" x2="16" y2="4" stroke="#9ca3af" stroke-width="2.5" stroke-linecap="round"/><polygon points="16,4 11,6 14,11" fill="#d1d5db"/><line x1="5" y1="14" x2="3" y2="17" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round"/><line x1="7" y1="16" x2="5" y2="18" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  "baby-nuke": `<svg viewBox="0 0 20 20" width="20" height="20"><ellipse cx="10" cy="14" rx="5" ry="2.5" fill="#6b7280" opacity="0.6"/><rect x="9" y="9" width="2" height="5" fill="#9ca3af"/><ellipse cx="10" cy="8" rx="4" ry="3.5" fill="#9ca3af"/><ellipse cx="10" cy="6" rx="5.5" ry="2.5" fill="#d1d5db"/></svg>`,
  "nuke": `<svg viewBox="0 0 20 20" width="20" height="20"><ellipse cx="10" cy="15" rx="6" ry="2.5" fill="#92400e" opacity="0.6"/><rect x="9" y="9" width="2" height="6" fill="#d97706"/><ellipse cx="10" cy="8" rx="5" ry="4" fill="#d97706"/><ellipse cx="10" cy="5.5" rx="6.5" ry="2.8" fill="#fbbf24"/></svg>`,
  "funky-bomb": `<svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="9" r="3" fill="#a855f7" stroke="#d8b4fe" stroke-width="0.5"/><circle cx="10" cy="4" r="1.2" fill="#f472b6"/><circle cx="14" cy="5.5" r="1.2" fill="#fb923c"/><circle cx="15.5" cy="9.5" r="1.2" fill="#facc15"/><circle cx="14" cy="14" r="1.2" fill="#4ade80"/><circle cx="10" cy="16" r="1.2" fill="#22d3ee"/><circle cx="6" cy="14" r="1.2" fill="#60a5fa"/><circle cx="4.5" cy="9.5" r="1.2" fill="#e879f9"/><circle cx="6" cy="5.5" r="1.2" fill="#f87171"/></svg>`,
  "mirv": `<svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="4" r="3" fill="#6b7280" stroke="#9ca3af" stroke-width="0.8"/><line x1="10" y1="7" x2="5" y2="15" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="7" x2="7.5" y2="16" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="7" x2="10" y2="17" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="7" x2="12.5" y2="16" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="7" x2="15" y2="15" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round"/></svg>`,
};

export class WeaponBar {
  private el: HTMLDivElement;
  private strip: HTMLDivElement;
  private leftArrow: HTMLDivElement;
  private rightArrow: HTMLDivElement;
  private scrollOffset = 0;
  private weaponOrder: string[] = Array.from(WEAPON_REGISTRY.keys());

  constructor(private room: Room<MatchState>) {
    this.el = document.createElement("div");
    this.el.className = "interactive";
    this.el.style.cssText =
      "position:fixed;bottom:0;left:0;right:0;height:58px;" +
      "background:rgba(0,0,0,0.88);border-top:1px solid rgba(255,255,255,0.12);" +
      "display:flex;align-items:stretch;z-index:100;";

    this.leftArrow = this.mkArrow("‹");
    this.leftArrow.onclick = () => this.scroll(-1);

    this.strip = document.createElement("div");
    this.strip.style.cssText = "flex:1;display:flex;overflow:hidden;";

    this.rightArrow = this.mkArrow("›");
    this.rightArrow.onclick = () => this.scroll(1);

    this.el.append(this.leftArrow, this.strip, this.rightArrow);
    document.getElementById("ui")!.appendChild(this.el);
    window.addEventListener("keydown", this.onKey);
  }

  wire(): void {
    const $ = getStateCallbacks(this.room);
    const localTank = this.room.state.tanks.get(this.room.sessionId);
    if (!localTank) return;
    const refresh = () => this.render(localTank.weaponId, localTank.inventory);
    $(localTank).listen("weaponId", refresh);
    $(localTank).inventory.onAdd(refresh);
    $(localTank).inventory.onChange(refresh);
    refresh();
  }

  private render(activeId: string, inventory: ReadonlyMap<string, number>): void {
    this.strip.innerHTML = "";
    const visible = this.weaponOrder.filter((id) => inventory.has(id));
    const showArrows = visible.length > 6;
    this.leftArrow.style.visibility = showArrows ? "visible" : "hidden";
    this.rightArrow.style.visibility = showArrows ? "visible" : "hidden";

    const windowSlots = visible.slice(this.scrollOffset, this.scrollOffset + 6);
    windowSlots.forEach((id, i) => {
      const count = inventory.get(id) ?? 0;
      this.strip.appendChild(this.mkSlot(id, count, id === activeId, i + 1));
    });
  }

  private mkSlot(weaponId: string, count: number, active: boolean, keyNum: number): HTMLDivElement {
    const depleted = count === 0;
    const slot = document.createElement("div");
    slot.style.cssText = [
      "flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;",
      "padding:4px 2px;cursor:pointer;border-right:1px solid rgba(255,255,255,0.06);position:relative;",
      active ? "background:#1e3a6e;" : "",
      depleted ? "opacity:0.4;cursor:not-allowed;" : "",
    ].join("");

    if (active) {
      const line = document.createElement("div");
      line.style.cssText = "position:absolute;bottom:0;left:0;right:0;height:2px;background:#3b82f6;";
      slot.appendChild(line);
    }

    const key = document.createElement("div");
    key.style.cssText = "font:bold 8px 'Courier New',monospace;color:#4b5563;margin-bottom:1px;";
    key.textContent = String(keyNum);
    slot.appendChild(key);

    const icon = document.createElement("div");
    icon.innerHTML = ICONS[weaponId] ?? `<svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="6" fill="#6b7280"/></svg>`;
    slot.appendChild(icon);

    const name = document.createElement("div");
    name.style.cssText = `font:bold 7px 'Courier New',monospace;color:${active ? "#93c5fd" : "#9ca3af"};overflow:hidden;white-space:nowrap;max-width:100%;text-align:center;`;
    name.textContent = LABELS[weaponId] ?? weaponId.toUpperCase().slice(0, 8);
    slot.appendChild(name);

    const ammo = document.createElement("div");
    ammo.style.cssText = `font:9px 'Courier New',monospace;color:${active ? "#bfdbfe" : "#6b7280"};`;
    ammo.textContent = count === -1 ? "∞" : String(count);
    slot.appendChild(ammo);

    if (!depleted) {
      slot.onclick = () => this.room.send("select-weapon", { weaponId });
    }
    return slot;
  }

  private scroll(delta: number): void {
    const inv = this.room.state.tanks.get(this.room.sessionId)?.inventory;
    if (!inv) return;
    const visible = this.weaponOrder.filter((id) => inv.has(id));
    const max = Math.max(0, visible.length - 6);
    this.scrollOffset = Math.max(0, Math.min(max, this.scrollOffset + delta));
    const tank = this.room.state.tanks.get(this.room.sessionId);
    if (tank) this.render(tank.weaponId, tank.inventory);
  }

  private onKey = (e: KeyboardEvent): void => {
    const slot = parseInt(e.key, 10);
    if (isNaN(slot) || slot < 1 || slot > 6) return;
    const inv = this.room.state.tanks.get(this.room.sessionId)?.inventory;
    if (!inv) return;
    const visible = this.weaponOrder.filter((id) => inv.has(id));
    const id = visible[this.scrollOffset + slot - 1];
    if (!id) return;
    const count = inv.get(id) ?? 0;
    if (count !== 0) this.room.send("select-weapon", { weaponId: id });
  };

  private mkArrow(char: string): HTMLDivElement {
    const d = document.createElement("div");
    d.style.cssText =
      "width:22px;display:flex;align-items:center;justify-content:center;" +
      "color:#9ca3af;font-size:1.1rem;cursor:pointer;" +
      "border-right:1px solid rgba(255,255,255,0.08);visibility:hidden;";
    d.textContent = char;
    return d;
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKey);
    this.el.remove();
  }
}
```

- [ ] **Wire `WeaponBar` into `MatchScene.ts`:**

In the `MatchScene` constructor, add after `this.aim = new AimControls(room);`:

```ts
import { WeaponBar } from "../hud/WeaponBar";
// ...
this.weaponBar = new WeaponBar(room);
```

Add `private weaponBar!: WeaponBar;` to the class fields.

In `onFirstState`, inside the `$(state).tanks.onAdd` callback, add:

```ts
if (id === this.room.sessionId) {
  this.aim.setLocalTank(view);
  this.weaponBar.wire();   // inventory will be populated once match starts
}
```

(Remove the standalone `if (id === this.room.sessionId) this.aim.setLocalTank(view);` line since the block above replaces it.)

- [ ] **Run typecheck:**

```bash
pnpm -r typecheck
```

- [ ] **Commit:**

```bash
git add apps/client/src/hud/WeaponBar.ts apps/client/src/scenes/MatchScene.ts
git commit -m "feat(client): scrollable weapon toolbar with vector icons and 1-6 hotkeys"
```

---

## Task 13: Client — multi-trajectory playback

**Files:**
- Modify: `apps/client/src/scenes/MatchScene.ts`

- [ ] **Add `WEAPON_REGISTRY` import to `MatchScene.ts`:**

```ts
import { WEAPON_REGISTRY } from "@se/game";
```

- [ ] **Replace `onTrajectory` in `MatchScene`:**

```ts
private onTrajectory(msg: {
  samples: { x: number; y: number; t: number }[];
  splitAt: { x: number; y: number; t: number } | null;
  children: Array<{
    samples: { x: number; y: number; t: number }[];
    impact: { x: number; y: number } | null;
    durationMs: number;
    weaponId: string;
  }>;
  impact: { x: number; y: number } | null;
  weaponId: string;
  durationMs: number;
}) {
  const parentRadius = WEAPON_REGISTRY.get(msg.weaponId)?.radius ?? 20;

  const proj = new ProjectileAnim(msg.samples);
  this.world.addChild(proj);
  this.activeAnims.push(proj);

  if (msg.splitAt && msg.children.length > 0) {
    setTimeout(() => {
      for (const child of msg.children) {
        const cp = new ProjectileAnim(child.samples);
        this.world.addChild(cp);
        this.activeAnims.push(cp);
        if (child.impact) {
          const childRadius = WEAPON_REGISTRY.get(child.weaponId)?.radius ?? 15;
          const { x, y } = child.impact;
          setTimeout(() => {
            const ex = new Explosion(x, y, childRadius);
            this.world.addChild(ex);
            this.activeAnims.push(ex);
          }, child.durationMs);
        }
      }
    }, msg.splitAt.t);
  } else if (msg.impact) {
    const { x, y } = msg.impact;
    setTimeout(() => {
      const ex = new Explosion(x, y, parentRadius);
      this.world.addChild(ex);
      this.activeAnims.push(ex);
    }, msg.durationMs);
  }
}
```

- [ ] **Commit:**

```bash
git add apps/client/src/scenes/MatchScene.ts
git commit -m "feat(client): compound trajectory playback — fan out children at splitAt.t"
```

---

## Task 14: Client — loadout picker in AimControls

**Files:**
- Modify: `apps/client/src/input/AimControls.ts`

- [ ] **Add class fields to `AimControls`:**

```ts
private loadoutSection!: HTMLDivElement;
private loadoutBtns: HTMLButtonElement[] = [];
private loadoutDisplay!: HTMLDivElement;
```

- [ ] **Add loadout UI to `buildDOM` method** (at the end, before the closing `this.el.append(...)`):

Replace the final `this.el.append(angleSection, powerSection, actionSection);` with:

```ts
// Loadout section (host only, lobby phase)
this.loadoutSection = mkDiv(
  "pointer-events:auto;display:none;flex-direction:column;align-items:center;gap:4px;",
);
const loadoutTitle = mkLabel("LOADOUT");
this.loadoutBtns = (["starter", "standard", "bonanza"] as const).map((id, i) => {
  const btn = document.createElement("button");
  btn.textContent = (["STARTER", "STANDARD", "BONANZA"] as const)[i];
  btn.style.cssText =
    "padding:3px 8px;font:bold 9px 'Courier New',monospace;border-radius:4px;" +
    "border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.3);" +
    "color:#94a3b8;cursor:pointer;";
  btn.dataset.loadoutId = id;
  btn.onclick = () => {
    this.room.send("configure", { loadoutId: id });
    this.refreshLoadoutBtns(id);
  };
  return btn;
});
this.loadoutSection.append(loadoutTitle, ...this.loadoutBtns);

// Loadout display (non-host, lobby phase)
this.loadoutDisplay = mkDiv(
  "color:#94a3b8;font:9px 'Courier New',monospace;text-align:center;display:none;",
);

this.el.append(angleSection, powerSection, actionSection, this.loadoutSection, this.loadoutDisplay);
```

- [ ] **Add `refreshLoadoutBtns` helper method to `AimControls`:**

```ts
private refreshLoadoutBtns(activeId: string): void {
  for (const btn of this.loadoutBtns) {
    const active = btn.dataset.loadoutId === activeId;
    btn.style.background = active ? "rgba(37,99,235,0.6)" : "rgba(0,0,0,0.3)";
    btn.style.color = active ? "#93c5fd" : "#94a3b8";
    btn.style.borderColor = active ? "#3b82f6" : "rgba(255,255,255,0.2)";
  }
}
```

- [ ] **Update `refreshChrome` to show/hide loadout UI:**

Add at the end of the `if (inLobby)` block inside `refreshChrome`:

```ts
if (inLobby) {
  this.phaseEl.textContent = isHost ? "WAITING FOR PLAYERS" : "WAITING FOR HOST";
  this.loadoutSection.style.display = isHost ? "flex" : "none";
  this.loadoutDisplay.style.display = !isHost ? "block" : "none";
  if (isHost) this.refreshLoadoutBtns(this.room.state.loadoutId);
  if (!isHost) {
    const labels: Record<string, string> = { starter: "STARTER", standard: "STANDARD", bonanza: "BONANZA" };
    this.loadoutDisplay.textContent = "LOADOUT: " + (labels[this.room.state.loadoutId] ?? this.room.state.loadoutId.toUpperCase());
  }
} else {
  this.loadoutSection.style.display = "none";
  this.loadoutDisplay.style.display = "none";
}
```

- [ ] **Run typecheck:**

```bash
pnpm -r typecheck
```

- [ ] **Commit:**

```bash
git add apps/client/src/input/AimControls.ts
git commit -m "feat(client): host loadout picker (Starter/Standard/Bonanza) in lobby AimControls"
```

---

## Task 15: Full test run + typecheck

- [ ] **Run all unit + integration tests:**

```bash
pnpm -r test --run
```

Expected: all tests pass. Note any failures and fix before proceeding.

- [ ] **Run typecheck:**

```bash
pnpm -r typecheck
```

Expected: no errors.

- [ ] **Commit if any fixes were needed:**

```bash
git add -p && git commit -m "fix: typecheck and test cleanup for Phase 2"
```

---

## Task 16: E2E smoke tests

**Files:**
- Modify or extend existing Playwright spec (find with `find apps/client -name "*.spec.ts" -o -name "*.e2e.ts" | head`)

- [ ] **Find the existing E2E test file:**

```bash
find . -name "*.spec.ts" -not -path "*/node_modules/*"
```

- [ ] **Add Phase 2 E2E scenarios** to the existing spec file:

```ts
test("weapon bar shows 2 slots in Starter loadout", async ({ page }) => {
  // Start a match (reuse existing helper if available)
  // Host selects Starter loadout
  // Verify weapon bar has exactly 2 visible slots (Baby Missile, Missile)
});

test("firing Missile decrements ammo count from 5 to 4", async ({ page }) => {
  // Start a Standard match
  // Fire Missile
  // Verify slot shows ×4
});

test("pressing key 2 selects Missile slot", async ({ page }) => {
  // Start a Standard match (local player's turn)
  // Press key "2"
  // Verify Missile slot is highlighted
});
```

These tests should follow the same setup pattern as the existing Phase 1 E2E tests. Adapt to the actual test helpers already in place.

- [ ] **Run E2E tests:**

```bash
pnpm -r test:e2e
```

Expected: existing tests pass; new tests pass if implemented.

- [ ] **Commit:**

```bash
git add . && git commit -m "test(e2e): Phase 2 weapon bar and ammo smoke tests"
```

---

## Task 17: Update roadmap + changelog

- [ ] **In `docs/superpowers/specs/2026-05-22-roadmap.md`**, update Phase 2 row:

```
| 2 ✅ | **Damage & Weapon Variety** | ... Implemented 2026-05-25. | 2 wk | Phase 1 |
```

- [ ] **Append to `CHANGELOG.md`** (create if absent):

```md
## Phase 2 — 2026-05-25

- Added 5 new weapons: Missile, Baby Nuke, Nuke, Funky Bomb (8-way split), MIRV (5-way fan)
- Compound trajectory simulation: split weapons fan out children at apex
- Death explosion (radius 40, damage 30) with recursive chain-kill resolution
- Per-player inventory seeded from host-selected loadout (Starter / Standard / Bonanza)
- Scrollable weapon toolbar with smooth vector icons and 1–6 hotkeys
- Floating HP bars above tanks (green→yellow→red) + HP in PlayerList sidebar
- Host loadout picker in lobby; all players see current loadout selection
```

- [ ] **Commit:**

```bash
git add docs/ CHANGELOG.md
git commit -m "docs: mark Phase 2 implemented, update roadmap and changelog"
```

---

## Self-Review Checklist

Spec requirements mapped to tasks:

| Spec requirement | Task |
|---|---|
| 5 new weapon defs | 2, 4 |
| Compound split simulation | 3 |
| DEATH_EXPLOSION + chain kills | 2, 9 |
| Tank inventory + decrement | 7, 9 |
| Named loadout presets | 6 |
| MatchState.loadoutId | 7 |
| Server: seed inventory at match start | 8 |
| Server: select-weapon intent handler | 8 |
| Server: handleFire uses tank.weaponId | 9 |
| WEAPON_REGISTRY | 5 |
| HP bar above tanks (canvas) | 10 |
| HP in PlayerList sidebar | 11 |
| WeaponBar DOM component + hotkeys | 12 |
| Multi-trajectory playback | 13 |
| Lobby loadout picker | 14 |
| Tests: game package ≥90% | 2, 3, 4 |
| Tests: server chain kill integration | 9 |
| Tests: E2E smoke | 16 |
