# Phase-4 Shields — May-26 System Adoption — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shipped 4-shield/full-absorb system with the May-26 5-shield `hpCostFraction` model (absorb/deflect/bend/explode + auto-equip), preserving plasma `shieldPierce`.

**Architecture:** Shield catalog lives in `packages/shared/src/shields.ts`. Pure projectile/shield physics in `packages/game/src/physics/step.ts` operate on `StepTankInfo` (shield fields threaded from the schema via `buildStepTanks`). The server (`tickLoop.applyStepEvent`) applies shield events to schema state and emits broadcasts. Client renders shield visuals from `shieldId`→type.

**Tech Stack:** TypeScript, Vitest, Colyseus schema, PixiJS, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-05-31-phase4-shields-may26-adoption-design.md`

---

## File Structure

- `packages/shared/src/shields.ts` — **replace** `ShieldDef`/`SHIELD_DEFS`; add `ShieldType` + constants.
- `packages/game/src/types.ts` — extend `StepTankInfo` (`shieldType` union + `hpCostFraction`); replace shield events in `StepEvent`.
- `packages/game/src/physics/step.ts` — rewrite the shield block (§5).
- `packages/game/src/physics/step.test.ts` — rewrite/extend shield tests.
- `apps/server/src/rooms/tickLoop.ts` — `buildStepTanks` mapping + `applyStepEvent` shield handlers.
- `apps/server/src/rooms/MatchRoom.ts` — auto-equip, AI `shieldOrder`, debug grant.
- `apps/client/src/render/Shield.ts` — styles/colors/radii for the 5 shields.
- `apps/client/src/scenes/ShopScene.ts` — shop shield catalog.

---

## Task 1: Shield catalog + types (shared)

**Files:**
- Modify: `packages/shared/src/shields.ts` (full replacement)
- Test: `packages/shared/src/shields.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/shields.test.ts
import { describe, it, expect } from "vitest";
import { SHIELD_DEFS, MAGNETIC_DRAIN_HP_PER_SEC, REACTIVE_BLAST } from "./shields";

describe("SHIELD_DEFS (May-26 catalog)", () => {
  it("has exactly the 5 May-26 shields with correct mechanics", () => {
    expect([...SHIELD_DEFS.keys()].sort()).toEqual(
      ["auto-shield", "deflector-shield", "force-field", "magnetic-shield", "reactive-armor"].sort(),
    );
    expect(SHIELD_DEFS.get("force-field")).toMatchObject({ maxHp: 200, radius: 60, type: "absorb", hpCostFraction: 0.5, price: 1_500, packSize: 1 });
    expect(SHIELD_DEFS.get("deflector-shield")).toMatchObject({ maxHp: 500, radius: 70, type: "deflect", hpCostFraction: 0.25, price: 3_000, packSize: 1 });
    expect(SHIELD_DEFS.get("magnetic-shield")).toMatchObject({ maxHp: 600, radius: 100, type: "bend", hpCostFraction: 0, price: 3_500, packSize: 1 });
    expect(SHIELD_DEFS.get("reactive-armor")).toMatchObject({ maxHp: 1, radius: 50, type: "explode", hpCostFraction: 1, price: 2_000, packSize: 3 });
    expect(SHIELD_DEFS.get("auto-shield")).toMatchObject({ maxHp: 400, radius: 60, type: "absorb", hpCostFraction: 0.5, price: 2_500, packSize: 2 });
  });
  it("exposes magnetic + reactive constants", () => {
    expect(MAGNETIC_DRAIN_HP_PER_SEC).toBe(15);
    expect(REACTIVE_BLAST).toMatchObject({ radius: 60, damage: 40 });
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @se/shared exec vitest run src/shields.test.ts`
Expected: FAIL (old ids `shield`/`heavy-shield` present; new fields missing).

- [ ] **Step 3: Replace `shields.ts`**

```ts
// packages/shared/src/shields.ts
export type ShieldType = "absorb" | "deflect" | "bend" | "explode";

export interface ShieldDef {
  id: string;
  label: string;
  maxHp: number;
  radius: number;
  type: ShieldType;
  hpCostFraction: number; // shieldHp lost = shieldedDamage * hpCostFraction
  price: number;
  packSize: number;
}

export const MAGNETIC_DRAIN_HP_PER_SEC = 15;
export const MAGNETIC_FORCE_CONST = 8000; // bend strength = CONST / dist²
export const REACTIVE_BLAST = { radius: 60, damage: 40 } as const;

export const SHIELD_DEFS = new Map<string, ShieldDef>([
  ["force-field",      { id:"force-field",      label:"Force Field",      maxHp:200, radius:60,  type:"absorb",  hpCostFraction:0.5,  price:1_500, packSize:1 }],
  ["deflector-shield", { id:"deflector-shield", label:"Deflector Shield", maxHp:500, radius:70,  type:"deflect", hpCostFraction:0.25, price:3_000, packSize:1 }],
  ["magnetic-shield",  { id:"magnetic-shield",  label:"Magnetic Shield",  maxHp:600, radius:100, type:"bend",    hpCostFraction:0,    price:3_500, packSize:1 }],
  ["reactive-armor",   { id:"reactive-armor",   label:"Reactive Armor",   maxHp:1,   radius:50,  type:"explode", hpCostFraction:1,    price:2_000, packSize:3 }],
  ["auto-shield",      { id:"auto-shield",      label:"Auto Shield",      maxHp:400, radius:60,  type:"absorb",  hpCostFraction:0.5,  price:2_500, packSize:2 }],
]);
```

- [ ] **Step 4: Verify `shields.ts` is exported from the package index**

Run: `grep -n "shields" packages/shared/src/index.ts`
Expected: a re-export line exists (e.g. `export * from "./shields";`). If `ShieldType`/constants aren't exported, add them to the existing export.

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm --filter @se/shared exec vitest run src/shields.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/shields.ts packages/shared/src/shields.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): May-26 shield catalog (5 shields, hpCostFraction, constants)"
```

---

## Task 2: Thread shield type + hpCostFraction into the step layer

**Files:**
- Modify: `packages/game/src/types.ts` (`StepTankInfo`, `StepEvent` shield union)
- Modify: `apps/server/src/rooms/tickLoop.ts` (`buildStepTanks`)

- [ ] **Step 1: Extend `StepTankInfo` in `types.ts`**

Replace the `StepTankInfo` shield fields:

```ts
export interface StepTankInfo {
  sessionId: string;
  x: number;
  y: number;
  shieldHp: number;
  shieldMaxHp: number;
  shieldRadius: number;
  shieldType: "absorb" | "deflect" | "bend" | "explode" | "";
  hpCostFraction: number; // 0 when no shield
}
```

- [ ] **Step 2: Replace the shield events in the `StepEvent` union**

Replace the existing `shield-absorb` and `shield-bend` members with:

```ts
  | { kind: "shield-absorb";  projectileId: string; targetId: string; hpBefore: number; hpAfter: number; piercedHull: number; ownerId: string }
  | { kind: "shield-deflect"; projectileId: string; targetId: string; newVx: number; newVy: number; hpBefore: number; hpAfter: number; piercedHull: number; ownerId: string }
  | { kind: "shield-bend";    projectileId: string; targetId: string; impulseX: number; impulseY: number }
  | { kind: "shield-explode"; projectileId: string; targetId: string; x: number; y: number; piercedHull: number; weapon: WeaponDef; ownerId: string }
```

(Note: `shield-absorb` no longer carries `absorbed`/`overflow`; hull damage is now exactly `piercedHull`.)

- [ ] **Step 3: Map the new fields in `buildStepTanks` (`tickLoop.ts`)**

```ts
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
```

- [ ] **Step 4: Typecheck (expect errors only where step.ts/tickLoop still use old event fields)**

Run: `pnpm --filter @se/game exec tsc --noEmit`
Expected: errors in `step.ts` (old `shield-absorb` shape) — fixed in Task 3. Note them; do not fix yet.

- [ ] **Step 5: Commit**

```bash
git add packages/game/src/types.ts apps/server/src/rooms/tickLoop.ts
git commit -m "feat(game): thread shieldType+hpCostFraction; new shield event shapes"
```

---

## Task 3: Rewrite shield physics in `step.ts` (absorb/deflect/bend/explode + pierce)

**Files:**
- Modify: `packages/game/src/physics/step.ts` (lines ~181-232, the `// 5. Shield check` block)
- Test: `packages/game/src/physics/step.test.ts`

- [ ] **Step 1: Write failing tests** (append to `step.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { stepProjectiles } from "./step";
import type { StepInput, StepTankInfo, LiveProjectile } from "../types";

function tank(over: Partial<StepTankInfo> = {}): StepTankInfo {
  return { sessionId: "T", x: 100, y: 100, shieldHp: 0, shieldMaxHp: 0, shieldRadius: 0, shieldType: "", hpCostFraction: 0, ...over };
}
function proj(over: Partial<LiveProjectile> = {}): LiveProjectile {
  return { id: "p1", x: 100, y: 100, vx: 10, vy: 0, ownerId: "A",
    weapon: { id:"w", label:"W", damage:100, radius:30, price:0, packSize:1 } as any, ...over } as LiveProjectile;
}
function baseInput(over: Partial<StepInput> = {}): StepInput {
  return { projectiles: [proj()], tanks: [], terrain: new Int16Array(2000).fill(900),
    terrainWidth: 1600, terrainHeight: 900, wind: 0, gravity: 0, dt: 1/60, wallMode: "none", ...over };
}

describe("shield physics — May-26 model", () => {
  it("absorb: consumes projectile, drains shieldHp by damage*hpCostFraction, no hull overflow", () => {
    const t = tank({ shieldHp: 200, shieldMaxHp: 200, shieldRadius: 60, shieldType: "absorb", hpCostFraction: 0.5 });
    const r = stepProjectiles(baseInput({ tanks: [t] }));
    const ev = r.events.find(e => e.kind === "shield-absorb") as any;
    expect(ev).toBeTruthy();
    expect(ev.hpAfter).toBe(200 - 100 * 0.5); // 150
    expect(ev.piercedHull).toBe(0);
    expect(r.survivors.find(p => p.id === "p1")).toBeUndefined(); // consumed
  });

  it("absorb + plasma pierce: hull takes pierced fraction, shield drains on shielded fraction", () => {
    const t = tank({ shieldHp: 200, shieldMaxHp: 200, shieldRadius: 60, shieldType: "absorb", hpCostFraction: 0.5 });
    const p = proj({ weapon: { id:"plasma", label:"P", damage:100, radius:30, price:0, packSize:1, shieldPierce:0.5 } as any });
    const r = stepProjectiles(baseInput({ projectiles: [p], tanks: [t] }));
    const ev = r.events.find(e => e.kind === "shield-absorb") as any;
    expect(ev.piercedHull).toBe(50);              // 100 * 0.5
    expect(ev.hpAfter).toBe(200 - (100 * 0.5) * 0.5); // shieldedDamage 50 * 0.5 = 25 → 175
  });

  it("deflect: reflects velocity about the shield normal, keeps projectile alive", () => {
    // projectile moving +x toward a shield centered to its right reflects to -x
    const t = tank({ x: 110, y: 100, shieldHp: 500, shieldMaxHp: 500, shieldRadius: 70, shieldType: "deflect", hpCostFraction: 0.25 });
    const p = proj({ x: 100, y: 100, vx: 10, vy: 0 });
    const r = stepProjectiles(baseInput({ projectiles: [p], tanks: [t] }));
    const ev = r.events.find(e => e.kind === "shield-deflect") as any;
    expect(ev).toBeTruthy();
    expect(ev.newVx).toBeLessThan(0);             // reflected back
    expect(ev.hpAfter).toBe(500 - 100 * 0.25);    // 475
    expect(r.survivors.find(p => p.id === "p1")).toBeTruthy(); // not consumed
  });

  it("explode: reactive armor consumed, shield spent, emits shield-explode at contact", () => {
    const t = tank({ shieldHp: 1, shieldMaxHp: 1, shieldRadius: 50, shieldType: "explode", hpCostFraction: 1 });
    const r = stepProjectiles(baseInput({ tanks: [t] }));
    const ev = r.events.find(e => e.kind === "shield-explode") as any;
    expect(ev).toBeTruthy();
    expect(ev.x).toBeCloseTo(100, 0);
    expect(r.survivors.find(p => p.id === "p1")).toBeUndefined();
  });

  it("bend: applies impulse, reports drain, projectile survives", () => {
    const t = tank({ x: 130, y: 100, shieldHp: 600, shieldMaxHp: 600, shieldRadius: 100, shieldType: "bend", hpCostFraction: 0 });
    const r = stepProjectiles(baseInput({ tanks: [t] }));
    expect(r.events.find(e => e.kind === "shield-bend")).toBeTruthy();
    expect(r.shieldDrains.find(d => d.sessionId === "T")?.hpDrain).toBeCloseTo(15 * (1/60), 5);
    expect(r.survivors.find(p => p.id === "p1")).toBeTruthy();
  });

  it("owner's own shield never blocks", () => {
    const t = tank({ sessionId: "A", shieldHp: 200, shieldMaxHp: 200, shieldRadius: 60, shieldType: "absorb", hpCostFraction: 0.5 });
    const r = stepProjectiles(baseInput({ tanks: [t] })); // projectile ownerId "A"
    expect(r.events.find(e => e.kind === "shield-absorb")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @se/game exec vitest run src/physics/step.test.ts`
Expected: FAIL (deflect/explode unhandled; absorb still uses overflow model).

- [ ] **Step 3: Rewrite the shield block** (replace lines ~181-232, the `// 5. Shield check` through the `bend` block, up to but not including `if (shielded) continue;`)

```ts
    // 5. Shield check (May-26 model: absorb/deflect/bend/explode + universal pierce)
    let shielded = false;
    for (const tank of tanks) {
      if (tank.sessionId === p.ownerId) continue; // owner's own shield never blocks
      if (tank.shieldHp <= 0) continue;
      if (!tank.shieldType) continue;
      const dx = p.x - tank.x;
      const dy = p.y - tank.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= tank.shieldRadius) continue;

      // Guard degenerate center hit.
      const nx = dist > 1e-6 ? dx / dist : 1;
      const ny = dist > 1e-6 ? dy / dist : 0;

      const pierce = p.weapon.shieldPierce ?? 0;
      const piercedHull   = p.weapon.damage * pierce;
      const shieldedDamage = p.weapon.damage * (1 - pierce);

      if (tank.shieldType === "absorb") {
        const hpBefore = tank.shieldHp;
        const hpAfter = Math.max(0, hpBefore - shieldedDamage * tank.hpCostFraction);
        tank.shieldHp = hpAfter;
        events.push({ kind: "shield-absorb", projectileId: p.id, targetId: tank.sessionId, hpBefore, hpAfter, piercedHull, ownerId: p.ownerId });
        shielded = true; // projectile consumed
        break;
      }

      if (tank.shieldType === "deflect") {
        const hpBefore = tank.shieldHp;
        const hpAfter = Math.max(0, hpBefore - shieldedDamage * tank.hpCostFraction);
        tank.shieldHp = hpAfter;
        const dot = p.vx * nx + p.vy * ny;
        p.vx = p.vx - 2 * dot * nx;
        p.vy = p.vy - 2 * dot * ny;
        events.push({ kind: "shield-deflect", projectileId: p.id, targetId: tank.sessionId, newVx: p.vx, newVy: p.vy, hpBefore, hpAfter, piercedHull, ownerId: p.ownerId });
        // not consumed — continues with reflected velocity
        break;
      }

      if (tank.shieldType === "explode") {
        events.push({ kind: "shield-explode", projectileId: p.id, targetId: tank.sessionId, x: p.x, y: p.y, piercedHull, weapon: p.weapon, ownerId: p.ownerId });
        tank.shieldHp = 0; // reactive armor fully spent
        shielded = true;   // projectile consumed
        break;
      }

      if (tank.shieldType === "bend") {
        const strength = 8000 / (dist * dist);
        const impulseX = nx * strength * dt;
        const impulseY = ny * strength * dt;
        p.vx += impulseX;
        p.vy += impulseY;
        events.push({ kind: "shield-bend", projectileId: p.id, targetId: tank.sessionId, impulseX, impulseY });
        const existing = shieldDrains.find(d => d.sessionId === tank.sessionId);
        if (existing) existing.hpDrain = Math.max(existing.hpDrain, 15 * dt);
        else shieldDrains.push({ sessionId: tank.sessionId, hpDrain: 15 * dt });
        // projectile stays alive
        break;
      }
    }

    if (shielded) continue;
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @se/game exec vitest run src/physics/step.test.ts`
Expected: PASS (all shield cases). Fix any older shield tests that asserted the overflow model — update them to the hpCostFraction expectations.

- [ ] **Step 5: Typecheck the game package**

Run: `pnpm --filter @se/game exec tsc --noEmit`
Expected: no errors in `step.ts`/`types.ts`.

- [ ] **Step 6: Commit**

```bash
git add packages/game/src/physics/step.ts packages/game/src/physics/step.test.ts
git commit -m "feat(game): May-26 shield physics — absorb/deflect/bend/explode + universal pierce"
```

---

## Task 4: Server — apply new shield events (`tickLoop.applyStepEvent`)

**Files:**
- Modify: `apps/server/src/rooms/tickLoop.ts` (the `shield-absorb` handler ~109-138; add `shield-deflect`, `shield-explode`)
- Test: `apps/server/tests/shield-events.test.ts` (create)

- [ ] **Step 1: Replace the `shield-absorb` handler** (new model: hull = `piercedHull`; no `reflectFraction`)

```ts
  if (event.kind === "shield-absorb") {
    const tank = state.tanks.get(event.targetId);
    if (tank) {
      tank.shieldHp = event.hpAfter;
      if (tank.shieldHp <= 0) tank.shieldId = "";
      if (event.piercedHull > 0) {
        tank.hp = Math.max(0, tank.hp - event.piercedHull);
        if (tank.hp <= 0) tank.alive = false;
      }
    }
    broadcast("shield-hit", { targetId: event.targetId, type: "absorb", hpBefore: event.hpBefore, hpAfter: event.hpAfter });
    return;
  }

  if (event.kind === "shield-deflect") {
    const tank = state.tanks.get(event.targetId);
    if (tank) {
      tank.shieldHp = event.hpAfter;
      if (tank.shieldHp <= 0) tank.shieldId = "";
      if (event.piercedHull > 0) {
        tank.hp = Math.max(0, tank.hp - event.piercedHull);
        if (tank.hp <= 0) tank.alive = false;
      }
    }
    broadcast("shield-hit", { targetId: event.targetId, type: "deflect", hpBefore: event.hpBefore, hpAfter: event.hpAfter });
    return;
  }

  if (event.kind === "shield-explode") {
    const tank = state.tanks.get(event.targetId);
    if (tank) { tank.shieldHp = 0; tank.shieldId = ""; }
    // Reactive blast at contact — damages all in radius incl. owner.
    const blast = computeDamage(
      { x: event.x, y: event.y, radius: REACTIVE_BLAST.radius, damage: REACTIVE_BLAST.damage } as any,
      Array.from(state.tanks.values()).filter(t => t.alive).map(t => ({ playerId: t.sessionId, x: t.x, y: t.y })),
    );
    for (const d of blast) {
      const v = state.tanks.get(d.playerId);
      if (v) { v.hp = Math.max(0, v.hp - d.amount); if (v.hp <= 0) v.alive = false; }
    }
    // Direct pierced hull on the shielded tank from the original weapon.
    if (tank && event.piercedHull > 0) { tank.hp = Math.max(0, tank.hp - event.piercedHull); if (tank.hp <= 0) tank.alive = false; }
    broadcast("explosion", { x: event.x, y: event.y, radius: REACTIVE_BLAST.radius, weaponId: "reactive-armor" });
    broadcast("shield-hit", { targetId: event.targetId, type: "explode" });
    return;
  }
```

> **Adapt to local signatures:** match the existing `computeDamage` call shape used elsewhere in `tickLoop.ts` (see the `plasma-wave` handler ~154-158 for the exact `computeDamage` argument form and `DamageEntry` field names — use `playerId`/`amount` as that code does). Import `REACTIVE_BLAST` from `@se/shared`.

- [ ] **Step 2: Confirm the `shield-bend` handler + `shieldDrains` application remain**

The `shield-bend` broadcast handler stays as-is. Verify the per-tick `shieldDrains` are applied to `shieldHp` (search `shieldDrains` in `tickLoop.ts`/`MatchRoom.ts`); if drains are applied and a shield reaches 0, clear `shieldId`. If no drain-application code exists, add after stepping:

```ts
for (const d of result.shieldDrains) {
  const t = state.tanks.get(d.sessionId);
  if (t) { t.shieldHp = Math.max(0, t.shieldHp - d.hpDrain); if (t.shieldHp <= 0) t.shieldId = ""; }
}
```

- [ ] **Step 3: Write a server test** (`apps/server/tests/shield-events.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { REACTIVE_BLAST } from "@se/shared";

// Unit-test the reactive blast math directly via computeDamage against two tanks at
// known positions; assert the owner can be damaged by its own reactive armor.
// (Mirror the existing computeDamage import + call shape used in tickLoop.ts.)
describe("reactive armor blast", () => {
  it("REACTIVE_BLAST is radius 60 / damage 40", () => {
    expect(REACTIVE_BLAST).toMatchObject({ radius: 60, damage: 40 });
  });
});
```

> Expand this with a real `computeDamage` call once you've confirmed its import path/signature in `tickLoop.ts`. Assert a tank at the blast center takes ~40 and a tank 200px away takes 0.

- [ ] **Step 4: Typecheck + test server**

Run: `pnpm --filter @se/server exec tsc --noEmit && pnpm --filter @se/server exec vitest run tests/shield-events.test.ts`
Expected: no type errors; test passes.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/rooms/tickLoop.ts apps/server/tests/shield-events.test.ts
git commit -m "feat(server): apply deflect/explode shield events + reactive blast; absorb hull=pierced"
```

---

## Task 5: Auto-equip + AI shield order + debug grant (`MatchRoom.ts`)

**Files:**
- Modify: `apps/server/src/rooms/MatchRoom.ts` (turn-start hook; line ~456 `shieldOrder`; line ~567 debug grant)

- [ ] **Step 1: Add auto-equip at turn start**

Find where a new turn begins (search for `turnDeadlineMs = Date.now() + ` / the turn-advance path, ~657/801, and the `onTurnStart`-equivalent). At the point the active player's turn starts, insert:

```ts
// Auto-Shield: if the active player owns one and has no active shield, auto-equip.
const at = this.state.tanks.get(this.state.currentTurnPlayerId);
if (at && at.alive && !at.shieldId) {
  const owned = at.inventory.get("auto-shield") ?? 0;
  if (owned > 0) {
    const def = SHIELD_DEFS.get("auto-shield")!;
    at.inventory.set("auto-shield", owned - 1);
    at.shieldId = "auto-shield";
    at.shieldHp = def.maxHp;
    at.shieldMaxHp = def.maxHp;
  }
}
```

- [ ] **Step 2: Update the AI shield-buy order (line ~456)**

Replace:
```ts
const shieldOrder = ["force-shield", "super-magnetic", "heavy-shield", "shield"];
```
with:
```ts
const shieldOrder = ["magnetic-shield", "deflector-shield", "auto-shield", "force-field", "reactive-armor"];
```

- [ ] **Step 3: Fix the debug grant (line ~567)**

Replace `tank.inventory.set("shield", 1);` with a valid new id, or delete the line if it was test scaffolding. If kept:
```ts
tank.inventory.set("force-field", 1);
```

- [ ] **Step 4: Typecheck + run the full server suite**

Run: `pnpm --filter @se/server exec tsc --noEmit && pnpm --filter @se/server exec vitest run`
Expected: no type errors; all server tests pass (incl. the de-flaked `invariant-match`).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/rooms/MatchRoom.ts
git commit -m "feat(server): auto-equip Auto-Shield at turn start; new AI shield order; fix debug grant"
```

---

## Task 6: Client shield rendering (`Shield.ts`)

**Files:**
- Modify: `apps/client/src/render/Shield.ts`

- [ ] **Step 1: Replace the color/radius maps + style resolver**

Update the color and radius maps to the 5 new ids and derive style from type:

```ts
const SHIELD_COLOR: Record<string, number> = {
  "force-field":      0x4ecdc4,
  "deflector-shield": 0xffd93d,
  "magnetic-shield":  0xc77dff,
  "reactive-armor":   0xff6b6b,
  "auto-shield":      0x80ed99,
};
const SHIELD_RADIUS: Record<string, number> = {
  "force-field": 60, "deflector-shield": 70, "magnetic-shield": 100, "reactive-armor": 50, "auto-shield": 60,
};
type ShieldStyle = "absorb" | "deflect" | "bend" | "explode";
const STYLE_BY_ID: Record<string, ShieldStyle> = {
  "force-field": "absorb", "auto-shield": "absorb",
  "deflector-shield": "deflect", "magnetic-shield": "bend", "reactive-armor": "explode",
};
function styleFor(shieldId: string): ShieldStyle { return STYLE_BY_ID[shieldId] ?? "absorb"; }
```

- [ ] **Step 2: Handle the new styles in the draw routine**

Keep the existing `bend` animated style. For `deflect` render a brief spark/ring on a `shield-hit type:"deflect"` event; for `explode` render a one-shot flash on `shield-hit type:"explode"`. Reuse the existing absorb bubble for `absorb`. Match the existing draw structure in this file (don't invent a new render lifecycle).

- [ ] **Step 3: Typecheck client**

Run: `pnpm --filter @se/client exec tsc --noEmit`
Expected: only the pre-existing `ReplayScene.ts:83` error.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/render/Shield.ts
git commit -m "feat(client): render 5 May-26 shields (absorb/deflect/bend/explode styles)"
```

---

## Task 7: Shop catalog (`ShopScene.ts`)

**Files:**
- Modify: `apps/client/src/scenes/ShopScene.ts`

- [ ] **Step 1: Find the shield list in the shop**

Run: `grep -nE "shield|SHIELD_DEFS|force-shield|heavy-shield" apps/client/src/scenes/ShopScene.ts`
Identify how purchasable shields are enumerated (hardcoded list vs `SHIELD_DEFS`).

- [ ] **Step 2: Drive the shield section from `SHIELD_DEFS`**

Render one buy row per `SHIELD_DEFS` entry (label, price, packSize). Remove any hardcoded old shield ids. Use the existing buy-row component/markup in this file — don't restyle.

- [ ] **Step 3: Typecheck + smoke**

Run: `pnpm --filter @se/client exec tsc --noEmit`
Expected: only the pre-existing `ReplayScene.ts:83` error.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/scenes/ShopScene.ts
git commit -m "feat(client): shop lists the 5 May-26 shields from SHIELD_DEFS"
```

---

## Task 8: Full regression + determinism

- [ ] **Step 1: Run every package suite**

Run:
```bash
pnpm --filter @se/shared test
pnpm --filter @se/game exec vitest run
pnpm --filter @se/client exec vitest run
pnpm --filter @se/server exec vitest run
```
Expected: all green. The replay-determinism suite must still pass (shield formulas use no `Math.random()`).

- [ ] **Step 2: Manual live smoke (optional but recommended)**

Launch the app (see the `run` skill), buy each shield in the shop, and verify: absorb bubble blocks + drains; deflector bounces a shot; magnetic curves a shot and drains; reactive armor explodes (can self-damage); auto-shield auto-equips at your next turn; plasma half-pierces an absorb shield.

- [ ] **Step 3: Final commit (if any cleanup)**

```bash
git commit -am "test(shields): full regression green for May-26 shield adoption" || true
```

---

## Self-Review Notes (author)

- **Spec coverage:** catalog (T1), data model/threading (T2), absorb/deflect/bend/explode + pierce (T3), server apply incl. reactive blast + magnetic drain + auto-equip (T4-5), render+shop (T6-7), tests/determinism (T8). Battery unchanged (already +250). ✓
- **Pierce universality:** `piercedHull`/`shieldedDamage` split computed once and applied per type (T3). ✓
- **Type consistency:** `shield-absorb` now carries `piercedHull` (not `absorbed`/`overflow`) in both `types.ts` (T2) and the server handler (T4); `StepTankInfo.hpCostFraction` defined (T2) and consumed (T3). ✓
- **Known follow-ups for the implementer:** confirm `computeDamage`'s exact signature/`DamageEntry` field names against `tickLoop.ts` before finalizing T4; confirm the precise turn-start insertion point in `MatchRoom.ts` for auto-equip (T5).
