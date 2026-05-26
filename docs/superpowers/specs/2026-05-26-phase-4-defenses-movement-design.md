# Phase 4 — Defenses & Movement (Design)

**Status:** Approved, ready for implementation planning.
**Date:** 2026-05-26.
**Parent docs:** `2026-05-22-roadmap.md` (phase plan), `SPEC.md` (full-game north star).
**Phase 3 design:** `2026-05-26-phase-3-economy-shop-design.md`
**Next:** `/superpowers:writing-plans` against this doc.

---

## Goal

Extend Phase 3 with tank movement (fuel-based driving before each shot), five trajectory-modifying shields, a Patriot interceptor missile, parachutes, batteries, and falling-tank damage. The netcode migrates from trajectory-batch to a per-tick projectile stream so that mid-flight shield interactions can happen server-authoritatively in real time.

---

## In Scope

- **Tank movement** — fuel-based left/right driving before firing each turn; drive mode + aim mode in one turn
- **5 trajectory-modifying shields** — Force Field, Deflector Shield, Magnetic Shield, Reactive Armor, Auto Shield
- **Defense items** — Parachute (fall-damage prevention), Battery (shield HP restore), Patriot (auto-intercept missile)
- **Fuel items** — Fuel Tank S/L (movement budget)
- **Falling-tank damage** — tanks that fall after terrain carves take HP damage; parachute prevents it
- **Netcode: projectile-only tick stream** — server broadcasts live projectile positions at 60 Hz during resolving phase; all shield interactions are server-authoritative
- **New intents** — `"move"`, `"equip-shield"`, `"use-battery"`
- **Shop additions** — 10 new purchasable items

## Out of Scope (deferred)

| Feature | Phase |
|---|---|
| Terrain types & wall modes | 5 |
| Remaining 25+ weapons | 6 |
| AI opponents | 7 |
| Full Colyseus schema tick stream | not planned |

---

## Cross-Phase Invariants Maintained

1. **Deterministic `packages/game`** — `stepProjectiles` is a pure function; same inputs produce identical outputs. Shield physics formulas use no `Math.random()`.
2. **Authoritative server** — clients send `"move"` and `"equip-shield"` intents; server applies and broadcasts results. Live projectile positions come from server, not client re-simulation.
3. **Pure `packages/game`** — no Colyseus, Pixi, or Node imports. `LiveProjectile`, `StepInput`, `StepResult` are plain TypeScript interfaces.
4. **State vs. events split** — `shieldId`, `shieldHp`, `fuel` in Colyseus schema (late-join safe). Live projectile positions are broadcast-only events (not schema) to avoid 60 Hz diff cost.
5. **TDD discipline** — all new `packages/game` logic written test-first; ≥90% coverage.
6. **Phase additivity** — existing weapons, economy, shop, and multi-round flow are unchanged.

---

## Architecture

### New files

```
packages/game/src/
  physics/
    step.ts              ← stepProjectiles() pure function + shield physics
    step.test.ts         ← TDD tests for every shield type + Patriot + MIRV
    fall-damage.ts       ← computeFallDamage() pure function
    fall-damage.test.ts

packages/shared/src/
  shields.ts             ← SHIELD_DEFS map (id → maxHp, radius, type, price)

apps/server/src/rooms/
  resolveTurn.ts         ← extended: tick loop replaces handleFire batch, new intents
  tickLoop.ts            ← new: 60 Hz interval management, Patriot trigger logic

apps/client/src/
  render/
    Shield.ts            ← new: shield bubble graphics + hit animations
    Patriot.ts           ← new: interceptor sprite + trail
  render/Projectile.ts   ← refactored: tick-stream renderer replaces sample replay
  render/Tank.ts         ← extended: shield overlay, fuel bar
  input/AimControls.ts   ← extended: drive mode state machine
  scenes/MatchScene.ts   ← extended: wire new events
  hud/WeaponBar.ts       ← extended: defense item counts
```

### Modified files (summary)

| File | Change |
|---|---|
| `packages/shared/src/schema/Tank.ts` | Add `shieldId`, `shieldHp`, `shieldMaxHp`, `fuel` |
| `packages/shared/src/schema/MatchState.ts` | Add `resolvingTick` |
| `packages/shared/src/loadouts.ts` | No change to existing loadouts; shields/fuel start at 0 |
| `packages/game/src/index.ts` | Export `stepProjectiles`, `computeFallDamage` |
| `packages/game/src/types.ts` | Add `LiveProjectile`, `StepInput`, `StepResult`, `StepEvent`, `StepTankInfo` |
| `packages/shared/src/index.ts` | Export `SHIELD_DEFS`, `ShieldDef` from `shields.ts` |
| `apps/server/src/rooms/resolveTurn.ts` | `simulateProjectile` batch path removed; superseded by tick loop in `tickLoop.ts` |

---

## Schema Changes

### Tank additions (`packages/shared/src/schema/Tank.ts`)

```typescript
// Phase 4 — Shields
@type("string") shieldId = "";        // "force-field" | "deflector-shield" | "magnetic-shield" | "reactive-armor" | "auto-shield" | ""
@type("number") shieldHp = 0;         // current HP of equipped shield (0 = no shield active)
@type("number") shieldMaxHp = 0;      // max HP for the equipped shield type

// Phase 4 — Movement
@type("number") fuel = 0;             // px of movement budget remaining this turn
```

Inventory `MapSchema<number>` gains new item IDs: `"force-field"`, `"deflector-shield"`, `"magnetic-shield"`, `"reactive-armor"`, `"auto-shield"`, `"parachute"`, `"battery"`, `"patriot"`, `"fuel-small"`, `"fuel-large"`.

### MatchState additions (`packages/shared/src/schema/MatchState.ts`)

```typescript
// Phase 4 — tick-stream support
@type("number") resolvingTick = 0;    // increments each physics tick; clients detect dropped frames
```

Live projectile positions are **not** in schema — broadcast as raw events.

### New broadcast events (not schema)

| Event | Payload |
|---|---|
| `"tick"` | `{ tick: number, projectiles: [{id,x,y,vx,vy,weaponId}], patriots: [{id,x,y,vx,vy}] }` |
| `"shield-hit"` | `{ targetId, shieldId, type: "absorb"\|"deflect"\|"bend"\|"explode", hpBefore, hpAfter }` |
| `"patriot-launched"` | `{ ownerId, patriotId, targetProjectileId }` |
| `"tank-moved"` | `{ sessionId, fromX, toX, fuelUsed }` |
| `"tank-fell"` | `{ sessionId, fromY, toY, fallDistance, damage, parachuteUsed }` |

---

## Physics Step Function (`packages/game/src/physics/step.ts`)

### Types

```typescript
interface LiveProjectile {
  id: string;
  x: number; y: number;
  vx: number; vy: number;
  weapon: WeaponDef;
  ownerId: string;
  apexReached: boolean;       // MIRV split guard
  isPatriot?: true;
  targetId?: string;          // Patriot homing target
}

interface StepTankInfo {
  sessionId: string;
  x: number; y: number;
  shieldId: string;
  shieldHp: number;
  shieldMaxHp: number;
}

interface StepInput {
  projectiles: LiveProjectile[];
  tanks: StepTankInfo[];
  terrain: Int16Array;
  terrainWidth: number;
  terrainHeight: number;
  wind: number;
  gravity: number;
  dt: number;                 // seconds; 1/60 in production, variable in tests
}

interface StepResult {
  survivors: LiveProjectile[];    // still flying after this tick
  spawned: LiveProjectile[];      // new projectiles (MIRV children, Patriots)
  events: StepEvent[];
  shieldDrains: Array<{ sessionId: string; hpDrain: number }>;  // magnetic drain
}

type StepEvent =
  | { kind: "terrain-impact"; projectileId: string; x: number; y: number; weapon: WeaponDef; ownerId: string }
  | { kind: "shield-absorb";  projectileId: string; targetId: string; hpBefore: number; hpAfter: number }
  | { kind: "shield-deflect"; projectileId: string; targetId: string; newVx: number; newVy: number; hpBefore: number; hpAfter: number }
  | { kind: "shield-bend";    projectileId: string; targetId: string; impulseX: number; impulseY: number }
  | { kind: "shield-explode"; projectileId: string; targetId: string; x: number; y: number }
  | { kind: "out-of-bounds";  projectileId: string }
  | { kind: "mirv-split";     projectileId: string; x: number; y: number; children: LiveProjectile[] }
  | { kind: "patriot-intercept"; patriotId: string; targetId: string; x: number; y: number }
```

### Per-tick processing order (order is critical)

For each projectile:
1. **Apply physics** — update `vx += windAccel * dt`, `vy += gravity * dt`, `x += vx * dt`, `y += vy * dt`
2. **Patriot homing** — if `isPatriot`, recalculate velocity toward target position at speed 600 px/s; if target gone, emit nothing and remove
3. **Patriot intercept** — if `isPatriot` and `distance(patriot, target) < 15px`, emit `patriot-intercept`, remove both
4. **MIRV apex split** — if `!apexReached && prevVy < 0 && vy >= 0`, emit `mirv-split`, return children in `spawned`
5. **Out-of-bounds** — if `x < 0 || x >= terrainWidth || y > terrainHeight + 200`, emit `out-of-bounds`, remove
6. **Shield check** — for each tank with `shieldHp > 0` (excluding projectile owner for non-Patriots): compute `dist`; if `dist < shieldRadius[shieldId]`, apply shield effect
7. **Terrain collision** — if `y >= terrain[floor(x)]`, emit `terrain-impact`, remove

Shield check (step 6) precedes terrain (step 7) so a shield can intercept a projectile that would have hit terrain on the same tick.

### Shield definitions (`packages/shared/src/shields.ts`)

```typescript
interface ShieldDef {
  id: string;
  label: string;
  maxHp: number;
  radius: number;           // px — detection bubble
  type: "absorb" | "deflect" | "bend" | "explode";
  hpCostFraction: number;   // fraction of weapon.damage applied to shield HP per hit
  price: number;
  packSize: number;
}

const SHIELD_DEFS: Map<string, ShieldDef> = new Map([
  ["force-field",      { id:"force-field",      label:"Force Field",      maxHp:200,  radius:60,  type:"absorb",  hpCostFraction:0.5,  price:1500, packSize:1 }],
  ["deflector-shield", { id:"deflector-shield", label:"Deflector Shield", maxHp:500,  radius:70,  type:"deflect", hpCostFraction:0.25, price:3000, packSize:1 }],
  ["magnetic-shield",  { id:"magnetic-shield",  label:"Magnetic Shield",  maxHp:600,  radius:100, type:"bend",    hpCostFraction:0,    price:3500, packSize:1 }],
  ["reactive-armor",   { id:"reactive-armor",   label:"Reactive Armor",   maxHp:1,    radius:50,  type:"explode", hpCostFraction:1,    price:2000, packSize:3 }],
  ["auto-shield",      { id:"auto-shield",      label:"Auto Shield",      maxHp:400,  radius:60,  type:"absorb",  hpCostFraction:0.5,  price:2500, packSize:2 }],
]);
```

### Shield physics formulas

**Force Field / Auto Shield (absorb):** Projectile removed. `hpAfter = hpBefore - weapon.damage * 0.5`. If `hpAfter <= 0`, shield deactivated (`shieldId = ""`, `shieldHp = 0`). Projectile is consumed regardless of whether the shield survives.

**Deflector Shield (reflect):**
```
nx = (px - tx) / dist;  ny = (py - ty) / dist;
dot = vx*nx + vy*ny;
newVx = vx - 2*dot*nx;
newVy = vy - 2*dot*ny;
hpAfter = hpBefore - weapon.damage * 0.25;
```
Projectile continues with reflected velocity — can hit the attacker or other tanks.

**Magnetic Shield (bend):**
```
// Applied each tick while any projectile is within radius (no per-hit removal)
strength = 8000 / (dist * dist);    // repulsive, falls off with distance²
vx += (nx * strength) * dt;
vy += (ny * strength) * dt;
```
Drain: `15 HP/s` while any hostile projectile is within radius, applied via `shieldDrains` in `StepResult` (not per-hit). Projectile is not removed — it curves away.

**Reactive Armor (explode):** Projectile removed. Full charge consumed (`shieldHp = 0`, `shieldId = ""`). Emits `shield-explode` event — server applies `computeDamage` at contact point using a reactive weapon def (`radius: 60`, `damage: 40`), which can damage nearby tanks including the owner.

### Patriot homing

```typescript
// Per-tick velocity update (step 2 above)
const target = projectiles.find(p => p.id === patriot.targetId);
if (!target) { remove patriot; return; }
const dx = target.x - patriot.x;
const dy = target.y - patriot.y;
const dist = Math.sqrt(dx*dx + dy*dy);
const speed = 600;   // px/s — faster than most weapons
patriot.vx = (dx / dist) * speed;
patriot.vy = (dy / dist) * speed;
```

Patriot deals **zero hull damage**. On intercept it emits `patriot-intercept`; server applies a small terrain carve (`radius: 30`) at intercept position for visual feedback. If Patriot misses (target hit terrain first), it falls until terrain collision — emits standard `terrain-impact` with zero damage weapon.

---

## Falling-Tank Damage (`packages/game/src/physics/fall-damage.ts`)

```typescript
interface FallDamageInput {
  sessionId: string;
  tankY: number;                // tank Y before settling
  surfaceY: number;             // new terrain surface Y at tank X
  hasParachute: boolean;
}

interface FallDamageResult {
  damage: number;
  parachuteConsumed: boolean;
}

function computeFallDamage(input: FallDamageInput): FallDamageResult {
  const fallDistance = input.surfaceY - input.tankY;
  if (fallDistance < 20) return { damage: 0, parachuteConsumed: false };
  if (input.hasParachute) return { damage: 0, parachuteConsumed: true };
  return { damage: Math.floor(fallDistance * 0.5), parachuteConsumed: false };
}
```

Applied in `commitTurnEnd()` after `applyAllCarves()` and before `applyDamagesWithChainKills()`. A tank reduced to 0 HP by falling triggers death explosion chain as normal.

---

## Server Game Loop (`apps/server/src/rooms/`)

### Resolving phase lifecycle

When `"fire"` intent arrives (replaces existing `handleFire` batch flow):

```
1. Validate: phase === "playing", correct player, weapon in inventory
2. Deduct weapon from inventory; store weaponDef
3. Create initial LiveProjectile from angle + power (initialVelocityFromAnglePower)
4. state.phase = "resolving"; cancel turn timer
5. Start tick loop: this.tickInterval = clock.setInterval(tickLoop, 1000/60)
```

**`tickLoop()` — runs every 16 ms:**
```
result = stepProjectiles({ projectiles: liveProjectiles, tanks: buildStepTanks(state), terrain, wind, gravity, dt: 1/60 })
liveProjectiles = [...result.survivors, ...result.spawned]
state.resolvingTick++
broadcast("tick", { tick: state.resolvingTick, projectiles: liveProjectiles })
result.events.forEach(applyStepEvent)
applyMagneticDrains(result.shieldDrains)
checkPatriotTriggers()

if liveProjectiles.length === 0:
  clock.clear(this.tickInterval)
  applyFallDamage()
  commitTurnEnd()
```

### `applyStepEvent` mapping

| StepEvent kind | Server action |
|---|---|
| `terrain-impact` | `carveInPlace()` + `computeDamage()` + `applyDamagesWithChainKills()` |
| `shield-absorb` | `tank.shieldHp = hpAfter`; if 0: `tank.shieldId = ""`. `broadcast("shield-hit", ...)` |
| `shield-deflect` | Update projectile velocity in `liveProjectiles`; update shield HP. `broadcast("shield-hit", ...)` |
| `shield-bend` | Update projectile velocity in `liveProjectiles` (no HP change here; drain via `shieldDrains`) |
| `shield-explode` | Consume charge (`tank.shieldId = ""`, `tank.shieldHp = 0`); `computeDamage` at contact. `broadcast("shield-hit", ...)` |
| `out-of-bounds` | No-op (projectile already removed from `survivors`) |
| `mirv-split` | No-op (children already in `spawned`) |
| `patriot-intercept` | `carveInPlace` (small radius, cosmetic); `broadcast("shield-hit")`-style event for client animation |

### Patriot trigger (`checkPatriotTriggers()`)

```
for each tank t where inventory["patriot"] > 0 and no active patriot for t:
  for each hostile liveProjectile p (not owned by t, not a patriot):
    dist = distance(p, t)
    if dist < 200:
      t.inventory["patriot"] -= 1
      spawn patriotProjectile aimed at p.id
      liveProjectiles.push(patriotProjectile)
      broadcast("patriot-launched", { ownerId: t.sessionId, patriotId, targetId: p.id })
      break   // one patriot per tank per check
```

"Hostile" means not owned by the same player. A player's own projectile never triggers their own Patriot.

### New intents

**`"move"` — accepted during `phase === "playing"`, correct player's turn:**
```
pixelsRequested = clamp(msg.pixels, 0, tank.fuel)
direction = msg.direction  // "left" | "right"
dx = direction === "left" ? -pixelsRequested : pixelsRequested
tank.x = clamp(tank.x + dx, 0, TERRAIN_WIDTH - 1)
tank.y = terrain[Math.round(tank.x)]    // snap to surface
tank.fuel -= pixelsRequested
broadcast("tank-moved", { sessionId, fromX, toX: tank.x, fuelUsed: pixelsRequested })
```
Does not advance turn. Player still fires afterward.

**`"equip-shield"` — accepted during `phase === "playing"`, correct player's turn:**
```
shieldId = msg.shieldId
if tank.inventory[shieldId] <= 0: return
def = SHIELD_DEFS.get(shieldId)
tank.inventory[shieldId] -= 1
tank.shieldId = shieldId
tank.shieldHp = def.maxHp
tank.shieldMaxHp = def.maxHp
```

**`"use-battery"` — accepted during `phase === "playing"`, correct player's turn:**
```
if tank.inventory["battery"] <= 0 || tank.shieldId === "": return
tank.inventory["battery"] -= 1
tank.shieldHp = Math.min(tank.shieldHp + 250, tank.shieldMaxHp)
```

### Round-start setup (`startRound()` additions)

```
for each alive tank:
  // Auto Shield: equip if in inventory and no shield active
  if tank.inventory["auto-shield"] > 0 && tank.shieldId === "":
    tank.inventory["auto-shield"] -= 1
    tank.shieldId = "auto-shield"
    tank.shieldHp = 400
    tank.shieldMaxHp = 400

  // Fuel: apply all fuel tanks to fuel budget, zero inventory
  tank.fuel = 0
  fuel_s = tank.inventory["fuel-small"] ?? 0
  fuel_l = tank.inventory["fuel-large"] ?? 0
  tank.fuel += fuel_s * 250 + fuel_l * 600
  tank.inventory.delete("fuel-small")
  tank.inventory.delete("fuel-large")
```

---

## Shop Additions

10 new items added to a new `packages/game/src/items/index.ts`. Defense items (shields, fuel, parachute, battery, Patriot) are not weapons and do not belong in `weapons/`. The existing `WEAPON_REGISTRY` in `weapons/index.ts` is unchanged. The shop uses a combined registry (weapons + items) built at server startup by merging both maps:

| ID | Name | Effect | Price | Pack |
|---|---|---|---|---|
| `force-field` | Force Field | 200 HP absorb shield | $1,500 | 1 |
| `deflector-shield` | Deflector Shield | 500 HP reflect shield | $3,000 | 1 |
| `magnetic-shield` | Magnetic Shield | 600 HP bend shield | $3,500 | 1 |
| `reactive-armor` | Reactive Armor | 1-shot counter-blast shield | $2,000 | 3 |
| `auto-shield` | Auto Shield | 400 HP absorb, auto-equips each round | $2,500 | 2 |
| `battery` | Battery | Restore 250 HP to equipped shield | $1,000 | 2 |
| `parachute` | Parachute | Prevent one fall-damage event | $500 | 3 |
| `patriot` | Patriot | Auto-intercept one incoming missile | $3,000 | 1 |
| `fuel-small` | Fuel Tank (S) | +250 px movement per round | $500 | 2 |
| `fuel-large` | Fuel Tank (L) | +600 px movement per round | $1,000 | 1 |

**Shield equip rule:** Only one shield active at a time. Buying a second type stacks in inventory. Equipping via `"equip-shield"` intent replaces the active one — old shield HP is lost. Battery only works if a shield is currently equipped.

Existing `validatePurchase` logic handles all new items without modification — they are simply new entries in the item registry with `price` and `packSize`.

---

## Client Changes (`apps/client`)

### Projectile rendering refactor (`render/Projectile.ts`)

Replaces sample-array interpolation with a tick-stream map:

```typescript
// State
private sprites = new Map<string, PIXI.Graphics>();

// On "tick" event from server
onTick(event: TickPayload) {
  const incoming = new Set(event.projectiles.map(p => p.id));
  // Remove sprites for projectiles that disappeared
  for (const [id, sprite] of this.sprites) {
    if (!incoming.has(id)) { this.container.removeChild(sprite); this.sprites.delete(id); }
  }
  // Upsert sprites for live projectiles
  for (const p of event.projectiles) {
    if (!this.sprites.has(p.id)) { this.sprites.set(p.id, this.createSprite(p.weaponId)); }
    const sprite = this.sprites.get(p.id)!;
    sprite.x = p.x; sprite.y = p.y;
  }
}
```

Pixi renders at 60fps between tick events — no additional interpolation needed at 60Hz server tick rate.

### Shield rendering (`render/Shield.ts`)

Pixi Graphics circles drawn per tank when `tank.shieldHp > 0`. Opacity = `tank.shieldHp / tank.shieldMaxHp`. Styles per type:

| Shield | Idle style | On `"shield-hit"` event |
|---|---|---|
| Force Field | Teal circle, 10% opacity, solid | Flash to 100% → fade 0.3s |
| Deflector Shield | Gold circle, dashed stroke | Flash + brief arc overlay showing reflected direction |
| Magnetic Shield | Purple circle, rotating dashes (ticker-driven rotation) | Projectile bend visible in real-time from tick stream |
| Reactive Armor | Orange spiky aura, slow pulse | `Explosion.ts` triggered at contact point |
| Auto Shield | Same as Force Field (teal) | Same as Force Field flash |

### Tank rendering additions (`render/Tank.ts`)

- Shield bubble rendered as child `PIXI.Graphics` (updated each frame from schema)
- Fuel bar shown below tank HP bar during own turn in drive mode (teal, depletes left to right)

### Drive mode input (`input/AimControls.ts`)

```typescript
type InputMode = "drive" | "aim";

// Turn start: mode = tank.fuel > 0 ? "drive" : "aim"
// A/ArrowLeft held → emit "move" intent { direction: "left", pixels: driveChunkPx } every 100ms
// D/ArrowRight held → emit "move" intent { direction: "right", pixels: driveChunkPx } every 100ms
// driveChunkPx = 10 (small steps for responsive feel)
// Space / Tab → mode = "aim"
// Any fire action while mode === "drive" → mode = "aim"; then fire
// On "tank-moved" event: update local tank.x + fuel display (server authoritative)
```

### WeaponBar additions (`hud/WeaponBar.ts`)

Displays counts for all defense items alongside weapon inventory: shield (type + HP bar), fuel px remaining, parachute count, Patriot count, battery count.

### MatchScene event wiring (`scenes/MatchScene.ts`)

New event handlers: `"tick"`, `"shield-hit"`, `"patriot-launched"`, `"tank-moved"`, `"tank-fell"`.

---

## Testing Plan

### `packages/game/src/physics/step.test.ts` (TDD-first)

```
Force Field:
  ✓ absorbs projectile, emits shield-absorb event
  ✓ shield HP depletes by weapon.damage * 0.5
  ✓ shield at 0 HP does NOT intercept (projectile passes through)
  ✓ shield deactivated when HP reaches 0

Deflector Shield:
  ✓ emits shield-deflect with correct reflected vx/vy (normal reflection formula)
  ✓ shield HP depletes by weapon.damage * 0.25
  ✓ reflected projectile continues as survivor (can hit other targets)
  ✓ reflected projectile can hit terrain in subsequent ticks

Magnetic Shield:
  ✓ applies repulsive impulse: vx/vy modified, projectile survives
  ✓ impulse strength falls off with distance² (strength = 8000/dist²)
  ✓ drain: shieldDrains includes 15 HP/s * dt when projectile in range
  ✓ no drain when projectile out of range
  ✓ projectile curves away over multiple ticks (integration test)

Reactive Armor:
  ✓ emits shield-explode at contact point
  ✓ projectile removed (in neither survivors nor spawned)
  ✓ charge consumed (shieldHp → 0, reflected in next tick)
  ✓ at 0 charges does NOT trigger (projectile passes through)

Auto Shield:
  ✓ behaves identically to Force Field

Patriot:
  ✓ velocity updated toward target each tick
  ✓ emits patriot-intercept when within 15px, both removed
  ✓ removes itself if target already gone (not in projectiles list)
  ✓ does not target projectiles owned by same player (own shots)

MIRV:
  ✓ apex split still fires correctly (regression)

General:
  ✓ out-of-bounds projectile removed, emits out-of-bounds
  ✓ multiple live projectiles processed independently
  ✓ shield owner's own projectile does NOT trigger their own shield
```

### `packages/game/src/physics/fall-damage.test.ts`

```
✓ fall < 20px: damage = 0, parachute not consumed
✓ fall >= 20px, no parachute: damage = floor(dist * 0.5)
✓ fall >= 20px, has parachute: damage = 0, parachute consumed
✓ large fall (200px): damage = 100
```

### Server integration (`apps/server` — existing pattern)

```
✓ "move" intent: tank.x updated, fuel decremented, "tank-moved" broadcast
✓ "move" intent rejected when not player's turn
✓ "move" intent rejected when fuel = 0
✓ "move" intent clamped to available fuel
✓ "equip-shield" updates shieldId/shieldHp/shieldMaxHp, decrements inventory
✓ "equip-shield" rejected if shield not in inventory
✓ "use-battery" increases shieldHp capped at shieldMaxHp
✓ "use-battery" rejected if no shield equipped
✓ auto-shield equips at round start if in inventory and no shield active
✓ fuel applied from inventory at round start, inventory zeroed
✓ patriot auto-fires when hostile projectile within 200px
✓ patriot does not fire against own projectile
✓ tick loop stops when liveProjectiles is empty
✓ fall damage applied after carve ops, before commitTurnEnd
```

---

## Acceptance Criteria

- [ ] All 5 shield types intercept/modify projectile trajectories server-authoritatively
- [ ] Deflected missiles visibly travel back and can hit the attacker
- [ ] Magnetic shield visibly curves projectile paths in the tick stream
- [ ] Reactive Armor explosion can damage nearby tanks (including owner)
- [ ] Auto Shield equips automatically at round start without player action
- [ ] Patriot launches and intercepts an incoming missile in real time
- [ ] Tank can drive left/right before firing, consuming fuel from inventory
- [ ] Tanks take fall damage after terrain carves; parachute prevents it
- [ ] All 10 new items purchasable in shop; inventory persists between rounds
- [ ] Battery restores shield HP, capped at shield's max HP
- [ ] Shield bubble visible on tank with HP bar; fades as HP depletes
- [ ] Drive mode HUD appears when player has fuel; fuel bar drains while driving
- [ ] Tick loop runs at 60 Hz only during resolving phase
- [ ] `packages/game` test coverage ≥90%
- [ ] All Phase 1–3 acceptance criteria still pass

---

*End of Phase 4 design.*
