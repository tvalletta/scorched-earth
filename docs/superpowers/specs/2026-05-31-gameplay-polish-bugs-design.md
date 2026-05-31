# Gameplay Polish & Bug Fixes — Design Spec
**Date:** 2026-05-31  
**Status:** Approved

---

## Overview

Nine distinct issues covering multiplayer flow, HUD usability, rendering correctness, weapon behavior, terrain generation, and dev tooling.

---

## 1. Store Ready Exits Immediately

### Problem
`openShop()` in `MatchRoom.ts` marks every AI tank `readyForShop = true` synchronously (line ~734). When the human player then clicks Ready, `allReady` becomes true and the shop closes instantly — no time to browse.

### Fix
Delay AI `readyForShop = true` by **10 000 ms** after shop opens. Replace the synchronous assignment with a `this.clock.setTimeout` call per AI tank:

```
// inside openShop(), replace:
tank.readyForShop = true;

// with:
this.clock.setTimeout(() => {
  tank.readyForShop = true;
  const livingPlayers = Array.from(state.tanks.values()).filter(t => t.alive);
  if (livingPlayers.every(t => t.readyForShop)) this.advanceAfterShop();
}, 10_000);
```

The shop timer still closes things automatically at `SHOP_DURATION_MS`. AI shopping purchases are applied synchronously as before; only the ready-flag fires later.

---

## 2. Weapon HUD — Grid Panel (Option C1)

### Replaces
The horizontal infinite-scroll carousel in `HudBar.ts`.

### Layout
```
┌──────────────────────────────────────────────────────────────────────┐
│ [Dial] [Pwr] │ [ALL][BALLISTIC][FIRE][ENERGY][UTILITY]   ← Q / E → │ [Wind/Round] [🔥FIRE] │
│              │ [chip][chip][chip][chip][chip][chip][chip][chip]...   │               │
└──────────────────────────────────────────────────────────────────────┘
```

Height stays at ~104 px. Category tabs row (~22 px) + chip grid row (~76 px) fill the center panel.

### Chip States (three, mutually exclusive)

| State | Condition | Border | Background | Opacity | Cursor |
|---|---|---|---|---|---|
| **Selected** | `weaponId === selectedKey` | `2px solid #ff8c00` + box-shadow glow | `rgba(255,140,0,0.18)` | 1 | pointer |
| **Owned** | `count > 0 || count === -1` | `1.5px solid rgba(255,180,0,0.45)` | `rgba(255,140,0,0.07)` | 1 | pointer |
| **Zero** | `count === 0` | `1px solid rgba(255,255,255,0.08)` | `rgba(255,255,255,0.02)` | 0.35 + grayscale(0.6) | not-allowed |

Each chip shows: emoji icon (20 px owned / 24 px selected), weapon name (7 px bold, truncated), ammo count (14 px Impact owned / 17 px selected; `∞` only for count === -1).

### Ammo Display Bug Fix
`HudBar.ts` line ~366 currently treats `undefined` inventory entries as `∞`. Fix:
```ts
// before:
const ammoStr = ammo === undefined || ammo < 0 ? '∞' : String(ammo);
// after:
const ammoStr = ammo !== undefined && ammo < 0 ? '∞' : String(ammo ?? 0);
```

### Category Tabs
Same five tabs as the shop: ALL / BALLISTIC / FIRE / ENERGY / UTILITY. `activeTab` state lives in `HudBar`. Tab click re-renders the grid. The `WEAPON_CATEGORIES` map from `ShopScene` is extracted to a shared constant (or duplicated into `HudBar`).

### Key Navigation (Q / E)
`scrollWeapon(delta)` advances through only **owned + infinite** weapons (skipping zero-count entries) within the active category. Wraps.

### Scroll Debounce
Wheel events on the grid: accumulate and fire at most once per 150 ms.

### Shield Chips
Shields (from `SHIELD_DEFS`) appear at the end of the ALL tab and their own implicit DEFENSE bucket (not a tab, just always-appended when not filtered to a weapon category). Chip label shows "EQUIP" when count > 0, "ACTIVE" (green tint) when tank's `shieldId === def.id`. Click sends `room.send("equip-shield", { shieldId })` instead of `select-weapon`. Zero-owned shields use the same zero chip style (dim + not-allowed).

---

## 3. Stalactites / Underside Rendering

### Problem
Both `drawUnderside` and `drawCeiling` in `Terrain.ts` start their stalactite triangle bases just outside the rock body (6 px offset), making the flat triangle top visible as a floating line against the sky/air gap.

### Fix — `drawUnderside`
```ts
// before: g.moveTo(sx - wHalf, by - 6)  /  g.lineTo(sx + wHalf, by - 6)
// after:  g.moveTo(sx - wHalf, by - 40) /  g.lineTo(sx + wHalf, by - 40)
```
Base is now 40 px inside the island body. Tip still at `by + len`.

### Fix — `drawCeiling`
```ts
// before: g.moveTo(sx - wHalf, cy + 6)  /  g.lineTo(sx + wHalf, cy + 6)
// after:  g.moveTo(sx - wHalf, cy - 30) /  g.lineTo(sx + wHalf, cy - 30)
```
Base is now 30 px inside the rock ceiling. Tip still at `cy + len`.

Both fixes are purely cosmetic; no physics or heightmap changes.

---

## 4. Shutdown & Restart Scripts

### `package.json` (root)
```json
"kill:server": "lsof -ti tcp:2567 | xargs kill -9 2>/dev/null || true",
"kill:client": "lsof -ti tcp:5183 | xargs kill -9 2>/dev/null || true",
"kill":        "pnpm kill:server && pnpm kill:client",
"restart":     "pnpm kill && pnpm dev"
```

Port 2567 = Colyseus server (`apps/server`). Port 5183 = Vite client (`apps/client/vite.config.ts`).

### README update
Add a "Managing processes" section after the "Running the game" block:
```
## Managing processes

| Command | Effect |
|---|---|
| `pnpm kill` | Kill server (port 2567) + client (port 5183) |
| `pnpm kill:server` | Kill server only |
| `pnpm kill:client` | Kill client only |
| `pnpm restart` | Kill both, then re-run `pnpm dev` |
```

Also correct the stale port reference (README says 5173, actual is 5183).

---

## 5. Funky Bomb — Ground Impact + Rainbow Effect

### Physics (`funky-bomb.ts`)

```ts
// SplitDef trigger field must be widened in types.ts:
trigger: "apex" | "ground";

// funky-bomb.ts changes:
split: {
  trigger: "ground",   // was "apex"
  count: 8,
  spreadDeg: 160,      // was 360 — fans from 10° to 170° (nearly horizontal both sides)
  centerDeg: 90,       // unchanged — centered on upward; wide spread reaches left & right
  inheritVelocity: false,
  ejectionSpeed: 180,
  child: FUNKY_BOMB_SUB,
}
```

`centerDeg: 90, spreadDeg: 160` → angles 10°–170°: the fan naturally covers nearly-horizontal-right through straight-up through nearly-horizontal-left, giving left/right scatter from the impact point without special mirroring logic.

Sub-projectile `windImmune: true` so bullets scatter chaotically rather than being bent uniformly.

### `simulate.ts` — ground trigger

Add a ground-hit split path alongside the existing apex split:
```ts
// After terrain collision is detected (surfaceY check), before detonation:
if (weapon.split?.trigger === "ground") {
  // fire children from impact point; parent does NOT detonate (no crater)
  const vels = childVelocities(weapon.split, vx, vy);
  const children = vels.map(cv => ({
    x, y, vx: cv.vx, vy: cv.vy,
    weapon: weapon.split!.child, ...
  }));
  // push to active projectile list, return without terrain-carve
}
```

### Visual (`Explosion.ts` + `MatchScene.ts`)

Add `'rainbow'` to `ExplosionStyle`. Map `'funky-bomb'` → `'rainbow'` in `STYLE_BY_WEAPON`.

Rainbow burst: on ground-impact detonation, emit 20–30 tiny particles cycling through `[#ff0000, #ff8c00, #ffff00, #00cc44, #00b4d8, #4361ee, #b5179e]`. Each particle: radius 4–8 px, random direction, fades over 600 ms, no gravity. Implemented as a pixi.js `Graphics` burst inside the `Explosion` class's `rainbow` style branch.

---

## 6. Terrain Organic Generation — Plateau Edges

### Problem
`genPlateau` uses linear `t` interpolation for both cliff edges, producing perfectly straight geometric slopes.

### Fix

Replace linear with `smoothstep(t)` on both edges, then add small octave noise along the slope:

```ts
// Left edge (x: 0 → leftEdge):
const t = x / leftEdge;
const curve = smoothstep(t);              // S-curve instead of straight line
const jitter = (noise[x] ?? 0) * 8;       // small noise term on the slope
y = floorY + (plateauY - floorY) * curve + jitter;

// Right edge (x: rightEdge → width-1):
const t = (x - rightEdge) / (width - 1 - rightEdge);
const curve = smoothstep(t);
const jitter = (noise[x] ?? 0) * 8;
y = plateauY + (floorY - plateauY) * curve + jitter;
```

`noise` reuses the existing `buildOctave(seed + "-top", 200, width)` that's already generated. The plateau top keeps its existing `noise * 2` jitter (unchanged).

Result: organic sigmoid cliff faces with rocky texture rather than a geometric trapezoid.

---

## 7. Shield Visualization (Both: Ring + Roster Bar)

### Shield Ring — `ShieldBubble.update`

Three visual zones based on `hpFraction = shieldHp / shieldMaxHp`:

| Zone | Range | Style | Color |
|---|---|---|---|
| Full | > 0.66 | Solid ring, bright | shield color |
| Mid | 0.33–0.66 | Solid ring, dimmed (alpha × 0.55) | shield color |
| Low | < 0.33 | Dashed ring (8 short strokes), red tint | lerp → #ef4444 |

Dashed ring: same as the existing `bend` style's dash loop, but non-rotating and with red blend.

### Roster Bar — `TurnHud.update`

When rendering a tank row, check `tank.shieldId && tank.shieldHp > 0`. If so, append a shield bar beneath the HP bar:

```html
<div class="thp-shield" style="display:flex;align-items:center;gap:4px;padding:1px 0 0 18px;">
  <span style="font:bold 7px sans-serif;color:#4ecdc4;letter-spacing:1px;">🛡</span>
  <!-- 5 segments, each 1/5 of shieldMaxHp -->
  <div style="display:flex;gap:2px;flex:1;">
    [seg][seg][seg][seg][seg]
  </div>
  <span style="font:bold 7px monospace;color:#4ecdc4;">60%</span>
</div>
```

Segment color: green (`#22c55e`) when full, yellow (`#eab308`) when mid, red (`#ef4444`) when low (thresholds same as above). Empty segments: `rgba(255,255,255,0.1)`.

This appended element is part of the structural rebuild (inside the `sig !== this.sig` branch) and updated in the live-update branch for HP changes.

---

## 8. Shield Equip in HUD

Covered in §2 (Weapon HUD). Shields appear at the end of the ALL tab grid as `chip-own` / `chip-zero` entries. Clicking an owned shield sends `room.send("equip-shield", { shieldId: def.id })`. When `tank.shieldId === def.id && tank.shieldHp > 0`, the chip renders in ACTIVE state (green border + "ACTIVE" label instead of count).

Active shield chip style:
```
border: 2px solid #22c55e
background: rgba(34,197,94,0.12)
label: "ACTIVE" in green instead of ammo count
```

---

## 9. Scroll Speed Debounce

In `HudBar.bindEvents()`, replace direct scroll handler with a debounced version:

```ts
let lastWheelMs = 0;
carousel?.addEventListener('wheel', (e: WheelEvent) => {
  e.preventDefault();
  const now = Date.now();
  if (now - lastWheelMs < 150) return;
  lastWheelMs = now;
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (delta !== 0) this.scrollWeapon(delta > 0 ? 1 : -1);
}, { passive: false });
```

---

## File Change Index

| File | Changes |
|---|---|
| `apps/server/src/rooms/MatchRoom.ts` | §1 — delay AI readyForShop |
| `apps/client/src/hud/HudBar.ts` | §2, §9 — full grid panel rewrite |
| `apps/client/src/hud/TurnHud.ts` | §7 — roster shield bar |
| `apps/client/src/render/Terrain.ts` | §3 — stalactite base offsets |
| `apps/client/src/render/Shield.ts` | §7 — ring depletion style |
| `apps/client/src/render/Explosion.ts` | §5 — rainbow style |
| `apps/client/src/scenes/MatchScene.ts` | §5 — wire rainbow explosion trigger |
| `packages/game/src/types.ts` | §5 — add `"ground"` to SplitDef trigger |
| `packages/game/src/physics/simulate.ts` | §5 — ground-trigger split path |
| `packages/game/src/weapons/funky-bomb.ts` | §5 — trigger/spread/centerDeg |
| `packages/game/src/terrain/generate.ts` | §6 — smoothstep plateau edges |
| `package.json` (root) | §4 — kill/restart scripts |
| `README.md` | §4 — process management section, fix port |
