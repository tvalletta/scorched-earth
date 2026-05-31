# Phase-4 Shields — Full May-26 System Adoption (C1) — Design

**Date:** 2026-05-31
**Status:** Approved (brainstorming) — pending spec review → implementation plan
**Resolves:** Audit conflict **C1** (see `DECISIONS-2026-05-31-audit-resolutions.md`).
**Supersedes:** the shield catalog + damage model in `2026-05-27-phase4-design.md` §3.1–3.3.
**Authoritative source:** `2026-05-26-phase-4-defenses-movement-design.md` §"Shield definitions" + §"Shield physics formulas".

---

## 1. Overview & goals

Replace the shipped 4-shield system (`shield`, `heavy-shield`, `super-magnetic`, `force-shield` —
full-damage absorb + `reflectFraction`) with the May-26 **5-shield** model: `force-field`,
`deflector-shield`, `magnetic-shield`, `reactive-armor`, `auto-shield`, using an `hpCostFraction`
damage model and four distinct physics types (absorb / deflect / bend / explode), plus auto-equip.

**Non-goals.** No netcode change (the 60 Hz projectile-stream migration already shipped). No save-data
migration (shields are shop-only; matches are ephemeral). No change to Battery (already +250, matching
May-26). No change to the weapon catalog except where shield interaction is defined.

### 1.1 Decisions baked into this spec

| # | Decision | Rationale |
|---|---|---|
| D1 | **Full adoption** — replace the shield catalog + damage model wholesale | User decision on C1; May-26 is authoritative |
| D2 | **Keep plasma `shieldPierce`** (0.5 on Plasma Ball/Blast) | Preserve shipped weapon balance; plasma stays the shield-buster |
| D3 | **Auto-equip at turn start** — if owner holds `auto-shield` and has no active shield, auto-equip one | Least surprising; matches "Auto Shield" intent. *Confirm at review.* |
| D4 | **Magnetic drain = shield self-HP** — `magnetic-shield` loses 15 HP/s of its own `shieldHp` while repelling a hostile projectile | Treats bending as a maintenance cost on the shield. *Confirm at review.* |

---

## 2. Data model

### 2.1 `ShieldDef` (`packages/shared/src/shields.ts`) — replaces current interface

```ts
export type ShieldType = "absorb" | "deflect" | "bend" | "explode";

export interface ShieldDef {
  id: string;
  label: string;
  maxHp: number;
  radius: number;          // px; projectile interacts when dist(center, projectile) < radius
  type: ShieldType;
  hpCostFraction: number;  // shieldHp lost = incomingShieldedDamage * hpCostFraction (absorb/deflect/explode)
  price: number;
  packSize: number;        // inventory units granted per purchase
}

export const SHIELD_DEFS = new Map<string, ShieldDef>([
  ["force-field",      { id:"force-field",      label:"Force Field",      maxHp:200, radius:60,  type:"absorb",  hpCostFraction:0.5,  price:1_500, packSize:1 }],
  ["deflector-shield", { id:"deflector-shield", label:"Deflector Shield", maxHp:500, radius:70,  type:"deflect", hpCostFraction:0.25, price:3_000, packSize:1 }],
  ["magnetic-shield",  { id:"magnetic-shield",  label:"Magnetic Shield",  maxHp:600, radius:100, type:"bend",    hpCostFraction:0,    price:3_500, packSize:1 }],
  ["reactive-armor",   { id:"reactive-armor",   label:"Reactive Armor",   maxHp:1,   radius:50,  type:"explode", hpCostFraction:1,    price:2_000, packSize:3 }],
  ["auto-shield",      { id:"auto-shield",      label:"Auto Shield",      maxHp:400, radius:60,  type:"absorb",  hpCostFraction:0.5,  price:2_500, packSize:2 }],
]);

export const MAGNETIC_DRAIN_HP_PER_SEC = 15;
export const MAGNETIC_FORCE_CONST = 8000;       // bend strength = CONST / dist²
export const REACTIVE_BLAST = { radius: 60, damage: 40 };
```

**Removed:** the `reflectFraction` field (deflect now reflects the *velocity vector*, not a damage %).

### 2.2 `Tank` schema (`packages/shared/src/schema/Tank.ts`) — no field changes

`shieldId`, `shieldHp`, `shieldMaxHp` already exist. Update the `shieldId` comment to list the new ids.

### 2.3 `Weapon` (`packages/game/src/types.ts`) — no change

`shieldPierce?: number` already exists (default 0; 0.5 on plasma). Retained per D2.

### 2.4 `StepResult` shield events (`packages/game/src/types.ts`)

Replace the current shield event set with the May-26 set:

```ts
type ShieldEvent =
  | { kind:"shield-absorb";  projectileId:string; targetId:string; hpBefore:number; hpAfter:number }
  | { kind:"shield-deflect"; projectileId:string; targetId:string; newVx:number; newVy:number; hpBefore:number; hpAfter:number }
  | { kind:"shield-bend";    projectileId:string; targetId:string; impulseX:number; impulseY:number }
  | { kind:"shield-explode"; projectileId:string; targetId:string; x:number; y:number };

// StepResult also carries (already present): shieldDrains: Array<{ sessionId:string; hpDrain:number }>
```

---

## 3. Damage-resolution model

Let `dmg = weapon.damage`, `pierce = weapon.shieldPierce ?? 0`.
Split every shielded hit into:
- `piercedDamage  = dmg * pierce`      → always applied **directly to hull** at contact (bypasses shield)
- `shieldedDamage = dmg * (1 - pierce)` → undergoes the shield's effect below

This split applies to **all four** shield types (D2 — pierce is universal).

### 3.1 absorb (`force-field`, `auto-shield`)
- Projectile **consumed** (removed); emit `shield-absorb`.
- `shieldHp -= shieldedDamage * hpCostFraction` (0.5).
- Hull takes `piercedDamage` only.
- If `shieldHp <= 0` → deactivate (`shieldId=""`, `shieldHp=0`, `shieldMaxHp=0`). The shot is still fully consumed this tick even if the shield breaks (no overflow of `shieldedDamage` to hull).

### 3.2 deflect (`deflector-shield`)
- Reflect velocity about the shield normal `n = (p - center)/dist`:
  `dot = v·n; newV = v - 2·dot·n`. Emit `shield-deflect`.
- `shieldHp -= shieldedDamage * 0.25`; deactivate at ≤0.
- The **shielded tank's hull** takes `piercedDamage` (the pierced fraction passes through to the tank behind the shield).
- Projectile **not** consumed — the live shell continues with reflected velocity and may strike the attacker/others; on any later impact it resolves with its full weapon def (the pierce split only applies at the moment it crosses a shield).

### 3.3 bend (`magnetic-shield`)
- Applied **per tick** while any hostile projectile is within radius (not per-hit):
  `strength = MAGNETIC_FORCE_CONST / dist²; v += n·strength·dt`. Emit `shield-bend` with the impulse.
- `hpCostFraction = 0` (no per-hit cost). Instead the shield owner accrues a drain of
  `MAGNETIC_DRAIN_HP_PER_SEC · dt` (D4) reported via `shieldDrains`; server subtracts it from `shieldHp`;
  deactivate at ≤0.
- Projectile **not** consumed (curves away). Pierce is irrelevant to bend (no contact); a plasma shot is
  still bent. If a bent projectile nonetheless enters a tank hull, normal hull-collision (§4) resolves it.

### 3.4 explode (`reactive-armor`)
- Projectile **consumed**; shield fully spent (`shieldHp=0`, `shieldId=""`). Emit `shield-explode` at contact.
- Server applies `REACTIVE_BLAST` (radius 60, damage 40) via `computeDamage` at contact — damages nearby
  tanks **including the owner**. Hull also takes `piercedDamage` from the original weapon.

---

## 4. `step.ts` integration & ordering

Per-projectile resolution order (existing order, shield block rewritten):

1. physics integrate (capture `prevX/prevY/prevVy`)
2. wall mode (wrap/reflect/absorb)
3. **shield check (rewritten, this spec)** — for each tank with `shieldHp>0` and `shieldId`, excluding the
   projectile owner for non-Patriot shots: if `dist < radius`, apply §3 by `type`. `absorb`/`explode`
   `continue` (projectile gone); `deflect` mutates velocity and continues; `bend` applies impulse + drain
   and continues.
4. hull-collision (the merged direct-contact detonation) — only reached if the shield didn't consume the shot.
5. ceiling collision
6. terrain collision

**Why shield precedes hull/terrain:** a shield must intercept a shot that would otherwise hull-hit or hit
terrain on the same tick (preserves shipped ordering).

**Determinism:** all formulas use only projectile/tank state + `dt`; no `Math.random()` (keeps the
replay-determinism regression suite green).

---

## 5. Server handling (`apps/server/src/rooms/`)

| Concern | Change |
|---|---|
| `shield-absorb`/`-deflect` | apply `hpBefore→hpAfter` to `tank.shieldHp`; deactivate at ≤0 (tickLoop) |
| `shield-bend` | visual only client-side; server applies `shieldDrains` to `shieldHp` |
| `shield-explode` | run `computeDamage(REACTIVE_BLAST)` at contact; apply to all tanks in radius incl. owner; emit `explosion` event |
| `shieldDrains` | subtract `hpDrain` from each listed tank's `shieldHp`; deactivate at ≤0 |
| auto-equip (D3) | at turn start (`onTurnStart`/turn advance), if `inventory["auto-shield"]>0` and `!shieldId`: equip one (`shieldId="auto-shield"`, `shieldHp=maxHp`, decrement inventory) |
| `equip-shield` intent | unchanged logic; works off new `SHIELD_DEFS` |
| `use-battery` | unchanged (+250, clamped to `shieldMaxHp`) |
| AI shield order (`MatchRoom.ts:456`) | replace `["force-shield","super-magnetic","heavy-shield","shield"]` with a priority over new ids, e.g. `["magnetic-shield","deflector-shield","auto-shield","force-field","reactive-armor"]` |
| debug grant (`MatchRoom.ts:567`) | replace `inventory.set("shield",1)` with a valid new id or remove |

---

## 6. Client (`apps/client/src/`)

- **`render/Shield.ts`**: extend `ShieldStyle` to `"absorb"|"deflect"|"bend"|"explode"`; color/radius maps
  keyed by the 5 new ids; bend keeps the existing animated style; deflect = brief spark/ring on reflect;
  explode = one-shot flash (driven by `shield-explode`). Map `shieldId→style` from `SHIELD_DEFS[id].type`.
- **Shop (`ShopScene`)**: list the 5 new shields with new labels/prices/packSizes; remove old ids.
- **HUD**: shield HP overlay already exists; just reads `shieldHp/shieldMaxHp` (no change).

---

## 7. Edge cases & failure modes

- **Shield breaks mid-hit (absorb/deflect):** shot still consumed/deflected that tick; no `shieldedDamage`
  overflow to hull (only `piercedDamage`).
- **Plasma vs magnetic:** pierce irrelevant (no contact); projectile bends; if it later hull-hits, the full
  weapon resolves there (pierce no longer applies — it already passed the shield).
- **Reactive armor self-damage:** owner can be killed by their own reactive blast if point-blank; intended.
- **Auto-equip with an active shield:** never overrides an existing shield; only fills an empty slot.
- **Owner's own projectile:** never blocked by the owner's own shield (existing rule retained).
- **Multiple shielded tanks in radius:** resolve against the first intercepting tank in `tanks` iteration
  order (MapSchema insertion order — deterministic across client/server and replays). For absorb/explode the
  projectile is consumed on that first interception, so later tanks aren't reached that tick.
- **`dist == 0`** (projectile exactly at center): guard normal computation (use a fallback normal).

---

## 8. Component breakdown / files touched

- `packages/shared/src/shields.ts` — new `SHIELD_DEFS`, `ShieldType`, constants (replace).
- `packages/shared/src/schema/Tank.ts` — comment only.
- `packages/game/src/types.ts` — shield event union (replace).
- `packages/game/src/physics/step.ts` — shield block rewrite (absorb/deflect/bend/explode + pierce split).
- `packages/game/src/physics/step.test.ts` — rewrite shield tests (TDD).
- `apps/server/src/rooms/tickLoop.ts` — apply shield events + drains + reactive blast.
- `apps/server/src/rooms/MatchRoom.ts` — auto-equip, AI shieldOrder, debug grant.
- `apps/server/src/rooms/resolveTurn.ts` — if it touches shield resolution.
- `apps/client/src/render/Shield.ts` — styles/colors/radii for 5 shields.
- `apps/client/src/scenes/ShopScene.ts` — shop catalog.
- Server tests for explode blast, magnetic drain, auto-equip.

---

## 9. Testing strategy (TDD)

Game (`step.test.ts`), one block per behavior:
1. **absorb**: force-field consumes projectile, `shieldHp -= dmg*0.5`, no hull dmg; breaks at ≤0.
2. **deflect**: velocity reflected about normal; `shieldHp -= dmg*0.25`; projectile continues.
3. **bend**: per-tick impulse sign/magnitude `8000/dist²`; drain reported; projectile not removed.
4. **explode**: reactive-armor consumed, shield spent, `shield-explode` emitted at contact.
5. **pierce × each type**: `piercedDamage` reaches hull; `shieldedDamage` undergoes shield effect.
6. **auto-equip**: turn-start equips when owned + empty; never overrides; decrements inventory.
7. **deactivation**: shield removed at `shieldHp<=0` for absorb/deflect/explode/drain.
8. **owner exclusion** + **dist==0 guard**.

Server: reactive blast damages owner + neighbors; magnetic drain subtracts over ticks; use-battery clamps.

---

## 10. Sequencing

1. `shields.ts` (defs/types/constants) + shared exports.
2. `types.ts` shield events.
3. `step.ts` shield physics (TDD against step.test.ts) — core.
4. Server: tickLoop event application + drains + reactive blast.
5. Server: auto-equip + AI order + debug grant.
6. Client: Shield render + shop.
7. Full regression: game + server suites; replay-determinism still green.
