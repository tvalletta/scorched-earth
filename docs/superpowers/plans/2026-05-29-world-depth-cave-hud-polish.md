# World Depth, Caves, HUD Consolidation & Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate to one polished bottom HUD, fix MIRV to a flat fan, extend the cage to full shoot-height, make the sky seam-free, give the floating island an organic drop-off underside, and add a dual-heightmap terrain model that powers carveable caves for absorb mode — all matching the existing dark-navy arcade look with unchanged gameplay feel.

**Architecture:** Terrain gains an optional `ceiling` heightmap (solid `y ≤ ceiling[x]`) beside the existing `floor` (solid `y ≥ floor[x]`); physics, carving, rendering, and sync all branch on its presence, defaulting to today's behavior when absent. The HUD collapses to a single enriched `HudBar` + `PlayerStrip`. Pure logic (MIRV, collision, carve, cave-gen) is unit-tested; rendering/HUD verified via Playwright.

**Tech Stack:** TypeScript, PixiJS 8, colyseus.js 0.16, @colyseus/schema, vitest (node, DOM stubbed), Playwright MCP.

**Spec:** `docs/superpowers/specs/2026-05-29-world-depth-cave-hud-polish-design.md`

**Cross-cutting:** Match the existing aesthetic (orange `#ff8c00`, dark navy panels, cartoon terrain palette, time-of-day skies). No rough/half-styled UI. Per-package gates: `pnpm --filter @se/<pkg> test|typecheck`. Known pre-existing typecheck failures (game decorators, server @sentry, ReplayScene) are not regressions — gate on tests + the files you touch.

---

## File Structure

**Shared** — `schema/MatchState.ts` (+`hasCeiling`,`ceilingSeed`), `schema/CarveOp.ts` (+`layer`), `constants.ts` (cave constants).
**Game** — `terrain/generate.ts` (+`generateCeiling`, underside helper), `terrain/carve.ts` (+`carveCeilingInPlace`), `physics/step.ts` & `physics/simulate.ts` (ceiling collision), `weapons/mirv.ts` & `physics/step.ts` (flat MIRV). Tests beside each.
**Server** — `rooms/MatchRoom.ts` (cave gen + ceiling carve), `rooms/placement.ts` (cave slots), `rooms/ReplayRecorder.ts` (cave fields).
**Client** — `hud/HudBar.ts` (single HUD), `hud/PlayerStrip.ts` (restyle), `scenes/MatchScene.ts` (remove old HUD, wire ceiling/cage/sky), `render/Terrain.ts` (dual heightmap + organic underside), `render/Sky.ts` (seam-free), `render/Cage.ts` (full height). **Delete** `input/AimControls.ts`, `hud/WeaponBar.ts`, `hud/PlayerList.ts`, `hud/WindArrow.ts`, `hud/TurnTimer.ts`, `hud/RoundInfo.ts`.

---

## Task 1: MIRV flat horizontal spread

**Files:** Modify `packages/game/src/physics/step.ts` (`spawnMirvChildren`), `packages/game/src/weapons/mirv.ts`. Test: find the existing MIRV split test (`grep -rl "mirv\|split" packages/game/src/physics/*.test.ts`) — likely `step-new-mechanics.test.ts` or `simulate-split.test.ts`; add/adjust there.

- [ ] **Step 1: Write the failing test** (in the located split test file)

```typescript
import { stepProjectiles } from "./step";
import { MIRV } from "../weapons/mirv";
// Build a MIRV projectile at apex (prevVy<0 → vy>=0). Easiest: place it rising then crossing apex.
it("MIRV splits into a flat symmetric horizontal fan", () => {
  const terrain = new Int16Array(1600).fill(500);
  const p = { id: "m", x: 800, y: 100, vx: 0, vy: 0, weapon: MIRV, ownerId: "a", apexReached: false };
  // First step crosses apex (vy goes 0 -> +) triggering the split.
  const r = stepProjectiles({ terrain, terrainWidth: 1600, terrainHeight: 900, wind: 0, gravity: 250, dt: 1/60, wallMode: "none", projectiles: [p], tanks: [] });
  const kids = r.spawned;
  expect(kids.length).toBe(5);
  const vxs = kids.map(k => k.vx).sort((a, b) => a - b);
  expect(vxs[0]!).toBeLessThan(0);                 // leftmost goes left
  expect(vxs[vxs.length - 1]!).toBeGreaterThan(0); // rightmost goes right
  // roughly symmetric
  expect(Math.abs(vxs[0]! + vxs[vxs.length - 1]!)).toBeLessThan(40);
  // all have slight upward lift at burst (vy <= 0 in screen space)
  expect(kids.every(k => k.vy <= 0)).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @se/game test` → FAIL (current downward cluster: vy>0, not symmetric).

- [ ] **Step 3: Implement flat spread** — replace the per-child velocity math in `spawnMirvChildren` (`packages/game/src/physics/step.ts`):

```typescript
const LIFT = 60;
for (let i = 0; i < split.count; i++) {
  const frac = split.count === 1 ? 0.5 : i / (split.count - 1); // 0..1
  const ejVx = (-1 + 2 * frac) * split.ejectionSpeed + (split.inheritVelocity ? parent.vx : 0);
  const ejVy = -LIFT + (split.inheritVelocity ? parent.vy * 0.3 : 0);
  children.push({ id: `${parent.id}-child-${i}`, x, y, vx: ejVx, vy: ejVy, weapon: split.child, ownerId: parent.ownerId, apexReached: false });
}
return children;
```

(Leave the 360° `spreadDeg>=360` branch for other weapons intact — only change the default fan branch, or gate on the weapon: simplest is to make this the default branch and keep the `>=360` ring branch above it.)

In `weapons/mirv.ts` set `ejectionSpeed: 260` (keep `count:5`, `inheritVelocity:true`, `trigger:"apex"`).

- [ ] **Step 4: Run to verify pass** — `pnpm --filter @se/game test` → PASS (189+1).

- [ ] **Step 5: Commit** — `git add packages/game && git commit -m "feat(physics): MIRV bursts into a flat horizontal fan"`

---

## Task 2: Cage extended to full shoot-height

**Files:** Modify `apps/client/src/scenes/MatchScene.ts` (the `wallMode` listener that calls `this.cage.update(mode)`), import `PLAY_CEILING_Y`, `PLAY_FLOOR_MARGIN`, `TERRAIN_HEIGHT` from `@se/shared`.

- [ ] **Step 1: Pass the full span to the cage**

In the `$(state).listen("wallMode", …)` callback, change `this.cage.update(mode)` to:
```typescript
this.cage.update(mode, PLAY_CEILING_Y, TERRAIN_HEIGHT + PLAY_FLOOR_MARGIN);
```
Add the imports to the existing `@se/shared` import line.

- [ ] **Step 2: Typecheck** — `pnpm --filter @se/client typecheck` → only pre-existing errors.

- [ ] **Step 3: Commit** — `git add apps/client/src/scenes/MatchScene.ts && git commit -m "feat(client): cage spans full shoot-height"`

(Visual confirmation happens in Task 9.)

---

## Task 3: Seam-free, resizable sky

**Files:** Modify `apps/client/src/render/Sky.ts`, `apps/client/src/scenes/MatchScene.ts` (resize hook).

- [ ] **Step 1: Widen the span and tile hills**

In `Sky.ts`, introduce a span constant and use it everywhere `viewW * 2` appears:
```typescript
// wide enough that max parallax shift never exposes an end
const SPAN_MULT = 4;
// in buildLayers: const SPAN = Math.max(this.viewW, 1600) * SPAN_MULT;
```
- Build the gradient rects, cloud x-positions, and hill polygons across `SPAN`, **centered**: offset everything by `-SPAN/2 + viewW/2` so x=0 sits mid-span. Equivalent: draw from `-SPAN/2` to `+SPAN/2` and let parallax shift stay within bounds.
- Hills: extend `STEPS` so the bump pattern covers `SPAN` continuously (no end visible) and continue the silhouette to the full span width; fill down to `viewH * 1.5` (well below the island base) so vertical pans never reveal a hard bottom.
- Gradient: extend the solid `bottom` fill down to `viewH * 1.5` and the band up to `-viewH * 0.5`.

- [ ] **Step 2: Add resize support**

Add `resize(viewW, viewH)` to `SkyRenderer` that updates `this.viewW/viewH`, clears children/layers, and calls `buildLayers(this.currentTod)` (store `currentTod` in the ctor). In `MatchScene`, in the existing `window.addEventListener('resize', …)` handler, also call `this.sky?.resize(window.innerWidth, window.innerHeight)`.

- [ ] **Step 3: Typecheck** — `pnpm --filter @se/client typecheck` → clean (touched files).

- [ ] **Step 4: Commit** — `git add apps/client/src/render/Sky.ts apps/client/src/scenes/MatchScene.ts && git commit -m "feat(client): seam-free, resizable parallax sky"`

(Pan verification in Task 9.)

---

## Task 4: HUD consolidation — single bottom HUD

**Files:** Rewrite/extend `apps/client/src/hud/HudBar.ts`; restyle `apps/client/src/hud/PlayerStrip.ts`; edit `apps/client/src/scenes/MatchScene.ts` (remove old HUD wiring); delete `input/AimControls.ts`, `hud/WeaponBar.ts`, `hud/PlayerList.ts`, `hud/WindArrow.ts`, `hud/TurnTimer.ts`, `hud/RoundInfo.ts`. Add `WeaponDef.displayName?` to `packages/game/src/types.ts` and set names in the weapon defs (or humanize ids in the HUD).

- [ ] **Step 1: Port drive + add wind/round to HudBar**

In `HudBar.ts`:
- Add fields `private maxFuel = 0; private driveHeld; private driveInterval` and methods `setDriveMode(fuel,maxFuel)`, `updateFuel(fuel)`, `setLocalTank(view)` ported from `AimControls` (the `move` send loop on A/D, fuel readout). Add a small inline `FUEL` element shown only when `fuel>0`.
- Add `updateWindRound(state)` that fills a new inline status block: WIND arrow+value, `ROUND r/N`, `terrain · wall` label. Style with the existing muted-label look.
- Enlarge: bar height `104px`; dial `76px` with `0/90/180` ticks and a larger `NN°` readout; power bar `76px` with a `0–1000` scale and large `NNN`; FIRE `64px` tall.

- [ ] **Step 2: Weapon carousel — real names, always-show-selected**

- Carousel chips show `displayName` (fallback: humanize id — `baby-missile`→`Baby Missile`) and ammo `×N`/`∞`.
- Default selection = `baby-missile` (infinite); ensure the selected weapon always renders highlighted even when its ammo is 0 and even if inventory is otherwise empty.

- [ ] **Step 3: Rewire MatchScene to the single HUD**

In `MatchScene.ts`:
- Remove construction + update + listener calls for `WindArrow`, `TurnTimer`, `PlayerList`, `AimControls`, `WeaponBar`, `RoundInfo`. Remove their imports and fields.
- Route what they did to the HUD: in `onTick` call `hudBar.update(state)`, `hudBar.updateTimer(state.turnDeadlineMs)`, `hudBar.updateWindRound(state)`. In `tanks.onAdd` for the local tank, call `hudBar.setLocalTank(view)`; on `fuel` change call `hudBar.updateFuel`; on `currentTurnPlayerId` call `hudBar.setDriveMode(...)`. The trajectory overlay uses `hudBar.setAimChangeCallback` (already present).
- Cage/terrain/round-label: fold the former `RoundInfo.update` into `hudBar.updateWindRound`.

- [ ] **Step 4: Delete the dead components**

`git rm apps/client/src/input/AimControls.ts apps/client/src/hud/WeaponBar.ts apps/client/src/hud/PlayerList.ts apps/client/src/hud/WindArrow.ts apps/client/src/hud/TurnTimer.ts apps/client/src/hud/RoundInfo.ts`. Fix any remaining imports.

- [ ] **Step 5: Typecheck + tests** — `pnpm --filter @se/client typecheck && pnpm --filter @se/client test` → green (touched files clean; existing client tests pass).

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(client): consolidate to a single enlarged bottom HUD; remove old HUD components"`

---

## Task 5: Organic, drop-off island underside

**Files:** Add `generateUnderside` to `packages/game/src/terrain/generate.ts` (export); rewrite `TerrainRenderer.drawUnderside` in `apps/client/src/render/Terrain.ts`. Test: `packages/game/src/terrain/generate.test.ts` (or beside it).

- [ ] **Step 1: Failing test for underside generator**

```typescript
import { generateUnderside } from "./generate";
it("generateUnderside returns organic bottom below the surface with edges plunging", () => {
  const W = 1600;
  const u = generateUnderside("seed-1", W, 500); // avgSurface = 500
  expect(u.length).toBe(W);
  // everywhere below the reference surface
  for (let x = 0; x < W; x++) expect(u[x]!).toBeGreaterThan(500);
  // edges plunge deeper than the middle's minimum (drop off the face)
  const edge = Math.max(u[5]!, u[W - 6]!);
  const midMin = Math.min(...Array.from(u.slice(W * 0.4, W * 0.6)));
  expect(edge).toBeGreaterThan(midMin - 1); // edges are not shallower than mid valleys
});
```

- [ ] **Step 2: Run → fail** (`generateUnderside` undefined).

- [ ] **Step 3: Implement `generateUnderside`** — reuse `buildOctave`/`lerp`/`smoothstep` already in the file:

```typescript
export function generateUnderside(seed: string, width: number, avgSurface: number): Int16Array {
  const o1 = buildOctave(seed + "-u1", 220, width);
  const o2 = buildOctave(seed + "-u2", 90, width);
  const o3 = buildOctave(seed + "-u3", 40, width);
  const out = new Int16Array(width);
  const baseDepth = 300, amp = 120;
  for (let x = 0; x < width; x++) {
    const t = x / (width - 1);
    const noise = (o1[x] as number) * 0.6 + (o2[x] as number) * 0.3 + (o3[x] as number) * 0.1;
    // edges plunge: add a U-shaped term that grows toward x=0 and x=W
    const edge = Math.pow(Math.abs(t - 0.5) * 2, 2.2) * 260;
    out[x] = Math.round(avgSurface + baseDepth + noise * amp + edge);
  }
  return out;
}
```

- [ ] **Step 4: Run → pass.**

- [ ] **Step 5: Rewrite `TerrainRenderer.drawUnderside`** to use `generateUnderside(this.seed, TERRAIN_WIDTH, avgSurface)` for the bottom profile (replacing the bell curve), keep the body/shadow/stalactite/rim layering (stalactites seeded at the noise lows). Edges now curl down via the generator's `edge` term, so the side silhouette plunges instead of a straight cut.

- [ ] **Step 6: Typecheck game+client** — `pnpm --filter @se/game test && pnpm --filter @se/client typecheck` → green.

- [ ] **Step 7: Commit** — `git add packages/game apps/client/src/render/Terrain.ts && git commit -m "feat(client): organic island underside that plunges at the edges"`

(Visual check in Task 9.)

---

## Task 6: Dual-heightmap — shared schema + constants

**Files:** `packages/shared/src/schema/MatchState.ts`, `packages/shared/src/schema/CarveOp.ts`, `packages/shared/src/constants.ts`.

- [ ] **Step 1: Add cave constants** (`constants.ts`):

```typescript
export const CAVE_MIN_GAP = 280;     // min vertical air gap floor−ceiling
export const CAVE_EDGE_SEAL = 140;   // px at each side where the cave seals shut
```

- [ ] **Step 2: CarveOp gains a layer** — read `schema/CarveOp.ts`, then add:
```typescript
@type("string") layer = "floor"; // "floor" | "ceiling"
```

- [ ] **Step 3: MatchState gains ceiling fields** (`schema/MatchState.ts`):
```typescript
@type("boolean") hasCeiling = false;
@type("string") ceilingSeed = "";
```

- [ ] **Step 4: Build shared + typecheck** — `pnpm --filter @se/shared typecheck` → clean.

- [ ] **Step 5: Commit** — `git add packages/shared && git commit -m "feat(shared): dual-heightmap state (hasCeiling, ceilingSeed, CarveOp.layer)"`

---

## Task 7: Dual-heightmap — generation + carve (game)

**Files:** `packages/game/src/terrain/generate.ts` (`generateCeiling`), `packages/game/src/terrain/carve.ts` (`carveCeilingInPlace`). Tests beside.

- [ ] **Step 1: Failing tests**

```typescript
import { generateCeiling, generateTerrain } from "./generate";
import { CAVE_MIN_GAP, CAVE_EDGE_SEAL } from "@se/shared";
it("generateCeiling stays above the floor with min gap, sealed at edges", () => {
  const W = 1600, H = 900;
  const floor = generateTerrain({ seed: "c", type: "flat", width: W, height: H });
  const ceil = generateCeiling({ seed: "c", type: "random", width: W, height: H }, floor);
  for (let x = CAVE_EDGE_SEAL; x < W - CAVE_EDGE_SEAL; x++) {
    expect(floor[x]! - ceil[x]!).toBeGreaterThanOrEqual(CAVE_MIN_GAP - 1);
  }
  // sealed: at the very edges the gap is ~0 (ceiling meets floor)
  expect(floor[2]! - ceil[2]!).toBeLessThan(40);
  expect(floor[W - 3]! - ceil[W - 3]!).toBeLessThan(40);
});

import { carveCeilingInPlace } from "./carve";
it("carveCeilingInPlace recedes the ceiling upward within radius", () => {
  const ceil = new Int16Array(1600).fill(300);
  carveCeilingInPlace(ceil, { x: 800, y: 300, radius: 50, tick: 0 });
  expect(ceil[800]!).toBeLessThan(300);     // ceiling moved up (rock removed)
  expect(ceil[600]!).toBe(300);             // outside radius unchanged
  expect(ceil[800]!).toBeGreaterThanOrEqual(0); // clamped
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement `generateCeiling`** (in `generate.ts`) — noise-based, positioned above the floor with the min gap, sealed at edges:

```typescript
import { CAVE_MIN_GAP, CAVE_EDGE_SEAL } from "@se/shared";
export function generateCeiling(opts: TerrainOptions, floor: Int16Array): Int16Array {
  const { seed, width } = opts;
  const o1 = buildOctave(seed + "-c1", 180, width);
  const o2 = buildOctave(seed + "-c2", 70, width);
  const out = new Int16Array(width);
  for (let x = 0; x < width; x++) {
    const noise = (o1[x] as number) * 0.65 + (o2[x] as number) * 0.35; // -1..1
    let gap = CAVE_MIN_GAP + (noise + 1) * 120;                        // cavern height
    // Seal the cave at the edges: ramp gap → ~0 within CAVE_EDGE_SEAL.
    const edgeDist = Math.min(x, width - 1 - x);
    if (edgeDist < CAVE_EDGE_SEAL) gap *= edgeDist / CAVE_EDGE_SEAL;
    out[x] = Math.max(0, Math.round(floor[x]! - gap));
  }
  return out;
}
```

- [ ] **Step 4: Implement `carveCeilingInPlace`** (in `carve.ts`, mirroring `carveInPlace` but raising the ceiling). Read the existing `carveInPlace` first to match its crater profile, then:

```typescript
export function carveCeilingInPlace(ceiling: Int16Array, op: { x: number; y: number; radius: number; tick: number }): void {
  const { x: cx, radius } = op;
  const xMin = Math.max(0, Math.floor(cx - radius));
  const xMax = Math.min(ceiling.length - 1, Math.ceil(cx + radius));
  for (let x = xMin; x <= xMax; x++) {
    const dx = x - cx;
    const carve = Math.sqrt(Math.max(0, radius * radius - dx * dx)); // half-circle depth
    if (carve > 0) ceiling[x] = Math.max(0, Math.round(ceiling[x]! - carve)); // recede upward
  }
}
```
(If `carveInPlace` uses a different crater shape, match it for visual consistency.)

- [ ] **Step 5: Run → pass.** Export both from `packages/game/src/index.ts` if not already.

- [ ] **Step 6: Commit** — `git add packages/game && git commit -m "feat(game): cave ceiling generation + ceiling carve"`

---

## Task 8: Dual-heightmap — physics collision (game)

**Files:** `packages/game/src/types.ts` (`StepInput`/`SimInput` gain `ceiling?: Int16Array`; `StepEvent` terrain-impact gains `layer?`), `packages/game/src/physics/step.ts`, `packages/game/src/physics/simulate.ts`. Tests beside.

- [ ] **Step 1: Failing tests** (`step.test.ts`)

```typescript
it("hits the ceiling when y <= ceiling[x] (tagged ceiling)", () => {
  const terrain = new Int16Array(1600).fill(800); // floor low
  const ceiling = new Int16Array(1600).fill(200); // ceiling high
  const p = makeProjectile({ x: 800, y: 205, vy: -200 }); // moving up toward ceiling
  const r = stepProjectiles({ ...BASE_INPUT, terrain, ceiling, projectiles: [p], tanks: NO_TANKS });
  const impact = r.events.find(e => e.kind === "terrain-impact");
  expect(impact).toBeDefined();
  expect((impact as any).layer).toBe("ceiling");
  expect(r.survivors).toHaveLength(0);
});
it("passes through the air gap between ceiling and floor", () => {
  const terrain = new Int16Array(1600).fill(800);
  const ceiling = new Int16Array(1600).fill(200);
  const p = makeProjectile({ x: 800, y: 500, vy: 0, vx: 50 }); // mid-gap
  const r = stepProjectiles({ ...BASE_INPUT, terrain, ceiling, projectiles: [p], tanks: NO_TANKS });
  expect(r.events.find(e => e.kind === "terrain-impact")).toBeUndefined();
  expect(r.survivors).toHaveLength(1);
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement ceiling collision** — in `step.ts`, after the floor terrain-impact check, add (guarded on `input.ceiling`):

```typescript
const ceil = input.ceiling;
// ... within the per-projectile loop, alongside the floor surface check:
if (ceil && p.y <= (ceil[Math.max(0, Math.min(ceil.length - 1, Math.floor(p.x)))] ?? -Infinity)) {
  events.push({ kind: "terrain-impact", projectileId: p.id, x: p.x, y: p.y, layer: "ceiling" });
  continue;
}
```
Tag the existing floor terrain-impact event with `layer: "floor"`. Add `layer?: "floor" | "ceiling"` to the terrain-impact `StepEvent` variant in `types.ts`.

- [ ] **Step 4: Mirror in `simulate.ts`** — the trajectory preview stops at the ceiling too: add the same `ceiling` check so the aim dotted-line ends at the cave roof. Add `ceiling?: Int16Array` to `SimInput`.

- [ ] **Step 5: Run → pass** (existing no-ceiling tests still green — collision identical when `ceiling` undefined).

- [ ] **Step 6: Commit** — `git add packages/game && git commit -m "feat(game): projectile collision against optional ceiling (step + preview)"`

---

## Task 9: Dual-heightmap — server wiring + cave for absorb

**Files:** `apps/server/src/rooms/MatchRoom.ts`, `apps/server/src/rooms/placement.ts`, `apps/server/src/rooms/ReplayRecorder.ts`. Tests: `apps/server/tests/` (new `cave.test.ts` using the `boot` harness, or extend `MatchRoom.test.ts`).

- [ ] **Step 1: Failing test** (server `boot` harness; force absorb via configure)

```typescript
it("absorb mode generates a sealed cave (hasCeiling) and places tanks in the gap", async () => {
  const a = await colyseus.sdk.joinOrCreate("match", { code: "CAVE1", nickname: "H", color: "red" });
  await wait(40);
  a.send("configure", { wallModePool: "absorb" });
  await wait(40);
  a.send("ready", {});
  await wait(150);
  expect(a.state.phase).not.toBe("lobby");
  expect(a.state.wallMode).toBe("absorb");
  expect(a.state.hasCeiling).toBe(true);
  expect(a.state.ceilingSeed.length).toBeGreaterThan(0);
  await a.leave();
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Server holds + generates the ceiling** — in `MatchRoom`: add `private ceiling: Int16Array | null = null;`. In `startMatch`/`startNextRound`, after generating the floor terrain, when `state.wallMode === "absorb"`: set `state.hasCeiling = true; state.ceilingSeed = state.terrainSeed + "_ceiling"; this.ceiling = generateCeiling({ seed: state.ceilingSeed, type: "random", width: TERRAIN_WIDTH, height: TERRAIN_HEIGHT }, this.terrain);` else `state.hasCeiling = false; state.ceilingSeed = ""; this.ceiling = null;`.

- [ ] **Step 4: Feed ceiling to physics + handle ceiling carve** — pass `ceiling: this.ceiling ?? undefined` into the `stepProjectiles` input (in `tickLoop`). In `applyStepEvent`/the terrain-impact handler (`tickLoop.ts`/`resolveTurn.ts`), when the impact `layer === "ceiling"`, call `carveCeilingInPlace(this.ceiling, op)` and push a `CarveOp` with `layer:"ceiling"` to `state.terrainOps`; floor impacts keep `layer:"floor"`. (Read `tickLoop.ts` to slot this in where floor carves are currently emitted.)

- [ ] **Step 5: Cave-aware placement** — in `placement.ts` `randomSlots`, accept an optional `ceiling` and ensure chosen x have `floor[x] - ceiling[x] >= tankHeight + margin` and avoid the sealed edge band (`CAVE_EDGE_SEAL`). Pass the ceiling from `MatchRoom.placeTanksOn`.

- [ ] **Step 6: Replay fields** — in `ReplayRecorder.captureRoundStart`, record `hasCeiling`/`ceilingSeed` so replays reconstruct caves. (Read the recorder to match its snapshot shape.)

- [ ] **Step 7: Run → pass** (`pnpm --filter @se/server test`, isolation to avoid CPU contention).

- [ ] **Step 8: Commit** — `git add apps/server && git commit -m "feat(server): absorb mode generates a carveable cave; ceiling carve + placement + replay"`

---

## Task 10: Dual-heightmap — client rendering (ceiling + layered carve)

**Files:** `apps/client/src/render/Terrain.ts`, `apps/client/src/scenes/MatchScene.ts`, `apps/client/src/render/Cage.ts`.

- [ ] **Step 1: TerrainRenderer holds + renders a ceiling**

In `Terrain.ts`: add an optional ceiling heightmap. New ctor param or setter `setCeiling(seed: string)` that generates via `generateCeiling` (client regen from `ceilingSeed`, deterministic). In `redraw`, when a ceiling exists, draw the **upper rock mass** from the top of the world down to `ceiling[x]` using the same layered palette as the island underside (bedrock/dirt body, shadow, stalactites along the ceiling edge, rim light) so it matches. Add `ceilingAt(x)`.

- [ ] **Step 2: Route carve ops by layer**

`carve(op)` checks `op.layer`: `"ceiling"` → `carveCeilingInPlace(this.ceilingHeightmap, op)` then redraw + return `DirtParticles` for the changed columns (debris drifts down — reuse `DirtParticles`); `"floor"` (default) → existing path.

- [ ] **Step 3: Wire in MatchScene**

- In `onFirstState`/`buildTerrain`, after creating the `TerrainRenderer`, if `state.hasCeiling` call `terrain.setCeiling(state.ceilingSeed)`. Add `$(state).listen("hasCeiling", …)` / `listen("ceilingSeed", …)` to (re)apply on round changes.
- The `terrainOps.onAdd` handler already calls `this.terrain?.carve(op)` — it now passes `op.layer` through automatically (CarveOp carries it). Verify the op object includes `layer`.
- Absorb: when `hasCeiling`, do **not** draw the energy cage (rock cave is the boundary); reflect still draws the cyan cage. Adjust the `wallMode`/`hasCeiling` logic so absorb shows the cave (+ optional subtle violet rim on the ceiling rock) and reflect shows the cage.

- [ ] **Step 4: Typecheck + client tests** — `pnpm --filter @se/client typecheck && pnpm --filter @se/client test` → green.

- [ ] **Step 5: Commit** — `git add apps/client && git commit -m "feat(client): render cave ceiling + layered (floor/ceiling) carving"`

---

## Task 11: Playwright visual verification + polish sweep

**Files:** none (drives the running app); fix any issues found in the relevant source files.

- [ ] **Step 1: Boot stack** — ensure `pnpm dev` is running (client :5183, server :2567); use the `window.__room` debug hook to force wall modes.

- [ ] **Step 2: Single HUD** — open a match; assert exactly one bottom HUD + top-right HP panel; no old center cluster / top-left list / floating wind & timer (`document.querySelector` checks + screenshot). Angle/power numbers large/legible; weapon name + ammo readable; with only Baby Missile, it shows selected.

- [ ] **Step 3: MIRV** — select MIRV (force inventory via configure/buy or start with bonanza), fire straight up, screenshot mid-flight → wide flat fan.

- [ ] **Step 4: Cage full height** — force `reflect`; screenshot → cyan walls span from the shoot ceiling down; pylon caps at extremes.

- [ ] **Step 5: Sky pan** — fire a long shot / pan; screenshot at pan extremes → no hard sky/hill edge; gradient covers.

- [ ] **Step 6: Island drop-off** — lobby + open-mode match; screenshot → underside organic, edges plunge (no vertical cut).

- [ ] **Step 7: Absorb cave** — force `absorb`; screenshot → tanks enclosed in a randomly-generated cave; fire at the ceiling → crater cutout appears; shot is absorbed (no bounce). Verify `state.hasCeiling === true`.

- [ ] **Step 8: Polish sweep** — `browser_console_messages` shows zero errors across the above; palette consistent; nothing clipped/half-styled. Fix any deltas in source, re-screenshot.

- [ ] **Step 9: Full suite + commit** — `pnpm -r test` (game/client/server green) and `pnpm typecheck` (only known pre-existing failures). `git add -A && git commit -m "polish: verified world-depth/HUD changes via Playwright; aesthetic cleanup"`

---

## Self-Review Notes (coverage)

- Spec §2 HUD → Task 4. ✓  §3 MIRV → Task 1. ✓  §4 Cage → Task 2. ✓  §5 Sky → Task 3. ✓  §6 Underside → Task 5. ✓
- Spec §7 Dual-heightmap → Tasks 6 (schema), 7 (gen/carve), 8 (collision), 10 (render). ✓  §8 Absorb cave → Task 9 (+10 render). ✓
- Spec §9 Testing → unit tests in Tasks 1,5,7,8,9; Playwright in Task 11. ✓
- Spec §10 file-change summary ↔ File Structure + tasks. ✓  §11 edge cases → handled across tasks (guards on `hasCeiling`/`ceiling`, displayName fallback, infinite missile, clamp ≥0, headroom in placement). ✓
- Type consistency: `layer:"floor"|"ceiling"` (CarveOp + StepEvent), `ceiling?: Int16Array` (StepInput/SimInput), `generateCeiling(opts, floor)`, `carveCeilingInPlace(ceiling, op)`, `generateUnderside(seed,width,avgSurface)`, `CAVE_MIN_GAP`/`CAVE_EDGE_SEAL` — used consistently across tasks 6–10. ✓
