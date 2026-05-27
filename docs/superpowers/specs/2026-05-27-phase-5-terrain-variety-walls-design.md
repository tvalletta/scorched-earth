# Phase 5 — Terrain Variety & Walls Design

**Date:** 2026-05-27
**Status:** Approved
**Roadmap row:** Phase 5 — "All 9 terrain types. All 4 wall modes."
**Depends on:** Phase 1 (terrain generation, carve pipeline), Phase 4 (tick-stream step loop)

---

## Overview

Phase 5 adds visual and mechanical variety to every round by shipping 9 distinct terrain generators and 4 projectile wall-boundary modes. The host configures a *pool* of terrain types and a *pool* of wall modes before the match; the server draws one of each at random from the pools at the start of every round. Both vary round-to-round. All generation is deterministic (seeded PRNG).

---

## Scope

**In scope:**
- 9 terrain generators in `packages/game/src/terrain/generate.ts`
- 4 wall-boundary modes in `packages/game/src/physics/step.ts`
- Schema fields: `wallMode`, `terrainTypePool`, `wallModePool`
- Host lobby controls: terrain-type pool picker + wall-mode pool picker
- Round-start randomization from pools
- In-game HUD pill showing active type + mode
- Trajectory preview reflects wall mode (aim dotted line)

**Out of scope:**
- Animated terrain transitions between rounds
- Per-column wall behavior (walls are always the left/right map edges)
- Vertical (top/bottom) wrapping — top is always open sky; soft-bottom always removes projectiles
- Saving pool preferences across sessions

---

## Data Model

### `MatchState` additions (`packages/shared/src/schema/MatchState.ts`)

```typescript
// Phase 5 — terrain variety & walls
@type("string") wallMode = "none";           // active mode this round
@type("string") terrainTypePool = "all";     // comma-delimited type ids, or "all"
@type("string") wallModePool = "all";        // comma-delimited mode ids, or "all"
```

`terrainType` already exists as `@type("string") terrainType = "random"` — no change needed.

### `TerrainOptions.type` (`packages/game/src/types.ts`)

Expand from the single literal `"random"` to the full union:

```typescript
export type TerrainType =
  | "mountains" | "hills" | "valleys" | "cliffs" | "crater"
  | "sky-high"  | "plateau" | "flat"  | "random";

export interface TerrainOptions {
  seed: string;
  type: TerrainType;
  width: number;
  height: number;
}
```

### `StepInput` addition (`packages/game/src/types.ts`)

```typescript
export interface StepInput {
  // … existing fields …
  wallMode: "none" | "wrap" | "reflect" | "absorb";
}
```

### `SimInput` addition (`packages/game/src/types.ts`)

```typescript
export interface SimInput {
  // … existing fields …
  wallMode: "none" | "wrap" | "reflect" | "absorb";
}
```

### `configure` intent (`packages/shared/src/intents.ts`)

```typescript
| { kind: "configure"; turnTimerMs?: number; loadoutId?: string; maxRounds?: number;
    terrainTypePool?: string; wallModePool?: string }
```

---

## Constants (`packages/shared/src/constants.ts`)

```typescript
export const ALL_TERRAIN_TYPES: TerrainType[] = [
  "mountains", "hills", "valleys", "cliffs", "crater",
  "sky-high", "plateau", "flat", "random",
];

export const ALL_WALL_MODES = ["none", "wrap", "reflect", "absorb"] as const;
export type WallMode = typeof ALL_WALL_MODES[number];
```

Add a `parsePool` utility (usable server-side):

```typescript
export function parsePool<T extends string>(
  pool: string,
  all: readonly T[],
): T[] {
  if (pool === "all" || !pool) return [...all];
  return pool.split(",").map(s => s.trim() as T).filter(s => all.includes(s));
}
```

---

## Terrain Generators

### Entry point

`generateTerrain` becomes a dispatcher:

```typescript
export function generateTerrain(opts: TerrainOptions): Int16Array {
  switch (opts.type) {
    case "mountains": return genMountains(opts);
    case "hills":     return genHills(opts);
    case "valleys":   return genValleys(opts);
    case "cliffs":    return genCliffs(opts);
    case "crater":    return genCrater(opts);
    case "sky-high":  return genSkyHigh(opts);
    case "plateau":   return genPlateau(opts);
    case "flat":      return genFlat(opts);
    case "random":
    default:          return genRandom(opts);  // existing 4-octave impl
  }
}
```

### Generator specifications

All generators return `Int16Array` of length `width`. Heights are clamped to `[0, height]`. Y increases downward (smaller value = taller terrain).

#### `genRandom` — existing 4-octave value noise
No change. Baseline ≈ 65% of height, amplitude ≈ ±20%.

#### `genMountains`
- Place 2–4 Gaussian peaks at PRNG-chosen x-positions (seed `"${seed}-peaks"`).
- Each peak: center drawn from `[10%, 90%]` of width; height multiplier 0.6–1.0; σ = 5–12% of width.
- Superimpose low-amplitude ridgeline noise (octave freq=50, weight 0.08) for texture.
- Baseline (floor between peaks) ≈ 80% of height.

```
amplitude = sum of Gaussians + ridgeline noise
terrain[x] = height * 0.85 - amplitude * height * 0.75
```

#### `genHills`
- 2–3 sine harmonics with PRNG-chosen frequencies and phases (seed `"${seed}-hills"`).
- Frequency range: 2–6 full cycles across the map.
- Baseline ≈ 60% height, amplitude ≈ ±25%.

```
elev = Σ Aᵢ · sin(fᵢ · 2π · x/width + φᵢ)
terrain[x] = height * 0.60 - elev * height * 0.25
```

#### `genValleys`
- Parabolic bowl: edges at ~30% height, center at ~75% height.
- Add low-frequency noise (octave freq=100, weight 0.06) to ridge walls.

```
t = x / (width - 1)
bowl = (2t - 1)²
terrain[x] = height * (0.30 + bowl * 0.45) + noise
```

#### `genCliffs`
- 2–3 plateau levels at PRNG-chosen y-values and x-breakpoints.
- Between plateaus: ramp of 6–10 columns (linear interpolation).
- Slight jitter (±3px) on each plateau.

```
Sort breakpoints left-to-right.
For each segment: constant height with jitter.
At each transition: lerp over 6–10 columns.
```

#### `genCrater`
- Flat rim at ~28% height, width 15–25% of map on each side.
- Center crater: parabolic bowl from rim to floor at ~75% height.
- Crater radius = 30–40% of map width (PRNG).

```
d = |x - cx| / craterRadius  (cx = width/2)
if d >= 1:  terrain[x] = height * 0.28 + jitter
else:       terrain[x] = height * 0.28 + (1 - d²) * height * 0.47
```

#### `genSkyHigh`
- 3–5 narrow spires: σ = 3–6% of width, peak at 5–15% of height.
- Floor between spires at ~80% of height.
- PRNG places centers in `[8%, 92%]` of width.

```
spire(x) = exp(-((x - cx)/σ)²)
terrain[x] = height - min(floor + Σ spireᵢ(x) * height * 0.85, height - 1)
```

#### `genPlateau`
- Middle 55–65% of map (PRNG width): flat top at 18–25% of height (PRNG level).
- Edge ramps: linear interpolation over 12–18% of width each side.
- Slight noise (±2px) on flat top.

```
leftEdge  = PRNG(0.12, 0.18) * width
rightEdge = (1 - PRNG(0.12, 0.18)) * width
plateauY  = height * PRNG(0.18, 0.25)
floorY    = height * 0.72
```

#### `genFlat`
- Constant value: `height * 0.65` (matches current baseline). No noise.

---

## Wall Mode Mechanics

### In `stepProjectiles` (`packages/game/src/physics/step.ts`)

Replace the current flat out-of-bounds check with a wall-mode dispatcher. Top-of-screen (`y < 0`) always emits `out-of-bounds` regardless of mode.

```typescript
// After position update, before terrain collision:

// Top of screen — always OOB regardless of wall mode
if (p.y < -200) {
  events.push({ kind: "out-of-bounds", projectileId: p.id });
  continue;
}

// Soft bottom — always OOB
if (p.y > SOFT_BOTTOM) {
  events.push({ kind: "out-of-bounds", projectileId: p.id });
  continue;
}

// Left/right walls
if (p.x < 0 || p.x >= terrainWidth) {
  switch (wallMode) {
    case "none":
      events.push({ kind: "out-of-bounds", projectileId: p.id });
      continue; // projectile removed

    case "wrap":
      p.x = ((p.x % terrainWidth) + terrainWidth) % terrainWidth;
      // projectile continues — fall through to terrain check
      break;

    case "reflect":
      p.vx = -p.vx;
      p.x = p.x < 0 ? 0 : terrainWidth - 1;
      // projectile continues
      break;

    case "absorb":
      // Explode at edge — treat as terrain impact
      const edgeX = p.x < 0 ? 0 : terrainWidth - 1;
      events.push({ kind: "terrain-impact", projectileId: p.id,
                    x: edgeX, y: p.y, weapon: p.weapon, ownerId: p.ownerId });
      continue; // projectile removed
  }
}
```

### In `simulateProjectile` (`packages/game/src/physics/simulate.ts`)

Same wall-mode logic applied to the trajectory simulator so the aim preview dotted line correctly reflects wrap/reflect/absorb behavior. `SimInput.wallMode` is passed down from the server's current `state.wallMode`.

---

## Server Changes

### `MatchRoom` — round start (`apps/server/src/rooms/MatchRoom.ts` / `resolveTurn.ts`)

In `startRound` (or equivalent), after terrain seed generation:

```typescript
const typesPool = parsePool(state.terrainTypePool, ALL_TERRAIN_TYPES);
const modesPool = parsePool(state.wallModePool, ALL_WALL_MODES);
state.terrainType = prng.pick(typesPool);   // uniform random from pool
state.wallMode    = prng.pick(modesPool);
```

`prng.pick` is a new helper on the existing PRNG: `pick<T>(arr: T[]): T` → returns `arr[Math.floor(nextFloat() * arr.length)]`.

### `MatchRoom` — configure handler

```typescript
this.onMessage("configure", (client, msg) => {
  if (client.sessionId !== state.hostId) return;
  if (msg.terrainTypePool !== undefined) state.terrainTypePool = String(msg.terrainTypePool);
  if (msg.wallModePool    !== undefined) state.wallModePool    = String(msg.wallModePool);
  // … existing turnTimerMs / maxRounds / loadoutId handling …
});
```

### Tick loop — pass `wallMode`

In `tickLoop.ts`, pass `state.wallMode` into `stepProjectiles`:

```typescript
const result = stepProjectiles({
  // … existing fields …
  wallMode: state.wallMode as WallMode,
});
```

---

## Client Changes

### `TerrainRenderer` — rebuild on `terrainType` change (`apps/client/src/render/Terrain.ts`)

`generateTerrain` already takes `type` from `TerrainOptions`. `buildTerrain` in `MatchScene` currently only reacts to `terrainSeed` changes. Add a listener:

```typescript
$(state).listen("terrainType", () => buildTerrain(state.terrainSeed));
```

`buildTerrain` passes the current `state.terrainType` to `TerrainRenderer`:

```typescript
const buildTerrain = (seed: string) => {
  const t = new TerrainRenderer(seed, state.terrainType as TerrainType);
  // …
};
```

`TerrainRenderer` constructor passes the type to `generateTerrain`.

### Round info HUD pill (`apps/client/src/hud/`)

New file: `apps/client/src/hud/RoundInfo.ts`

- A DOM element (fixed position, top-left of game view, z-index above canvas).
- Shows: `Mountains · Wrap` (terrain type label + wall mode label).
- Fades in at round start (300ms opacity transition), stays visible until round ends.
- Wired in `MatchScene`: listens to `terrainType` and `wallMode` state changes.

```typescript
export class RoundInfo {
  private el: HTMLDivElement;

  constructor() {
    this.el = document.createElement("div");
    this.el.style.cssText =
      "position:fixed;top:12px;left:12px;background:rgba(0,0,0,0.7);" +
      "color:#e6edf3;font:11px 'Courier New',monospace;padding:4px 10px;" +
      "border-radius:6px;z-index:100;opacity:0;transition:opacity 0.3s;pointer-events:none;";
    document.getElementById("ui")!.appendChild(this.el);
  }

  update(terrainType: string, wallMode: string): void {
    const typeLabel = TERRAIN_LABELS[terrainType] ?? terrainType;
    const modeLabel = WALL_LABELS[wallMode] ?? wallMode;
    this.el.textContent = `${typeLabel} · ${modeLabel}`;
    this.el.style.opacity = "1";
  }

  hide(): void { this.el.style.opacity = "0"; }
}

const TERRAIN_LABELS: Record<string, string> = {
  mountains: "Mountains", hills: "Hills", valleys: "Valleys",
  cliffs: "Cliffs", crater: "Crater", "sky-high": "Sky High",
  plateau: "Plateau", flat: "Flat", random: "Random",
};

const WALL_LABELS: Record<string, string> = {
  none: "No Walls", wrap: "Wrap", reflect: "Reflect", absorb: "Absorb",
};
```

### Lobby pool pickers (`apps/client/src/scenes/LobbyScene.ts`)

Host-only section added below existing controls. Two groups:

**Terrain Types** (9 checkboxes, all checked by default):
```
☑ Mountains  ☑ Hills  ☑ Valleys  ☑ Cliffs  ☑ Crater
☑ Sky High   ☑ Plateau  ☑ Flat  ☑ Random
```

**Wall Modes** (4 checkboxes, all checked by default):
```
☑ No Walls  ☑ Wrap  ☑ Reflect  ☑ Absorb
```

On change, host sends `configure` with the updated pool string. Non-host players see the same checkboxes disabled (read from state).

---

## PRNG Extension

Add `pick<T>(arr: T[]): T` to the PRNG class (`packages/game/src/rng/prng.ts`):

```typescript
pick<T>(arr: T[]): T {
  if (arr.length === 0) throw new Error("pick: empty array");
  return arr[Math.floor(this.nextFloat() * arr.length)]!;
}
```

---

## Testing

### `packages/game` — TDD

| Test file | What it covers |
|---|---|
| `terrain/generate.test.ts` | One smoke test per terrain type: output length == width, all values in `[0, height]`, deterministic (same seed → same output) |
| `physics/step.test.ts` | One test per wall mode: wrap teleports x, reflect negates vx, absorb emits terrain-impact at edge, none emits out-of-bounds |
| `rng/prng.test.ts` | `pick` returns element from array; throws on empty |

### `apps/server` — integration

Extend existing `MatchRoom.test.ts`:
- Host `configure` with `terrainTypePool` and `wallModePool` updates state
- `startRound` sets `terrainType` to a value from the pool

---

## File Map

| File | Status | Change |
|---|---|---|
| `packages/shared/src/schema/MatchState.ts` | Modify | Add `wallMode`, `terrainTypePool`, `wallModePool` |
| `packages/shared/src/constants.ts` | Modify | Add `ALL_TERRAIN_TYPES`, `ALL_WALL_MODES`, `parsePool`, `WallMode` |
| `packages/shared/src/intents.ts` | Modify | Add `terrainTypePool?`, `wallModePool?` to configure intent |
| `packages/shared/src/index.ts` | Modify | Export new constants |
| `packages/game/src/types.ts` | Modify | Add `TerrainType` union, expand `TerrainOptions.type`, add `wallMode` to `StepInput` and `SimInput` |
| `packages/game/src/terrain/generate.ts` | Modify | Dispatcher + 8 new generators (keeping existing `genRandom`) |
| `packages/game/src/terrain/generate.test.ts` | Modify | 9 smoke tests (one per type) |
| `packages/game/src/physics/step.ts` | Modify | Wall-mode dispatcher replacing flat OOB check |
| `packages/game/src/physics/step.test.ts` | Modify | 4 wall-mode tests |
| `packages/game/src/physics/simulate.ts` | Modify | Same wall-mode logic for trajectory preview |
| `packages/game/src/rng/prng.ts` | Modify | Add `pick<T>` method |
| `packages/game/src/rng/prng.test.ts` | Modify | `pick` tests |
| `packages/game/src/index.ts` | Modify | Export `TerrainType`, `ALL_TERRAIN_TYPES` |
| `apps/server/src/rooms/MatchRoom.ts` | Modify | Configure handler additions; `applyRoundStartItems` → `startRound` adds type/mode draw |
| `apps/server/src/rooms/tickLoop.ts` | Modify | Pass `wallMode` to `stepProjectiles` |
| `apps/client/src/render/Terrain.ts` | Modify | Accept `TerrainType` in constructor |
| `apps/client/src/scenes/MatchScene.ts` | Modify | Listen to `terrainType` + `wallMode` changes; wire `RoundInfo` |
| `apps/client/src/scenes/LobbyScene.ts` | Modify | Pool picker checkboxes for host |
| `apps/client/src/hud/RoundInfo.ts` | **Create** | Terrain type + wall mode HUD pill |

---

## Acceptance Criteria

1. All 9 terrain types generate visually distinct heightmaps; same seed produces identical output on client and server.
2. All 4 wall modes behave correctly for projectiles (manual smoke test + unit tests).
3. Host can set pools in lobby; non-host sees pools read-only.
4. Every round picks a new type and mode from the pools; never picks a type or mode not in the pool.
5. Aim trajectory dotted line correctly reflects wrap/reflect/absorb boundary.
6. `RoundInfo` pill appears at round start showing correct labels.
7. All pre-existing Phase 1–4 tests continue to pass.
8. `packages/game` test coverage ≥ 90%.

---

*End of Phase 5 design.*
