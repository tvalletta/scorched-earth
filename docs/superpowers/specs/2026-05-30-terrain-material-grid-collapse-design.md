# Terrain: 2-D Material Grid with Collapsing Dirt — Design

**Date:** 2026-05-30
**Status:** Approved (design phase)
**Supersedes:** the heightmap + dual-heightmap cave model (`generateTerrain`/`generateCeiling`/`carveInPlace`/`carveCeilingInPlace` and `MatchState.hasCeiling`/`ceilingSeed`).

---

## 0. Overview & Goals

Reproduce the classic Scorched Earth terrain feel: a shot into a cliff carves a real hole and the dirt above **collapses down** (with animation); dirt-clod/dirt-ball pile up and settle; the **digger/tunneler** becomes useful because tunnels cave in. Caves (absorb mode) stay open — their rock shell doesn't collapse — and **indestructible bedrock** bounds the world and seals caves.

The current terrain is a **heightmap** (one surface height per column), which cannot represent a hole with dirt above it, so craters into cliffs remove the whole column up to the surface and collapse is impossible. We replace it with a **2-D material grid** plus **per-column gravity**.

### Goals
- Circular craters that leave proper holes; dirt above a hole collapses straight down (original-game feel).
- Dirt-adding weapons pile dirt that then settles; tunneler/digger tunnels collapse.
- Caves: carveable ROCK ceilings/walls that **don't** collapse; indestructible BEDROCK shell.
- Indestructible BEDROCK floor band (no bottomless digging).
- Deterministic for netcode (server-authoritative grid; client reproduces from seed + ops).
- Keep the cartoon aesthetic (dirt/rock/grass palette, grass line, layered look).

### Non-goals (YAGNI)
- True 2-D rigid-body physics or connectivity flood-fill (we use cheap per-column gravity).
- Sub-pixel terrain; soft/fluid dirt; sand sliding at angles of repose (straight-down only).
- Per-cell network sync (we sync seed + circular ops, not the grid).

---

## 1. Locked Decisions
1. **2-D material grid** (cell-based), replacing heightmap + dual-heightmap.
2. **Per-column collapse** (classic SE): DIRT falls straight down within its column; ROCK/BEDROCK are immovable.
3. **Materials:** `AIR`, `DIRT` (falls, carveable), `ROCK` (carveable, immovable), `BEDROCK` (indestructible, immovable).
4. Defaults: **4 px cells**, BEDROCK floor band ≈ bottom 24 px, collapse animation ≈ 300 ms.

---

## 2. Data Model — `MaterialGrid`

```typescript
// packages/game/src/terrain/grid.ts
export const CELL = 4;                       // px per cell
export const enum Mat { AIR = 0, DIRT = 1, ROCK = 2, BEDROCK = 3 }

export interface MaterialGrid {
  cols: number;       // TERRAIN_WIDTH / CELL  (1600/4 = 400)
  rows: number;       // TERRAIN_HEIGHT / CELL (900/4 = 225)
  cells: Uint8Array;  // length cols*rows, row-major: cells[cy*cols + cx]
}

// Coordinate helpers (world px ↔ cell)
cx = Math.floor(x / CELL); cy = Math.floor(y / CELL);
idx = cy * cols + cx;
matAt(grid, x, y): Mat            // AIR if out of bounds horizontally; BEDROCK below world bottom
isSolid(grid, x, y): boolean      // matAt !== AIR
surfaceTop(grid, x): number       // world-y of the topmost solid cell in the column (for placement)
```

Memory: 400×225 = 90 KB `Uint8Array`. Out-of-bounds: left/right of world = AIR (shots leave via wallMode); below world bottom = BEDROCK (nothing falls out); above = AIR.

---

## 3. Generation (deterministic from seed)

`buildGrid({ seed, type, wallMode, cols, rows }): MaterialGrid`. Reuse the existing octave-noise surface generators as **contours**, then rasterize:

**Open terrain** (`wallMode !== "absorb"`):
- `floor = generateTerrain({seed,type,...})` → surface height per column (existing).
- For each column `cx`, each `cy`: worldY = `cy*CELL`.
  - `worldY >= TERRAIN_HEIGHT - BEDROCK_BAND` → `BEDROCK` (floor band).
  - else `worldY >= floor[cx*CELL]` → `DIRT`.
  - else `AIR`.

**Cave** (`wallMode === "absorb"`):
- `floor = generateTerrain(...)`, `ceil = generateCeiling(..., floor)` (existing contours).
- For each column/cell:
  - bottom band → `BEDROCK`; else at/below floor → `DIRT`.
  - at/above ceiling contour → `ROCK`, except the **outermost shell** (top `SHELL` px of the ceiling mass, and the sealed side columns within `CAVE_EDGE_SEAL`) → `BEDROCK`.
  - between ceiling and floor → `AIR` (cave interior).
- Guarantee: a contiguous `AIR` band of ≥ `CAVE_MIN_GAP` between ceiling and floor mid-cave (existing invariant), sealed at edges by BEDROCK.

Determinism: identical seed/type/wallMode → identical grid (pure noise + rasterization). New constants in `@se/shared`: `CELL` (or keep in game), `BEDROCK_BAND = 24`, `CAVE_SHELL = 16`.

---

## 4. Carve + Settle

### 4.1 Carve
```
carveCircle(grid, cx, cy, radius):           // world coords
  for each cell within radius of (cx,cy):
    if cell is DIRT or ROCK: set AIR          // BEDROCK is indestructible
  settleColumns(grid, xMin..xMax)             // xMin/xMax = carve x-range in cell columns
```

### 4.2 Deposit (dirt-adding weapons)
```
depositBlob(grid, cx, cy, shape):
  for each cell in shape that is AIR: set DIRT  // never overwrite ROCK/BEDROCK
  settleColumns(grid, affected columns)         // piled dirt then settles
```

### 4.3 Settle (per-column gravity)
For each affected column, split it into **segments** separated by immovable cells (ROCK/BEDROCK) and the grid bottom; within each segment, compact DIRT to the bottom:

```
settleColumn(grid, cx):
  segTop = 0
  for cy in 0..rows-1:
    m = cell(cx,cy)
    if m == ROCK or m == BEDROCK:
      compactSegment(cx, segTop, cy-1)
      segTop = cy + 1
  compactSegment(cx, segTop, rows-1)

compactSegment(cx, top, bottom):               // cells in [top,bottom] are AIR/DIRT only
  if top > bottom: return
  dirt = count of DIRT in [top,bottom]
  set all cells in [top,bottom] = AIR
  for k in 0..dirt-1: cell(cx, bottom-k) = DIRT // stack at segment bottom
```

**Outcomes (invariants, tested):**
- Cliff crater: the hole sits mid-segment; after compaction DIRT rests on the bedrock band, the gap rises to the top → surface drops, hole fills → **collapse**.
- Cave: ceiling ROCK bounds the interior segment above; stray DIRT in the interior settles onto the floor; the ROCK ceiling never moves → cave stays open.
- ROCK/BEDROCK cell counts/positions are unchanged by settle.
- Per-column only → settling one column never changes a neighbor → only carved columns settle (O(affected width × rows)).

---

## 5. Collision & Trajectory

`step.ts` and `simulate.ts` replace heightmap/ceiling checks with grid lookups:
- **Terrain impact** when `isSolid(grid, p.x, p.y)` (was `y >= floor[x]` and the ceiling check). The impact point is the projectile's current cell; carve is applied there.
- Roller/leapfrog surface logic uses `surfaceTop(grid, x)` where it previously used `heightAt`.
- Out-of-bounds (vertical `PLAY_CEILING_Y` / horizontal wallMode) unchanged.
- The trajectory preview uses the same `isSolid` so the aim dotted line stops where a real shot would (including under overhangs and at cave roofs).

`StepInput`/`SimInput` carry `grid: MaterialGrid` instead of `terrain: Int16Array` (+ `ceiling`). The old fields are removed.

---

## 6. Per-Weapon Terrain Interactions (migration)
- **Standard explosive impacts** → `carveCircle`.
- **Dirt-clod / dirt-ball / liquid-dirt** (terrain deposit) → `depositBlob` of DIRT (then settles → piles).
- **Tunneler / sandhog (burrow)** → carve a vertical column (a tall thin carve) → dirt above collapses in (digger usefulness).
- **Roller / heavy-roller / leapfrog** → carve on final impact (surface via `surfaceTop`).
- **Laser / plasma-wave** → carve their existing shapes against the grid.
The per-weapon **explosion visuals** (Phase 8 §6.2, already implemented) are unaffected — they key off `weaponId`, independent of terrain representation.

---

## 7. Rendering

`TerrainRenderer` renders the grid via **run-length encoding per column** (redrawn only on carve, not per frame):
- For each column, walk cells top→bottom, emit a rect for each contiguous run of one material: DIRT `#5c3a1e` (with a `#8bc34a` grass cap + tufts on the topmost dirt run), ROCK `#3a2614`, BEDROCK `#1c1208` with a speckled/striped tell so it reads as indestructible. ~1–2k rects total; fine for infrequent redraws.
- A smoothed surface polyline over the top dirt contour preserves the cartoon silhouette; cave interiors get the existing dark-atmosphere tint + violet rim (absorb accent).
- **Collapse animation (cosmetic):** on carve, diff each affected column's DIRT positions pre/post-settle; tween the dropped dirt from old→new y over ~300 ms (falling rects/dust), then the grid is authoritative. Reuse/retire `DirtParticles`.

Rendering reads only the grid; no collision logic client-side (server-authoritative).

---

## 8. Sync / State

- **Server-authoritative grid.** Generated from `terrainSeed + terrainType + wallMode`; mutated by ops.
- **Ops log** (`MatchState.terrainOps`): each op is a circle carve or a deposit — extend `CarveOp` with `kind: "carve" | "deposit"` (default `carve`) and keep `x,y,radius` (deposits also carry a small shape via radius). The existing `layer` field is removed.
- Client regenerates the grid from the seed and **replays ops in order** → identical grid (gen + carve + settle are pure, in shared `@se/game`). `terrainVersion` still bumps to trigger redraw.
- **Removed:** `MatchState.hasCeiling`, `ceilingSeed` (cave is derived from `wallMode`); `generateCeiling`/`carveCeilingInPlace` and ceiling-specific collision.
- **Replay** records `terrainSeed/type/wallMode` + ops (already does, minus the removed fields).

---

## 9. Placement & AI
- `placement.randomSlots` uses `surfaceTop(grid, x)` to seat tanks; cave-aware headroom check uses the grid (open AIR band ≥ tank height between floor and ceiling), avoiding the sealed BEDROCK edges.
- AI `think` is unchanged (it already reasons over a surface function); feed it `surfaceTop`. Caves remain a known AI limitation (documented).

---

## 10. Component / File Breakdown

**New** — `packages/game/src/terrain/grid.ts`: `Mat`, `MaterialGrid`, `buildGrid`, `matAt`, `isSolid`, `surfaceTop`, `carveCircle`, `depositBlob`, `settleColumns`. Tests beside it.

**Modified**
- `packages/game/src/physics/step.ts`, `simulate.ts` — grid collision; `StepInput`/`SimInput` carry `grid`.
- `packages/game/src/index.ts` — export grid API; stop exporting ceiling helpers.
- `packages/shared/src/constants.ts` — `BEDROCK_BAND`, `CAVE_SHELL` (keep `CAVE_MIN_GAP`/`CAVE_EDGE_SEAL`).
- `packages/shared/src/schema/MatchState.ts` — remove `hasCeiling`/`ceilingSeed`.
- `packages/shared/src/schema/CarveOp.ts` — `kind`, drop `layer`.
- `apps/server/src/rooms/MatchRoom.ts` — hold a `MaterialGrid`; gen on round start; carve/deposit on impacts; placement.
- `apps/server/src/rooms/tickLoop.ts`, `resolveTurn.ts` — route impacts to grid carve/deposit; emit ops.
- `apps/client/src/render/Terrain.ts` — grid RLE render + collapse animation; `surfaceTop`/`isSolid` accessors.
- `apps/client/src/scenes/MatchScene.ts` — build/replay grid; apply ops; cave visual from grid.
- `apps/server/src/rooms/placement.ts` — grid-based slots.

**Retire:** heightmap-only paths in `generate.ts`/`carve.ts` are kept only as the contour source for `buildGrid` (or inlined); `generateCeiling`/`carveCeilingInPlace` removed.

---

## 11. Edge Cases & Risks
| Case | Handling |
|------|----------|
| Dig to the bottom | BEDROCK floor band is indestructible; carve can't remove it. |
| Cave ceiling blasted fully through | ROCK carves away; the BEDROCK shell at the very top still caps it (rare to reach). |
| Dirt under an overhang of ROCK | Per-column: dirt in that segment drops to the segment floor (off the rock) — acceptable, matches "disconnected dirt falls." |
| Floating ROCK after carving around it | ROCK is immovable by design; it can float (cartoon-acceptable; matches "cave roof stays"). |
| Client/server grid divergence | gen+carve+settle are pure & shared; ops replayed in order; server authoritative for collision. |
| Performance (render) | RLE redraw only on carve; ~1–2k rects; 90 KB grid; O(1) collision. |
| Trajectory preview vs real shot | both use `isSolid` over the same grid. |
| Tank sitting where dirt collapses | after settle, re-seat tanks on `surfaceTop` (server already re-places at round start; mid-round collapse under a tank applies fall damage via existing fall logic using the new surface). |
| Migration breakage | large surface area; sequence so each step compiles + tests green (see §13). |

---

## 12. Testing

**Unit (vitest, `@se/game`)**
- `buildGrid`: deterministic (seed→identical cells); bedrock band present; cave has sealed edges + min air gap; open terrain has DIRT under contour, AIR above.
- `carveCircle`: removes DIRT & ROCK in radius, leaves BEDROCK; only affected columns change.
- `settleColumns`: dirt above a hole collapses to rest on bedrock; ROCK/BEDROCK positions unchanged; cave-interior stray dirt settles to floor, ceiling untouched; dirt count conserved (minus carved).
- `depositBlob`: adds DIRT in AIR only; piles then settles.
- `isSolid`/`surfaceTop`: correct at boundaries; out-of-bounds (below = BEDROCK, sides = AIR).
- `step`/`simulate`: impact when entering a solid cell; passes through AIR (incl. cave interior & under overhangs); preview stops at the same cell.

**Playwright (visual)**
- Cliff crater: fire at a cliff face → circular hole, dirt above **collapses** with animation.
- Digger: tunneler into a hill → tunnel **caves in**.
- Dirt weapon: dirt-ball builds a **pile** that settles.
- Cave (absorb): tanks enclosed; blast the ROCK ceiling → hole, rest stays up; bedrock floor undiggable.
- No console errors; cartoon palette intact.

---

## 13. Migration Sequencing (for the plan)
1. **`grid.ts`** — model + `buildGrid` + `isSolid`/`surfaceTop` + `carveCircle`/`depositBlob`/`settleColumns`, fully unit-tested (no integration yet).
2. **Physics** — `step.ts`/`simulate.ts` switch to `grid`; update their tests.
3. **Shared schema** — `CarveOp.kind`, remove `hasCeiling`/`ceilingSeed`.
4. **Server** — `MatchRoom`/`tickLoop`/`resolveTurn`/`placement` hold + mutate the grid; emit ops; remove ceiling code. Server tests green.
5. **Client render** — `Terrain.ts` grid RLE + collapse animation; `MatchScene` build/replay/apply ops; cave visuals from grid.
6. **Playwright sweep** + polish.

Each step ends compiling with green unit tests for the packages it touches; integration verified in steps 4–6.
