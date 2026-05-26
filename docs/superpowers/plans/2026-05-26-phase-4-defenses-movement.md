# Phase 4 — Defenses & Movement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add trajectory-modifying shields, Patriot interceptor, tank movement, falling-tank damage, and a projectile-only 60 Hz tick-stream netcode layer to replace the trajectory-batch model.

**Architecture:** The server's resolving phase is replaced by a `clock.setInterval` tick loop that calls `stepProjectiles()` (a new pure function in `packages/game`) each frame, broadcasts live positions, and applies returned events. Clients render projectiles from the tick stream instead of replaying a pre-computed sample array.

**Tech Stack:** TypeScript, Colyseus 0.16, PixiJS v8, Vitest, pnpm workspaces (`@se/game`, `@se/shared`, `@se/server`, `@se/client`).

---

## File Map

| File | Status | Purpose |
|---|---|---|
| `packages/shared/src/schema/Tank.ts` | Modify | Add shieldId, shieldHp, shieldMaxHp, fuel |
| `packages/shared/src/schema/MatchState.ts` | Modify | Add resolvingTick |
| `packages/shared/src/shields.ts` | **Create** | SHIELD_DEFS map |
| `packages/shared/src/intents.ts` | Modify | Add move, equip-shield, use-battery intent kinds |
| `packages/shared/src/index.ts` | Modify | Export shields |
| `packages/game/src/types.ts` | Modify | Add LiveProjectile, StepTankInfo, StepInput, StepResult, StepEvent |
| `packages/game/src/items/index.ts` | **Create** | ITEM_REGISTRY (10 defense/fuel items) |
| `packages/game/src/physics/fall-damage.ts` | **Create** | computeFallDamage pure function |
| `packages/game/src/physics/fall-damage.test.ts` | **Create** | TDD tests |
| `packages/game/src/physics/step.ts` | **Create** | stepProjectiles pure function |
| `packages/game/src/physics/step.test.ts` | **Create** | TDD tests for all shields + Patriot |
| `packages/game/src/index.ts` | Modify | Export new symbols |
| `apps/server/src/rooms/tickLoop.ts` | **Create** | 60 Hz interval logic, Patriot triggers, commitTurnEnd |
| `apps/server/src/rooms/resolveTurn.ts` | Modify | handleFire delegates to tick loop; add move/equip-shield/use-battery; startRound additions |
| `apps/server/src/rooms/MatchRoom.ts` | Modify | Wire new message handlers; add liveProjectiles + tickInterval fields |
| `apps/client/src/render/Projectile.ts` | Modify | Replace sample-replay with tick-stream Map renderer |
| `apps/client/src/render/Shield.ts` | **Create** | Shield bubble Graphics + hit animations |
| `apps/client/src/render/Patriot.ts` | **Create** | Patriot sprite + trail |
| `apps/client/src/render/Tank.ts` | Modify | Add shield bubble child, fuel bar |
| `apps/client/src/input/AimControls.ts` | Modify | Drive mode state machine |
| `apps/client/src/scenes/MatchScene.ts` | Modify | Wire tick, shield-hit, patriot-launched, tank-moved, tank-fell |
| `apps/client/src/hud/WeaponBar.ts` | Modify | Show shield HP bar + defense item counts |

---

### Task 1: Schema foundations

**Files:**
- Modify: `packages/shared/src/schema/Tank.ts`
- Modify: `packages/shared/src/schema/MatchState.ts`
- Create: `packages/shared/src/shields.ts`
- Modify: `packages/shared/src/intents.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add fields to Tank schema**

Replace the existing Tank.ts content:

```typescript
import { Schema, MapSchema, type } from "@colyseus/schema";

export class Tank extends Schema {
  @type("string") playerId = "";
  @type("string") sessionId = "";
  @type("string") nickname = "";
  @type("string") color = "red";
  @type("string") hat = "none";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") hp = 100;
  @type("number") angle = 90;
  @type("number") power = 500;
  @type("boolean") alive = true;
  @type("boolean") connected = true;
  @type("string") weaponId = "baby-missile";
  @type({ map: "number" }) inventory = new MapSchema<number>();
  // Phase 3 — economy
  @type("number") cash = 10_000;
  @type("number") damageDealtThisRound = 0;
  @type("number") killsThisRound = 0;
  @type("boolean") readyForShop = false;
  @type("number") totalDamageDealt = 0;
  @type("number") totalKills = 0;
  // Phase 4 — shields
  @type("string") shieldId = "";
  @type("number") shieldHp = 0;
  @type("number") shieldMaxHp = 0;
  // Phase 4 — movement
  @type("number") fuel = 0;
}
```

- [ ] **Step 2: Add resolvingTick to MatchState**

In `packages/shared/src/schema/MatchState.ts`, add after `shopDeadlineMs`:

```typescript
  // Phase 4 — tick-stream
  @type("number") resolvingTick = 0;
```

- [ ] **Step 3: Create shields.ts**

```typescript
// packages/shared/src/shields.ts
export interface ShieldDef {
  id: string;
  label: string;
  maxHp: number;
  radius: number;
  type: "absorb" | "deflect" | "bend" | "explode";
  hpCostFraction: number;
  price: number;
  packSize: number;
}

export const SHIELD_DEFS = new Map<string, ShieldDef>([
  ["force-field", {
    id: "force-field", label: "Force Field",
    maxHp: 200, radius: 60, type: "absorb", hpCostFraction: 0.5,
    price: 1500, packSize: 1,
  }],
  ["deflector-shield", {
    id: "deflector-shield", label: "Deflector Shield",
    maxHp: 500, radius: 70, type: "deflect", hpCostFraction: 0.25,
    price: 3000, packSize: 1,
  }],
  ["magnetic-shield", {
    id: "magnetic-shield", label: "Magnetic Shield",
    maxHp: 600, radius: 100, type: "bend", hpCostFraction: 0,
    price: 3500, packSize: 1,
  }],
  ["reactive-armor", {
    id: "reactive-armor", label: "Reactive Armor",
    maxHp: 1, radius: 50, type: "explode", hpCostFraction: 1,
    price: 2000, packSize: 3,
  }],
  ["auto-shield", {
    id: "auto-shield", label: "Auto Shield",
    maxHp: 400, radius: 60, type: "absorb", hpCostFraction: 0.5,
    price: 2500, packSize: 2,
  }],
]);
```

- [ ] **Step 4: Add new intent kinds to intents.ts**

```typescript
export type Intent =
  | { kind: "aim"; angle: number; power: number }
  | { kind: "fire"; angle: number; power: number }
  | { kind: "configure"; turnTimerMs?: number; loadoutId?: string; maxRounds?: number }
  | { kind: "ready" }
  | { kind: "chat"; text: string }
  | { kind: "select-weapon"; weaponId: string }
  | { kind: "buy"; weaponId: string }
  | { kind: "ready-for-shop" }
  | { kind: "move"; direction: "left" | "right"; pixels: number }
  | { kind: "equip-shield"; shieldId: string }
  | { kind: "use-battery" };
```

- [ ] **Step 5: Export from shared index**

Add to `packages/shared/src/index.ts`:

```typescript
export { SHIELD_DEFS, type ShieldDef } from "./shields";
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
pnpm --filter @se/shared typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/schema/Tank.ts packages/shared/src/schema/MatchState.ts packages/shared/src/shields.ts packages/shared/src/intents.ts packages/shared/src/index.ts
git commit -m "feat(shared): Phase 4 schema — shield fields, fuel, resolvingTick, shield defs, new intents"
```

---

### Task 2: Game types

**Files:**
- Modify: `packages/game/src/types.ts`

- [ ] **Step 1: Add Phase 4 types to types.ts**

Append to the end of `packages/game/src/types.ts`:

```typescript
// Phase 4 — tick-stream physics

export interface LiveProjectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  weapon: WeaponDef;
  ownerId: string;
  apexReached: boolean;
  isPatriot?: true;
  targetId?: string;
}

export interface StepTankInfo {
  sessionId: string;
  x: number;
  y: number;
  shieldHp: number;
  shieldMaxHp: number;
  shieldRadius: number;
  shieldType: "absorb" | "deflect" | "bend" | "explode" | "";
  hpCostFraction: number;
}

export interface StepInput {
  projectiles: LiveProjectile[];
  tanks: StepTankInfo[];
  terrain: Int16Array;
  terrainWidth: number;
  terrainHeight: number;
  wind: number;
  gravity: number;
  dt: number;
}

export type StepEvent =
  | { kind: "terrain-impact"; projectileId: string; x: number; y: number; weapon: WeaponDef; ownerId: string }
  | { kind: "shield-absorb";  projectileId: string; targetId: string; hpBefore: number; hpAfter: number }
  | { kind: "shield-deflect"; projectileId: string; targetId: string; newVx: number; newVy: number; hpBefore: number; hpAfter: number }
  | { kind: "shield-bend";    projectileId: string; targetId: string; impulseX: number; impulseY: number }
  | { kind: "shield-explode"; projectileId: string; targetId: string; x: number; y: number }
  | { kind: "out-of-bounds";  projectileId: string }
  | { kind: "mirv-split";     projectileId: string; x: number; y: number; children: LiveProjectile[] }
  | { kind: "patriot-intercept"; patriotId: string; targetId: string; x: number; y: number };

export interface StepResult {
  survivors: LiveProjectile[];
  spawned: LiveProjectile[];
  events: StepEvent[];
  shieldDrains: Array<{ sessionId: string; hpDrain: number }>;
}

export interface FallDamageInput {
  sessionId: string;
  tankY: number;
  surfaceY: number;
  hasParachute: boolean;
}

export interface FallDamageResult {
  damage: number;
  parachuteConsumed: boolean;
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @se/game typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/game/src/types.ts
git commit -m "feat(game): add Phase 4 types — LiveProjectile, StepInput, StepResult, StepEvent"
```

---

### Task 3: Item registry

**Files:**
- Create: `packages/game/src/items/index.ts`
- Modify: `packages/game/src/index.ts`

- [ ] **Step 1: Create items/index.ts**

```typescript
// packages/game/src/items/index.ts
export interface ItemDef {
  id: string;
  label: string;
  price: number;
  packSize: number;
}

export const ITEM_REGISTRY = new Map<string, ItemDef>([
  ["force-field",      { id: "force-field",      label: "Force Field",      price: 1500, packSize: 1 }],
  ["deflector-shield", { id: "deflector-shield", label: "Deflector Shield", price: 3000, packSize: 1 }],
  ["magnetic-shield",  { id: "magnetic-shield",  label: "Magnetic Shield",  price: 3500, packSize: 1 }],
  ["reactive-armor",   { id: "reactive-armor",   label: "Reactive Armor",   price: 2000, packSize: 3 }],
  ["auto-shield",      { id: "auto-shield",      label: "Auto Shield",      price: 2500, packSize: 2 }],
  ["battery",          { id: "battery",          label: "Battery",          price: 1000, packSize: 2 }],
  ["parachute",        { id: "parachute",        label: "Parachute",        price: 500,  packSize: 3 }],
  ["patriot",          { id: "patriot",          label: "Patriot",          price: 3000, packSize: 1 }],
  ["fuel-small",       { id: "fuel-small",       label: "Fuel Tank (S)",    price: 500,  packSize: 2 }],
  ["fuel-large",       { id: "fuel-large",       label: "Fuel Tank (L)",    price: 1000, packSize: 1 }],
]);
```

- [ ] **Step 2: Export from game index**

Add to `packages/game/src/index.ts`:

```typescript
export { ITEM_REGISTRY, type ItemDef } from "./items/index";
```

- [ ] **Step 3: Commit**

```bash
git add packages/game/src/items/index.ts packages/game/src/index.ts
git commit -m "feat(game): add Phase 4 item registry — shields, fuel, battery, parachute, Patriot"
```

---

### Task 4: Fall damage — TDD

**Files:**
- Create: `packages/game/src/physics/fall-damage.test.ts`
- Create: `packages/game/src/physics/fall-damage.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/game/src/physics/fall-damage.test.ts
import { describe, it, expect } from "vitest";
import { computeFallDamage } from "./fall-damage";

describe("computeFallDamage", () => {
  it("returns no damage for fall under 20px threshold", () => {
    expect(computeFallDamage({ sessionId: "a", tankY: 90, surfaceY: 108, hasParachute: false }))
      .toEqual({ damage: 0, parachuteConsumed: false });
  });

  it("returns no damage for fall exactly at threshold boundary (19px)", () => {
    expect(computeFallDamage({ sessionId: "a", tankY: 100, surfaceY: 119, hasParachute: false }))
      .toEqual({ damage: 0, parachuteConsumed: false });
  });

  it("returns damage for fall >= 20px", () => {
    expect(computeFallDamage({ sessionId: "a", tankY: 80, surfaceY: 120, hasParachute: false }))
      .toEqual({ damage: 20, parachuteConsumed: false });
  });

  it("floors fractional damage", () => {
    // fallDistance = 21, floor(21 * 0.5) = 10
    expect(computeFallDamage({ sessionId: "a", tankY: 100, surfaceY: 121, hasParachute: false }))
      .toEqual({ damage: 10, parachuteConsumed: false });
  });

  it("large fall: 200px → damage 100", () => {
    expect(computeFallDamage({ sessionId: "a", tankY: 0, surfaceY: 200, hasParachute: false }))
      .toEqual({ damage: 100, parachuteConsumed: false });
  });

  it("parachute zeroes damage and is consumed for fall >= 20px", () => {
    expect(computeFallDamage({ sessionId: "a", tankY: 80, surfaceY: 120, hasParachute: true }))
      .toEqual({ damage: 0, parachuteConsumed: true });
  });

  it("parachute is NOT consumed for fall under threshold", () => {
    expect(computeFallDamage({ sessionId: "a", tankY: 90, surfaceY: 108, hasParachute: true }))
      .toEqual({ damage: 0, parachuteConsumed: false });
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
pnpm --filter @se/game test -- fall-damage
```

Expected: FAIL — `Cannot find module './fall-damage'`

- [ ] **Step 3: Implement fall-damage.ts**

```typescript
// packages/game/src/physics/fall-damage.ts
import type { FallDamageInput, FallDamageResult } from "../types";

export function computeFallDamage(input: FallDamageInput): FallDamageResult {
  const { tankY, surfaceY, hasParachute } = input;
  const fallDistance = surfaceY - tankY;
  if (fallDistance < 20) return { damage: 0, parachuteConsumed: false };
  if (hasParachute) return { damage: 0, parachuteConsumed: true };
  return { damage: Math.floor(fallDistance * 0.5), parachuteConsumed: false };
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
pnpm --filter @se/game test -- fall-damage
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/game/src/physics/fall-damage.ts packages/game/src/physics/fall-damage.test.ts
git commit -m "feat(game): computeFallDamage — 0.5 hp/px, 20px threshold, parachute support"
```

---

### Task 5: Step function — core loop (physics, MIRV, out-of-bounds)

**Files:**
- Create: `packages/game/src/physics/step.test.ts` (core cases only)
- Create: `packages/game/src/physics/step.ts`

- [ ] **Step 1: Write failing tests for core loop**

```typescript
// packages/game/src/physics/step.test.ts
import { describe, it, expect } from "vitest";
import { stepProjectiles, initialVelocityFromAnglePower } from "./step";
import type { LiveProjectile, StepTankInfo } from "../types";
import { BABY_MISSILE } from "../weapons/baby-missile";
import { MIRV } from "../weapons/mirv";

const FLAT_TERRAIN = new Int16Array(1600).fill(500);
const NO_TANKS: StepTankInfo[] = [];
const BASE_INPUT = {
  terrain: FLAT_TERRAIN,
  terrainWidth: 1600,
  terrainHeight: 900,
  wind: 0,
  gravity: 250,
  dt: 1 / 60,
};

function makeProjectile(overrides: Partial<LiveProjectile> = {}): LiveProjectile {
  return {
    id: "p1",
    x: 800, y: 100,
    vx: 0, vy: 0,
    weapon: BABY_MISSILE,
    ownerId: "player1",
    apexReached: false,
    ...overrides,
  };
}

describe("stepProjectiles — core", () => {
  it("applies gravity to vy each tick", () => {
    const p = makeProjectile({ vy: 0 });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: NO_TANKS });
    const survivor = result.survivors[0];
    expect(survivor).toBeDefined();
    expect(survivor!.vy).toBeCloseTo(250 / 60, 5);
  });

  it("applies wind to vx (non-immune weapon)", () => {
    const p = makeProjectile({ vx: 0 });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: NO_TANKS, wind: 60 });
    const survivor = result.survivors[0];
    expect(survivor!.vx).toBeCloseTo(60 * 5 / 60, 4); // WIND_ACCEL_SCALE = 5
  });

  it("wind-immune weapon ignores wind", () => {
    const immune = { ...BABY_MISSILE, windImmune: true };
    const p = makeProjectile({ weapon: immune, vx: 0 });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: NO_TANKS, wind: 100 });
    expect(result.survivors[0]!.vx).toBeCloseTo(0, 5);
  });

  it("emits terrain-impact when projectile hits terrain surface", () => {
    const terrain = new Int16Array(1600).fill(200);
    const p = makeProjectile({ x: 800, y: 195, vy: 100 });
    const result = stepProjectiles({ ...BASE_INPUT, terrain, projectiles: [p], tanks: NO_TANKS });
    const impact = result.events.find(e => e.kind === "terrain-impact");
    expect(impact).toBeDefined();
    expect(result.survivors).toHaveLength(0);
  });

  it("emits out-of-bounds when projectile leaves terrain width", () => {
    const p = makeProjectile({ x: 1598, vx: 200 });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: NO_TANKS });
    const oob = result.events.find(e => e.kind === "out-of-bounds");
    expect(oob).toBeDefined();
    expect(result.survivors).toHaveLength(0);
  });

  it("emits out-of-bounds when projectile falls below soft bottom", () => {
    const p = makeProjectile({ x: 800, y: 1095, vy: 50 }); // terrainHeight(900) + 200 = 1100
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: NO_TANKS });
    expect(result.events.some(e => e.kind === "out-of-bounds")).toBe(true);
  });

  it("handles multiple simultaneous projectiles independently", () => {
    const p1 = makeProjectile({ id: "p1", x: 400 });
    const p2 = makeProjectile({ id: "p2", x: 1200 });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p1, p2], tanks: NO_TANKS });
    expect(result.survivors).toHaveLength(2);
  });

  it("emits mirv-split at apex (vy crosses 0 negative→positive)", () => {
    const p = makeProjectile({ weapon: MIRV, vy: -1, apexReached: false }); // about to cross apex
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: NO_TANKS, gravity: 250 });
    const split = result.events.find(e => e.kind === "mirv-split");
    expect(split).toBeDefined();
    expect(result.spawned.length).toBeGreaterThan(0);
  });

  it("does not split twice — apexReached guard", () => {
    const p = makeProjectile({ weapon: MIRV, vy: 10, apexReached: true });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: NO_TANKS });
    expect(result.events.find(e => e.kind === "mirv-split")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
pnpm --filter @se/game test -- step
```

Expected: FAIL — `Cannot find module './step'`

- [ ] **Step 3: Implement step.ts — core loop only (no shield logic yet)**

```typescript
// packages/game/src/physics/step.ts
import type { LiveProjectile, StepInput, StepResult, StepEvent, WeaponDef } from "../types";

const WIND_ACCEL_SCALE = 5.0;

export function initialVelocityFromAnglePower(angle: number, power: number): { vx: number; vy: number } {
  const a = (angle * Math.PI) / 180;
  return { vx: -Math.cos(a) * power, vy: -Math.sin(a) * power };
}

function heightAt(terrain: Int16Array, x: number): number {
  const i = Math.floor(x);
  if (i < 0 || i >= terrain.length) return Number.POSITIVE_INFINITY;
  return terrain[i] as number;
}

function spawnMirvChildren(parent: LiveProjectile, x: number, y: number): LiveProjectile[] {
  const split = parent.weapon.split;
  if (!split) return [];
  const children: LiveProjectile[] = [];
  for (let i = 0; i < split.count; i++) {
    const deg =
      split.spreadDeg >= 360
        ? i * (360 / split.count)
        : split.count === 1
        ? split.centerDeg
        : split.centerDeg - split.spreadDeg / 2 + i * (split.spreadDeg / (split.count - 1));
    const rad = (deg * Math.PI) / 180;
    const ejVx = Math.cos(rad) * split.ejectionSpeed + (split.inheritVelocity ? parent.vx : 0);
    const ejVy = Math.sin(rad) * split.ejectionSpeed + (split.inheritVelocity ? parent.vy : 0);
    children.push({
      id: `${parent.id}-child-${i}`,
      x, y,
      vx: ejVx, vy: ejVy,
      weapon: split.child,
      ownerId: parent.ownerId,
      apexReached: false,
    });
  }
  return children;
}

export function stepProjectiles(input: StepInput): StepResult {
  const { projectiles, tanks, terrain, terrainWidth, terrainHeight, wind, gravity, dt } = input;
  const SOFT_BOTTOM = terrainHeight + 200;

  const survivors: LiveProjectile[] = [];
  const spawned: LiveProjectile[] = [];
  const events: StepEvent[] = [];
  const shieldDrains: Array<{ sessionId: string; hpDrain: number }> = [];

  for (const p of projectiles) {
    // 1. Apply physics
    const windAccel = p.weapon.windImmune ? 0 : wind * WIND_ACCEL_SCALE;
    p.vx += windAccel * dt;
    p.vy += gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // 2 & 3. Patriot homing + intercept (handled in Task 10)
    if (p.isPatriot) {
      // placeholder — filled in Task 10
      survivors.push(p);
      continue;
    }

    // 4. MIRV apex split
    if (p.weapon.split && p.weapon.split.trigger === "apex" && !p.apexReached) {
      const prevVy = p.vy - gravity * dt; // vy before this tick's gravity
      if (prevVy < 0 && p.vy >= 0) {
        p.apexReached = true;
        const children = spawnMirvChildren(p, p.x, p.y);
        spawned.push(...children);
        events.push({ kind: "mirv-split", projectileId: p.id, x: p.x, y: p.y, children });
        continue; // parent consumed
      }
    }

    // 5. Out-of-bounds
    if (p.x < 0 || p.x >= terrainWidth || p.y > SOFT_BOTTOM) {
      events.push({ kind: "out-of-bounds", projectileId: p.id });
      continue;
    }

    // 6. Shield check (handled in Tasks 6–9)
    // placeholder — filled in later tasks

    // 7. Terrain collision
    const surfaceY = heightAt(terrain, p.x);
    if (p.y >= surfaceY) {
      events.push({ kind: "terrain-impact", projectileId: p.id, x: p.x, y: p.y, weapon: p.weapon, ownerId: p.ownerId });
      continue;
    }

    survivors.push(p);
  }

  return { survivors, spawned, events, shieldDrains };
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
pnpm --filter @se/game test -- step
```

Expected: all core tests pass. MIRV split test may need adjustment if the prevVy calculation differs — check output.

- [ ] **Step 5: Commit**

```bash
git add packages/game/src/physics/step.ts packages/game/src/physics/step.test.ts
git commit -m "feat(game): stepProjectiles core — physics, MIRV split, OOB, terrain impact"
```

---

### Task 6: Step function — absorb shields (Force Field + Auto Shield)

**Files:**
- Modify: `packages/game/src/physics/step.test.ts` (add shield tests)
- Modify: `packages/game/src/physics/step.ts` (fill shield check placeholder)

- [ ] **Step 1: Add absorb shield tests**

Append to `step.test.ts` inside a new describe block:

```typescript
// Helper — builds a StepTankInfo with absorb shield
function absorbTank(overrides: Partial<StepTankInfo> = {}): StepTankInfo {
  return {
    sessionId: "defender",
    x: 800, y: 490,
    shieldHp: 200, shieldMaxHp: 200,
    shieldRadius: 60,
    shieldType: "absorb",
    hpCostFraction: 0.5,
    ...overrides,
  };
}

describe("stepProjectiles — absorb shield", () => {
  it("absorbs projectile within radius, emits shield-absorb", () => {
    const tank = absorbTank();
    const p = makeProjectile({ x: 800, y: 455, vy: 50, ownerId: "attacker" }); // within 60px
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    const ev = result.events.find(e => e.kind === "shield-absorb");
    expect(ev).toBeDefined();
    expect(result.survivors).toHaveLength(0);
    if (ev?.kind === "shield-absorb") {
      expect(ev.targetId).toBe("defender");
      expect(ev.hpAfter).toBe(200 - Math.floor(BABY_MISSILE.damage * 0.5));
    }
  });

  it("does NOT absorb when shield HP is 0", () => {
    const tank = absorbTank({ shieldHp: 0 });
    const p = makeProjectile({ x: 800, y: 455, vy: 50, ownerId: "attacker" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.events.find(e => e.kind === "shield-absorb")).toBeUndefined();
  });

  it("does NOT absorb owner's own projectile", () => {
    const tank = absorbTank({ sessionId: "player1" });
    const p = makeProjectile({ x: 800, y: 455, vy: 50, ownerId: "player1" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.events.find(e => e.kind === "shield-absorb")).toBeUndefined();
  });

  it("does NOT absorb projectile outside radius", () => {
    const tank = absorbTank({ x: 800, y: 490 });
    const p = makeProjectile({ x: 800, y: 300, vy: 5, ownerId: "attacker" }); // 190px away
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.events.find(e => e.kind === "shield-absorb")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect new tests fail**

```bash
pnpm --filter @se/game test -- step
```

Expected: new shield-absorb tests FAIL.

- [ ] **Step 3: Implement shield check in step.ts**

Replace the `// 6. Shield check` placeholder with the full shield logic:

```typescript
    // 6. Shield check
    let shielded = false;
    for (const tank of tanks) {
      if (tank.sessionId === p.ownerId) continue; // owner's own shield never blocks
      if (tank.shieldHp <= 0) continue;
      const dx = p.x - tank.x;
      const dy = p.y - tank.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= tank.shieldRadius) continue;

      const nx = dx / dist;
      const ny = dy / dist;

      if (tank.shieldType === "absorb") {
        const hpCost = Math.floor(p.weapon.damage * tank.hpCostFraction);
        const hpBefore = tank.shieldHp;
        const hpAfter = Math.max(0, hpBefore - hpCost);
        events.push({ kind: "shield-absorb", projectileId: p.id, targetId: tank.sessionId, hpBefore, hpAfter });
        tank.shieldHp = hpAfter;
        shielded = true;
        break;
      }

      if (tank.shieldType === "deflect") {
        const hpCost = Math.floor(p.weapon.damage * tank.hpCostFraction);
        const hpBefore = tank.shieldHp;
        const hpAfter = Math.max(0, hpBefore - hpCost);
        const dot = p.vx * nx + p.vy * ny;
        const newVx = p.vx - 2 * dot * nx;
        const newVy = p.vy - 2 * dot * ny;
        p.vx = newVx;
        p.vy = newVy;
        tank.shieldHp = hpAfter;
        events.push({ kind: "shield-deflect", projectileId: p.id, targetId: tank.sessionId, newVx, newVy, hpBefore, hpAfter });
        // deflected projectile stays alive — no break, no shielded=true
        break;
      }

      if (tank.shieldType === "bend") {
        const strength = 8000 / (dist * dist);
        const impulseX = nx * strength * dt;
        const impulseY = ny * strength * dt;
        p.vx += impulseX;
        p.vy += impulseY;
        events.push({ kind: "shield-bend", projectileId: p.id, targetId: tank.sessionId, impulseX, impulseY });
        // magnetic drain tracked in shieldDrains — apply per-tank, not per-hit
        const existing = shieldDrains.find(d => d.sessionId === tank.sessionId);
        if (existing) {
          existing.hpDrain = Math.max(existing.hpDrain, 15 * dt);
        } else {
          shieldDrains.push({ sessionId: tank.sessionId, hpDrain: 15 * dt });
        }
        // projectile stays alive — no break
        break;
      }

      if (tank.shieldType === "explode") {
        events.push({ kind: "shield-explode", projectileId: p.id, targetId: tank.sessionId, x: p.x, y: p.y });
        tank.shieldHp = 0;
        shielded = true;
        break;
      }
    }

    if (shielded) continue;
```

- [ ] **Step 4: Run all step tests — expect pass**

```bash
pnpm --filter @se/game test -- step
```

Expected: all tests pass including new absorb shield tests.

- [ ] **Step 5: Commit**

```bash
git add packages/game/src/physics/step.ts packages/game/src/physics/step.test.ts
git commit -m "feat(game): shield check in stepProjectiles — absorb, deflect, bend, explode stubs"
```

---

### Task 7: Step function — Deflector Shield tests

**Files:**
- Modify: `packages/game/src/physics/step.test.ts`

- [ ] **Step 1: Add deflect tests**

Append to `step.test.ts`:

```typescript
describe("stepProjectiles — deflector shield", () => {
  function deflectTank(overrides: Partial<StepTankInfo> = {}): StepTankInfo {
    return {
      sessionId: "defender",
      x: 800, y: 490,
      shieldHp: 500, shieldMaxHp: 500,
      shieldRadius: 70,
      shieldType: "deflect",
      hpCostFraction: 0.25,
      ...overrides,
    };
  }

  it("emits shield-deflect and projectile survives (remains in survivors)", () => {
    const tank = deflectTank();
    const p = makeProjectile({ x: 800, y: 430, vy: 100, ownerId: "attacker" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.events.find(e => e.kind === "shield-deflect")).toBeDefined();
    expect(result.survivors).toHaveLength(1);
  });

  it("reflected projectile has reversed vy component (hits from above → bounces up)", () => {
    const tank = deflectTank({ x: 800, y: 500 });
    // Projectile coming straight down from above tank center
    const p = makeProjectile({ x: 800, y: 450, vx: 0, vy: 200, ownerId: "attacker" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    const deflected = result.survivors[0];
    expect(deflected).toBeDefined();
    expect(deflected!.vy).toBeLessThan(0); // reflected upward
  });

  it("reduces shield HP by hpCostFraction * damage", () => {
    const tank = deflectTank();
    const p = makeProjectile({ x: 800, y: 430, vy: 100, ownerId: "attacker" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    const ev = result.events.find(e => e.kind === "shield-deflect");
    if (ev?.kind === "shield-deflect") {
      const expectedCost = Math.floor(BABY_MISSILE.damage * 0.25);
      expect(ev.hpAfter).toBe(500 - expectedCost);
    }
  });

  it("does NOT deflect own projectile", () => {
    const tank = deflectTank({ sessionId: "player1" });
    const p = makeProjectile({ x: 800, y: 430, vy: 100, ownerId: "player1" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.events.find(e => e.kind === "shield-deflect")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect pass (logic already in step.ts from Task 6)**

```bash
pnpm --filter @se/game test -- step
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/game/src/physics/step.test.ts
git commit -m "test(game): deflector shield tests"
```

---

### Task 8: Step function — Magnetic Shield tests

**Files:**
- Modify: `packages/game/src/physics/step.test.ts`

- [ ] **Step 1: Add magnetic shield tests**

Append to `step.test.ts`:

```typescript
describe("stepProjectiles — magnetic shield", () => {
  function magneticTank(overrides: Partial<StepTankInfo> = {}): StepTankInfo {
    return {
      sessionId: "defender",
      x: 800, y: 490,
      shieldHp: 600, shieldMaxHp: 600,
      shieldRadius: 100,
      shieldType: "bend",
      hpCostFraction: 0,
      ...overrides,
    };
  }

  it("projectile survives and vx/vy are modified", () => {
    const tank = magneticTank();
    const p = makeProjectile({ x: 800, y: 400, vx: 0, vy: 50, ownerId: "attacker" }); // 90px away
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.survivors).toHaveLength(1);
    // vy should have decreased (impulse pushes away — upward since p is above tank)
    expect(result.survivors[0]!.vy).toBeLessThan(50);
  });

  it("emits shield-bend event", () => {
    const tank = magneticTank();
    const p = makeProjectile({ x: 800, y: 400, vy: 50, ownerId: "attacker" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.events.find(e => e.kind === "shield-bend")).toBeDefined();
  });

  it("adds hpDrain to shieldDrains while projectile is in range", () => {
    const tank = magneticTank();
    const p = makeProjectile({ x: 800, y: 400, vy: 0, ownerId: "attacker" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.shieldDrains).toHaveLength(1);
    expect(result.shieldDrains[0]!.sessionId).toBe("defender");
    expect(result.shieldDrains[0]!.hpDrain).toBeGreaterThan(0);
  });

  it("no drain when projectile out of range", () => {
    const tank = magneticTank({ x: 800, y: 490 });
    const p = makeProjectile({ x: 800, y: 100, vy: 0, ownerId: "attacker" }); // 390px away
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.shieldDrains).toHaveLength(0);
  });

  it("does not apply bend to owner's own projectile", () => {
    const tank = magneticTank({ sessionId: "player1" });
    const p = makeProjectile({ x: 800, y: 400, vy: 50, ownerId: "player1" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.events.find(e => e.kind === "shield-bend")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect pass**

```bash
pnpm --filter @se/game test -- step
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/game/src/physics/step.test.ts
git commit -m "test(game): magnetic shield tests"
```

---

### Task 9: Step function — Reactive Armor tests

**Files:**
- Modify: `packages/game/src/physics/step.test.ts`

- [ ] **Step 1: Add reactive armor tests**

Append to `step.test.ts`:

```typescript
describe("stepProjectiles — reactive armor", () => {
  function reactiveTank(overrides: Partial<StepTankInfo> = {}): StepTankInfo {
    return {
      sessionId: "defender",
      x: 800, y: 490,
      shieldHp: 1, shieldMaxHp: 1,
      shieldRadius: 50,
      shieldType: "explode",
      hpCostFraction: 1,
      ...overrides,
    };
  }

  it("removes projectile and emits shield-explode when charged (shieldHp=1)", () => {
    const tank = reactiveTank();
    const p = makeProjectile({ x: 800, y: 450, vy: 50, ownerId: "attacker" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.survivors).toHaveLength(0);
    expect(result.events.find(e => e.kind === "shield-explode")).toBeDefined();
  });

  it("explode event contains contact point", () => {
    const tank = reactiveTank();
    const p = makeProjectile({ x: 800, y: 450, vy: 50, ownerId: "attacker" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    const ev = result.events.find(e => e.kind === "shield-explode");
    if (ev?.kind === "shield-explode") {
      expect(ev.targetId).toBe("defender");
      expect(typeof ev.x).toBe("number");
    }
  });

  it("does NOT trigger when depleted (shieldHp=0)", () => {
    const tank = reactiveTank({ shieldHp: 0 });
    const p = makeProjectile({ x: 800, y: 450, vy: 50, ownerId: "attacker" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.events.find(e => e.kind === "shield-explode")).toBeUndefined();
    // projectile should continue (hits terrain or survives)
  });

  it("does NOT trigger against owner's projectile", () => {
    const tank = reactiveTank({ sessionId: "player1" });
    const p = makeProjectile({ x: 800, y: 450, vy: 50, ownerId: "player1" });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [p], tanks: [tank] });
    expect(result.events.find(e => e.kind === "shield-explode")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect pass**

```bash
pnpm --filter @se/game test -- step
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/game/src/physics/step.test.ts
git commit -m "test(game): reactive armor tests"
```

---

### Task 10: Step function — Patriot homing + intercept

**Files:**
- Modify: `packages/game/src/physics/step.test.ts`
- Modify: `packages/game/src/physics/step.ts` (fill Patriot placeholder)

- [ ] **Step 1: Add Patriot tests**

Append to `step.test.ts`:

```typescript
describe("stepProjectiles — Patriot", () => {
  function makePatriot(targetId: string, overrides: Partial<LiveProjectile> = {}): LiveProjectile {
    return {
      id: "pat1",
      x: 700, y: 400,
      vx: 0, vy: 0,
      weapon: BABY_MISSILE,
      ownerId: "defender",
      apexReached: false,
      isPatriot: true,
      targetId,
      ...overrides,
    };
  }

  it("updates patriot velocity toward target each tick", () => {
    const target = makeProjectile({ id: "enemy1", x: 900, y: 400, ownerId: "attacker" });
    const patriot = makePatriot("enemy1", { x: 700, y: 400 });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [patriot, target], tanks: NO_TANKS });
    const survivingPatriot = result.survivors.find(p => p.id === "pat1");
    expect(survivingPatriot).toBeDefined();
    expect(survivingPatriot!.vx).toBeGreaterThan(0); // should move right toward target at x=900
  });

  it("emits patriot-intercept and removes both when within 15px", () => {
    // Place patriot right next to target
    const target = makeProjectile({ id: "enemy1", x: 800, y: 400, vy: 0, ownerId: "attacker" });
    const patriot = makePatriot("enemy1", { x: 806, y: 404 }); // ~7px away
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [patriot, target], tanks: NO_TANKS });
    expect(result.events.find(e => e.kind === "patriot-intercept")).toBeDefined();
    expect(result.survivors.find(p => p.id === "pat1")).toBeUndefined();
    expect(result.survivors.find(p => p.id === "enemy1")).toBeUndefined();
  });

  it("removes patriot when target is already gone from projectiles list", () => {
    const patriot = makePatriot("ghost-target", { x: 800, y: 400 });
    const result = stepProjectiles({ ...BASE_INPUT, projectiles: [patriot], tanks: NO_TANKS });
    // Patriot should not survive (target gone)
    expect(result.survivors.find(p => p.id === "pat1")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect Patriot tests fail**

```bash
pnpm --filter @se/game test -- step
```

Expected: Patriot tests FAIL (placeholder just pushes to survivors).

- [ ] **Step 3: Implement Patriot logic in step.ts**

Replace the Patriot placeholder block:

```typescript
    // 2 & 3. Patriot homing + intercept
    if (p.isPatriot) {
      const target = projectiles.find(t => t.id === p.targetId);
      if (!target) continue; // target gone — remove patriot

      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 15) {
        events.push({ kind: "patriot-intercept", patriotId: p.id, targetId: target.id, x: p.x, y: p.y });
        // Mark target for removal (filter it after loop)
        intercepted.add(target.id);
        continue; // patriot also consumed
      }

      const speed = 600;
      p.vx = (dx / dist) * speed;
      p.vy = (dy / dist) * speed;
      survivors.push(p);
      continue;
    }
```

Also add `const intercepted = new Set<string>();` before the projectile loop, and filter intercepted from survivors after the loop:

```typescript
  const intercepted = new Set<string>();
  // ... existing loop ...
  return {
    survivors: survivors.filter(p => !intercepted.has(p.id)),
    spawned,
    events,
    shieldDrains,
  };
```

- [ ] **Step 4: Run all step tests — expect pass**

```bash
pnpm --filter @se/game test -- step
```

Expected: all tests pass.

- [ ] **Step 5: Export from game index**

Add to `packages/game/src/index.ts`:

```typescript
export { stepProjectiles, initialVelocityFromAnglePower } from "./physics/step";
export { computeFallDamage } from "./physics/fall-damage";
```

- [ ] **Step 6: Run full game test suite**

```bash
pnpm --filter @se/game test
```

Expected: all tests pass (including pre-existing simulate, terrain, economy tests).

- [ ] **Step 7: Commit**

```bash
git add packages/game/src/physics/step.ts packages/game/src/physics/step.test.ts packages/game/src/index.ts
git commit -m "feat(game): Patriot homing + intercept in stepProjectiles; export step + fallDamage"
```

---

### Task 11: Server — tick loop

**Files:**
- Create: `apps/server/src/rooms/tickLoop.ts`
- Modify: `apps/server/src/rooms/resolveTurn.ts`
- Modify: `apps/server/src/rooms/MatchRoom.ts`

- [ ] **Step 1: Create tickLoop.ts**

```typescript
// apps/server/src/rooms/tickLoop.ts
import {
  MatchState, CarveOp,
  TERRAIN_WIDTH, TERRAIN_HEIGHT,
} from "@se/shared";
import { SHIELD_DEFS } from "@se/shared";
import {
  stepProjectiles, computeFallDamage, WEAPON_REGISTRY, DEATH_EXPLOSION,
  computeDamage, carveInPlace, initialVelocityFromAnglePower,
  type LiveProjectile, type StepTankInfo, type StepEvent,
} from "@se/game";
import { nextTurnPlayerId } from "./turnController";
import { endRound, applyDamagesWithChainKills } from "./resolveTurn";
import type { ResolveContext } from "./resolveTurn";

const PATRIOT_DETECT_RADIUS = 200;
const PATRIOT_CARVE_RADIUS = 30;
const REACTIVE_WEAPON = { id: "reactive-blast", radius: 60, damage: 40, windImmune: true, price: 0, packSize: 0 };

export function buildStepTanks(state: MatchState): StepTankInfo[] {
  return Array.from(state.tanks.values())
    .filter(t => t.alive)
    .map(t => {
      const def = t.shieldId ? SHIELD_DEFS.get(t.shieldId) : undefined;
      return {
        sessionId: t.sessionId,
        x: t.x,
        y: t.y,
        shieldHp: t.shieldHp,
        shieldMaxHp: t.shieldMaxHp,
        shieldRadius: def?.radius ?? 0,
        shieldType: (def?.type ?? "") as StepTankInfo["shieldType"],
        hpCostFraction: def?.hpCostFraction ?? 0,
      };
    });
}

export function applyStepEvent(
  ctx: ResolveContext,
  event: StepEvent,
  liveProjectiles: LiveProjectile[],
  firingSessionId: string,
): void {
  const { state, broadcast, terrain } = ctx;

  if (event.kind === "terrain-impact") {
    const { x, y, weapon, ownerId } = event;
    const op = new CarveOp();
    op.x = Math.round(x); op.y = Math.round(y); op.radius = weapon.radius; op.tick = state.tick + 1;
    state.terrainOps.push(op);
    state.terrainVersion++;
    carveInPlace(terrain, op, { terrainHeight: TERRAIN_HEIGHT });

    const aliveBefore = new Set(Array.from(state.tanks.values()).filter(t => t.alive).map(t => t.sessionId));
    const targets = Array.from(state.tanks.values())
      .filter(t => t.alive)
      .map(t => ({ playerId: t.sessionId, x: t.x, y: t.y, shieldHp: t.shieldHp }));
    const damages = computeDamage({ x, y }, weapon, targets);
    applyDamagesWithChainKills(ctx, damages, 0);

    if (ownerId === firingSessionId) {
      const firingTank = state.tanks.get(firingSessionId);
      if (firingTank) {
        const directHull = damages.reduce((s, d) => s + d.hullDamage, 0);
        firingTank.damageDealtThisRound += directHull;
        const aliveAfter = new Set(Array.from(state.tanks.values()).filter(t => t.alive).map(t => t.sessionId));
        for (const id of aliveBefore) {
          if (!aliveAfter.has(id) && id !== firingSessionId) firingTank.killsThisRound += 1;
        }
      }
    }
    return;
  }

  if (event.kind === "shield-absorb") {
    const tank = state.tanks.get(event.targetId);
    if (tank) { tank.shieldHp = event.hpAfter; if (tank.shieldHp <= 0) tank.shieldId = ""; }
    broadcast("shield-hit", { targetId: event.targetId, type: "absorb", hpBefore: event.hpBefore, hpAfter: event.hpAfter });
    return;
  }

  if (event.kind === "shield-deflect") {
    const tank = state.tanks.get(event.targetId);
    if (tank) { tank.shieldHp = event.hpAfter; if (tank.shieldHp <= 0) tank.shieldId = ""; }
    // Update velocity in live array
    const p = liveProjectiles.find(lp => lp.id === event.projectileId);
    if (p) { p.vx = event.newVx; p.vy = event.newVy; }
    broadcast("shield-hit", { targetId: event.targetId, type: "deflect", hpBefore: event.hpBefore, hpAfter: event.hpAfter });
    return;
  }

  if (event.kind === "shield-bend") {
    // Velocity already updated in step function — just broadcast
    broadcast("shield-hit", { targetId: event.targetId, type: "bend" });
    return;
  }

  if (event.kind === "shield-explode") {
    const tank = state.tanks.get(event.targetId);
    if (tank) { tank.shieldHp = 0; tank.shieldId = ""; }
    const op = new CarveOp();
    op.x = Math.round(event.x); op.y = Math.round(event.y); op.radius = REACTIVE_WEAPON.radius; op.tick = state.tick + 1;
    state.terrainOps.push(op); state.terrainVersion++;
    carveInPlace(terrain, op, { terrainHeight: TERRAIN_HEIGHT });
    const targets = Array.from(state.tanks.values()).filter(t => t.alive)
      .map(t => ({ playerId: t.sessionId, x: t.x, y: t.y, shieldHp: t.shieldHp }));
    const damages = computeDamage({ x: event.x, y: event.y }, REACTIVE_WEAPON as any, targets);
    applyDamagesWithChainKills(ctx, damages, 0);
    broadcast("shield-hit", { targetId: event.targetId, type: "explode" });
    return;
  }

  if (event.kind === "patriot-intercept") {
    const op = new CarveOp();
    op.x = Math.round(event.x); op.y = Math.round(event.y); op.radius = PATRIOT_CARVE_RADIUS; op.tick = state.tick + 1;
    state.terrainOps.push(op); state.terrainVersion++;
    carveInPlace(terrain, op, { terrainHeight: TERRAIN_HEIGHT });
    broadcast("patriot-intercept", { patriotId: event.patriotId, targetId: event.targetId, x: event.x, y: event.y });
    return;
  }
}

export function checkPatriotTriggers(
  ctx: ResolveContext,
  liveProjectiles: LiveProjectile[],
): LiveProjectile[] {
  const { state, broadcast } = ctx;
  const newPatriots: LiveProjectile[] = [];
  const activePatriotOwners = new Set(liveProjectiles.filter(p => p.isPatriot).map(p => p.ownerId));

  for (const tank of state.tanks.values()) {
    if (!tank.alive) continue;
    if (activePatriotOwners.has(tank.sessionId)) continue;
    const count = tank.inventory.get("patriot") ?? 0;
    if (count <= 0) continue;

    for (const p of liveProjectiles) {
      if (p.isPatriot) continue;
      if (p.ownerId === tank.sessionId) continue;
      const dx = p.x - tank.x;
      const dy = p.y - tank.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < PATRIOT_DETECT_RADIUS) {
        tank.inventory.set("patriot", count - 1);
        const patriotId = `patriot-${tank.sessionId}-${Date.now()}`;
        const vel = initialVelocityFromAnglePower(90, 400);
        newPatriots.push({
          id: patriotId,
          x: tank.x, y: tank.y - 10,
          vx: vel.vx, vy: vel.vy,
          weapon: { id: "patriot", radius: 0, damage: 0, windImmune: true, price: 0, packSize: 0 },
          ownerId: tank.sessionId,
          apexReached: false,
          isPatriot: true,
          targetId: p.id,
        });
        broadcast("patriot-launched", { ownerId: tank.sessionId, patriotId, targetProjectileId: p.id });
        break;
      }
    }
  }

  return newPatriots;
}

export function applyFallDamage(ctx: ResolveContext): void {
  const { state, terrain, broadcast } = ctx;
  for (const tank of state.tanks.values()) {
    if (!tank.alive) continue;
    const x = Math.max(0, Math.min(TERRAIN_WIDTH - 1, Math.round(tank.x)));
    const surfaceY = terrain[x] ?? 0;
    if (surfaceY <= tank.y) continue; // not above surface
    const fromY = tank.y;
    const hasParachute = (tank.inventory.get("parachute") ?? 0) > 0;
    const { damage, parachuteConsumed } = computeFallDamage({ sessionId: tank.sessionId, tankY: tank.y, surfaceY, hasParachute });
    if (parachuteConsumed) tank.inventory.set("parachute", (tank.inventory.get("parachute") ?? 1) - 1);
    tank.y = surfaceY;
    if (damage > 0) {
      tank.hp = Math.max(0, tank.hp - damage);
      if (tank.hp <= 0) tank.alive = false;
    }
    broadcast("tank-fell", { sessionId: tank.sessionId, fromY, toY: surfaceY, fallDistance: surfaceY - fromY, damage, parachuteUsed: parachuteConsumed });
  }
}

export function commitTurnEnd(ctx: ResolveContext): void {
  const { state } = ctx;
  state.tick++;
  const alive = Array.from(state.tanks.values()).filter(t => t.alive);
  if (alive.length <= 1) {
    endRound(ctx, alive[0]?.sessionId ?? "");
    return;
  }
  const next = nextTurnPlayerId(Array.from(state.tanks.values()), state.currentTurnPlayerId);
  state.currentTurnPlayerId = next;
  state.phase = "playing";
  state.turnDeadlineMs = Date.now() + state.turnTimerMs;
  ctx.onTurnReady?.();
}
```

- [ ] **Step 2: Update resolveTurn.ts — make handleFire start tick loop**

The `handleFire` function needs to be slimmed down. It now creates the initial `LiveProjectile` and signals the room to start the tick loop. Add a `startTickLoop` callback to `ResolveContext`:

In `resolveTurn.ts`, update `ResolveContext`:

```typescript
export interface ResolveContext {
  state: MatchState;
  broadcast: (event: string, payload: unknown) => void;
  schedule: (delayMs: number, fn: () => void) => void;
  terrain: Int16Array;
  onTurnReady?: () => void;
  onRoundEnd?: () => void;
  startTickLoop: (projectiles: LiveProjectile[], firingSessionId: string) => void;
}
```

Replace the body of `handleFire` (keep the function signature, replace everything after validation):

```typescript
export function handleFire(
  ctx: ResolveContext,
  sessionId: string,
  rawAngle: number,
  rawPower: number,
): void {
  const { state } = ctx;
  if (state.phase !== "playing") return;
  if (state.currentTurnPlayerId !== sessionId) return;

  const tank = state.tanks.get(sessionId);
  if (!tank || !tank.alive) return;

  const angle = clampAngle(Number(rawAngle));
  const power = clampPower(Number(rawPower));
  tank.angle = angle;
  tank.power = power;

  const currentCount = tank.inventory.get(tank.weaponId) ?? -1;
  if (currentCount > 0) {
    tank.inventory.set(tank.weaponId, currentCount - 1);
  } else if (currentCount === 0) {
    tank.weaponId = "baby-missile";
  }
  const weaponDef = WEAPON_REGISTRY.get(tank.weaponId) ?? BABY_MISSILE;

  const { vx, vy } = initialVelocityFromAnglePower(angle, power);
  const initial: LiveProjectile = {
    id: `shot-${sessionId}-${state.tick}`,
    x: tank.x, y: tank.y - 5,
    vx, vy,
    weapon: weaponDef,
    ownerId: sessionId,
    apexReached: false,
  };

  state.phase = "resolving";
  ctx.startTickLoop([initial], sessionId);
}
```

Also add the import for `initialVelocityFromAnglePower` and `LiveProjectile` at the top of `resolveTurn.ts`:

```typescript
import {
  simulateProjectile,       // keep for now — remove in later cleanup
  generateTerrain,
  carveInPlace,
  BABY_MISSILE,
  WEAPON_REGISTRY,
  DEATH_EXPLOSION,
  computeDamage,
  computeRoundEarnings,
  initialVelocityFromAnglePower,
  type TargetInfo,
  type TrajectoryResult,
  type WeaponDef,
  type DamageEntry,
  type LiveProjectile,
} from "@se/game";
```

- [ ] **Step 3: Update MatchRoom.ts — add tick loop fields and wire startTickLoop**

Add to `MatchRoom` class fields:

```typescript
  private liveProjectiles: LiveProjectile[] = [];
  private firingSessionId = "";
  private tickInterval: ReturnType<typeof this.clock.setInterval> | null = null;
```

Add a `startTickLoop` method to `MatchRoom`:

```typescript
  private startTickLoop(projectiles: LiveProjectile[], firingSessionId: string): void {
    this.liveProjectiles = projectiles;
    this.firingSessionId = firingSessionId;
    this.tickInterval = this.clock.setInterval(() => this.tickLoop(), 1000 / 60);
  }

  private tickLoop(): void {
    const result = stepProjectiles({
      projectiles: this.liveProjectiles,
      tanks: buildStepTanks(this.state),
      terrain: this.terrain,
      terrainWidth: TERRAIN_WIDTH,
      terrainHeight: TERRAIN_HEIGHT,
      wind: this.state.wind,
      gravity: this.state.gravity,
      dt: 1 / 60,
    });

    this.liveProjectiles = [...result.survivors, ...result.spawned];
    this.state.resolvingTick++;

    this.broadcast("tick", {
      tick: this.state.resolvingTick,
      projectiles: this.liveProjectiles.filter(p => !p.isPatriot).map(p => ({ id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy, weaponId: p.weapon.id })),
      patriots: this.liveProjectiles.filter(p => p.isPatriot).map(p => ({ id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy })),
    });

    const ctx = this.resolveCtx();
    for (const event of result.events) {
      applyStepEvent(ctx, event, this.liveProjectiles, this.firingSessionId);
    }

    // Apply magnetic shield drains
    for (const drain of result.shieldDrains) {
      const tank = this.state.tanks.get(drain.sessionId);
      if (tank && tank.shieldHp > 0) {
        tank.shieldHp = Math.max(0, tank.shieldHp - drain.hpDrain);
        if (tank.shieldHp <= 0) tank.shieldId = "";
      }
    }

    // Check Patriot triggers
    const newPatriots = checkPatriotTriggers(ctx, this.liveProjectiles);
    this.liveProjectiles.push(...newPatriots);

    if (this.liveProjectiles.length === 0) {
      if (this.tickInterval) { this.clock.clear(this.tickInterval); this.tickInterval = null; }
      applyFallDamage(ctx);
      commitTurnEnd(ctx);
    }
  }
```

Update `resolveCtx()` to pass `startTickLoop`:

```typescript
  private resolveCtx(): ResolveContext {
    return {
      state: this.state,
      broadcast: (ev, payload) => this.broadcast(ev, payload),
      schedule: (delayMs, fn) => { this.clock.setTimeout(fn, delayMs); },
      terrain: this.terrain,
      onTurnReady: () => this.armTurnTimer(),
      onRoundEnd: () => this.handleRoundEnd(),
      startTickLoop: (projectiles, firingSessionId) => this.startTickLoop(projectiles, firingSessionId),
    };
  }
```

Add imports to `MatchRoom.ts`:

```typescript
import {
  stepProjectiles, buildStepTanks, applyStepEvent,
  checkPatriotTriggers, applyFallDamage, commitTurnEnd,
} from "./tickLoop";
import type { LiveProjectile } from "@se/game";
import { TERRAIN_WIDTH, TERRAIN_HEIGHT } from "@se/shared";
```

(Note: `buildStepTanks` etc. are imported from `tickLoop.ts`, not from `@se/game`.)

- [ ] **Step 4: Typecheck server**

```bash
pnpm --filter @se/server typecheck
```

Fix any type errors before continuing.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/rooms/tickLoop.ts apps/server/src/rooms/resolveTurn.ts apps/server/src/rooms/MatchRoom.ts
git commit -m "feat(server): replace trajectory-batch with 60 Hz tick loop — shields, Patriot, fall damage"
```

---

### Task 12: Server — new intents (move, equip-shield, use-battery) + round-start

**Files:**
- Modify: `apps/server/src/rooms/MatchRoom.ts`
- Modify: `apps/server/src/rooms/resolveTurn.ts` (startRound additions)

- [ ] **Step 1: Add move intent handler to MatchRoom.onCreate**

Inside `onCreate`, after the existing `this.onMessage("select-weapon", ...)` block:

```typescript
    this.onMessage("move", (client, msg: { direction?: string; pixels?: number }) => {
      if (this.state.phase !== "playing") return;
      if (this.state.currentTurnPlayerId !== client.sessionId) return;
      const tank = this.state.tanks.get(client.sessionId);
      if (!tank || !tank.alive) return;

      const direction = msg?.direction === "right" ? 1 : -1;
      const requested = Math.max(0, Number(msg?.pixels ?? 0));
      const pixels = Math.min(requested, tank.fuel);
      if (pixels <= 0) return;

      const fromX = tank.x;
      tank.x = Math.max(0, Math.min(TERRAIN_WIDTH - 1, tank.x + direction * pixels));
      const snappedX = Math.max(0, Math.min(TERRAIN_WIDTH - 1, Math.round(tank.x)));
      tank.y = this.terrain[snappedX] ?? tank.y;
      tank.fuel -= pixels;

      this.broadcast("tank-moved", { sessionId: client.sessionId, fromX, toX: tank.x, fuelUsed: pixels });
    });

    this.onMessage("equip-shield", (client, msg: { shieldId?: string }) => {
      if (this.state.phase !== "playing") return;
      if (this.state.currentTurnPlayerId !== client.sessionId) return;
      const tank = this.state.tanks.get(client.sessionId);
      if (!tank || !tank.alive) return;

      const shieldId = String(msg?.shieldId ?? "");
      const def = SHIELD_DEFS.get(shieldId);
      if (!def) return;
      const count = tank.inventory.get(shieldId) ?? 0;
      if (count <= 0) return;

      tank.inventory.set(shieldId, count - 1);
      tank.shieldId = shieldId;
      tank.shieldHp = def.maxHp;
      tank.shieldMaxHp = def.maxHp;
    });

    this.onMessage("use-battery", (client) => {
      if (this.state.phase !== "playing") return;
      if (this.state.currentTurnPlayerId !== client.sessionId) return;
      const tank = this.state.tanks.get(client.sessionId);
      if (!tank || !tank.alive) return;
      if (!tank.shieldId) return;

      const batteries = tank.inventory.get("battery") ?? 0;
      if (batteries <= 0) return;

      tank.inventory.set("battery", batteries - 1);
      tank.shieldHp = Math.min(tank.shieldHp + 250, tank.shieldMaxHp);
    });
```

Add `SHIELD_DEFS` to the `@se/shared` import at the top of `MatchRoom.ts`.

- [ ] **Step 2: Add round-start auto-shield + fuel application**

In `resolveTurn.ts`, find the `startRound` function (or the section that resets tanks at round start inside `MatchRoom.ts`) and add after resetting existing fields:

In `MatchRoom.ts`, find where `startMatch` / `startRound` initializes each tank, and add:

```typescript
  private applyRoundStartItems(): void {
    for (const tank of this.state.tanks.values()) {
      if (!tank.alive) continue;

      // Auto Shield: equip if in inventory and no shield currently active
      if (!tank.shieldId) {
        const autoCount = tank.inventory.get("auto-shield") ?? 0;
        if (autoCount > 0) {
          tank.inventory.set("auto-shield", autoCount - 1);
          tank.shieldId = "auto-shield";
          tank.shieldHp = 400;
          tank.shieldMaxHp = 400;
        }
      }

      // Fuel: convert fuel inventory to fuel budget, zero inventory
      const smallTanks = tank.inventory.get("fuel-small") ?? 0;
      const largeTanks = tank.inventory.get("fuel-large") ?? 0;
      tank.fuel = smallTanks * 250 + largeTanks * 600;
      tank.inventory.delete("fuel-small");
      tank.inventory.delete("fuel-large");
    }
  }
```

Call `this.applyRoundStartItems()` at the start of the existing round-start path (right before setting `state.phase = "playing"`).

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @se/server typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/rooms/MatchRoom.ts apps/server/src/rooms/resolveTurn.ts
git commit -m "feat(server): move/equip-shield/use-battery intents; auto-shield + fuel on round start"
```

---

### Task 13: Client — projectile renderer refactor

**Files:**
- Modify: `apps/client/src/render/Projectile.ts`

- [ ] **Step 1: Replace Projectile.ts with tick-stream renderer**

```typescript
// apps/client/src/render/Projectile.ts
import { Container, Graphics } from "pixi.js";

interface LivePos { id: string; x: number; y: number; weaponId: string; }

export class ProjectileRenderer {
  private container: Container;
  private sprites = new Map<string, Graphics>();
  private trail = new Map<string, Array<{ x: number; y: number }>>();

  constructor(parent: Container) {
    this.container = new Container();
    parent.addChild(this.container);
  }

  onTick(projectiles: LivePos[]): void {
    const incoming = new Set(projectiles.map(p => p.id));

    // Remove sprites for gone projectiles
    for (const [id, sprite] of this.sprites) {
      if (!incoming.has(id)) {
        this.container.removeChild(sprite);
        this.sprites.delete(id);
        this.trail.delete(id);
      }
    }

    // Upsert sprites for live projectiles
    for (const p of projectiles) {
      if (!this.sprites.has(p.id)) {
        const g = new Graphics();
        g.circle(0, 0, 5).fill(0x2c3e50);
        this.container.addChild(g);
        this.sprites.set(p.id, g);
        this.trail.set(p.id, []);
      }
      const sprite = this.sprites.get(p.id)!;
      sprite.position.set(p.x, p.y);

      // Update trail
      const t = this.trail.get(p.id)!;
      t.push({ x: p.x, y: p.y });
      if (t.length > 30) t.shift();
    }
  }

  drawTrails(): void {
    for (const [id, t] of this.trail) {
      const sprite = this.sprites.get(id);
      if (!sprite || t.length < 2) continue;
      const g = sprite.parent as Container;
      void g; // trails drawn on sprite directly below
    }
  }

  clear(): void {
    for (const sprite of this.sprites.values()) this.container.removeChild(sprite);
    this.sprites.clear();
    this.trail.clear();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/render/Projectile.ts
git commit -m "refactor(client): Projectile renderer — tick-stream map replaces sample replay"
```

---

### Task 14: Client — Shield renderer

**Files:**
- Create: `apps/client/src/render/Shield.ts`

- [ ] **Step 1: Create Shield.ts**

```typescript
// apps/client/src/render/Shield.ts
import { Container, Graphics } from "pixi.js";

type ShieldStyle = "absorb" | "deflect" | "bend" | "explode";

const SHIELD_COLORS: Record<ShieldStyle, number> = {
  absorb:  0x4ecdc4,
  deflect: 0xffd93d,
  bend:    0xc77dff,
  explode: 0xff9f1c,
};

const SHIELD_RADII: Record<string, number> = {
  "force-field": 60, "auto-shield": 60,
  "deflector-shield": 70,
  "magnetic-shield": 100,
  "reactive-armor": 50,
};

export class ShieldBubble extends Container {
  private ring: Graphics;
  private flashAlpha = 0;
  private rotationSpeed = 0;

  constructor() {
    super();
    this.ring = new Graphics();
    this.addChild(this.ring);
  }

  update(shieldId: string, shieldHp: number, shieldMaxHp: number): void {
    this.ring.clear();
    if (!shieldId || shieldHp <= 0) return;

    const style = this.styleFor(shieldId);
    const color = SHIELD_COLORS[style];
    const radius = SHIELD_RADII[shieldId] ?? 60;
    const hpFraction = shieldMaxHp > 0 ? shieldHp / shieldMaxHp : 0;
    const baseAlpha = 0.1 + hpFraction * 0.15;
    const alpha = Math.min(1, baseAlpha + this.flashAlpha);

    if (style === "bend") {
      // Rotating dashes
      this.ring.rotation += 0.02;
      const dashCount = 8;
      for (let i = 0; i < dashCount; i++) {
        const a = (i / dashCount) * Math.PI * 2;
        const ax = Math.cos(a) * radius;
        const ay = Math.sin(a) * radius;
        const bx = Math.cos(a + 0.2) * radius;
        const by = Math.sin(a + 0.2) * radius;
        this.ring.moveTo(ax, ay).lineTo(bx, by).stroke({ color, width: 2, alpha });
      }
    } else {
      this.ring.circle(0, 0, radius).stroke({ color, width: 2, alpha });
    }

    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - 0.05);
  }

  flash(): void {
    this.flashAlpha = 0.8;
  }

  private styleFor(shieldId: string): ShieldStyle {
    if (shieldId === "deflector-shield") return "deflect";
    if (shieldId === "magnetic-shield") return "bend";
    if (shieldId === "reactive-armor") return "explode";
    return "absorb";
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/render/Shield.ts
git commit -m "feat(client): ShieldBubble renderer — per-type style, HP opacity, flash animation"
```

---

### Task 15: Client — Patriot renderer

**Files:**
- Create: `apps/client/src/render/Patriot.ts`

- [ ] **Step 1: Create Patriot.ts**

```typescript
// apps/client/src/render/Patriot.ts
import { Container, Graphics } from "pixi.js";

interface PatriotPos { id: string; x: number; y: number; vx: number; vy: number; }

export class PatriotRenderer {
  private container: Container;
  private sprites = new Map<string, Graphics>();

  constructor(parent: Container) {
    this.container = new Container();
    parent.addChild(this.container);
  }

  onTick(patriots: PatriotPos[]): void {
    const incoming = new Set(patriots.map(p => p.id));

    for (const [id, sprite] of this.sprites) {
      if (!incoming.has(id)) { this.container.removeChild(sprite); this.sprites.delete(id); }
    }

    for (const p of patriots) {
      if (!this.sprites.has(p.id)) {
        const g = new Graphics();
        g.circle(0, 0, 4).fill(0xff4444);
        this.container.addChild(g);
        this.sprites.set(p.id, g);
      }
      const sprite = this.sprites.get(p.id)!;
      sprite.position.set(p.x, p.y);
      // Rotate to face direction of travel
      sprite.rotation = Math.atan2(p.vy, p.vx);
    }
  }

  clear(): void {
    for (const sprite of this.sprites.values()) this.container.removeChild(sprite);
    this.sprites.clear();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/render/Patriot.ts
git commit -m "feat(client): PatriotRenderer — tick-stream interceptor sprite"
```

---

### Task 16: Client — Tank additions (shield bubble + fuel bar)

**Files:**
- Modify: `apps/client/src/render/Tank.ts`

- [ ] **Step 1: Read current Tank.ts**

```bash
cat apps/client/src/render/Tank.ts
```

- [ ] **Step 2: Add ShieldBubble child to createTankView**

In `Tank.ts`, import `ShieldBubble`:

```typescript
import { ShieldBubble } from "./Shield";
```

Inside `createTankView` (or equivalent function), add a shield bubble as a child of the tank container:

```typescript
  const shieldBubble = new ShieldBubble();
  container.addChild(shieldBubble);
```

Expose a `setShield(shieldId, shieldHp, shieldMaxHp)` and `flashShield()` method on the returned view object:

```typescript
  setShield(shieldId: string, shieldHp: number, shieldMaxHp: number): void {
    shieldBubble.update(shieldId, shieldHp, shieldMaxHp);
  },
  flashShield(): void {
    shieldBubble.flash();
  },
```

Also add a `setFuel(fuel: number, maxFuel: number)` method that shows/hides a teal fuel bar (a thin `Graphics` rectangle below the HP bar):

```typescript
  const fuelBar = new Graphics();
  container.addChild(fuelBar);

  setFuel(fuel: number, maxFuel: number): void {
    fuelBar.clear();
    if (maxFuel <= 0) return;
    const w = 40;
    const frac = fuel / maxFuel;
    fuelBar.rect(-w / 2, 14, w * frac, 4).fill(0x4ecdc4);
  },
```

- [ ] **Step 3: Update MatchScene to call setShield on schema changes**

In `MatchScene.ts`, inside the Colyseus state change callback for tank fields, call:

```typescript
  tankView.setShield(tank.shieldId, tank.shieldHp, tank.shieldMaxHp);
```

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/render/Tank.ts apps/client/src/scenes/MatchScene.ts
git commit -m "feat(client): tank shield bubble + fuel bar from schema"
```

---

### Task 17: Client — Drive mode in AimControls

**Files:**
- Modify: `apps/client/src/input/AimControls.ts`

- [ ] **Step 1: Add drive mode state and controls to AimControls.ts**

Add to the class fields:

```typescript
  private inputMode: "drive" | "aim" = "aim";
  private driveHeld: "left" | "right" | null = null;
  private driveInterval: ReturnType<typeof setInterval> | null = null;
  private maxFuel = 0;
```

Add a `setDriveMode(fuel: number, maxFuel: number)` method called at turn start:

```typescript
  setDriveMode(fuel: number, maxFuel: number): void {
    this.maxFuel = maxFuel;
    this.inputMode = fuel > 0 ? "drive" : "aim";
    this.renderDriveHUD(fuel, maxFuel);
  }
```

In `onKey` handler (already exists), add drive key handling:

```typescript
  // In onKey — add before existing angle/power handling:
  if (this.inputMode === "drive") {
    if (e.key === "ArrowLeft" || e.key === "a") { this.startDrive("left"); return; }
    if (e.key === "ArrowRight" || e.key === "d") { this.startDrive("right"); return; }
    if (e.key === " " || e.key === "Tab") { e.preventDefault(); this.inputMode = "aim"; this.renderDriveHUD(0, 0); return; }
  }
```

Add keyup listener for drive:

```typescript
  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "ArrowRight" || e.key === "d") {
      this.stopDrive();
    }
  };
```

Add in `constructor`: `window.addEventListener("keyup", this.onKeyUp);`

Drive methods:

```typescript
  private startDrive(direction: "left" | "right"): void {
    if (this.driveHeld === direction) return;
    this.stopDrive();
    this.driveHeld = direction;
    this.driveInterval = setInterval(() => {
      this.room.send("move", { direction, pixels: 10 });
    }, 100);
  }

  private stopDrive(): void {
    if (this.driveInterval !== null) { clearInterval(this.driveInterval); this.driveInterval = null; }
    this.driveHeld = null;
  }
```

Add drive HUD section that renders a fuel bar when in drive mode. Append to `buildDOM()`:

```typescript
  private driveSection!: HTMLDivElement;
  private fuelBarFill!: HTMLDivElement;
  private fuelLabel!: HTMLSpanElement;
```

In `buildDOM()`, create the drive HUD:

```typescript
    this.driveSection = mkDiv(
      "pointer-events:auto;display:none;align-items:center;gap:12px;" +
      "background:rgba(0,0,0,0.8);border:1.5px solid #4ecdc4;border-radius:8px;padding:8px 14px;"
    );
    this.fuelLabel = document.createElement("span");
    this.fuelLabel.style.cssText = "color:#4ecdc4;font-size:.8rem;min-width:80px";
    const fuelTrack = mkDiv("flex:1;background:#1a1a2e;border-radius:3px;height:8px;min-width:120px");
    this.fuelBarFill = mkDiv("background:#4ecdc4;border-radius:3px;height:8px;width:100%");
    fuelTrack.appendChild(this.fuelBarFill);
    const doneBtn = document.createElement("button");
    doneBtn.textContent = "Done (Space)";
    doneBtn.style.cssText = "background:#4ecdc4;color:#0d1117;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:.8rem;font-weight:bold";
    doneBtn.onclick = () => { this.inputMode = "aim"; this.renderDriveHUD(0, 0); };
    this.driveSection.append(this.fuelLabel, fuelTrack, doneBtn);
    this.el.appendChild(this.driveSection);
```

```typescript
  private renderDriveHUD(fuel: number, maxFuel: number): void {
    const show = this.inputMode === "drive" && maxFuel > 0;
    this.driveSection.style.display = show ? "flex" : "none";
    if (!show) return;
    this.fuelBarFill.style.width = `${(fuel / maxFuel) * 100}%`;
    this.fuelLabel.textContent = `Fuel: ${fuel} / ${maxFuel} px`;
  }
```

Update fuel display on `"tank-moved"` event (wired in MatchScene):

```typescript
  updateFuel(fuel: number): void {
    this.renderDriveHUD(fuel, this.maxFuel);
  }
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/input/AimControls.ts
git commit -m "feat(client): drive mode in AimControls — A/D keys, fuel bar HUD, Space to switch to aim"
```

---

### Task 18: Client — MatchScene event wiring + WeaponBar

**Files:**
- Modify: `apps/client/src/scenes/MatchScene.ts`
- Modify: `apps/client/src/hud/WeaponBar.ts`

- [ ] **Step 1: Wire new events in MatchScene**

Import new renderers at the top of `MatchScene.ts`:

```typescript
import { ProjectileRenderer } from "../render/Projectile";
import { PatriotRenderer } from "../render/Patriot";
```

Replace the `ProjectileAnim` field and usage. Add to class:

```typescript
  private projectileRenderer!: ProjectileRenderer;
  private patriotRenderer!: PatriotRenderer;
```

In `onFirstState` (or wherever the world container is set up), initialize:

```typescript
  this.projectileRenderer = new ProjectileRenderer(this.world);
  this.patriotRenderer = new PatriotRenderer(this.world);
```

Remove the `room.onMessage("trajectory-resolved", ...)` handler and replace with:

```typescript
    room.onMessage("tick", (msg: { tick: number; projectiles: {id:string;x:number;y:number;vx:number;vy:number;weaponId:string}[]; patriots: {id:string;x:number;y:number;vx:number;vy:number}[] }) => {
      this.projectileRenderer.onTick(msg.projectiles);
      this.patriotRenderer.onTick(msg.patriots);
    });

    room.onMessage("shield-hit", (msg: { targetId: string; type: string }) => {
      const tankView = this.tanks.get(msg.targetId);
      tankView?.flashShield();
    });

    room.onMessage("patriot-launched", (_msg) => {
      // Patriot sprite appears via tick stream — no extra handling needed
    });

    room.onMessage("tank-moved", (msg: { sessionId: string; toX: number; fuelUsed: number }) => {
      if (msg.sessionId === this.room.sessionId) {
        // Update local fuel display
        const tank = this.room.state.tanks.get(this.room.sessionId);
        if (tank) this.aim.updateFuel(tank.fuel);
      }
    });

    room.onMessage("tank-fell", (msg: { sessionId: string; damage: number; parachuteUsed: boolean }) => {
      if (msg.damage > 0) {
        // Brief screen shake or flash — use existing Explosion for now
        const tank = this.room.state.tanks.get(msg.sessionId);
        if (tank) {
          const expl = new Explosion(this.world, tank.x, tank.y, 20);
          this.activeAnims.push(expl);
        }
      }
    });
```

In state-change callback for tank schema, call `setShield` and `setFuel`:

```typescript
    state.tanks.onAdd((tank, sessionId) => {
      // ...existing setup...
      tank.listen("shieldId", () => {
        const view = this.tanks.get(sessionId);
        view?.setShield(tank.shieldId, tank.shieldHp, tank.shieldMaxHp);
      });
      tank.listen("shieldHp", () => {
        const view = this.tanks.get(sessionId);
        view?.setShield(tank.shieldId, tank.shieldHp, tank.shieldMaxHp);
      });
      tank.listen("fuel", () => {
        if (sessionId === room.sessionId) this.aim.updateFuel(tank.fuel);
      });
    });
```

Wire drive mode at turn start — in the state-change callback for `currentTurnPlayerId`:

```typescript
    state.listen("currentTurnPlayerId", (id) => {
      if (id === room.sessionId) {
        const tank = state.tanks.get(id);
        if (tank) this.aim.setDriveMode(tank.fuel, tank.fuel); // maxFuel = current fuel at turn start
      }
    });
```

- [ ] **Step 2: Update WeaponBar to show defense item counts**

In `WeaponBar.ts`, in the render method (wherever the weapon list is displayed), append after weapon items:

```typescript
    const defenseItems = [
      { id: "force-field",      label: "Force Field" },
      { id: "deflector-shield", label: "Deflector" },
      { id: "magnetic-shield",  label: "Mag Shield" },
      { id: "reactive-armor",   label: "Reactive" },
      { id: "auto-shield",      label: "Auto Shield" },
      { id: "battery",          label: "Battery" },
      { id: "parachute",        label: "Parachute" },
      { id: "patriot",          label: "Patriot" },
      { id: "fuel-small",       label: "Fuel (S)" },
      { id: "fuel-large",       label: "Fuel (L)" },
    ];

    for (const item of defenseItems) {
      const count = tank.inventory.get(item.id) ?? 0;
      if (count <= 0) continue;
      // Render as a small badge: "[Parachute ×3]"
      // Use same pattern as existing weapon chips
    }
```

Also show the active shield HP bar if `tank.shieldHp > 0`:

```typescript
    if (tank.shieldId && tank.shieldHp > 0) {
      // Render: "🛡 Force Field  ██████░░  180/200"
    }
```

Match the exact DOM structure used for existing weapon items in `WeaponBar.ts`.

- [ ] **Step 3: Typecheck client**

```bash
pnpm --filter @se/client typecheck 2>/dev/null || pnpm --filter @se/client build 2>&1 | head -40
```

Fix any type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/scenes/MatchScene.ts apps/client/src/hud/WeaponBar.ts
git commit -m "feat(client): wire tick/shield-hit/tank-moved/tank-fell events; shield + defense items in WeaponBar"
```

---

### Task 19: Update shop to include defense items + final integration check

**Files:**
- Modify: `apps/server/src/rooms/MatchRoom.ts` (buy handler uses combined registry)
- Modify: `apps/client/src/scenes/ShopScene.ts` (show defense items)

- [ ] **Step 1: Update server buy handler to use combined weapon + item registry**

In `MatchRoom.ts`, find the `"buy"` handler. Currently it builds the registry from `WEAPON_REGISTRY`. Update to include `ITEM_REGISTRY`:

```typescript
    this.onMessage("buy", (client, msg: { weaponId?: string }) => {
      if (this.state.phase !== "shopping") return;
      const tank = this.state.tanks.get(client.sessionId);
      if (!tank || !tank.alive) return;

      const weaponId = String(msg?.weaponId ?? "");
      // Combined registry: weapons + defense items
      const registry = [
        ...Array.from(WEAPON_REGISTRY.values()).map(w => ({ id: w.id, price: w.price, packSize: w.packSize })),
        ...Array.from(ITEM_REGISTRY.values()).map(i => ({ id: i.id, price: i.price, packSize: i.packSize })),
      ];

      const result = validatePurchase(weaponId, tank.cash, new Map(tank.inventory.entries()), registry);
      if (!result.ok) return;
      tank.cash = result.newCash;
      for (const [id, count] of result.newInventory.entries()) {
        tank.inventory.set(id, count);
      }
    });
```

Import `ITEM_REGISTRY` at the top:

```typescript
import { ITEM_REGISTRY } from "@se/game";
```

- [ ] **Step 2: Update ShopScene to display defense items**

In `ShopScene.ts`, wherever the weapon grid is built, also render the 10 defense items. Follow the exact same card pattern already used for weapons. Pass `ITEM_REGISTRY` values as an additional item group.

Read `apps/client/src/scenes/ShopScene.ts` first to understand the existing grid structure, then append defense item cards in a new "Defense" section below weapons.

- [ ] **Step 3: Run full test suite**

```bash
pnpm --filter @se/game test
pnpm --filter @se/server test
```

Expected: all tests pass.

- [ ] **Step 4: Typecheck all packages**

```bash
pnpm --filter @se/shared typecheck
pnpm --filter @se/game typecheck
pnpm --filter @se/server typecheck
```

- [ ] **Step 5: Smoke test manually**

Start the dev server:

```bash
pnpm dev
```

1. Open two browser tabs, join same room
2. Start match — confirm trajectory batch is gone (no "trajectory-resolved" event in console)
3. Buy a Force Field in shop, equip it — confirm teal shield bubble appears
4. Fire at the shielded tank — confirm "shield-hit" event fires, bubble flashes, HP depletes
5. Buy a Fuel Tank, start turn — confirm drive HUD appears, A/D moves tank
6. Blow out terrain under a tank — confirm tank falls, "tank-fell" event fires
7. Buy Patriot — fire a weapon toward the Patriot owner — confirm "patriot-launched" fires, interceptor appears on tick stream

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/rooms/MatchRoom.ts apps/client/src/scenes/ShopScene.ts
git commit -m "feat: defense items in shop buy handler and ShopScene grid; Phase 4 complete"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| 5 trajectory-modifying shields | Tasks 5–9 |
| Deflector reflects visibly | Task 7 |
| Magnetic curves in real-time | Task 8 |
| Reactive Armor counter-blast | Task 9 |
| Auto Shield auto-equips | Task 12 |
| Patriot auto-intercepts | Task 10, 11 |
| Tank movement (fuel, drive mode) | Task 12, 17 |
| Falling-tank damage + parachute | Task 4, 11 |
| 10 items purchasable in shop | Task 3, 19 |
| Battery restores shield HP | Task 12 |
| Shield bubble visible, fades | Task 14, 16 |
| Drive mode HUD | Task 17 |
| 60 Hz tick loop only during resolving | Task 11 |
| packages/game ≥90% coverage | Tasks 4–10 |
| Phase 1–3 criteria still pass | Task 19 step 3 |

No gaps found.

**Type consistency:**
- `LiveProjectile` defined Task 2, used Tasks 5–11 ✓
- `StepTankInfo` defined Task 2, built in `buildStepTanks` Task 11 ✓
- `StepResult.shieldDrains` defined Task 2, populated Task 6, applied Task 11 ✓
- `initialVelocityFromAnglePower` defined + exported Task 10, imported Task 11 ✓
- `SHIELD_DEFS` created Task 1, imported in server Task 11, Task 12 ✓
- `ITEM_REGISTRY` created Task 3, used Task 19 ✓
- `ProjectileRenderer` created Task 13, used Task 18 ✓
- `PatriotRenderer` created Task 15, used Task 18 ✓
- `ShieldBubble` created Task 14, used Task 16 ✓
