# World Depth, Caves, HUD Consolidation & Polish — Design

**Date:** 2026-05-29
**Status:** Approved (design phase)
**Builds on:** lobby/background-battle work (floating island, energy cage, wider play bounds)

---

## 0. Guiding Principle — Polish & Consistency

Every change must match the game's existing **dark-navy arcade aesthetic**: orange (`#ff8c00`) primary accents, chunky `Impact`/system-ui type, rounded panels with `rgba(8,6,24,…)` fills and soft shadows, the cartoon terrain palette (grass `#8bc34a`, dirt `#5c3a1e`, bedrock `#2a1a0a`), and the time-of-day sky palettes. Gameplay feel is unchanged — same controls, same physics tuning, same turn flow. No hard edges, no half-styled elements, no debug-looking UI. Where adjacent code is rough, clean it up in passing. The bar is "looks like a finished, fun, exciting game."

---

## 1. Scope

Nine workstreams, one plan, ordered so contained visual/gameplay wins land first and the terrain-model upgrade lands last:

| # | Workstream | Risk |
|---|-----------|------|
| A | HUD consolidation to one bottom HUD + top-right HP panel | Med (client refactor) |
| B | MIRV flat horizontal spread | Low (physics + test) |
| C | Cage extended to full shoot-height | Low |
| D | Sky / parallax extension (no edge on pan) | Low–Med |
| E | Organic, drop-off floating-island underside (cosmetic) | Med (render) |
| F | Dual-heightmap terrain model (floor + ceiling), carveable both | High (shared/physics/render/sync) |
| G | Absorb → enclosed cave (uses F) | Med |
| H | Testing — unit + Playwright visual verification | — |

---

## 2. Workstream A — HUD Consolidation

### 2.1 Remove
Delete construction, update calls, and references in `MatchScene` for: `AimControls`, `WeaponBar`, `PlayerList`, `WindArrow`, `TurnTimer`. Delete the component files once no longer referenced (`input/AimControls.ts`, `hud/WeaponBar.ts`, `hud/PlayerList.ts`, `hud/WindArrow.ts`, `hud/TurnTimer.ts`). `RoundInfo` is absorbed into the HUD (see 2.3) and removed as a standalone overlay.

### 2.2 Keep
- **`PlayerStrip`** (top-right) — HP panel. Restyle pass for consistency (panel fill, HP bar colors per tank color, active-turn highlight, round counter).
- **`HudBar`** (bottom) — promoted to the single action HUD; enlarged and enriched.

### 2.3 HudBar redesign (the single HUD)
Fixed to bottom, full width, height `~104px`, same dark-navy gradient + orange top border. Left→right layout:

1. **Angle control** — circular dial (`~76px`) with a needle, a bold centered `NN°` readout (orange, `Impact`), and faint `0/90/180` reference ticks. Drag to set; arrows ±2° (Shift ±10°).
2. **Power control** — vertical bar (`~76px` tall) with green→yellow→red fill, a bold `NNN` readout and a `0–1000` scale ticks. Drag; arrows ±20 (Shift ±100).
3. **Weapon selector** — horizontal carousel of the player's weapons. Each chip shows the **full weapon name** (from a new `WeaponDef.displayName`, fallback to a humanized id) and ammo `×N`, infinite as `∞`. The **currently selected** weapon is always shown and highlighted **even at 0 ammo** — Baby Missile is infinite so a weapon is always selectable. `‹ ›` buttons + `Q/E` keys cycle; click selects.
4. **Status cluster** — compact stack: **WIND** (arrow + value, styled like the old `WindArrow` but inline), **ROUND `r/N`**, and **terrain · wall** label (e.g. `Hills · Reflect`) from former `RoundInfo`.
5. **Turn timer** — the existing square countdown (turns red ≤5s).
6. **FIRE** — the chunky orange button (disabled + dimmed when not your turn).

**Drive/move:** when the local tank has fuel, show a small inline **FUEL** readout + the existing `A/D` move behavior (port the `setDriveMode`/`move` send logic from `AimControls` into `HudBar`). When fuel is 0, hide it. Space fires; this must not conflict with drive.

**Empty-inventory rule:** the carousel is built from `WEAPON_REGISTRY` order but reflects the player's inventory for ammo counts; Baby Missile (infinite) is always present and selected by default, so "no weapons" still shows missile selected.

### 2.4 Data flow
`MatchScene.onTick` calls `hudBar.update(state)` and `hudBar.updateTimer(deadline)` (already wired) plus new `hudBar.updateWindRound(state)`. Aim-change callback drives the trajectory overlay (already wired). `select-weapon`, `fire`, `move` messages unchanged.

---

## 3. Workstream B — MIRV Flat Spread

### 3.1 Problem
`spawnMirvChildren` uses `ejVx=cos(deg)`, `ejVy=sin(deg)` with `centerDeg:90` → a downward arc, and a convention mismatched from the launcher (`vy = -sin`). Result reads as scattering.

### 3.2 Fix
Reconfigure the MIRV split to a **flat, wide horizontal fan**: submunitions eject with horizontal velocities spread symmetrically left→right and a small upward lift, so they fan out flat at apex then rain down under gravity. The submunition's horizontal velocity is spread evenly across `[-ejectionSpeed … +ejectionSpeed]`; the vertical component is a small constant upward lift the same for all children:

```
// Flat spread: child i of `count`, evenly across the full horizontal span.
const frac = count === 1 ? 0.5 : i / (count - 1);   // 0 … 1
const ejVx = (-1 + 2 * frac) * split.ejectionSpeed   // leftmost −speed … rightmost +speed
           + (split.inheritVelocity ? parent.vx : 0);
const ejVy = -LIFT                                    // small constant upward lift (e.g. LIFT ≈ 60)
           + (split.inheritVelocity ? parent.vy * 0.3 : 0);
```

**Observable contract (tested):** for an apex split, children's `vx` are roughly evenly spaced with the leftmost `< 0` and rightmost `> 0` (symmetric wide fan), and all `vy ≤ 0` at burst (slight lift) — a flat horizontal spread, not a downward cluster. MIRV config: `count: 5, spreadDeg` retained for compatibility but unused by the flat formula, `ejectionSpeed ≈ 260, inheritVelocity: true`, apex trigger, damage/radius unchanged. The exact `LIFT`/`ejectionSpeed` are finalized in the plan, test-first.

---

## 4. Workstream C — Full-Height Cage

`CageRenderer.update` is called with a vertical span. Change `MatchScene` to pass `topY = PLAY_CEILING_Y` (−600, imported from `@se/shared`) and `bottomY` = island base (terrain max + island depth, or `TERRAIN_HEIGHT + PLAY_FLOOR_MARGIN`). The cage's pylon caps sit at those extents; energy bands tile the full height. So the electric walls reach the maximum legal shot height. Keep the gentle shimmer.

---

## 5. Workstream D — Sky / Parallax Extension

### 5.1 Problem
Sky layers are `2×` viewport wide, anchored at `x=0`; hill layers shift by `−worldX·parallax` on pan, exposing their ends as hard vertical edges; the gradient also ends at `2W`.

### 5.2 Fix
- Build all sky/hill/gradient layers across a **wide span** `SPAN = max(viewW, TERRAIN_WIDTH) + 2·MARGIN` (MARGIN large enough to cover the max parallax shift at full pan, e.g. `worldX_max · maxParallax + viewW`). Center the span so shifting never reveals an end.
- Make hill silhouettes **wrap/tile** seamlessly (repeat the bump pattern across the full span) so no end is ever visible.
- Vertically, draw the gradient to cover the full visible band including when the camera tilts to follow high shots (extend the solid `bottom` fill downward to comfortably below the island base, and the `top` upward).
- **Resize handling:** `MatchScene` rebuilds/resizes the sky on `window` resize (currently only the world re-fits).

This is purely the existing `SkyRenderer`, widened and made seam-free; palettes and drift unchanged.

---

## 6. Workstream E — Organic Floating-Island Underside (cosmetic)

Replace the bell-curve underside (current `Terrain.drawUnderside`) with an **organically generated** profile:

- Generate an underside depth profile with the **same octave-noise** approach as `generateTerrain` (a helper `generateUnderside(seed, width, avgSurface)` in `@se/game` returning an `Int16Array` of bottom-y per column), so the underside has the same natural character as the top.
- **Sides "drop off the face":** instead of vertical cuts at `x=0` and `x=W`, the left/right margins **curl inward and plunge** — the underside profile near the edges sweeps downward into long tapering points/roots, and the side silhouette is a concave curve, not a straight wall. Visually the island edge falls away into the void.
- Keep the existing depth shading (medium rock → darker shadow toward the bottom), stalactites (now seeded from the noise lows), and rim light — all in the established palette.
- **Non-cave modes only.** Cosmetic: no collision (bullets fall past into the void, despawning at the soft floor). Not carveable (nothing hits it from above).

---

## 7. Workstream F — Dual-Heightmap Terrain Model

The core architectural change. Terrain becomes **two surfaces**: `floor` (existing) and an optional `ceiling`.

### 7.1 Semantics
- `floor: Int16Array[W]` — solid for `y ≥ floor[x]` (unchanged).
- `ceiling: Int16Array[W] | null` — when present, solid for `y ≤ ceiling[x]`. Air band is `ceiling[x] < y < floor[x]`. `ceiling[x] < floor[x]` always (validated at generation, with a guaranteed minimum air gap for tank headroom).
- `null` ceiling = today's behavior exactly (open sky).

### 7.2 Shared state & schema
`MatchState` additions:
- `@type("boolean") hasCeiling = false`
- `@type("string") ceilingSeed = ""` (deterministic client-side regen; usually `terrainSeed + "_ceiling"`).
- `CarveOp` gains `@type("string") layer = "floor"` (`"floor" | "ceiling"`). Existing floor carves default to `"floor"` — backward compatible. A single `terrainOps` array now carries both layers; the client routes each op to the right renderer/heightmap by `layer`.

### 7.3 Generation (`@se/game`)
- New `generateCeiling(opts): Int16Array` — octave-noise like the floor, positioned above the floor with a minimum air gap `CAVE_MIN_GAP` (e.g. 260px) and a maximum cavern height; near the left/right edges the ceiling **descends to meet the floor** so the cave is closed (no open sides).
- New `generateCaveFloor(opts)` if the cave floor needs different tuning than open terrain (flatter, so tanks have footing). Otherwise reuse `generateTerrain`.
- Invariants (tested): for all x, `ceiling[x] + CAVE_MIN_GAP ≤ floor[x]`; at the edges (`x < edgeW` and `x > W-edgeW`) the gap closes to ~0 (sealed cave).

### 7.4 Physics — `step.ts` & `simulate.ts`
`StepInput`/`SimInput` gain `ceiling?: Int16Array`.
- Collision: terrain-impact if `y ≥ floor[x]` **or** (`ceiling` and `y ≤ ceiling[x]`). The impact event carries the layer so the room can emit the correct carve op.
- The vertical out-of-bounds (`PLAY_CEILING_Y` / soft floor) still applies (a shot inside a cave hits the ceiling long before the ceiling-of-the-world).
- Trajectory preview (`simulate`) checks both surfaces identically so the dotted aim line stops at the cave ceiling.
- Existing single-surface behavior is preserved when `ceiling` is undefined.

### 7.5 Carving — both layers
- Floor carve: existing `carveInPlace` (surface drops; `floor[x]` increases).
- New `carveCeilingInPlace`: a bullet hitting the ceiling removes rock so the ceiling **recedes upward** (`ceiling[x]` decreases) within the blast radius, mirroring the floor crater shape. Clamp so `ceiling[x] ≥ 0`.
- Server: on a terrain-impact event tagged `ceiling`, apply `carveCeilingInPlace` and push a `CarveOp{layer:"ceiling"}`. Client `TerrainRenderer` applies ceiling ops to its ceiling heightmap and redraws.
- **Same crater visuals** (dirt-particle burst, identical look) for ceiling hits, falling/spraying appropriately (debris from a ceiling hit drifts down — reuse `DirtParticles`, no special-casing required for v1; "the dirt wouldn't fall from on top" is satisfied because we don't simulate ceiling collapse, only a crater cutout).

### 7.6 Rendering — `TerrainRenderer`
- Holds `floorHeightmap` (existing) and optional `ceilingHeightmap`.
- When a ceiling exists, draw the **upper rock mass** (from the top of the world down to `ceiling[x]`) with the same layered look as the ground but inverted (bedrock/dirt/“grass”-as-mossy-underside optional), plus stalactites along the ceiling edge and a rim light — consistent with the island underside style. The lower floor renders as today.
- `carve(op)` routes by `op.layer` to the right heightmap + redraw; returns `DirtParticles` for the changed columns either way.
- `heightAt(x)` (floor) unchanged; add `ceilingAt(x)`.

### 7.7 Placement & AI
- `placement.ts`: cave-aware random slots place tanks on the floor within the open band, ensuring headroom (`floor − ceiling ≥ tank height + margin`) and away from sealed edges.
- AI (`think`) already aims over terrain; with a ceiling it may need to avoid the ceiling. For v1, AI uses the same think loop; the ceiling simply blocks bad shots (acceptable). Note as a known limitation; no AI rework in scope.

### 7.8 Replay
`ReplayRecorder` already captures round start state; include `hasCeiling`/`ceilingSeed` and the layer-tagged ops so replays reconstruct caves. Verify replay round-trip in tests.

---

## 8. Workstream G — Absorb → Cave

- In `MatchRoom.startMatch`/`startNextRound`, when the drawn `wallMode === "absorb"`, set `hasCeiling = true`, generate `ceiling` (sealed cave), and generate/relax the floor for footing. Other modes leave `ceiling = null`.
- Bullets hitting the cave rock are **absorbed** (crater, no bounce) — which is exactly absorb semantics, now physical.
- Visual: the rock enclosure carries a subtle **violet** inner glow/rim (absorb accent) so it still reads as the absorb mode and stays consistent with the cage's violet language. The energy **cage is not drawn for absorb** (the rock cave is the boundary); **reflect** keeps the open cyan energy cage (C).
- Camera: auto-frame still targets tanks; the cave fits naturally.

---

## 9. Workstream H — Testing

### 9.1 Unit (vitest)
- **MIRV**: apex split produces a flat symmetric horizontal fan (vx spans −…+ evenly; vy ≤ 0 at burst). Replace the old MIRV expectation.
- **Dual-heightmap physics** (`step`, `simulate`): projectile hits ceiling when `y ≤ ceiling[x]` (event tagged ceiling); passes through the air gap; floor collision unchanged when no ceiling; trajectory preview stops at ceiling.
- **carveCeilingInPlace**: ceiling recedes upward within radius; clamps ≥0; floor carve unchanged.
- **Cave generation invariants**: gap ≥ `CAVE_MIN_GAP` mid-cave; sealed at edges; ceiling above floor everywhere.
- **Placement**: cave slots have headroom and avoid sealed edges.
- **Replay**: cave round-trips (hasCeiling/ceilingSeed/ops).

### 9.2 Playwright visual verification (per the user's explicit ask)
Drive the running app and screenshot, comparing against intent:
1. **Single HUD**: only one bottom HUD + top-right HP panel; no old center cluster / top-left list / floating wind/timer. Angle/power numbers large and legible; weapon name + ammo readable; missile shown selected with no other weapons.
2. **MIRV**: fire a MIRV; confirm a wide flat burst (capture mid-flight).
3. **Cage full height**: reflect match; cage spans from the shoot ceiling down.
4. **Sky pan**: pan/track a shot far; assert no hard sky/hill edge appears (screenshot extremes).
5. **Island drop-off**: lobby + open-mode match; underside is organic and edges fall away (no straight vertical cut).
6. **Absorb cave**: force absorb; tanks enclosed in a randomly-generated cave; fire at the ceiling and confirm a crater cutout; bullets are absorbed (no bounce).
7. **Polish sweep**: no console errors; consistent palette; no clipped/half-styled elements.

Verification uses the existing `window.__room` debug hook to force `wallModePool` for deterministic reflect/absorb/cave captures.

---

## 10. File-Change Summary

**Shared**
- `schema/MatchState.ts` (+`hasCeiling`, `ceilingSeed`), `schema/CarveOp.ts` (+`layer`)
- `constants.ts` (cave constants: `CAVE_MIN_GAP`, edge seal width)

**Game (`@se/game`)**
- `terrain/generate.ts` (+`generateCeiling`, cave floor tuning, export underside helper)
- `terrain/carve.ts` (+`carveCeilingInPlace`)
- `physics/step.ts`, `physics/simulate.ts` (ceiling collision; layer-tagged impacts)
- `weapons/mirv.ts` + `physics/step.ts` `spawnMirvChildren` (flat spread)
- Tests across the above

**Server**
- `rooms/MatchRoom.ts` (cave gen on absorb; ceiling carve on tagged impact; ceiling state)
- `rooms/placement.ts` (cave-aware placement)
- `rooms/ReplayRecorder.ts` (cave fields)

**Client**
- `hud/HudBar.ts` (single HUD redesign incl. wind/round/drive)
- `hud/PlayerStrip.ts` (restyle pass)
- `scenes/MatchScene.ts` (remove old HUD components; wire ceiling; full-height cage; sky resize)
- `render/Terrain.ts` (dual heightmap render + organic underside + ceiling + layered carve)
- `render/Sky.ts` (wide, seam-free, resizable)
- `render/Cage.ts` (full-height span)
- **Delete:** `input/AimControls.ts`, `hud/WeaponBar.ts`, `hud/PlayerList.ts`, `hud/WindArrow.ts`, `hud/TurnTimer.ts`, `hud/RoundInfo.ts` (absorbed)

---

## 11. Edge Cases & Risks

| Case | Handling |
|------|----------|
| Removing `AimControls` loses drive/keyboard | Port drive (`move`/fuel) + keys into `HudBar` before deleting. |
| Weapon with no `displayName` | Humanize the id (`baby-missile` → "Baby Missile"). |
| Player has zero ammo of everything | Baby Missile is infinite → always selectable/shown. |
| Ceiling carved away to nothing | Clamp `ceiling[x] ≥ 0`; if the gap opens fully, that column is just open — fine. |
| Cave with too little headroom for placement | Generation guarantees `CAVE_MIN_GAP`; placement asserts headroom. |
| Backward compat (no ceiling) | All ceiling code guards on `hasCeiling`/`ceiling != null`; default path identical to today. |
| Trajectory preview vs server drift | `simulate` and `step` use identical floor+ceiling collision and the same constants. |
| AI shooting in caves | v1: unchanged think loop; ceiling blocks poor shots (known limitation, documented). |
| Cage vs cave overlap | Absorb = rock cave (no energy cage); reflect = energy cage (no cave). Mutually exclusive. |
| Sky cost from wide span | One-time build; static layers; negligible per-frame cost (only x-shift). |

---

## 12. Sequencing (one plan, ordered for incremental, verifiable progress)

1. **B MIRV** (isolated physics + test) → 2. **C Cage height** → 3. **D Sky** → 4. **A HUD consolidation** (big but self-contained client) → 5. **E Organic underside** → 6. **F Dual-heightmap** (shared → game physics/carve → render → server) → 7. **G Absorb cave** (depends on F) → 8. **H Playwright sweep + polish**.

Each step ends green (unit tests where applicable) and committable; Playwright checks run at the relevant steps and a full sweep at the end.
