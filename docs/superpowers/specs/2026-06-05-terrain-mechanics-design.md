# Terrain Mechanics: Dirt Deposit, Napalm Flames, Gravity Settling — Design Spec

**Date:** 2026-06-05  
**Status:** Approved

---

## Overview

Three missing gameplay mechanics, all terrain-related but independently implementable:

1. **Dirt Deposit Client Sync** — server raises terrain on dirt-ball/liquid-dirt impact but client `TerrainRenderer` never updates its heightmap; fix is a `deposit()` method + message handler wire-up.
2. **Napalm Persistent Flame Visual** — burn zones show only a static orange tint; replace with an animated `BurnFlames` component that lives for the zone's duration.
3. **Terrain Gravity / Settling** — after a blast, steep post-carve drops trigger a settling pass that redistributes soil, with dirt particles showing the collapse.

---

## 1. Dirt Deposit Client Sync

### Root Cause

`tickLoop.ts` handles `terrain-deposit` events by lowering `terrain[col]` (raising the surface) and broadcasting `terrain-deposited`. The client `MatchScene` receives `terrain-deposited` but only spawns a short particle puff — `TerrainRenderer.heightmap` is never modified. Server and client terrain diverge immediately.

### Data Contract

Current broadcast shape in `tickLoop.ts`:
```ts
broadcast("terrain-deposited", { centerX, shape });
// shape is DepositShape: { halfWidth: number; height: number; spray?: boolean }
```
`spray` is already included via the `shape` object — no broadcast change needed.

### `TerrainRenderer.deposit()` — new method

**File:** `apps/client/src/render/Terrain.ts`

```ts
deposit(centerX: number, shape: DepositShape): DirtParticles | null {
  const half = shape.halfWidth;
  const xMin = Math.max(0, Math.round(centerX - half));
  const xMax = Math.min(TERRAIN_WIDTH - 1, Math.round(centerX + half));

  // Snapshot pre-deposit heights
  const before = new Int16Array(xMax - xMin + 1);
  for (let i = xMin; i <= xMax; i++) before[i - xMin] = this.heightmap[i]!;

  // Apply deposit (mirrors tickLoop algorithm exactly)
  for (let col = xMin; col <= xMax; col++) {
    const fraction = shape.spray
      ? Math.max(0, 1 - Math.abs(col - centerX) / half)
      : 1;
    const raise = Math.round(shape.height * fraction);
    this.heightmap[col] = Math.max(0, (this.heightmap[col] ?? 0) - raise);
  }

  this.redraw();

  // Build changed-column list for particles
  const changed: Array<{ x: number; oldY: number; newY: number }> = [];
  for (let i = xMin; i <= xMax; i++) {
    const oldY = before[i - xMin]!;
    const newY = this.heightmap[i]!;
    if (newY !== oldY) changed.push({ x: i, oldY, newY });
  }

  return changed.length > 0 ? new DirtParticles(changed) : null;
}
```

`DepositShape` must be imported from `@se/game` (it's already exported from `packages/game/src/types.ts`).

### `DirtParticles` — directional particles

`DirtParticles` currently always kicks particles upward (`vy: -15 - random*25`). When `newY < oldY` (terrain raised = deposit), particles should fall downward to simulate dirt landing. Distinguish by sign:

**File:** `apps/client/src/render/DirtParticles.ts`

In the constructor, for each `col`:
```ts
const isDeposit = col.newY < col.oldY;  // surface raised = deposit
const vyMagnitude = 15 + Math.random() * 25;
// deposit: particles fall from above; carve: particles kick upward
const vy = isDeposit ? vyMagnitude * 0.5 : -vyMagnitude;
const startY = isDeposit ? col.newY - Math.random() * 20 : col.oldY + Math.random() * drop * 0.4;
```

### MatchScene wiring

**File:** `apps/client/src/scenes/MatchScene.ts`

Replace the existing `terrain-deposited` handler body:
```ts
room.onMessage("terrain-deposited", (msg: {
  centerX: number;
  shape: { halfWidth: number; height: number; spray?: boolean }
}) => {
  const particles = this.terrain?.deposit(msg.centerX, msg.shape);
  if (particles) {
    this.world.addChild(particles);
    this.activeAnims.push(particles);
  }
});
```

The old handler showed only particle effects without updating the heightmap. The new handler calls `deposit()` which updates, redraws, AND returns particles.

### Edge Cases

- `deposit()` called before terrain is initialized: safe — `TERRAIN_WIDTH` constants are used for bounds.
- Deposit raises surface above 0 (out of bounds): `Math.max(0, ...)` clamp handles this.
- Multiple simultaneous deposits in the same turn: each broadcast triggers a separate `deposit()` call; deterministic ordering matches server.

---

## 2. Napalm Persistent Flame Visual

### Problem

Burn zones register as an orange color overlay on terrain via `TerrainRenderer.updateZones()`. There is no animated fire to communicate "this area is actively burning." The mechanical damage over turns works correctly — only the visual is missing.

### New Component: `BurnFlames`

**File:** `apps/client/src/render/BurnFlames.ts`

```ts
import { Container, Graphics } from "pixi.js";

const TONGUES_PER_100PX = 7;        // flame density
const BASE_HEIGHT_MIN = 20;         // px
const BASE_HEIGHT_MAX = 50;         // px
const FLICKER_SPEED = 70;           // ms per cycle (lower = faster)

interface Tongue {
  x: number;
  baseH: number;
  offset: number;      // phase offset for flicker (radians)
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

      // Outer orange tongue
      this.g.ellipse(t.x, ty, t.width * 0.5, h * 0.5)
        .fill({ color: 0xff4500, alpha: 0.75 });

      // Inner yellow core (brighter, narrower)
      this.g.ellipse(t.x, ty + h * 0.1, t.width * 0.28, h * 0.32)
        .fill({ color: 0xffb000, alpha: 0.85 });
    }

    return false; // never self-terminates
  }
}
```

**Visual summary:** Each tongue is a vertically-oriented ellipse pair (orange outer, yellow inner) sitting at the terrain surface, with height flickering via a sine wave at offset phases so adjacent tongues don't pulse in sync.

### Zone Lifetime

The client tracks zone lifetime indirectly: the existing `tick` broadcast handler in MatchScene re-reads `room.state.pendingEffects` on each tick and rebuilds `activeZones`. When an effect's `turnsLeft` reaches 0 on the server, it drops out of `pendingEffects` and disappears from the client's rebuilt `activeZones` list.

### MatchScene wiring

**File:** `apps/client/src/scenes/MatchScene.ts`

**New field:**
```ts
private activeBurnFlames: Map<string, BurnFlames> = new Map();
```

Key format: `"${x}:${width}"` (matches the zone's identity).

**`burn-zone-start` handler** — create and register:
```ts
room.onMessage("burn-zone-start", (msg: { x: number; width: number; turnsLeft: number }) => {
  this.activeZones.push({ kind: "burn-zone", x: msg.x, width: msg.width });
  this.terrain?.updateZones(this.activeZones);
  // Create persistent flame visual
  const key = `${msg.x}:${msg.width}`;
  if (!this.activeBurnFlames.has(key)) {
    const flames = new BurnFlames(msg.x, msg.width, (x) => this.terrain?.heightAt(x) ?? 0);
    this.world.addChild(flames);
    this.activeBurnFlames.set(key, flames);
    this.activeAnims.push(flames);  // tick() called every frame via activeAnims
  }
});
```

**Zone re-sync (existing `tick` handler around line 123)** — after rebuilding `activeZones` from `pendingEffects`, destroy flames for zones no longer present:
```ts
// After: this.activeZones = Array.from(this.room.state.pendingEffects.values()).map(...)
const liveKeys = new Set(this.activeZones.filter(z => z.kind === "burn-zone").map(z => `${z.x}:${z.width}`));
for (const [key, flames] of this.activeBurnFlames) {
  if (!liveKeys.has(key)) {
    flames.destroy();
    this.activeBurnFlames.delete(key);
    // Remove from activeAnims
    const idx = this.activeAnims.indexOf(flames);
    if (idx >= 0) this.activeAnims.splice(idx, 1);
  }
}
```

**Round start cleanup** (around line 403 where `activeZones = []`):
```ts
for (const flames of this.activeBurnFlames.values()) {
  flames.destroy();
  const idx = this.activeAnims.indexOf(flames);
  if (idx >= 0) this.activeAnims.splice(idx, 1);
}
this.activeBurnFlames.clear();
```

### Edge Cases

- Two napalm shots create overlapping zones at identical `x:width`: `has(key)` guard prevents duplicate flames.
- Terrain changes under a burn zone (further blasts carve the surface): `getTerrainHeight` is a live closure — flame tongues always sit at current surface height.
- `BurnFlames.tick()` returns `false` forever — must be explicitly removed from `activeAnims`; the zone cleanup above handles this.

---

## 3. Terrain Gravity / Settling

### Problem

After `carveInPlace` removes terrain, adjacent columns can have steep drops (e.g., a 300px difference between a cliff and a crater). The original Scorched Earth settles terrain post-blast: unsupported soil slides down steep faces until the slope is within the angle of repose.

### Algorithm: `settleInPlace`

**File:** `packages/game/src/terrain/carve.ts` — new export

```ts
export interface SettleOptions {
  slopeThreshold?: number;  // max allowed height diff between adjacent cols (default: 80)
  maxPasses?: number;       // safety cap on iterations (default: 30)
}

/**
 * Redistributes terrain height after a blast. Scans adjacent column pairs;
 * when the height difference exceeds slopeThreshold, soil slides from the
 * higher column to the lower until equilibrium or maxPasses is reached.
 *
 * Screen coordinates: smaller y = higher on screen = taller terrain.
 * "Higher column" = smaller y value = the cliff side.
 * "Sliding" = cliff column's y increases (surface lowers) + valley column's y decreases (surface rises).
 *
 * Returns snapshot of terrain BEFORE settling (for DirtParticles comparison).
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

  // Snapshot before settling for DirtParticles
  const before = terrain.slice(lo, hi + 1);

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let anyChange = false;
    for (let x = lo; x < hi; x++) {
      const left = terrain[x] as number;   // smaller y = higher cliff
      const right = terrain[x + 1] as number;
      const diff = right - left;           // positive = right is lower (valley)

      if (Math.abs(diff) > SLOPE_THRESHOLD) {
        const slide = Math.floor((Math.abs(diff) - SLOPE_THRESHOLD) / 2);
        if (slide === 0) continue;
        if (diff > 0) {
          // Left is higher cliff, right is lower valley → soil slides right
          terrain[x] = left + slide;           // cliff surface lowers (y increases)
          terrain[x + 1] = right - slide;      // valley fills (y decreases)
        } else {
          // Right is higher cliff, left is lower valley → soil slides left
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

**Slope threshold rationale:** At `SLOPE_THRESHOLD = 80`, a column difference of 80px (about 5° slope at game scale) doesn't settle. Only abrupt blast-created drops trigger cascades. Natural terrain hills (generated with octave noise) have per-column differences of 1–10px and are unaffected.

### Server Integration

**File:** `apps/server/src/rooms/tickLoop.ts`

In the carve op handler, after `carveInPlace(terrain, op)`:
```ts
import { carveInPlace, settleInPlace } from "@se/game";

// existing:
carveInPlace(terrain, op, { terrainHeight: TERRAIN_HEIGHT });
state.terrainOps.push(op);
state.terrainVersion++;

// NEW — settling pass:
settleInPlace(terrain, op.x - op.radius, op.x + op.radius);
// terrainVersion already incremented; no extra push needed since client settles too
```

### Client Integration

**File:** `apps/client/src/render/Terrain.ts`

In `carve()`, `xMin` and `xMax` are already declared at the top of the method (lines ~45-46 in the current file). `before` is the existing `Int16Array` snapshot taken before `carveInPlace` (offset: `i - xMin`). Insert the following **between** the `carveInPlace` call and the existing `this.redraw()` call:

```ts
// Settle the heightmap (mirrors server-side settling for deterministic sync).
// settleInPlace returns a snapshot of terrain[lo..hi] AFTER carve but BEFORE settling.
const lo = Math.max(0, xMin - 5);
const hi = Math.min(TERRAIN_WIDTH - 1, xMax + 5);
const settleBefore = settleInPlace(this.heightmap, xMin, xMax);
// (xMin, xMax are already defined above; do NOT redeclare)
```

Then **replace** the existing `changed` array construction (which was the single loop over `[xMin, xMax]`) with:

```ts
const changed: Array<{ x: number; oldY: number; newY: number }> = [];

// Blast zone: compare against pre-carve snapshot (before), captures full carve+settle delta
for (let i = xMin; i <= xMax; i++) {
  const oldY = before[i - xMin]!;       // pre-carve height
  const newY = this.heightmap[i]!;      // post-settle height
  if (newY !== oldY) changed.push({ x: i, oldY, newY: Math.max(oldY, newY) });
}
// Outer settling columns: compare against post-carve/pre-settle snapshot (settleBefore)
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
```

`settleInPlace` must be imported from `@se/game` alongside `carveInPlace`.

### Deterministic Sync

Both server and client apply `settleInPlace` with identical inputs (same post-carve heightmap, same blast bounds, same default options). Since the algorithm is pure and deterministic, the results are identical — no schema changes or additional broadcasts required.

### `DirtParticles` — settling particles

Settling changes are included in the `changed` array. The existing direction logic introduced in Feature 1:
- `newY > oldY` (surface lowered = cliff collapsed) → upward kick (blast-style)
- `newY < oldY` (surface raised = valley filled by sliding soil) → gentle downward fall

This produces the visual effect of cliff soil tumbling down into the crater.

### Edge Cases

- Settling of non-blast terrain ops (ceiling carves): ceiling carves use `carveCeilingInPlace` not `carveInPlace` — no settling needed since ceiling physics are independent.
- Settling cascades beyond MAX_PASSES (30): the algorithm caps and leaves a non-equilibrium state, which is acceptable for gameplay — very large collapses partially settle per blast.
- `settleInPlace` called with xMin > xMax: `lo`/`hi` clamping handles degenerate input.
- Settling raises a column to negative y: impossible since `slide = floor((diff - THRESHOLD) / 2)` and `diff` must exceed 80px — no column can be raised more than it was originally set.

---

## File Change Index

| File | Feature | Change |
|---|---|---|
| `packages/game/src/terrain/carve.ts` | §3 | Add `settleInPlace` export |
| `packages/game/src/terrain/carve.test.ts` | §3 | Add settling tests |
| `apps/client/src/render/Terrain.ts` | §1, §3 | Add `deposit()` method; call `settleInPlace` in `carve()` |
| `apps/client/src/render/DirtParticles.ts` | §1, §3 | Direction-aware particles (deposit vs. carve) |
| `apps/client/src/render/BurnFlames.ts` | §2 | New component (create file) |
| `apps/client/src/scenes/MatchScene.ts` | §1, §2 | Wire `terrain-deposited`; add flame lifecycle |
| `apps/server/src/rooms/tickLoop.ts` | §3 | Call `settleInPlace` after each carve op |

---

## Testing Notes

- `settleInPlace`: test that a 200px cliff-valley pair settles to within threshold; test flat terrain is unchanged; test MAX_PASSES cap stops infinite loops.
- `TerrainRenderer.deposit()`: unit-testable if jsdom is available (same setup as `TurnHud.test.ts`).
- `DirtParticles` directional behavior: visual only, no automated test needed.
- `BurnFlames` lifecycle: no automated test; verify manually with napalm shot.
