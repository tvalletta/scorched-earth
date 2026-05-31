# Phase 6 — Specialty Weapons — Retroactive As-Built Spec (C3)

**Date:** 2026-05-31
**Status:** Retroactive / as-built. Documents the shipped weapon catalog; no behavior change.
**Resolves:** Audit gap **C3** (Phase 6 had no spec). See `DECISIONS-2026-05-31-audit-resolutions.md`.
**Source of truth:** `packages/game/src/weapons/*` + `packages/game/src/types.ts`. This spec describes
what exists; if code and spec disagree, the code wins and this file should be updated.

---

## 1. Overview

Phase 6 is the specialty-weapon catalog: **27 shop-purchasable weapons** plus the free default
`baby-missile`, totalling **28 entries in `WEAPON_REGISTRY`** (player-selectable, in display order).
Several carriers spawn **sub-munitions** that are *not* registered (only created at runtime via
`split.child`), and a separate `death-explosion` def powers tank-death blasts (also unregistered).

Weapons are pure data (`WeaponDef`) consumed by the deterministic physics in
`packages/game/src/physics/step.ts`; all special behaviors are flags on `WeaponDef` that `step.ts`
branches on, keeping the catalog declarative. Weapons are bought in the shop (`price`/`packSize`),
held in `Tank.inventory`, and fired via the `fire` intent.

**Why this spec exists:** the weapons were built without a design doc. This catalog is needed for
replay versioning (C7 — replays re-sim from intents, so weapon IDs/values are part of the replay
contract) and future balance work.

---

## 2. Data model

### 2.1 `WeaponDef` (`packages/game/src/types.ts`)

```ts
export interface WeaponDef {
  id: string;
  radius: number;       // explosion/carve radius (px); 0 for carriers, lasers, terrain/tracer
  damage: number;       // peak hull damage at impact center; 0 for carriers/utility
  windImmune: boolean;  // true = horizontal wind acceleration does not apply
  split?: SplitDef;     // apex-splitting carrier (radius/damage 0; damage comes from children)
  price: number;        // $ per purchase; 0 = free / sub-munition
  packSize: number;     // units granted per purchase; 0 = not sold (sub-munition / default)
  // Phase-4/6 special mechanics (each handled by a dedicated branch in step.ts):
  shieldPierce?: number;        // 0–1 fraction of damage bypassing shields. Default 0.
  laser?: boolean;              // instant straight-line hit; no ballistic arc.
  plasmaWave?: boolean;         // horizontal expanding wave at impact y.
  rollOnImpact?: boolean;       // converts to a surface-roller on terrain hit.
  leapCount?: number;           // bounces N times at 70% velocity before final impact.
  burrow?: boolean;             // carves a vertical tunnel on terrain hit.
  terrainDeposit?: DepositShape;// raises the heightmap on impact (additive terrain; no damage).
  burnOnImpact?: BurnOnImpact;  // enqueues a burn-zone PendingEffect on impact.
  smokeOnImpact?: { width: number; turnsLeft: number }; // enqueues a smoke-zone PendingEffect.
  tracerMode?: boolean;         // no-damage ranging shell; returns full path; no terrain carve.
}

export interface SplitDef {
  trigger: "apex";          // splits when vy crosses negative → non-negative (top of arc)
  count: number;            // number of sub-munitions
  spreadDeg: number;        // 360 = full radial; <360 = fan
  centerDeg: number;        // fan center in screen space; 90 = straight down
  inheritVelocity: boolean; // add carrier vx/vy to each child's ejection velocity
  ejectionSpeed: number;    // px/s radial push per child
  child: WeaponDef;         // weapon def applied to each sub-munition
}

export interface DepositShape { halfWidth: number; height: number; spray?: boolean; }
export interface BurnOnImpact { width: number; damage: number; turnsLeft: number; }
```

### 2.2 Invariants
- **Determinism.** Weapon behavior in `step.ts` uses only projectile/tank/terrain state + `dt`; no
  `Math.random()`. (Guarded by the replay-determinism regression suite.)
- **Carrier shells deal no direct damage** (`radius:0, damage:0`); their damage is entirely in `child`.
- **Sub-munitions are never in `WEAPON_REGISTRY`** — they exist only as `split.child` and are spawned at
  apex. They have `price:0, packSize:0`.
- **`windImmune`** is true for laser/plasma-wave/rollers/burrowers (their flight model ignores wind);
  ballistic and split carriers are wind-affected.

---

## 3. Catalog by category

Categories follow the source-file grouping (which encodes the intended design families). Values are
as-built. "Damage" is peak center damage; falloff to the radius edge is handled by `computeDamage`.

### 3.1 Core ballistics (standalone files)
Simple ballistic lob weapons with increasing power/cost; the balance backbone.

| id | label | dmg | radius | price | pack | notes |
|---|---|---|---|---|---|---|
| `baby-missile` | Baby Missile | 40 | 20 | 0 | 0 | **Free default** (registered but not sold; every tank's fallback) |
| `missile` | Missile | 60 | 30 | 2,000 | 5 | entry-tier upgrade |
| `baby-nuke` | Baby Nuke | 80 | 45 | 5,000 | 3 | |
| `nuke` | Nuke | 100 | 60 | 10,000 | 2 | top of the plain-ballistic line |

### 3.2 Heavy & split variants (`group1-variants.ts` + `funky-bomb.ts`, `mirv.ts`)
Big single hits and apex-splitting cluster carriers. Carriers show `dmg/radius = 0` (damage is in the child).

| id | label | dmg | radius | price | pack | mechanic |
|---|---|---|---|---|---|---|
| `deaths-head` | Death's Head | 150 | 80 | 75,000 | 1 | biggest single blast in the game |
| `deaths-knell` | Death's Knell | 130 | 70 | 50,000 | 1 | |
| `funky-bomb` | Funky Bomb | — | — | 8,000 | 3 | split: 8 children, 360° radial, ejection 200; child r18/d30 |
| `mirv` | MIRV | — | — | 12,000 | 2 | split: 5 children, 120° fan, inheritVelocity, ejection 260; child r25/d45 |
| `triple-warhead` | Triple Warhead | — | — | 20,000 | 1 | split: 3, 60° fan, inheritVelocity, ejection 280; child r40/d70 |
| `pineapple` | Pineapple | — | — | 25,000 | 1 | split: 9, 360° radial, ejection 250; child r28/d45 |
| `funky-nuke` | Funky Nuke | — | — | 30,000 | 1 | split: 8, 360° radial, ejection 220; child = **baby-nuke** (r45/d80) |
| `plasma-ball` | Plasma Ball | 70 | 35 | 5,000 | 3 | **shieldPierce 0.5** |
| `plasma-blast` | Plasma Blast | 110 | 50 | 10,000 | 2 | **shieldPierce 0.5** |

All split carriers: `trigger:"apex"`, `centerDeg:90`. Children are spawned at the carrier's apex with
radial ejection; `inheritVelocity` adds the carrier's momentum (used by MIRV/triple/funky variants for a
forward-biased spread, while funky-bomb/pineapple/funky-nuke use a symmetric burst).

### 3.3 Alternative-physics movement (`group2-physics.ts`)
Non-standard flight/impact models. All `windImmune: true` except `tracer`/`smoke`.

| id | label | dmg | radius | price | pack | mechanic |
|---|---|---|---|---|---|---|
| `leapfrog` | Leapfrog | 30 | 25 | 6,000 | 3 | `leapCount 3` — bounces 3× at 70% velocity, then detonates |
| `roller` | Roller | 40 | 25 | 7,000 | 3 | `rollOnImpact` — rolls along terrain to seek tanks downslope |
| `heavy-roller` | Heavy Roller | 60 | 35 | 14,000 | 2 | `rollOnImpact` — heavier roller |
| `laser` | Laser | 80 | 0 | 20,000 | 1 | `laser` — instant straight-line beam, no arc |
| `plasma-wave` | Plasma Wave | 90 | 0 | 18,000 | 1 | `plasmaWave` — horizontal expanding wave at impact y |
| `tracer` | Tracer | 0 | 0 | 1,000 | 5 | `tracerMode` — ranging shot: returns full path, deals no damage, no carve |
| `smoke` | Smoke | 0 | 10 | 800 | 5 | `smokeOnImpact {width 100, turnsLeft 3}` — deploys a smoke-zone (vision/▼) |

### 3.4 Terrain manipulation (`group3-terrain.ts`)
Reshape the battlefield rather than (or in addition to) dealing damage.

| id | label | dmg | radius | price | pack | mechanic |
|---|---|---|---|---|---|---|
| `dirt-clod` | Dirt Clod | 0 | 0 | 1,500 | 5 | `terrainDeposit {halfWidth 20, height 40}` — small mound |
| `dirt-ball` | Dirt Ball | 0 | 0 | 3,000 | 3 | `terrainDeposit {halfWidth 40, height 60}` — large mound |
| `liquid-dirt` | Liquid Dirt | 0 | 0 | 5,000 | 2 | `terrainDeposit {halfWidth 150, height 40, spray:true}` — wide spray fill |
| `sandhog` | Sandhog | 0 | 0 | 7,500 | 2 | `burrow` (windImmune) — vertical tunnel, no damage |
| `tunneler` | Tunneler | 30 | 30 | 9,000 | 2 | `burrow` (windImmune) — tunnel **and** a damaging blast |

### 3.5 Fire / burn (`group4-burn.ts`)
Direct hit + a lingering burn-zone PendingEffect that damages tanks in the zone for N turns.

| id | label | dmg | radius | price | pack | burnOnImpact |
|---|---|---|---|---|---|---|
| `fireball` | Fireball | 45 | 30 | 4,000 | 3 | width 60, damage 20, turnsLeft 1 |
| `napalm` | Napalm | 60 | 50 | 6,000 | 3 | width 80, damage 15, turnsLeft 2 |
| `hot-napalm` | Hot Napalm | 80 | 60 | 11,000 | 2 | width 120, damage 25, turnsLeft 2 |

### 3.6 Unregistered defs (runtime-only)
| id | dmg | radius | role |
|---|---|---|---|
| `funky-bomb-sub` | 30 | 18 | funky-bomb child |
| `mirv-sub` | 45 | 25 | MIRV child |
| `triple-sub` | 70 | 40 | triple-warhead child |
| `pineapple-sub` | 45 | 28 | pineapple child |
| `baby-nuke` (funky-nuke child) | 80 | 45 | funky-nuke child (spread-copy of `baby-nuke`, id retained) |
| `death-explosion` | 70 | 40 | tank-death blast (windImmune; emitted on tank destruction, never fired) |

---

## 4. Special mechanics (how each flag behaves in `step.ts`)

- **`split` (apex):** when the carrier's `vy` crosses from negative to ≥0 (top of arc), it is removed and
  `count` children spawn, ejected radially across `spreadDeg` centered at `centerDeg` (90 = down) at
  `ejectionSpeed`; if `inheritVelocity`, the carrier velocity is added. Each child is a full projectile
  running `child`'s mechanics.
- **`shieldPierce` (0–1):** at a shield interaction, `damage*pierce` bypasses the shield straight to hull;
  `damage*(1-pierce)` undergoes the shield effect. Plasma weapons use 0.5. (See the shields spec
  `2026-05-31-phase4-shields-may26-adoption-design.md` §3.)
- **`laser`:** instant straight-line resolution from the muzzle along the aim vector; emits `laser-beam`;
  no ballistic arc, no wind.
- **`plasmaWave`:** at impact, expands horizontally along the impact `y`, hitting tanks within reach.
- **`rollOnImpact`:** on terrain contact the shell converts to a surface roller (`ROLLER_SPEED`),
  following the terrain downhill until it reaches a tank or runs out, then detonates.
- **`leapCount`:** on terrain contact the shell bounces (retaining 70% speed) up to N times, detonating on
  the final impact.
- **`burrow`:** on terrain contact, carves a vertical tunnel (ceiling-aware); `tunneler` also detonates,
  `sandhog` is pure excavation.
- **`terrainDeposit`:** on impact, *raises* the heightmap by a mound (`halfWidth`×`height`, optional
  `spray` for a wide soft fill) instead of cratering; deals no damage.
- **`burnOnImpact` / `smokeOnImpact`:** enqueue a `PendingEffect` zone (burn deals `damage` to tanks in
  `width` for `turnsLeft` turns; smoke obscures for `turnsLeft`).
- **`tracerMode`:** fires a no-damage ranging shell that returns its full sampled path and does not carve —
  used to range a shot without consequences.

---

## 5. Balance shape (as-built observations)

- **Plain ballistics** climb damage/radius with price: 40/20 free → 100/60 at $10k.
- **Split carriers** trade a $-premium and a no-direct-damage shell for area coverage; total potential
  damage scales with `count × child.damage` (e.g. pineapple 9×45, funky-nuke 8×80).
- **Death's Head** ($75k, 150/80) is the definitive single-shot finisher.
- **Utility tiers are cheap** (tracer $1k, smoke $800, dirt-clod $1.5k) — ranging/zoning, not kills.
- **`packSize` falls as power rises** (free/5 → 1) so elite weapons are scarce per purchase.
- These values are the **current balance baseline**; future tuning should update this table + the tests.

---

## 6. Acceptance criteria (anchored to existing tests)

The catalog is locked in by unit tests; any change must keep these green (or update them deliberately):
- `simple-weapons.test.ts`: missile 30/60, baby-nuke 45/80, nuke 60/100 (all `windImmune:false`, no split);
  death-explosion 40/70 `windImmune:true`.
- `split-weapons.test.ts`: funky-bomb split count 8 / spread 360 / inheritVelocity false / child carve r18;
  mirv count 5 / spread 120 / inheritVelocity true / child r25.
- `group1-variants.test.ts`: deaths-head 80/150 $75k; deaths-knell 70/130 $50k; triple-warhead count 3 /
  child r40; pineapple count 9; funky-nuke count 8 / child id `baby-nuke`; plasma-ball shieldPierce 0.5
  r35/d70 $5k×3; plasma-blast shieldPierce 0.5 r50/d110 $10k×2.
- `group2-physics.test.ts`: leapfrog leapCount 3; roller/heavy-roller rollOnImpact; laser/plasma-wave
  flags + r0; tracer tracerMode d0; smoke smokeOnImpact width 100 / turnsLeft 3.
- `group3-terrain.test.ts`: dirt-clod deposit 20/40; dirt-ball 40/60; liquid-dirt spray; sandhog burrow
  d0 $7.5k; tunneler burrow d30 $9k.
- `group4-burn.test.ts`: napalm 50/60 burn 80/15/2; hot-napalm burn 120/25/2; fireball burn _/_/1.

**New-weapon checklist:** define `WeaponDef` in the appropriate group file → register in
`WEAPON_REGISTRY` (display order) if shop-sold → add a unit test asserting its fields → add a `step.ts`
branch + test if it introduces a new mechanic flag → add a shop entry (driven from the registry) → add a
client render/icon → update this catalog table.

---

## 7. Known quirks / debt (as-built; not bugs to fix here)
- `funky-nuke`'s child is a spread-copy of `baby-nuke` that **keeps the id `"baby-nuke"`** (with
  price/packSize zeroed). Harmless today, but replay/telemetry that keys on weapon id will attribute those
  sub-blasts to `baby-nuke`. Consider a distinct `funky-nuke-sub` id if id-level attribution matters.
- `smokeOnImpact` carries no `damage` (only `burnOnImpact` does) — smoke is non-damaging by design.
- `baby-missile` is registered with `price:0, packSize:0` (free default) — it is the only registered entry
  not purchasable; the shop must treat `packSize:0` registry entries as non-buyable.
