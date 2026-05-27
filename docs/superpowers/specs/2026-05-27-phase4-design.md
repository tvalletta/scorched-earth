# Phase 4 Design Spec — Weapons Catalog + Defensive Systems

**Date:** 2026-05-27  
**Status:** Approved  
**Scope:** Complete the 30-weapon catalog (24 new weapons), defensive items (shields, parachute, battery), falling-tank damage, and fuel-based tank movement.

---

## 1. Overview

Phase 4 adds two major feature sets in tandem:

- **Weapons Catalog Completion** — all 24 weapons not yet implemented, spanning 4 complexity tiers
- **Defensive Systems & Movement** — 4 shield tiers, Parachute, Battery, falling-tank damage, and Q/E integrated driving

The core architectural addition is a **PendingEffect event queue** in `MatchState` that drives all persistent, cross-turn behavior (burn zones, smoke zones).

---

## 2. PendingEffect Queue

### 2.1 Schema

New Colyseus schema class added to `packages/shared/src/schema/`:

```typescript
// packages/shared/src/schema/PendingEffect.ts
export class PendingEffect extends Schema {
  @type("string") kind = "";      // "burn-zone" | "smoke-zone"
  @type("number") x = 0;         // center x (terrain column)
  @type("number") width = 0;     // zone width in pixels
  @type("number") damage = 0;    // per-tick damage (burn-zone only; 0 for smoke)
  @type("number") turnsLeft = 0; // decremented each turn start; removed at 0
}
```

`MatchState` gains:

```typescript
@type([PendingEffect]) pendingEffects = new ArraySchema<PendingEffect>();
```

### 2.2 Turn Flow (updated)

```
1. Turn start → processPendingEffects()
     - For each burn-zone: deal `damage` to any tank whose x falls within [zone.x - zone.width/2, zone.x + zone.width/2]
     - Decrement turnsLeft for all effects
     - Remove effects where turnsLeft <= 0
     - Broadcast PENDING_EFFECT_TICK state delta

2. Aim phase opens (unchanged)

3. All fire intents collected → projectile simulation tick loop
     - Patriot intercept checked per tick (see §4.4)
     - Super Magnetic Shield deflection checked per tick (see §3.3)

4. Weapon impacts resolve:
     - Carve terrain (existing)
     - Deal damage via resolveShieldDamage() (see §3.2)
     - Enqueue new PendingEffects for Napalm/Fireball/Smoke

5. Falling tanks resolved via resolveFallingTank() (see §3.4)

6. Death explosions chain (existing)

7. Turn end → broadcast full state delta
```

### 2.3 Weapons That Enqueue Effects

| Weapon     | kind        | width | damage/turn | turnsLeft |
|------------|-------------|-------|-------------|-----------|
| Napalm     | burn-zone   | 80px  | 15          | 2         |
| Hot Napalm | burn-zone   | 120px | 25          | 2         |
| Fireball   | burn-zone   | 60px  | 20          | 1         |
| Smoke      | smoke-zone  | 100px | 0           | 3         |

---

## 3. Defensive Systems

### 3.1 Shield Catalog

Replaces the current `packages/shared/src/shields.ts` with spec-accurate definitions:

| ID                    | Label                 | HP  | Price  | Special                                           |
|-----------------------|-----------------------|-----|--------|---------------------------------------------------|
| `shield`              | Shield                | 50  | $5,000 | Absorb only                                       |
| `heavy-shield`        | Heavy Shield          | 150 | $12,000| Absorb only                                       |
| `super-magnetic`      | Super Magnetic Shield | 250 | $25,000| Absorb + deflects projectiles within 10px         |
| `force-shield`        | Force Shield          | 500 | $50,000| Absorb + reflects 25% of absorbed damage to attacker |

`ShieldDef` interface updated:

```typescript
export interface ShieldDef {
  id: string;
  label: string;
  maxHp: number;
  price: number;
  packSize: number;
  deflectRadius?: number;   // Super Magnetic — pixels; undefined = no deflect
  reflectFraction?: number; // Force Shield — 0–1; undefined = no reflect
}
```

### 3.2 Shield Damage Resolution

```typescript
// packages/game/src/resolveShieldDamage.ts
function resolveShieldDamage(
  tank: Tank,
  rawDamage: number,
  shieldPierce: number,   // 0 for normal weapons; 0.5 for Plasma Ball/Blast
  attacker: Tank | null,
  state: MatchState
): void {
  const piercedDamage  = rawDamage * shieldPierce;         // bypasses shield entirely
  const shieldedDamage = rawDamage * (1 - shieldPierce);   // goes through shield first

  const absorbed = Math.min(shieldedDamage, tank.shieldHp);
  tank.shieldHp -= absorbed;
  const overflow = shieldedDamage - absorbed;

  // Force Shield reflect
  const def = SHIELD_DEFS.get(tank.shieldId);
  if (def?.reflectFraction && absorbed > 0 && attacker) {
    resolveShieldDamage(attacker, absorbed * def.reflectFraction, 0, null, state);
  }

  tank.hp -= overflow + piercedDamage;

  if (tank.shieldHp <= 0) {
    tank.shieldHp = 0;
    tank.shieldId = "";
  }
}
```

### 3.3 Super Magnetic Shield Deflection

During the projectile tick loop, after each position update:

```
for each active projectile p:
  for each alive tank t with shieldId === "super-magnetic":
    dist = distance(p.x, p.y, t.x, t.y)
    if dist < 10:
      // push projectile away from tank center
      angle = atan2(p.y - t.y, p.x - t.x)
      p.vx += cos(angle) * DEFLECT_FORCE
      p.vy += sin(angle) * DEFLECT_FORCE
```

`DEFLECT_FORCE = 50` (tunable constant in `packages/shared/src/constants.ts`).

### 3.4 Falling-Tank Damage

Called after every `carveAndSettle()` pass for tanks whose support column was modified:

```typescript
// packages/game/src/resolveFallingTank.ts
const SAFE_FALL = 30;       // pixels
const FALL_DAMAGE_FACTOR = 0.5;

function resolveFallingTank(tank: Tank, fallPixels: number): void {
  if (fallPixels <= SAFE_FALL) return;

  if ((tank.inventory.get("parachute") ?? 0) > 0) {
    tank.inventory.set("parachute", tank.inventory.get("parachute")! - 1);
    return; // no damage, parachute consumed
  }

  tank.hp -= (fallPixels - SAFE_FALL) * FALL_DAMAGE_FACTOR;
}
```

### 3.5 Battery

- `$2,000`, pack of 1. Stored in inventory as `"battery"`.
- `use-battery` intent (already defined in `intents.ts`) handled in `MatchRoom`:

```typescript
tank.shieldHp = Math.min(tank.shieldHp + 100, tank.shieldMaxHp);
tank.inventory.set("battery", (tank.inventory.get("battery") ?? 0) - 1);
```

- No effect if `tank.shieldId === ""` (server ignores intent silently).
- The `equip-shield` intent is sent automatically by the shop screen when a shield is purchased — no separate equip step. `tank.shieldMaxHp` is set to `def.maxHp` and `tank.shieldHp` is set to `def.maxHp` at equip time, discarding the old shield's remaining HP.

### 3.6 Shield UX

- Shields are **always-on** when equipped — no manual toggle.
- Equipping a new shield via `equip-shield` intent replaces and discards the current one.
- Shield HP rendered as a colored arc ring around the tank sprite by `Shield.ts` (stub exists).
- Ring color: green (>50% HP) → yellow (20–50%) → red (<20%).
- Battery button shown in HUD only when `tank.shieldId !== ""`; grayed if no battery in inventory.

---

## 4. Tank Movement

### 4.1 Controls

- **Q** = drive left, **E** = drive right.
- Available any time during the aim phase, before the fire intent is sent.
- Locked once a `fire` intent is received (`tank.hasFired = true`).

### 4.2 Intent Flow

Client sends incremental `{ kind: "move", direction: "left"|"right", pixels: 1 }` intents while Q/E are held (throttled to 1 per 16ms frame). Server accumulates and processes each:

```typescript
// apps/server/src/rooms/MatchRoom.ts — handleMove()
function handleMove(tank: Tank, direction: "left"|"right", pixels: number): void {
  if (tank.hasFired || !tank.alive) return;

  pixels = Math.min(pixels, tank.fuel);
  if (pixels <= 0) return;

  const dx = direction === "left" ? -pixels : pixels;
  const targetX = Math.round(tank.x + dx);

  // Slope check: |Δheight| / |Δx| <= 1.0 (≈45°)
  const rise = Math.abs(heightmap[targetX] - heightmap[Math.round(tank.x)]);
  if (rise / Math.abs(dx) > 1.0) return; // too steep

  tank.x = targetX;
  tank.y = heightmap[targetX]; // snap to terrain surface
  tank.fuel -= pixels;
}
```

### 4.3 Fuel

- Starts at `100` at the beginning of each round.
- Fully regenerates to `100` between rounds (in `resetRound()`).
- `tank.fuel` already exists in `Tank` schema.
- No fuel item in shop for v4 — fuel is a fixed per-round resource.

### 4.4 Patriot Auto-Intercept

Patriot is a passive item stored in inventory as `"patriot"`. During the projectile tick loop:

```
for each alive tank t where inventory["patriot"] > 0:
  for each active projectile p not owned by t:
    dist = distance(p.x, p.y, t.x, t.y)
    if dist < 200 && p.vy > 0:  // only intercept descending projectiles
      spawn intercept projectile aimed at p's current position
      consume one patriot charge (inventory["patriot"] -= 1)
      mark p for removal
      break  // one intercept per tick per tank
```

Intercept projectile: radius 25, damage 0 (destroys the incoming shell only).

---

## 5. New WeaponDef Fields

```typescript
// packages/game/src/types.ts — additions to WeaponDef
shieldPierce?:    number;         // 0–1; fraction of damage that bypasses shield. Default 0.
terrainDeposit?:  DepositShape;   // if set, raises heightmap on impact
burrow?:          boolean;        // Sandhog/Tunneler — carves vertical tunnel on terrain hit
rollOnImpact?:    boolean;        // Roller — converts to surface-rolling projectile on terrain hit
leapCount?:       number;         // Leapfrog — number of bounces (velocity * 0.7 each)
laser?:           boolean;        // instant straight-line, no arc simulation
patriot?:         boolean;        // item behaves as passive Patriot, not a fired weapon

interface DepositShape {
  halfWidth: number;  // columns either side of impact
  height:    number;  // pixels added to heightmap (tapers to 0 at edges)
  spray?:    boolean; // Liquid Dirt: arc distribution vs. flat plateau
}
```

---

## 6. Weapons Catalog — Full Specs

### 6.1 Group 1 — Variants

| ID              | Label          | Radius | Damage    | Price   | Pack | Notes                          |
|-----------------|----------------|--------|-----------|---------|------|--------------------------------|
| `deaths-head`   | Death's Head   | 80     | 150       | $75,000 | 1    | Simple large blast             |
| `deaths-knell`  | Death's Knell  | 70     | 130       | $50,000 | 1    | Cheaper Death's Head           |
| `triple-warhead`| Triple Warhead | 40     | 70×3      | $20,000 | 1    | 3-way downward fan (like MIRV) |
| `pineapple`     | Pineapple      | 30     | varies    | $25,000 | 1    | 9-cluster (like Funky Bomb)    |
| `funky-nuke`    | Funky Nuke     | 45     | varies    | $30,000 | 1    | 8 Baby Nukes at Funky apex     |
| `wimpy-pack`    | Wimpy Pack     | 20     | 25        | $5,000  | 1    | On purchase: adds 30 to `inventory["baby-missile"]` directly. Not a selectable weapon. |
| `plasma-ball`   | Plasma Ball    | 35     | 70        | $5,000  | 3    | shieldPierce: 0.5              |
| `plasma-blast`  | Plasma Blast   | 50     | 110       | $10,000 | 2    | shieldPierce: 0.5              |

### 6.2 Group 2 — New Physics

| ID             | Label        | Price   | Mechanic                                                                                     |
|----------------|--------------|---------|----------------------------------------------------------------------------------------------|
| `leapfrog`     | Leapfrog     | $6,000  | On terrain hit: bounce at 70% velocity, up to 3 bounces. Explodes (r25, d30) on each hit.   |
| `roller`       | Roller       | $7,000  | On terrain hit: rolls along surface at `ROLLER_SPEED = 200px/s`. Explodes (r25, d40) on tank contact or screen edge. |
| `heavy-roller` | Heavy Roller | $14,000 | Same as Roller. r35, d60.                                                                    |
| `laser`        | Laser        | $20,000 | Instant line at fired angle from muzzle. Hits all tanks on line. r0 (line), d80. No arc. Does NOT carve terrain. Pierces all targets (hits every tank on the line, not just first). |
| `plasma-wave`  | Plasma Wave  | $18,000 | On impact: expands horizontally ±400px at the fixed y of impact (not terrain-following). d90 to any tank crossed. |
| `tracer`       | Tracer       | $1,000  | No-damage shell. Server returns full trajectory path. Client renders dotted preview. Consumed.|
| `smoke`        | Smoke        | $800    | On impact: enqueues smoke-zone (width 100, 3 turns). Client hides `TrajectoryOverlay` when the tank's x falls within any active smoke-zone. |

### 6.3 Group 3 — Terrain Modifiers

| ID             | Label       | Price   | Mechanic                                                                                        |
|----------------|-------------|---------|--------------------------------------------------------------------------------------------------|
| `dirt-clod`    | Dirt Clod   | $1,500  | Raises heightmap ±20px wide by +40px at impact. No damage. terrainDeposit: {halfWidth:20, height:40} |
| `dirt-ball`    | Dirt Ball   | $3,000  | terrainDeposit: {halfWidth:40, height:60}                                                        |
| `liquid-dirt`  | Liquid Dirt | $5,000  | terrainDeposit: {halfWidth:150, height:40, spray:true} — tapers from center.                     |
| `sandhog`      | Sandhog     | $7,500  | On terrain hit: burrow=true. Carves 20px-wide vertical tunnel to map bottom. No damage.          |
| `tunneler`     | Tunneler    | $9,000  | Same as Sandhog + explodes (r30, d30) at tunnel bottom.                                          |

### 6.4 Group 4 — Persistent Effects & Intercept

| ID          | Label    | Price   | Mechanic                                                                                          |
|-------------|----------|---------|---------------------------------------------------------------------------------------------------|
| `napalm`    | Napalm   | $6,000  | Impact blast (r50, d60). Enqueues burn-zone: width 80, 15dmg/turn, 2 turns.                      |
| `hot-napalm`| Hot Napalm | $11,000 | Impact blast (r60, d80). Enqueues burn-zone: width 120, 25dmg/turn, 2 turns.                   |
| `fireball`  | Fireball | $4,000  | Impact blast (r30, d45). Enqueues burn-zone: width 60, 20dmg/turn, 1 turn.                       |
| `patriot`   | Patriot  | $15,000 | Passive item. Auto-intercepts descending projectiles within 200px. 1 charge = 1 intercept.       |

---

## 7. Shop Changes

### 7.1 New Defense Tab

The shop screen gains a **Defense** tab alongside the existing Weapons tab, containing:

| Item                  | Price   | Pack |
|-----------------------|---------|------|
| Shield                | $5,000  | 1    |
| Heavy Shield          | $12,000 | 1    |
| Super Magnetic Shield | $25,000 | 1    |
| Force Shield          | $50,000 | 1    |
| Battery               | $2,000  | 1    |
| Parachute             | $200    | 1    |

### 7.2 Loadout Updates

All three loadouts (Starter, Standard, Bonanza) seeded with **1 Parachute** by default. Bonanza additionally starts with **1 Shield**.

---

## 8. Client HUD Changes

| Element                  | Change                                                                                 |
|--------------------------|----------------------------------------------------------------------------------------|
| Aim controls panel       | Add fuel bar (Q/E labels) below angle/power controls                                   |
| Tank sprite              | Shield HP arc ring (green → yellow → red) via `Shield.ts` when `shieldId !== ""`      |
| Battery button           | New HUD button; visible only when shield equipped, grayed if no battery in inventory   |
| Burn zone                | Flickering orange flame rendered on terrain at burn-zone x ± width/2                  |
| Smoke zone               | Semi-transparent gray cloud at smoke-zone position                                     |
| Patriot render           | Intercept missile trail via existing `Patriot.ts` stub                                 |
| Roller                   | Projectile hugs terrain surface; rendered as rolling ball sprite                       |
| Laser                    | Instant bright magenta line rendered for 0.3s, then fades                              |
| Leapfrog                 | Impact flash + bounce arc on each of 3 hits                                            |
| Plasma Wave              | Expanding horizontal sheet animation ±400px from impact                                |

---

## 9. Files Changed / Created

### packages/shared/src/
- `schema/PendingEffect.ts` — new schema class
- `schema/MatchState.ts` — add `pendingEffects` array
- `schema/Tank.ts` — add `hasFired: boolean` (reset each turn start)
- `shields.ts` — replace with 4 spec-accurate shield defs
- `intents.ts` — no changes needed (move/equip-shield/use-battery already defined)
- `constants.ts` — add `DEFLECT_FORCE`, `SAFE_FALL`, `FALL_DAMAGE_FACTOR`

### packages/game/src/
- `types.ts` — extend `WeaponDef` with new optional fields
- `resolveShieldDamage.ts` — new function
- `resolveFallingTank.ts` — new function
- `processPendingEffects.ts` — new function
- `weapons/` — 24 new weapon definition files (or grouped files by category)
- `weapons/index.ts` — register all 24 in WEAPON_REGISTRY

### apps/server/src/rooms/
- `MatchRoom.ts` — handleMove(), handleEquipShield(), handleUseBattery(); Patriot loop; turn-start processPendingEffects()
- `resolveTurn.ts` — integrate resolveShieldDamage(), resolveFallingTank(), terrain deposit, burrow, roll, laser, plasma-wave
- `tickLoop.ts` — Super Magnetic deflection check, Patriot intercept check

### apps/client/src/
- `input/AimControls.ts` — Q/E key handling, fuel display
- `hud/` — fuel bar component, battery button
- `render/Shield.ts` — implement arc ring (stub → real)
- `render/Patriot.ts` — implement intercept trail (stub → real)
- `render/Terrain.ts` — burn zone flame, smoke zone cloud overlays
- `render/Projectile.ts` — roller surface-hug, leapfrog bounce flash, laser line, plasma wave sheet

### apps/client/src/scenes/
- `ShopScene.ts` — Defense tab, new items
