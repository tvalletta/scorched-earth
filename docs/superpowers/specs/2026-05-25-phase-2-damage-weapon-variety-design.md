# Phase 2 — Damage & Weapon Variety (Design)

**Status:** Approved, ready for implementation planning.
**Date:** 2026-05-25.
**Parent docs:** `2026-05-22-roadmap.md` (phase plan), `SPEC.md` (full-game north star).
**Phase 1 design:** `2026-05-22-phase-1-multiplayer-skeleton-design.md`
**Next:** `/superpowers:writing-plans` against this doc.

---

## Goal

Extend the working Phase 1 skeleton with 5 new weapons (including two cluster weapons), per-player weapon inventory, a host-configured loadout preset, HP bars on canvas and in the sidebar, a scrollable weapon-select toolbar, and death-explosion chain kills. Every match ends with real weapon decisions and visible health stakes.

---

## In Scope

- 5 new weapon definitions: **Missile**, **Baby Nuke**, **Nuke**, **Funky Bomb**, **MIRV**
- **Compound trajectory simulation** for split weapons (Funky Bomb → 8 sub-bombs at apex; MIRV → 5 missiles in downward fan)
- **Death explosion** on tank death (radius 40, damage 30) with recursive chain-kill resolution (max depth 10)
- **Tank inventory** — per-player ammo counts, decremented on fire; infinite for Baby Missile
- **3 named loadout presets** host selects in lobby; inventory seeded from preset at match start
- **HP bars** — floating color-coded bar above each tank on canvas + HP number in PlayerList sidebar
- **Scrollable bottom weapon toolbar** — smooth vector icons, 1–6 hotkeys, ammo count, scroll arrows at 7+ weapons
- **`select-weapon` intent** — client sends weapon choice; server validates inventory and syncs `tank.weaponId`
- **Lobby loadout picker** — 3-button group visible to host only; label visible to all players

## Out of Scope (deferred)

| Feature | Phase |
|---|---|
| Shop / economy / cash | 3 |
| Shields, parachute, Patriot | 4 |
| Falling-tank damage | 4 |
| Remaining 24 weapons | 6 |
| Multi-round play | 3 |

---

## Cross-Phase Invariants Maintained

All Phase 1 invariants continue unchanged:
1. Deterministic `packages/game` — pure TS, seeded PRNG, no DOM/Node imports
2. Authoritative server — clients send intents, server owns state
3. State vs. events split — inventory and weaponId in schema; trajectory payloads as broadcasts
4. Append-only terrain mutation log
5. TDD discipline in `packages/game` — tests written before implementation, ≥90% coverage target

---

## Architecture

### New files

```
packages/game/src/weapons/
  missile.ts
  baby-nuke.ts
  nuke.ts
  funky-bomb.ts          ← includes FUNKY_BOMB_SUB def
  mirv.ts                ← includes MIRV_SUB def
  index.ts               ← re-exports WEAPON_REGISTRY map

packages/shared/src/
  loadouts.ts            ← LoadoutDef type + LOADOUTS array

apps/client/src/
  hud/WeaponBar.ts       ← DOM overlay weapon toolbar
  hud/HpBar.ts           ← PixiJS HP bar drawn above each tank
```

### Modified files

```
packages/game/src/types.ts          ← SplitDef, WeaponDef.split, TrajectoryResult.children
packages/game/src/physics/simulate.ts ← split-weapon detection + child sims
packages/shared/src/schema/Tank.ts  ← weaponId, inventory fields
packages/shared/src/schema/MatchState.ts ← loadoutId field
packages/shared/src/intents.ts      ← select-weapon intent
packages/shared/src/index.ts        ← export loadouts
apps/server/src/rooms/MatchRoom.ts  ← configure loadoutId, select-weapon handler
apps/server/src/rooms/resolveTurn.ts ← weapon lookup, inventory decrement, chain kills
apps/client/src/scenes/MatchScene.ts ← multi-trajectory playback, HpBar wiring
apps/client/src/scenes/LobbyScene.ts ← loadout picker UI
apps/client/src/render/Tank.ts      ← attach HpBar
apps/client/src/hud/PlayerList.ts   ← HP numbers in sidebar
```

---

## Section 1 — Data Model

### `WeaponDef` extension (`packages/game/src/types.ts`)

```ts
export interface SplitDef {
  trigger: "apex";           // fires when vy flips from negative to positive
  count: number;             // number of sub-projectiles
  spreadDeg: number;         // total angular spread of the fan
  inheritVelocity: boolean;  // if true, children add parent vx/vy at split point
  ejectionSpeed: number;     // px/s radial push applied to each child
  child: WeaponDef;          // weapon def applied to every sub-munition (not player-selectable)
}

export interface WeaponDef {
  id: string;
  radius: number;
  damage: number;
  windImmune: boolean;
  split?: SplitDef;          // undefined = simple single-impact weapon
}
```

### `TrajectoryResult` extension

```ts
export interface TrajectoryResult {
  samples: TrajectorySample[];
  impact: Point | null;
  durationMs: number;
  carveOp: CarveOp | null;
  damages: DamageEntry[];
  splitAt?: TrajectorySample;    // sample where split was triggered
  children?: TrajectoryResult[]; // one per sub-munition; undefined for simple weapons
}
```

### `Tank` schema additions (`packages/shared/src/schema/Tank.ts`)

```ts
@type("string")          weaponId  = "baby-missile";
@type({ map: "number" }) inventory = new MapSchema<number>();
// Counts: -1 = infinite, 0 = depleted (should be removed or show as grayed out), N = remaining
```

### `MatchState` schema addition

```ts
@type("string") loadoutId = "standard";
```

### Weapon registry (`packages/game/src/weapons/index.ts`)

A `Map<string, WeaponDef>` exported as `WEAPON_REGISTRY`. The server uses this to resolve `weaponId` strings to `WeaponDef` objects at fire time. The registry contains only player-selectable weapons; sub-munition defs (`FUNKY_BOMB_SUB`, `MIRV_SUB`) are not registered.

### Named loadout presets (`packages/shared/src/loadouts.ts`)

```ts
export interface LoadoutDef {
  id: string;
  label: string;
  weapons: Record<string, number>; // weaponId → count; -1 = infinite
}

export const LOADOUTS: LoadoutDef[] = [
  {
    id: "starter",
    label: "Starter",
    weapons: { "baby-missile": -1, "missile": 5 },
  },
  {
    id: "standard",
    label: "Standard",
    weapons: {
      "baby-missile": -1,
      "missile": 5,
      "baby-nuke": 3,
      "nuke": 2,
      "funky-bomb": 2,
      "mirv": 1,
    },
  },
  {
    id: "bonanza",
    label: "Bonanza",
    weapons: {
      "baby-missile": -1,
      "missile": 10,
      "baby-nuke": 6,
      "nuke": 4,
      "funky-bomb": 5,
      "mirv": 3,
    },
  },
];

export const LOADOUT_MAP = new Map(LOADOUTS.map((l) => [l.id, l]));
export const DEFAULT_LOADOUT_ID = "standard";
```

---

## Section 2 — Physics (`packages/game`)

### Weapon definitions

| Weapon | id | radius | damage | windImmune | split |
|---|---|---|---|---|---|
| Baby Missile | `baby-missile` | 20 | 25 | false | — |
| Missile | `missile` | 30 | 50 | false | — |
| Baby Nuke | `baby-nuke` | 45 | 75 | false | — |
| Nuke | `nuke` | 60 | 100 | false | — |
| Funky Bomb | `funky-bomb` | 0 | 0 | false | apex, 8 subs, 360°, inheritVelocity:false, ejection:200 |
| MIRV | `mirv` | 0 | 0 | false | apex, 5 subs, 120°, inheritVelocity:true, ejection:300 |
| Funky Bomb sub | *(internal)* | 18 | 20 | false | — |
| MIRV sub | *(internal)* | 25 | 35 | false | — |
| Death explosion | *(internal)* | 40 | 30 | true | — |

`DEATH_EXPLOSION` is a fixed `WeaponDef` constant (`id: "death-explosion"`, not player-selectable, not in the registry) used only by chain-kill resolution. It is wind-immune because it originates from the tank's position, not a ballistic trajectory.

Funky Bomb and MIRV have `radius: 0, damage: 0` on the parent — the parent projectile does no damage itself; all damage comes from sub-munitions.

### Split simulation logic (`packages/game/src/physics/simulate.ts`)

The main simulation loop gains a split check immediately after computing the new `vy`:

```
if weapon.split is defined and not yet split:
  if trigger == "apex" and prev_vy < 0 and new_vy >= 0:
    record splitAt = current sample
    for i in 0..count:
      angle_deg = base_angle + (i / (count-1)) * spreadDeg  [fan] OR i * (360/count) [radial]
      child_vx = ejectionSpeed * cos(angle_rad)  [+ parent vx if inheritVelocity]
      child_vy = ejectionSpeed * sin(angle_rad)  [+ parent vy if inheritVelocity]
      simulate child from (splitAt.x, splitAt.y) with child_vx, child_vy
    push children into result
    break main loop (parent does not continue after split)
```

For Funky Bomb: children fan radially at `i * 45°` (i = 0..7), no velocity inheritance.
For MIRV: children fan between -60° and +60° from straight-down (`-90° ± 60°` in screen space), inheriting parent vx/vy.

Sub-munition trajectories are run to completion (impact or out-of-bounds) before `simulateProjectile` returns. The returned `TrajectoryResult` is a tree; all leaf nodes carry `carveOp` and `damages`.

### `computeDamage` — unchanged

The existing linear-falloff function is correct as-is. It is called once per leaf trajectory (per sub-munition impact).

---

## Section 3 — Server (`apps/server`)

### New intent (`packages/shared/src/intents.ts`)

```ts
| { kind: "select-weapon"; weaponId: string }
```

### `MatchRoom.ts` changes

```ts
// New configure field
onMessage("configure", (client, msg) => {
  // existing: turnTimerMs
  // new:
  if (msg.loadoutId && LOADOUT_MAP.has(msg.loadoutId)) {
    state.loadoutId = msg.loadoutId;
  }
});

// New select-weapon handler
onMessage("select-weapon", (client, msg) => {
  if (state.phase !== "playing") return;
  const tank = state.tanks.get(client.sessionId);
  if (!tank) return;
  const count = tank.inventory.get(msg.weaponId) ?? null;
  if (count === null) return;         // not in loadout
  if (count === 0) return;            // depleted
  tank.weaponId = msg.weaponId;
});
```

### `startMatch` changes

After terrain generation, seed each tank's inventory from the chosen loadout:

```ts
const loadout = LOADOUT_MAP.get(state.loadoutId) ?? LOADOUT_MAP.get("standard")!;
for (const tank of state.tanks.values()) {
  for (const [wId, count] of Object.entries(loadout.weapons)) {
    tank.inventory.set(wId, count);
  }
  tank.weaponId = "baby-missile";
}
```

### `resolveTurn.ts` — `handleFire` changes

```ts
// 1. Look up weapon
const weaponDef = WEAPON_REGISTRY.get(tank.weaponId) ?? BABY_MISSILE;

// 2. Decrement inventory if finite
const count = tank.inventory.get(tank.weaponId) ?? -1;
if (count > 0) tank.inventory.set(tank.weaponId, count - 1);
if (count === 0) { tank.weaponId = "baby-missile"; return; } // shouldn't happen; guard

// 3. Simulate (result may have children)
const result = simulateProjectile({ weapon: weaponDef, ... });

// 4. Broadcast compound payload
broadcast("trajectory-resolved", {
  samples: result.samples,
  splitAt: result.splitAt ?? null,
  children: (result.children ?? []).map((c) => ({
    samples: c.samples, impact: c.impact, durationMs: c.durationMs,
    weaponId: weaponDef.split!.child.id,
  })),
  impact: result.impact,
  weaponId: weaponDef.id,
  ownerId: sessionId,
  durationMs: totalDurationMs(result),
});
```

`totalDurationMs` = the maximum `durationMs` across all leaf trajectories in the tree (so the post-playback buffer is timed correctly).

### `commitResolution` — chain kill extension

```ts
function applyDamagesAndChain(ctx, damages, depth = 0): void {
  if (depth > 10) return;
  const events = [];
  const newlyDead: Tank[] = [];

  for (const d of damages) {
    const t = state.tanks.get(d.playerId);
    if (!t || !t.alive) continue;
    const before = t.hp;
    t.hp = Math.max(0, t.hp - d.hullDamage);
    events.push({ playerId: d.playerId, before, after: t.hp });
    if (t.hp <= 0) { t.alive = false; newlyDead.push(t); }
  }

  if (events.length > 0) broadcast("damage-applied", { damages: events, wave: depth });

  for (const dead of newlyDead) {
    const deathDamages = computeDamage(
      { x: dead.x, y: dead.y },
      DEATH_EXPLOSION,               // { id: "death", radius: 40, damage: 30, windImmune: true }
      Array.from(state.tanks.values())
        .filter(t => t.alive)
        .map(t => ({ playerId: t.sessionId, x: t.x, y: t.y, shieldHp: 0 })),
    );
    applyDamagesAndChain(ctx, deathDamages, depth + 1);
  }
}
```

All damages from the shot's leaf trajectories are collected into a single flat array and passed into `applyDamagesAndChain` at depth 0.

---

## Section 4 — Client (`apps/client`)

### `WeaponBar` (`apps/client/src/hud/WeaponBar.ts`)

- DOM overlay (`<div>` positioned `absolute; bottom:0; left:0; right:0`), z-indexed above the canvas.
- Renders one slot per weapon in the player's inventory, sorted by `WEAPON_REGISTRY` insertion order.
- Each slot: vector SVG icon (20×20) + weapon name + ammo count (`∞` for -1, numeric for finite, grayed/disabled at 0).
- Active weapon slot has a blue highlight + bottom underline.
- At ≤6 weapons: no scroll arrows, slots fill the bar evenly. At 7+ weapons: `‹` / `›` arrows appear; each click shifts the visible window by one slot.
- Click on slot → sends `select-weapon` intent.
- Keyboard: keys `1`–`6` select the weapon at that visible position.
- Subscribes via `$(tank).onChange` to re-render when `weaponId` or `inventory` changes.
- Only renders for the local player's tank; non-local players' weapon choice is not shown to others.

### `HpBar` (`apps/client/src/hud/HpBar.ts`)

- PixiJS `Graphics` object, attached as a child of each tank view in `createTankView`.
- Drawn as a 32×5 px rect, 12 px above the tank's pivot point.
- Color: `0x22c55e` (green) above 50 HP, `0xf59e0b` (yellow) 25–50 HP, `0xef4444` (red) below 25 HP.
- Background: dark semi-transparent rect behind the bar.
- Redrawn in `tank.onChange` callback via `hpBar.redraw(tank.hp)`.
- Hidden when `tank.alive === false`.

### `PlayerList` sidebar HP

- Existing `PlayerList.ts` gains a thin HP bar (same color logic) and a `${hp} HP` label below each player name.
- Updated each ticker frame from `room.state`.

### Multi-trajectory playback (`MatchScene.ts` — `onTrajectory`)

```ts
onTrajectory(msg):
  // Play parent
  const parent = new ProjectileAnim(msg.samples);
  world.addChild(parent); activeAnims.push(parent);

  if (msg.splitAt) {
    // At split time, fan out children
    setTimeout(() => {
      for (const child of msg.children) {
        const p = new ProjectileAnim(child.samples);
        world.addChild(p); activeAnims.push(p);
        if (child.impact) {
          setTimeout(() => {
            const ex = new Explosion(child.impact.x, child.impact.y, child.weaponId);
            world.addChild(ex); activeAnims.push(ex);
          }, child.durationMs);
        }
      }
    }, msg.splitAt.t);
  } else if (msg.impact) {
    setTimeout(() => {
      const ex = new Explosion(msg.impact.x, msg.impact.y, msg.weaponId);
      world.addChild(ex); activeAnims.push(ex);
    }, msg.durationMs);
  }
```

The `Explosion` constructor gains an optional `weaponId?: string` parameter. When provided, it looks up the radius from `WEAPON_REGISTRY` (imported from `@se/game`) and scales the particle burst accordingly — nukes look bigger than baby missiles. For sub-munitions the child's `weaponId` is passed.

### Lobby loadout picker (`LobbyScene.ts`)

- A 3-button group (Starter / Standard / Bonanza) rendered in the lobby UI, visible only when `state.hostId === room.sessionId`.
- Clicking a button sends `configure` with `loadoutId`.
- All clients display the current loadout name as a label next to the player list (subscribed via `$(state).listen("loadoutId", ...)`).

---

## Section 5 — Testing

### `packages/game` (TDD-first, target ≥90% coverage)

Tests to write before implementation:

1. **Weapon def tests** — one test file per weapon, verify `id`, `radius`, `damage`, `windImmune`, and `split` fields match spec table.
2. **`simulateProjectile` — simple weapons** — Missile, Baby Nuke, Nuke each produce a `TrajectoryResult` with no `children`, non-null `carveOp` on impact, correct `damages`.
3. **`simulateProjectile` — Funky Bomb** — fires, reaches apex, returns exactly 8 children; each child has its own `impact` and `carveOp`; parent `carveOp` is null.
4. **`simulateProjectile` — MIRV** — fires, reaches apex, returns 5 children; all child trajectories are angled downward (all initial child `vy` > 0); spread is within ±60° of vertical.
5. **`computeDamage`** — existing tests unchanged; add a multi-child damage aggregation test.

### `apps/server` (target ≥70% coverage)

1. `handleFire` with Missile decrements `tank.inventory.get("missile")` by 1.
2. `handleFire` when inventory count is 1 → decrements to 0; subsequent `select-weapon` for that weapon is rejected.
3. `select-weapon` with unknown weaponId → `tank.weaponId` unchanged.
4. `startMatch` with `loadoutId = "starter"` → each tank has `inventory.get("missile") === 5` and no `baby-nuke` key.
5. `startMatch` with `loadoutId = "bonanza"` → correct counts.
6. `configure` with invalid `loadoutId` → `state.loadoutId` unchanged.
7. Chain kill: two adjacent tanks, first tank shot to 0 HP, death explosion kills second. Verify both end up `alive === false` and two `damage-applied` events emitted.
8. Chain kill depth limit: a pathological scenario doesn't recurse more than 10 levels.

### `apps/client` (E2E smoke, Playwright)

1. Host selects "Bonanza" in lobby, starts match; weapon bar shows 5 weapon slots with correct ammo counts.
2. Player fires a Funky Bomb; canvas shows a parent arc followed by 8 sub-explosions.
3. Player fires a Missile; weapon bar ammo count decrements from 10 to 9.
4. Pressing key `3` switches to Baby Nuke (slot 3 in Standard loadout); the slot is highlighted.
5. HP bar above a tank changes color as HP drops (inject damage via server test harness).

---

## Open Questions (Deferred)

- **Explosion particle variety per weapon**: Phase 8 (Visual Polish). For now, all explosions use the same particle system but scale with `weapon.radius`.
- **Sound effects on Funky Bomb sub-munitions**: Phase 9 (Audio).
- **Weapon icons for all 30 weapons**: Authoring the full set deferred to Phase 6/8. Phase 2 ships icons for the 6 weapons in scope.

---

*End of Phase 2 design.*
