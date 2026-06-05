# Terrain Mechanics: Dirt Deposit, Napalm Flames, Gravity Settling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement three missing terrain mechanics: client-side terrain deposit for dirt weapons, animated flame visuals for napalm burn zones, and gravity settling that redistributes soil after blasts.

**Architecture:** Features are built bottom-up: the shared `settleInPlace` algorithm first (Task 1), then rendering primitives (Tasks 2–3), then wiring into server and client gameplay loops (Tasks 4–6). Each task is independently testable and deployable. Server and client settling run the same deterministic algorithm from identical post-carve state — no extra broadcasts needed.

**Tech Stack:** TypeScript, PixiJS v8 (client rendering), Colyseus v0.16 (server/client state), Vitest (tests).

---

## Task 1: `settleInPlace` Algorithm

**Files:**
- Modify: `packages/game/src/terrain/carve.ts`
- Modify: `packages/game/src/terrain/carve.test.ts`

**Context:** `carve.ts` already exports `carveInPlace` and `carveCeilingInPlace`. This task adds `settleInPlace` alongside them. It's pure TypeScript with no PixiJS dependency — fully unit-testable.

- [ ] **Write failing tests** — add to `packages/game/src/terrain/carve.test.ts` at the bottom:

```ts
describe("settleInPlace", () => {
  it("does not modify flat terrain", () => {
    const t = flatTerrain(100, 400);
    const before = settleInPlace(t, 30, 70);
    expect(Array.from(t)).toEqual(Array.from(flatTerrain(100, 400)));
    // before snapshot matches original
    const lo = Math.max(0, 30 - 5);
    const hi = Math.min(99, 70 + 5);
    expect(before.length).toBe(hi - lo + 1);
  });

  it("settles a steep cliff-valley pair to within threshold", () => {
    // cliff at y=100 (high), valley at y=500 (low), adjacent columns
    const t = new Int16Array(100);
    for (let i = 0; i < 100; i++) t[i] = i < 50 ? 100 : 500;
    settleInPlace(t, 45, 55);
    // after settling, adjacent pair difference must be <= 80 (threshold)
    for (let x = 0; x < 99; x++) {
      expect(Math.abs((t[x] as number) - (t[x + 1] as number))).toBeLessThanOrEqual(81);
    }
  });

  it("returns a pre-settle snapshot covering [xMin-5 .. xMax+5]", () => {
    const t = new Int16Array(100);
    for (let i = 0; i < 100; i++) t[i] = i < 50 ? 100 : 500;
    const before = settleInPlace(t, 48, 52);
    const lo = Math.max(0, 48 - 5);
    const hi = Math.min(99, 52 + 5);
    expect(before.length).toBe(hi - lo + 1);
    // before[0] corresponds to terrain[lo] — which was 100 before settling
    expect(before[0]).toBe(100);
  });

  it("respects MAX_PASSES cap — terminates even on extreme input", () => {
    // 2-column terrain with a huge cliff; needs many passes
    const t = new Int16Array(10);
    t[0] = 0; t[1] = 900; // 900px diff
    for (let i = 2; i < 10; i++) t[i] = 900;
    // Should not throw or hang
    settleInPlace(t, 0, 1, { maxPasses: 5 });
    expect(true).toBe(true); // just verify it completes
  });

  it("handles right-to-left slope (right column is higher)", () => {
    const t = new Int16Array(100);
    for (let i = 0; i < 100; i++) t[i] = i >= 50 ? 100 : 500;
    settleInPlace(t, 45, 55);
    for (let x = 0; x < 99; x++) {
      expect(Math.abs((t[x] as number) - (t[x + 1] as number))).toBeLessThanOrEqual(81);
    }
  });
});
```

- [ ] **Run to confirm FAIL:**

```bash
pnpm --filter @se/game test -- --reporter=verbose 2>&1 | grep -E "PASS|FAIL|settleInPlace"
```

Expected: FAIL — `settleInPlace is not a function`.

- [ ] **Add `SettleOptions` interface and `settleInPlace` to `packages/game/src/terrain/carve.ts`** — append after `applyCarve`:

```ts
export interface SettleOptions {
  slopeThreshold?: number;
  maxPasses?: number;
}

/**
 * Redistributes terrain height after a blast. Scans adjacent column pairs;
 * when the height difference exceeds slopeThreshold, soil slides from the
 * higher column to the lower until equilibrium or maxPasses is reached.
 *
 * Screen coords: smaller y = higher on screen. "Higher column" = smaller y = cliff.
 * Sliding: cliff y increases (surface lowers), valley y decreases (surface rises).
 *
 * Returns snapshot of terrain[lo..hi] BEFORE settling (for DirtParticles comparison).
 */
export function settleInPlace(
  terrain: Int16Array,
  xMin: number,
  xMax: number,
  options: SettleOptions = {},
): Int16Array {
  const SLOPE_THRESHOLD = options.slopeThreshold ?? 80;
  const MAX_PASSES = options.maxPasses ?? 30;

  const lo = Math.max(0, xMin - 5);
  const hi = Math.min(terrain.length - 1, xMax + 5);

  const before = terrain.slice(lo, hi + 1);

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let anyChange = false;
    for (let x = lo; x < hi; x++) {
      const left = terrain[x] as number;
      const right = terrain[x + 1] as number;
      const diff = right - left;

      if (Math.abs(diff) > SLOPE_THRESHOLD) {
        const slide = Math.floor((Math.abs(diff) - SLOPE_THRESHOLD) / 2);
        if (slide === 0) continue;
        if (diff > 0) {
          terrain[x] = left + slide;
          terrain[x + 1] = right - slide;
        } else {
          terrain[x] = left - slide;
          terrain[x + 1] = right + slide;
        }
        anyChange = true;
      }
    }
    if (!anyChange) break;
  }

  return before;
}
```

- [ ] **Export `settleInPlace` from the game package index.** Open `packages/game/src/index.ts` and add `settleInPlace` and `SettleOptions` to whatever export line already exports `carveInPlace`:

```ts
export { carveInPlace, carveCeilingInPlace, applyCarve, settleInPlace } from "./terrain/carve";
export type { CarveOptions, SettleOptions } from "./terrain/carve";
```

- [ ] **Add `settleInPlace` to the test import** at the top of `carve.test.ts`:

```ts
import { carveInPlace, applyCarve, carveCeilingInPlace, settleInPlace } from "./carve";
```

- [ ] **Run tests to confirm PASS:**

```bash
pnpm --filter @se/game test -- --reporter=verbose 2>&1 | grep -E "PASS|FAIL|settleInPlace|carve"
```

Expected: all `settleInPlace` tests PASS, existing carve tests unchanged.

- [ ] **Commit:**

```bash
git add packages/game/src/terrain/carve.ts packages/game/src/terrain/carve.test.ts packages/game/src/index.ts
git commit -m "feat(game): add settleInPlace terrain gravity algorithm"
```

---

## Task 2: `DirtParticles` — Directional Particles

**Files:**
- Modify: `apps/client/src/render/DirtParticles.ts`

**Context:** `DirtParticles` currently always kicks particles upward (blast-style). Deposits raise terrain (`newY < oldY`) and settling fills valleys (`newY < oldY`). These should spawn particles falling downward from above, not blasting upward. The direction is determined by the sign of `newY - oldY`. No test needed — purely visual.

- [ ] **Read the current constructor loop** in `DirtParticles.ts` (lines 28–52). It uses `col.oldY` and `col.newY` to compute `drop = col.newY - col.oldY`. The particle start y is `col.oldY + random * drop * 0.4` and vy is always `-15 - random*25` (upward).

- [ ] **Replace the `vx`/`vy`/`startY` lines inside the per-column loop** with direction-aware code:

Find:
```ts
        // Start anywhere within the carved column band
        g.x = col.x + (Math.random() - 0.5) * 4;
        g.y = col.oldY + Math.random() * drop * 0.4;

        this.addChild(g);
        this.particles.push({
          g,
          vx: (Math.random() - 0.5) * 40,
          vy: -15 - Math.random() * 25, // small upward kick from blast
        });
```

Replace with:
```ts
        const isDeposit = col.newY < col.oldY; // surface raised = dirt landing
        const vyMagnitude = 15 + Math.random() * 25;
        g.x = col.x + (Math.random() - 0.5) * 4;
        g.y = isDeposit
          ? col.newY - Math.random() * 20        // deposit: start just above new surface
          : col.oldY + Math.random() * drop * 0.4; // carve: start in excavated band

        this.addChild(g);
        this.particles.push({
          g,
          vx: (Math.random() - 0.5) * 40,
          vy: isDeposit ? vyMagnitude * 0.5 : -vyMagnitude,
        });
```

- [ ] **Typecheck:**

```bash
pnpm --filter @se/client typecheck 2>&1 | grep -v "ReplayScene" | tail -5
```

Expected: no new errors.

- [ ] **Commit:**

```bash
git add apps/client/src/render/DirtParticles.ts
git commit -m "fix(render): DirtParticles direction-aware — deposit falls down, carve kicks up"
```

---

## Task 3: `TerrainRenderer.deposit()` + MatchScene Wire-up

**Files:**
- Modify: `apps/client/src/render/Terrain.ts`
- Modify: `apps/client/src/scenes/MatchScene.ts`

**Context:** The server broadcasts `terrain-deposited` with `{ centerX, shape }` whenever a dirt weapon lands. Currently the client only shows a temporary particle puff without updating `TerrainRenderer.heightmap`. This task adds the `deposit()` method and replaces the handler.

### Step 3a — Add `deposit()` to `TerrainRenderer`

- [ ] **Add `DepositShape` to the import line** at the top of `apps/client/src/render/Terrain.ts`:

Find:
```ts
import { generateTerrain, generateUnderside, generateCeiling, carveInPlace, carveCeilingInPlace } from "@se/game";
```

Replace with:
```ts
import { generateTerrain, generateUnderside, generateCeiling, carveInPlace, carveCeilingInPlace } from "@se/game";
import type { DepositShape } from "@se/game";
```

- [ ] **Add the `deposit()` method** to `TerrainRenderer` immediately after the `carve()` method (after line ~68, before `heightAt()`):

```ts
  deposit(centerX: number, shape: DepositShape): DirtParticles | null {
    const half = shape.halfWidth;
    const xMin = Math.max(0, Math.round(centerX - half));
    const xMax = Math.min(TERRAIN_WIDTH - 1, Math.round(centerX + half));

    // Snapshot pre-deposit heights
    const before = new Int16Array(xMax - xMin + 1);
    for (let i = xMin; i <= xMax; i++) before[i - xMin] = this.heightmap[i]!;

    // Raise terrain (mirrors tickLoop: lower y = higher on screen)
    for (let col = xMin; col <= xMax; col++) {
      const fraction = shape.spray
        ? Math.max(0, 1 - Math.abs(col - centerX) / half)
        : 1;
      const raise = Math.round(shape.height * fraction);
      this.heightmap[col] = Math.max(0, (this.heightmap[col] ?? 0) - raise);
    }

    this.redraw();

    const changed: Array<{ x: number; oldY: number; newY: number }> = [];
    for (let i = xMin; i <= xMax; i++) {
      const oldY = before[i - xMin]!;
      const newY = this.heightmap[i]!;
      if (newY !== oldY) changed.push({ x: i, oldY, newY });
    }

    return changed.length > 0 ? new DirtParticles(changed) : null;
  }
```

### Step 3b — Replace `terrain-deposited` handler in MatchScene

- [ ] **Open `apps/client/src/scenes/MatchScene.ts`**. Find the `terrain-deposited` handler (around line 160):

```ts
    room.onMessage("terrain-deposited", (msg: { centerX: number; shape: { halfWidth: number; height: number } }) => {
      const g = new Graphics();
      const baseY = this.terrain?.heightAt(msg.centerX) ?? 0;
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8;
        const dist = 20 + Math.random() * 20;
        const px = msg.centerX + Math.cos(angle) * dist;
        const py = baseY + Math.sin(angle) * dist * 0.5;
        g.circle(px, py, 4).fill({ color: 0x8b6914, alpha: 0.7 });
      }
      this.world.addChild(g);
      setTimeout(() => { g.destroy(); }, 300);
    });
```

Replace with:
```ts
    room.onMessage("terrain-deposited", (msg: {
      centerX: number;
      shape: { halfWidth: number; height: number; spray?: boolean };
    }) => {
      const particles = this.terrain?.deposit(msg.centerX, msg.shape);
      if (particles) {
        this.world.addChild(particles);
        this.activeAnims.push(particles);
      }
    });
```

- [ ] **Typecheck:**

```bash
pnpm --filter @se/client typecheck 2>&1 | grep -v "ReplayScene" | tail -5
```

Expected: no new errors.

- [ ] **Commit:**

```bash
git add apps/client/src/render/Terrain.ts apps/client/src/scenes/MatchScene.ts
git commit -m "fix(render): dirt-ball/liquid-dirt now updates client terrain heightmap on deposit"
```

---

## Task 4: Server Settling in `tickLoop.ts`

**Files:**
- Modify: `apps/server/src/rooms/tickLoop.ts`

**Context:** `tickLoop.ts` line 4 already imports `carveInPlace` from `@se/game`. After each `carveInPlace` call (there are 4 of them — floor impacts, mirv splits, etc.), we call `settleInPlace` on the same terrain array. The client will do the same in Task 5. Since both operate on the same post-carve heightmap with the same inputs, they stay in sync without any broadcast.

- [ ] **Add `settleInPlace` to the import** at line 4 of `apps/server/src/rooms/tickLoop.ts`:

Find:
```ts
  computeDamage, carveInPlace, carveCeilingInPlace,
```

Replace with:
```ts
  computeDamage, carveInPlace, carveCeilingInPlace, settleInPlace,
```

- [ ] **Add settling after each floor `carveInPlace` call.** There are multiple `carveInPlace(terrain, op, ...)` calls in `tickLoop.ts` (lines ~50, ~84, ~101, ~190). For each one that operates on the floor (not ceiling — ceiling uses `carveCeilingInPlace`), add a settling call immediately after. The pattern is:

For each occurrence of:
```ts
      carveInPlace(terrain, op, { terrainHeight: TERRAIN_HEIGHT });
```

Add immediately after:
```ts
      settleInPlace(terrain, op.x - op.radius, op.x + op.radius);
```

There should be 3–4 such floor carve calls. Search all of them:

```bash
grep -n "carveInPlace(terrain" /Users/valletta/dev/scorched-earth/apps/server/src/rooms/tickLoop.ts
```

Add the `settleInPlace` line after each. Do NOT add it after `carveCeilingInPlace` calls.

- [ ] **Run server tests:**

```bash
pnpm --filter @se/server test 2>&1 | tail -8
```

Expected: all tests pass (settling doesn't affect test outcomes since tests check damage/hp, not terrain state).

- [ ] **Commit:**

```bash
git add apps/server/src/rooms/tickLoop.ts
git commit -m "feat(server): apply terrain settling after every blast carve"
```

---

## Task 5: Client Settling in `TerrainRenderer.carve()`

**Files:**
- Modify: `apps/client/src/render/Terrain.ts`

**Context:** `TerrainRenderer.carve()` runs `carveInPlace`, then builds `changed` columns, then returns `DirtParticles`. This task inserts `settleInPlace` between the carve and the particle-building steps, and expands the `changed` array to include settling columns outside the original blast zone.

- [ ] **Add `settleInPlace` and `SettleOptions` to the `@se/game` import** at the top of `Terrain.ts`:

Find:
```ts
import { generateTerrain, generateUnderside, generateCeiling, carveInPlace, carveCeilingInPlace } from "@se/game";
```

Replace with:
```ts
import { generateTerrain, generateUnderside, generateCeiling, carveInPlace, carveCeilingInPlace, settleInPlace } from "@se/game";
```

- [ ] **Modify `carve()` to call `settleInPlace` and expand the `changed` array.** The current `carve()` method (around lines 43–68) looks like this after recent changes:

```ts
  carve(op: { x: number; y: number; radius: number; tick: number; layer?: string }): DirtParticles | null {
    const { x: cx, radius } = op;
    const xMin = Math.max(0, Math.floor(cx - radius));
    const xMax = Math.min(TERRAIN_WIDTH - 1, Math.ceil(cx + radius));
    const map = op.layer === "ceiling" && this.ceilingMap ? this.ceilingMap : this.heightmap;

    // Snapshot pre-carve heights for columns in the blast zone.
    const before = new Int16Array(xMax - xMin + 1);
    for (let i = xMin; i <= xMax; i++) before[i - xMin] = map[i]!;

    if (op.layer === "ceiling" && this.ceilingMap) {
      carveCeilingInPlace(this.ceilingMap, op);
    } else {
      carveInPlace(this.heightmap, op, { terrainHeight: TERRAIN_HEIGHT });
    }
    this.redraw();

    // Build the changed-column list for the dirt-particle burst (debris).
    const changed: Array<{ x: number; oldY: number; newY: number }> = [];
    for (let i = xMin; i <= xMax; i++) {
      const oldY = before[i - xMin]!;
      const newY = map[i]!;
      if (newY !== oldY) changed.push({ x: i, oldY, newY: Math.max(oldY, newY) });
    }

    return changed.length > 0 ? new DirtParticles(changed) : null;
  }
```

Replace the entire `carve()` method with:

```ts
  carve(op: { x: number; y: number; radius: number; tick: number; layer?: string }): DirtParticles | null {
    const { x: cx, radius } = op;
    const xMin = Math.max(0, Math.floor(cx - radius));
    const xMax = Math.min(TERRAIN_WIDTH - 1, Math.ceil(cx + radius));
    const map = op.layer === "ceiling" && this.ceilingMap ? this.ceilingMap : this.heightmap;

    // Snapshot pre-carve heights for blast zone.
    const before = new Int16Array(xMax - xMin + 1);
    for (let i = xMin; i <= xMax; i++) before[i - xMin] = map[i]!;

    if (op.layer === "ceiling" && this.ceilingMap) {
      carveCeilingInPlace(this.ceilingMap, op);
    } else {
      carveInPlace(this.heightmap, op, { terrainHeight: TERRAIN_HEIGHT });
    }

    // Apply gravity settling on floor carves only.
    // settleBefore captures terrain[lo..hi] AFTER carve but BEFORE settling.
    let settleBefore: Int16Array | null = null;
    let lo = xMin;
    let hi = xMax;
    if (!(op.layer === "ceiling" && this.ceilingMap)) {
      lo = Math.max(0, xMin - 5);
      hi = Math.min(TERRAIN_WIDTH - 1, xMax + 5);
      settleBefore = settleInPlace(this.heightmap, xMin, xMax);
    }

    this.redraw();

    // Build changed-column list (carve + settle) for DirtParticles.
    const changed: Array<{ x: number; oldY: number; newY: number }> = [];

    // Blast zone: compare against pre-carve snapshot
    for (let i = xMin; i <= xMax; i++) {
      const oldY = before[i - xMin]!;
      const newY = map[i]!;
      if (newY !== oldY) changed.push({ x: i, oldY, newY: Math.max(oldY, newY) });
    }

    // Outer settling columns (outside blast zone)
    if (settleBefore) {
      for (let i = lo; i < xMin; i++) {
        const oldY = settleBefore[i - lo]!;
        const newY = this.heightmap[i]!;
        if (newY !== oldY) changed.push({ x: i, oldY, newY });
      }
      for (let i = xMax + 1; i <= hi; i++) {
        const oldY = settleBefore[i - lo]!;
        const newY = this.heightmap[i]!;
        if (newY !== oldY) changed.push({ x: i, oldY, newY });
      }
    }

    return changed.length > 0 ? new DirtParticles(changed) : null;
  }
```

- [ ] **Typecheck:**

```bash
pnpm --filter @se/client typecheck 2>&1 | grep -v "ReplayScene" | tail -5
```

Expected: no new errors.

- [ ] **Run all tests:**

```bash
pnpm test 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Commit:**

```bash
git add apps/client/src/render/Terrain.ts
git commit -m "feat(render): terrain settles after blasts — soil slides down steep faces"
```

---

## Task 6: `BurnFlames` Component + MatchScene Wire-up

**Files:**
- Create: `apps/client/src/render/BurnFlames.ts`
- Modify: `apps/client/src/scenes/MatchScene.ts`

**Context:** When napalm/fireball creates a burn zone, the server sends `burn-zone-start` and the client shows a static orange tint. This task adds animated flame tongues that persist until the zone expires. The existing `activeAnims` array drives `tick()` every frame — but `BurnFlames.tick()` returns `false` forever, so flames must be explicitly removed when zones expire (the cleanup code handles this).

### Step 6a — Create `BurnFlames.ts`

- [ ] **Create `apps/client/src/render/BurnFlames.ts`** with the full implementation:

```ts
import { Container, Graphics } from "pixi.js";

const TONGUES_PER_100PX = 7;
const BASE_HEIGHT_MIN = 20;
const BASE_HEIGHT_MAX = 50;
const FLICKER_SPEED = 70;

interface Tongue {
  x: number;
  baseH: number;
  offset: number;
  width: number;
}

export class BurnFlames extends Container {
  private g: Graphics;
  private tongues: Tongue[] = [];
  private elapsed = 0;
  private getHeight: (x: number) => number;

  constructor(
    zoneX: number,
    zoneWidth: number,
    getTerrainHeight: (x: number) => number,
  ) {
    super();
    this.getHeight = getTerrainHeight;
    this.g = new Graphics();
    this.addChild(this.g);

    const count = Math.max(3, Math.round((zoneWidth / 100) * TONGUES_PER_100PX));
    for (let i = 0; i < count; i++) {
      const x = (zoneX - zoneWidth / 2) + Math.random() * zoneWidth;
      this.tongues.push({
        x,
        baseH: BASE_HEIGHT_MIN + Math.random() * (BASE_HEIGHT_MAX - BASE_HEIGHT_MIN),
        offset: Math.random() * Math.PI * 2,
        width: 6 + Math.random() * 8,
      });
    }
  }

  tick(): boolean {
    this.elapsed += 1000 / 60;
    this.g.clear();

    for (const t of this.tongues) {
      const flicker = 0.6 + 0.4 * Math.sin(this.elapsed / FLICKER_SPEED + t.offset);
      const h = t.baseH * flicker;
      const surfaceY = this.getHeight(t.x);
      const ty = surfaceY - h * 0.5;

      this.g.ellipse(t.x, ty, t.width * 0.5, h * 0.5)
        .fill({ color: 0xff4500, alpha: 0.75 });
      this.g.ellipse(t.x, ty + h * 0.1, t.width * 0.28, h * 0.32)
        .fill({ color: 0xffb000, alpha: 0.85 });
    }

    return false; // never self-terminates — caller must explicitly destroy
  }
}
```

### Step 6b — Wire into MatchScene

- [ ] **Add the import** to `apps/client/src/scenes/MatchScene.ts` after the other render imports (around line 14):

```ts
import { BurnFlames } from '../render/BurnFlames';
```

- [ ] **Add the `activeBurnFlames` field** to the `MatchScene` class fields section (around line 45, near `activeZones`):

```ts
  private activeBurnFlames: Map<string, BurnFlames> = new Map();
```

- [ ] **Replace the `burn-zone-start` handler** (around line 111). The entire handler including its closing `});` currently reads:

```ts
    room.onMessage("burn-zone-start", (msg: { x: number; width: number; turnsLeft: number }) => {
      this.activeZones.push({ kind: "burn-zone", x: msg.x, width: msg.width });
      this.terrain?.updateZones(this.activeZones);
      this.trajectoryOverlay?.setSmokeZones(this.activeZones.filter(z => z.kind === "smoke-zone"));
    });
```

Replace the entire block with:

```ts
    room.onMessage("burn-zone-start", (msg: { x: number; width: number; turnsLeft: number }) => {
      this.activeZones.push({ kind: "burn-zone", x: msg.x, width: msg.width });
      this.terrain?.updateZones(this.activeZones);
      this.trajectoryOverlay?.setSmokeZones(this.activeZones.filter(z => z.kind === "smoke-zone"));
      const key = `${msg.x}:${msg.width}`;
      if (!this.activeBurnFlames.has(key)) {
        const flames = new BurnFlames(msg.x, msg.width, (x) => this.terrain?.heightAt(x) ?? 0);
        this.world.addChild(flames);
        this.activeBurnFlames.set(key, flames);
        this.activeAnims.push(flames);
      }
    });
```

- [ ] **Add flame cleanup after the `pendingEffects` re-sync block** (around line 123). The current block ends with:

```ts
      this.terrain?.updateZones(this.activeZones);
      this.trajectoryOverlay?.setSmokeZones(this.activeZones.filter(z => z.kind === "smoke-zone"));
```

Add immediately after those two lines (still inside the same handler block):

```ts
      // Destroy flames for burn zones that have expired
      const liveKeys = new Set(
        this.activeZones.filter(z => z.kind === "burn-zone").map(z => `${z.x}:${z.width}`)
      );
      for (const [key, flames] of this.activeBurnFlames) {
        if (!liveKeys.has(key)) {
          const idx = this.activeAnims.indexOf(flames);
          if (idx >= 0) this.activeAnims.splice(idx, 1);
          flames.removeFromParent();
          flames.destroy();
          this.activeBurnFlames.delete(key);
        }
      }
```

- [ ] **Add round-start cleanup** in `onPhaseChange()` where `activeZones = []` is set (around line 403). Find:

```ts
      this.activeZones = [];
      this.terrain?.updateZones([]);
      this.trajectoryOverlay?.setSmokeZones([]);
```

Add immediately after those three lines:

```ts
      // Destroy all burn flames at round start
      for (const [, flames] of this.activeBurnFlames) {
        const idx = this.activeAnims.indexOf(flames);
        if (idx >= 0) this.activeAnims.splice(idx, 1);
        flames.removeFromParent();
        flames.destroy();
      }
      this.activeBurnFlames.clear();
```

- [ ] **Typecheck:**

```bash
pnpm --filter @se/client typecheck 2>&1 | grep -v "ReplayScene" | tail -5
```

Expected: no new errors.

- [ ] **Run all tests:**

```bash
pnpm test 2>&1 | tail -8
```

Expected: all pass.

- [ ] **Commit:**

```bash
git add apps/client/src/render/BurnFlames.ts apps/client/src/scenes/MatchScene.ts
git commit -m "feat(render): animated BurnFlames component for napalm burn zones"
```

---

## Final Verification

- [ ] **Run full test suite:**

```bash
pnpm test 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Start the game and verify manually:**

```bash
pnpm dev
```

Open http://127.0.0.1:5183. Verify:
1. Fire a dirt-ball into the terrain — terrain visibly rises at impact, dirt particles fall downward onto the new surface.
2. Fire a liquid-dirt — terrain raises with tapered edges (spray=true), particles fall.
3. Fire a napalm or hot-napalm shot — after explosion, animated flame tongues appear on the terrain surface and flicker until the end of the next turn.
4. Fire at the base of a steep cliff — terrain settles: the cliff face partially collapses, dirt particles appear sliding downward into the crater.
5. Fire on flat terrain — no settling occurs (only steep drops trigger it).
