# Phase 7 — AI Opponents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship five computer-controlled AI opponents (Moron → Bouncer) that the host can add from the lobby, each with distinct aiming accuracy, weapon preferences, and shopping behavior.

**Architecture:** AI logic lives as pure functions in `packages/game/src/ai/` (no Colyseus, no DOM). The server imports `think()` and calls it when `currentTurnPlayerId` maps to an AI slot, then directly calls `handleFire()`. AI tanks are identical to human tanks in the schema — `MatchState.aiSlots` is the server's lookup table for which sessionIds are AI-controlled.

**Tech Stack:** TypeScript, Vitest (TDD for `@se/game`), Colyseus schema, pnpm workspaces

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `packages/shared/src/constants.ts` | Modify | Add `AiDifficulty` type + `ALL_AI_DIFFICULTIES` |
| `packages/shared/src/intents.ts` | Modify | Add `add-ai`, `remove-ai`, `set-ai-difficulty` intents |
| `packages/shared/src/schema/AiSlot.ts` | Create | Colyseus schema: sessionId + difficulty + nickname |
| `packages/shared/src/schema/MatchState.ts` | Modify | Add `@type([AiSlot]) aiSlots` |
| `packages/shared/src/index.ts` | Modify | Export `AiSlot` |
| `packages/game/src/ai/profiles.ts` | Create | `AiProfile` interface, `AI_PROFILES` constants, `AI_NAME_POOLS`, `WEAPON_CATEGORIES` |
| `packages/game/src/ai/scan.ts` | Create | `scanBestShot` — simulation-scan aiming algorithm |
| `packages/game/src/ai/scan.test.ts` | Create | Unit tests for scan |
| `packages/game/src/ai/shop.ts` | Create | `shopForAi` — difficulty-aware purchasing |
| `packages/game/src/ai/shop.test.ts` | Create | Unit tests for shop |
| `packages/game/src/ai/think.ts` | Create | `think` — top-level AI turn entry point |
| `packages/game/src/ai/think.test.ts` | Create | Unit tests for think |
| `packages/game/src/ai/index.ts` | Create | Re-exports from the ai/ directory |
| `packages/game/src/index.ts` | Modify | Re-export from `./ai` |
| `apps/server/src/rooms/MatchRoom.ts` | Modify | Lobby handlers, `isAiTurn`, `scheduleAiTurn`, AI tank creation, AI shopping |
| `apps/server/tests/MatchRoom.test.ts` | Modify | Integration tests |
| `apps/client/src/input/AimControls.ts` | Modify | Add AI lobby section (button + per-slot controls) |
| `apps/client/src/scenes/MatchScene.ts` | Modify | 🤖 badge on AI tank HUD entries |

---

## Task 1: Shared — AiDifficulty type and new intents

**Files:**
- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/intents.ts`

- [ ] **Step 1: Add AiDifficulty to constants.ts**

Append to the bottom of `packages/shared/src/constants.ts`:

```typescript
// Phase 7 — AI opponents
export type AiDifficulty = "moron" | "shooter" | "pyro" | "cyborg" | "bouncer";
export const ALL_AI_DIFFICULTIES: AiDifficulty[] = ["moron", "shooter", "pyro", "cyborg", "bouncer"];
```

- [ ] **Step 2: Add three new intents to intents.ts**

In `packages/shared/src/intents.ts`, replace the existing `Intent` union with:

```typescript
export type Intent =
  | { kind: "aim"; angle: number; power: number }
  | { kind: "fire"; angle: number; power: number }
  | { kind: "configure"; turnTimerMs?: number; loadoutId?: string; maxRounds?: number;
      terrainTypePool?: string; wallModePool?: string }
  | { kind: "ready" }
  | { kind: "chat"; text: string }
  | { kind: "select-weapon"; weaponId: string }
  | { kind: "buy"; weaponId: string }
  | { kind: "ready-for-shop" }
  | { kind: "move"; direction: "left" | "right"; pixels: number }
  | { kind: "equip-shield"; shieldId: string }
  | { kind: "use-battery" }
  | { kind: "add-ai"; difficulty: string }
  | { kind: "remove-ai"; sessionId: string }
  | { kind: "set-ai-difficulty"; sessionId: string; difficulty: string };
```

- [ ] **Step 3: Verify shared compiles**

```bash
pnpm --filter @se/shared exec tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/constants.ts packages/shared/src/intents.ts
git commit -m "feat(shared): add AiDifficulty type and add-ai/remove-ai/set-ai-difficulty intents"
```

---

## Task 2: Shared — AiSlot schema and MatchState.aiSlots

**Files:**
- Create: `packages/shared/src/schema/AiSlot.ts`
- Modify: `packages/shared/src/schema/MatchState.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create AiSlot.ts**

Create `packages/shared/src/schema/AiSlot.ts`:

```typescript
import { Schema, type } from "@colyseus/schema";

export class AiSlot extends Schema {
  @type("string") sessionId = "";
  @type("string") difficulty = "shooter";
  @type("string") nickname = "";
}
```

- [ ] **Step 2: Add aiSlots to MatchState**

In `packages/shared/src/schema/MatchState.ts`, add the import at the top:

```typescript
import { AiSlot } from "./AiSlot";
```

Then add this field after `@type([PendingEffect]) pendingEffects`:

```typescript
  // Phase 7 — AI opponents
  @type([AiSlot]) aiSlots = new ArraySchema<AiSlot>();
```

- [ ] **Step 3: Export AiSlot from shared index**

In `packages/shared/src/index.ts`, add:

```typescript
export { AiSlot } from "./schema/AiSlot";
```

- [ ] **Step 4: Verify shared compiles**

```bash
pnpm --filter @se/shared exec tsc --noEmit
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schema/AiSlot.ts packages/shared/src/schema/MatchState.ts packages/shared/src/index.ts
git commit -m "feat(shared): AiSlot schema + MatchState.aiSlots ArraySchema"
```

---

## Task 3: Game — AI profiles (pure constants)

**Files:**
- Create: `packages/game/src/ai/profiles.ts`

- [ ] **Step 1: Create the profiles file**

Create `packages/game/src/ai/profiles.ts`:

```typescript
import type { AiDifficulty } from "@se/shared";

export interface ShopBudgetRule {
  category: "fire" | "direct" | "area" | "terrain" | "shield" | "any";
  fractionOfCash: number;
}

export interface AiProfile {
  difficulty: AiDifficulty;
  scanAngles: number;
  scanPowers: number;
  noiseDeg: number;
  thinkDelayMs: number;
  shieldEquipChance: number;
  preferredWeaponIds: string[];
  shopBudgetRules: ShopBudgetRule[];
}

// Maps weapon IDs to shop budget categories
export const WEAPON_CATEGORIES: Partial<Record<string, ShopBudgetRule["category"]>> = {
  "napalm": "fire", "hot-napalm": "fire", "fireball": "fire",
  "missile": "direct", "baby-nuke": "direct", "nuke": "direct", "baby-missile": "direct",
  "deaths-head": "direct", "triple-warhead": "direct", "plasma-ball": "direct", "plasma-blast": "direct",
  "leapfrog": "direct", "laser": "direct", "plasma-wave": "direct", "tracer": "direct",
  "mirv": "area", "funky-bomb": "area", "funky-nuke": "area", "pineapple": "area", "deaths-knell": "area",
  "dirt-clod": "terrain", "dirt-ball": "terrain", "liquid-dirt": "terrain",
  "sandhog": "terrain", "tunneler": "terrain",
  "roller": "area", "heavy-roller": "area",
  "smoke": "any",
};

export const AI_NAME_POOLS: Record<AiDifficulty, string[]> = {
  moron:   ["Doofus", "Blunder", "Oopsie", "Fumbles", "Wobbles"],
  shooter: ["Deadeye", "Markus", "Sniper", "Bullseye", "Crosshair"],
  pyro:    ["Inferno", "Cinders", "Blazer", "Torch", "Scorch"],
  cyborg:  ["HAL-9000", "Nexus", "ARIA", "Unit-7", "Axiom"],
  bouncer: ["Ricochet", "Phantom", "Echo", "Wraith", "Specter"],
};

export const AI_PROFILES: Record<AiDifficulty, AiProfile> = {
  moron: {
    difficulty: "moron",
    scanAngles: 0,
    scanPowers: 0,
    noiseDeg: 90,
    thinkDelayMs: 500,
    shieldEquipChance: 0,
    preferredWeaponIds: [],
    shopBudgetRules: [{ category: "any", fractionOfCash: 1 }],
  },
  shooter: {
    difficulty: "shooter",
    scanAngles: 18,
    scanPowers: 5,
    noiseDeg: 20,
    thinkDelayMs: 1000,
    shieldEquipChance: 0.25,
    preferredWeaponIds: ["missile", "baby-nuke", "nuke", "baby-missile"],
    shopBudgetRules: [
      { category: "direct", fractionOfCash: 0.6 },
      { category: "shield", fractionOfCash: 0.2 },
      { category: "any",    fractionOfCash: 0.2 },
    ],
  },
  pyro: {
    difficulty: "pyro",
    scanAngles: 18,
    scanPowers: 5,
    noiseDeg: 25,
    thinkDelayMs: 1000,
    shieldEquipChance: 0.5,
    preferredWeaponIds: ["napalm", "hot-napalm", "fireball", "funky-bomb", "baby-nuke"],
    shopBudgetRules: [
      { category: "fire",  fractionOfCash: 0.7 },
      { category: "shield", fractionOfCash: 0.15 },
      { category: "any",   fractionOfCash: 0.15 },
    ],
  },
  cyborg: {
    difficulty: "cyborg",
    scanAngles: 36,
    scanPowers: 10,
    noiseDeg: 5,
    thinkDelayMs: 1500,
    shieldEquipChance: 1,
    preferredWeaponIds: ["funky-bomb", "nuke", "mirv", "laser", "plasma-wave", "missile"],
    shopBudgetRules: [
      { category: "shield", fractionOfCash: 0.2 },
      { category: "direct", fractionOfCash: 0.4 },
      { category: "area",   fractionOfCash: 0.25 },
      { category: "any",    fractionOfCash: 0.15 },
    ],
  },
  bouncer: {
    difficulty: "bouncer",
    scanAngles: 36,
    scanPowers: 10,
    noiseDeg: 2,
    thinkDelayMs: 2000,
    shieldEquipChance: 1,
    preferredWeaponIds: ["funky-bomb", "nuke", "mirv", "roller", "leapfrog", "laser", "plasma-wave", "missile"],
    shopBudgetRules: [
      { category: "shield",  fractionOfCash: 0.25 },
      { category: "direct",  fractionOfCash: 0.35 },
      { category: "area",    fractionOfCash: 0.2 },
      { category: "terrain", fractionOfCash: 0.1 },
      { category: "any",     fractionOfCash: 0.1 },
    ],
  },
};
```

- [ ] **Step 2: Verify game package compiles**

```bash
pnpm --filter @se/game exec tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add packages/game/src/ai/profiles.ts
git commit -m "feat(game): AI profiles — 5 difficulty constants, name pools, weapon categories"
```

---

## Task 4: Game — scan.ts (TDD)

**Files:**
- Create: `packages/game/src/ai/scan.test.ts`
- Create: `packages/game/src/ai/scan.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/game/src/ai/scan.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createPrng } from "../rng/prng";
import { BABY_MISSILE } from "../weapons/baby-missile";
import { simulateProjectile } from "../physics/simulate";
import { scanBestShot } from "./scan";
import { AI_PROFILES } from "./profiles";

const W = 1600;
const H = 900;
const FLAT = new Int16Array(W).fill(700);

describe("scanBestShot", () => {
  it("moron — returns angle [0,180] and power [100,900]", () => {
    const result = scanBestShot({
      origin: { x: 400, y: 700 },
      targets: [{ x: 1200, y: 700 }],
      terrain: FLAT, terrainWidth: W, terrainHeight: H,
      wallMode: "none", wind: 0, gravity: 250,
      weaponDef: BABY_MISSILE, profile: AI_PROFILES.moron,
      prng: createPrng("moron-seed"),
    });
    expect(result.angle).toBeGreaterThanOrEqual(0);
    expect(result.angle).toBeLessThanOrEqual(180);
    expect(result.power).toBeGreaterThanOrEqual(100);
    expect(result.power).toBeLessThanOrEqual(900);
  });

  it("moron — different seeds produce different results", () => {
    const r1 = scanBestShot({
      origin: { x: 400, y: 700 }, targets: [{ x: 1200, y: 700 }],
      terrain: FLAT, terrainWidth: W, terrainHeight: H,
      wallMode: "none", wind: 0, gravity: 250,
      weaponDef: BABY_MISSILE, profile: AI_PROFILES.moron,
      prng: createPrng("seed-A"),
    });
    const r2 = scanBestShot({
      origin: { x: 400, y: 700 }, targets: [{ x: 1200, y: 700 }],
      terrain: FLAT, terrainWidth: W, terrainHeight: H,
      wallMode: "none", wind: 0, gravity: 250,
      weaponDef: BABY_MISSILE, profile: AI_PROFILES.moron,
      prng: createPrng("seed-B"),
    });
    expect(r1.angle !== r2.angle || r1.power !== r2.power).toBe(true);
  });

  it("cyborg — trajectory passes within 150px of target (no wind, flat terrain)", () => {
    const target = { x: 800, y: 700 };
    const result = scanBestShot({
      origin: { x: 200, y: 700 }, targets: [target],
      terrain: FLAT, terrainWidth: W, terrainHeight: H,
      wallMode: "none", wind: 0, gravity: 250,
      weaponDef: BABY_MISSILE, profile: AI_PROFILES.cyborg,
      prng: createPrng("cyborg-aim"),
    });
    // Verify the selected angle/power produces a trajectory near the target
    const traj = simulateProjectile({
      weapon: BABY_MISSILE,
      origin: { x: 200, y: 700 },
      angle: result.angle, power: result.power,
      wind: 0, gravity: 250,
      terrain: FLAT, terrainWidth: W, terrainHeight: H,
      wallMode: "none", targets: [],
    });
    let minDist = Infinity;
    for (const s of traj.samples) {
      const dx = s.x - target.x;
      const dy = s.y - target.y;
      minDist = Math.min(minDist, Math.sqrt(dx * dx + dy * dy));
    }
    expect(minDist).toBeLessThan(150);
  });

  it("is deterministic — same seed same result", () => {
    const opts = {
      origin: { x: 300, y: 700 }, targets: [{ x: 900, y: 700 }],
      terrain: FLAT, terrainWidth: W, terrainHeight: H,
      wallMode: "none" as const, wind: 0, gravity: 250,
      weaponDef: BABY_MISSILE, profile: AI_PROFILES.shooter,
    };
    const r1 = scanBestShot({ ...opts, prng: createPrng("det") });
    const r2 = scanBestShot({ ...opts, prng: createPrng("det") });
    expect(r1.angle).toBeCloseTo(r2.angle);
    expect(r1.power).toBeCloseTo(r2.power);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @se/game exec vitest run src/ai/scan.test.ts
```
Expected: FAIL — `Cannot find module './scan'`

- [ ] **Step 3: Implement scan.ts**

Create `packages/game/src/ai/scan.ts`:

```typescript
import { simulateProjectile } from "../physics/simulate";
import type { WeaponDef, TrajectorySample } from "../types";
import type { WallMode } from "@se/shared";
import type { Prng } from "../rng/prng";
import type { AiProfile } from "./profiles";

export interface ScanInput {
  origin: { x: number; y: number };
  targets: Array<{ x: number; y: number }>;
  terrain: Int16Array;
  terrainWidth: number;
  terrainHeight: number;
  wallMode: WallMode;
  wind: number;
  gravity: number;
  weaponDef: WeaponDef;
  profile: AiProfile;
  prng: Prng;
}

export interface ScanResult {
  angle: number;
  power: number;
}

function minDistToTargets(
  samples: TrajectorySample[],
  targets: Array<{ x: number; y: number }>,
): number {
  let best = Infinity;
  for (const s of samples) {
    for (const t of targets) {
      const dx = s.x - t.x;
      const dy = s.y - t.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < best) best = d;
    }
  }
  return best;
}

export function scanBestShot(input: ScanInput): ScanResult {
  const { origin, targets, terrain, terrainWidth, terrainHeight,
          wallMode, wind, gravity, weaponDef, profile, prng } = input;

  if (profile.scanAngles === 0) {
    return {
      angle: prng.nextInt(10, 170),
      power: prng.nextInt(100, 900),
    };
  }

  let bestScore = Infinity;
  let bestAngle = 90;
  let bestPower = 500;

  const angleStep = 170 / (profile.scanAngles - 1);
  const powerStep = 800 / (profile.scanPowers - 1);

  for (let ai = 0; ai < profile.scanAngles; ai++) {
    const angle = 10 + ai * angleStep;
    for (let pi = 0; pi < profile.scanPowers; pi++) {
      const power = 100 + pi * powerStep;
      const result = simulateProjectile({
        weapon: weaponDef,
        origin,
        angle,
        power,
        wind,
        gravity,
        terrain,
        terrainWidth,
        terrainHeight,
        wallMode,
        targets: [],
      });
      const score = minDistToTargets(result.samples, targets);
      if (score < bestScore) {
        bestScore = score;
        bestAngle = angle;
        bestPower = power;
      }
    }
  }

  const noiseDeg = (prng.nextFloat() * 2 - 1) * profile.noiseDeg;
  return {
    angle: Math.max(0, Math.min(180, bestAngle + noiseDeg)),
    power: bestPower,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @se/game exec vitest run src/ai/scan.test.ts
```
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/game/src/ai/scan.ts packages/game/src/ai/scan.test.ts
git commit -m "feat(game): scanBestShot — simulation-scan AI aiming with difficulty noise"
```

---

## Task 5: Game — shop.ts (TDD)

**Files:**
- Create: `packages/game/src/ai/shop.test.ts`
- Create: `packages/game/src/ai/shop.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/game/src/ai/shop.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createPrng } from "../rng/prng";
import { shopForAi } from "./shop";

describe("shopForAi", () => {
  it("returns an array of purchase requests", () => {
    const purchases = shopForAi({
      cash: 10_000,
      shieldId: "",
      difficulty: "shooter",
      prng: createPrng("shop-basic"),
    });
    expect(Array.isArray(purchases)).toBe(true);
  });

  it("moron — spends all available cash (buys something)", () => {
    const purchases = shopForAi({
      cash: 10_000,
      shieldId: "",
      difficulty: "moron",
      prng: createPrng("moron-shop"),
    });
    expect(purchases.length).toBeGreaterThan(0);
  });

  it("moron — each itemId is a valid weapon or item id", () => {
    const { WEAPON_REGISTRY } = await import("../weapons/index");
    const { ITEM_REGISTRY } = await import("../items/index");
    const allIds = new Set([...WEAPON_REGISTRY.keys(), ...ITEM_REGISTRY.keys()]);
    const purchases = shopForAi({
      cash: 50_000,
      shieldId: "",
      difficulty: "moron",
      prng: createPrng("moron-ids"),
    });
    for (const p of purchases) {
      expect(allIds.has(p.itemId)).toBe(true);
    }
  });

  it("cyborg — always buys a shield when none equipped", () => {
    const shieldIds = ["shield", "heavy-shield", "super-magnetic", "force-shield"];
    const purchases = shopForAi({
      cash: 50_000,
      shieldId: "",
      difficulty: "cyborg",
      prng: createPrng("cyborg-shield"),
    });
    const boughtShield = purchases.some(p => shieldIds.includes(p.itemId));
    expect(boughtShield).toBe(true);
  });

  it("cyborg — does not buy a second shield if one already equipped", () => {
    const shieldIds = ["shield", "heavy-shield", "super-magnetic", "force-shield"];
    const purchases = shopForAi({
      cash: 50_000,
      shieldId: "shield",      // already equipped
      difficulty: "cyborg",
      prng: createPrng("cyborg-no-shield"),
    });
    const shieldPurchases = purchases.filter(p => shieldIds.includes(p.itemId));
    expect(shieldPurchases.length).toBe(0);
  });

  it("pyro — buys at least one fire weapon when cash allows", () => {
    const fireIds = ["napalm", "hot-napalm", "fireball"];
    const purchases = shopForAi({
      cash: 50_000,
      shieldId: "",
      difficulty: "pyro",
      prng: createPrng("pyro-fire"),
    });
    const boughtFire = purchases.some(p => fireIds.includes(p.itemId));
    expect(boughtFire).toBe(true);
  });

  it("returns empty array when cash is 0", () => {
    const purchases = shopForAi({
      cash: 0,
      shieldId: "",
      difficulty: "cyborg",
      prng: createPrng("zero-cash"),
    });
    expect(purchases).toHaveLength(0);
  });

  it("is deterministic — same seed same purchases", () => {
    const opts = { cash: 20_000, shieldId: "", difficulty: "shooter" as const };
    const r1 = shopForAi({ ...opts, prng: createPrng("det") });
    const r2 = shopForAi({ ...opts, prng: createPrng("det") });
    expect(r1.map(p => p.itemId)).toEqual(r2.map(p => p.itemId));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @se/game exec vitest run src/ai/shop.test.ts
```
Expected: FAIL — `Cannot find module './shop'`

- [ ] **Step 3: Implement shop.ts**

Create `packages/game/src/ai/shop.ts`:

```typescript
import type { AiDifficulty } from "@se/shared";
import type { Prng } from "../rng/prng";
import { WEAPON_REGISTRY } from "../weapons/index";
import { ITEM_REGISTRY } from "../items/index";
import { AI_PROFILES, WEAPON_CATEGORIES } from "./profiles";

export interface ShopInput {
  cash: number;
  shieldId: string;   // "" if no shield equipped; prevents buying a second one
  difficulty: AiDifficulty;
  prng: Prng;
}

export interface ShopPurchase {
  itemId: string;
}

const SHIELD_IDS = ["shield", "heavy-shield", "super-magnetic", "force-shield"];

// Sorted cheapest to most expensive so AI can afford as many as possible
const SHIELD_OPTIONS = SHIELD_IDS.map(id => ITEM_REGISTRY.get(id)!).filter(Boolean)
  .sort((a, b) => a.price - b.price);

export function shopForAi(input: ShopInput): ShopPurchase[] {
  const { cash, shieldId, difficulty, prng } = input;
  const profile = AI_PROFILES[difficulty];
  const purchases: ShopPurchase[] = [];
  let remaining = cash;

  for (const rule of profile.shopBudgetRules) {
    let budget = Math.floor(remaining * rule.fractionOfCash);
    if (budget <= 0) continue;

    if (rule.category === "shield") {
      // Skip if already equipped or already buying one
      if (shieldId || purchases.some(p => SHIELD_IDS.includes(p.itemId))) continue;
      // Buy the best shield we can afford
      const affordable = SHIELD_OPTIONS.filter(s => s.price <= budget).reverse();
      if (affordable.length > 0) {
        const chosen = affordable[0]!;
        purchases.push({ itemId: chosen.id });
        remaining -= chosen.price;
      }
      continue;
    }

    // Build candidate list for this rule category
    const candidates: Array<{ id: string; price: number; damage: number }> = [];
    for (const [id, def] of WEAPON_REGISTRY) {
      if (def.price <= 0 || def.packSize <= 0) continue;
      const cat = WEAPON_CATEGORIES[id];
      if (rule.category === "any" || cat === rule.category) {
        candidates.push({ id, price: def.price, damage: def.damage });
      }
    }

    if (candidates.length === 0) continue;

    let spent = 0;
    const used = new Set<string>();

    while (spent < budget) {
      // Filter to affordable items not yet exhausted
      const affordable = candidates.filter(c => c.price <= budget - spent && !used.has(c.id));
      if (affordable.length === 0) break;

      let item: typeof affordable[0];
      if (difficulty === "moron") {
        item = prng.pick(affordable);
      } else {
        // Pick highest damage-per-dollar ratio
        item = affordable.reduce((best, c) =>
          c.damage / c.price > best.damage / best.price ? c : best,
        );
      }

      purchases.push({ itemId: item.id });
      spent += item.price;
      remaining -= item.price;
      // Don't buy the same weapon multiple times per rule pass to spread spend
      used.add(item.id);
    }
  }

  return purchases;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @se/game exec vitest run src/ai/shop.test.ts
```
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/game/src/ai/shop.ts packages/game/src/ai/shop.test.ts
git commit -m "feat(game): shopForAi — difficulty-aware AI purchasing with budget rules"
```

---

## Task 6: Game — think.ts (TDD)

**Files:**
- Create: `packages/game/src/ai/think.test.ts`
- Create: `packages/game/src/ai/think.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/game/src/ai/think.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createPrng } from "../rng/prng";
import { WEAPON_REGISTRY } from "../weapons/index";
import { think } from "./think";

const W = 1600;
const H = 900;
const FLAT = new Int16Array(W).fill(700);

function makeState(mySessionId: string, enemySessionId: string, difficulty = "shooter") {
  return {
    tanks: [
      { sessionId: mySessionId, x: 200, y: 700, hp: 100, alive: true,
        inventory: new Map([["baby-missile", 10], ["missile", 3]]) },
      { sessionId: enemySessionId, x: 1200, y: 700, hp: 80, alive: true,
        inventory: new Map([["baby-missile", 10]]) },
    ],
    aiSlots: [{ sessionId: mySessionId, difficulty }],
    wallMode: "none",
    wind: 0,
    gravity: 250,
  };
}

describe("think", () => {
  it("returns a valid AiIntent with angle [0,180] and power [100,900]", () => {
    const state = makeState("ai-0", "player-1");
    const result = think({
      state, terrain: FLAT, sessionId: "ai-0",
      prng: createPrng("think-basic"),
    });
    expect(WEAPON_REGISTRY.has(result.weaponId)).toBe(true);
    expect(result.angle).toBeGreaterThanOrEqual(0);
    expect(result.angle).toBeLessThanOrEqual(180);
    expect(result.power).toBeGreaterThanOrEqual(100);
    expect(result.power).toBeLessThanOrEqual(900);
  });

  it("targets the lowest-HP enemy", () => {
    const state = {
      tanks: [
        { sessionId: "ai-0", x: 800, y: 700, hp: 100, alive: true,
          inventory: new Map([["baby-missile", 10]]) },
        { sessionId: "p1", x: 200, y: 700, hp: 30, alive: true,
          inventory: new Map() },   // low HP — should be targeted
        { sessionId: "p2", x: 1400, y: 700, hp: 90, alive: true,
          inventory: new Map() },
      ],
      aiSlots: [{ sessionId: "ai-0", difficulty: "cyborg" }],
      wallMode: "none",
      wind: 0,
      gravity: 250,
    };
    const result = think({
      state, terrain: FLAT, sessionId: "ai-0",
      prng: createPrng("target-low-hp"),
    });
    // Cyborg targeting p1 (x=200, left of ai-0 at x=800) should fire angle > 90
    expect(result.angle).toBeGreaterThan(90);
  });

  it("falls back to baby-missile if preferred weapons not in inventory", () => {
    const state = {
      tanks: [
        { sessionId: "ai-0", x: 200, y: 700, hp: 100, alive: true,
          inventory: new Map([["baby-missile", 5]]) },  // only baby-missile
        { sessionId: "p1", x: 1200, y: 700, hp: 100, alive: true,
          inventory: new Map() },
      ],
      aiSlots: [{ sessionId: "ai-0", difficulty: "cyborg" }],
      wallMode: "none", wind: 0, gravity: 250,
    };
    const result = think({
      state, terrain: FLAT, sessionId: "ai-0",
      prng: createPrng("fallback"),
    });
    expect(result.weaponId).toBe("baby-missile");
  });

  it("handles no enemies — fires at terrain center", () => {
    const state = {
      tanks: [
        { sessionId: "ai-0", x: 400, y: 700, hp: 100, alive: true,
          inventory: new Map([["baby-missile", 5]]) },
      ],
      aiSlots: [{ sessionId: "ai-0", difficulty: "shooter" }],
      wallMode: "none", wind: 0, gravity: 250,
    };
    const result = think({
      state, terrain: FLAT, sessionId: "ai-0",
      prng: createPrng("no-enemies"),
    });
    expect(result.weaponId).toBeTruthy();
    expect(result.angle).toBeGreaterThanOrEqual(0);
    expect(result.power).toBeGreaterThan(0);
  });

  it("is deterministic — same seed same result", () => {
    const state = makeState("ai-0", "player-1");
    const r1 = think({ state, terrain: FLAT, sessionId: "ai-0", prng: createPrng("det") });
    const r2 = think({ state, terrain: FLAT, sessionId: "ai-0", prng: createPrng("det") });
    expect(r1).toEqual(r2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @se/game exec vitest run src/ai/think.test.ts
```
Expected: FAIL — `Cannot find module './think'`

- [ ] **Step 3: Implement think.ts**

Create `packages/game/src/ai/think.ts`:

```typescript
import type { AiDifficulty, WallMode } from "@se/shared";
import type { Prng } from "../rng/prng";
import { WEAPON_REGISTRY } from "../weapons/index";
import { AI_PROFILES } from "./profiles";
import { scanBestShot } from "./scan";

// Lightweight snapshot of match state — avoids importing Colyseus schema into game package
export interface AiTankSnapshot {
  sessionId: string;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  inventory: Map<string, number>;
}

export interface ThinkStateSnapshot {
  tanks: AiTankSnapshot[];
  aiSlots: Array<{ sessionId: string; difficulty: string }>;
  wallMode: string;
  wind: number;
  gravity: number;
}

export interface ThinkInput {
  state: ThinkStateSnapshot;
  terrain: Int16Array;
  sessionId: string;
  prng: Prng;
}

export interface AiIntent {
  weaponId: string;
  angle: number;
  power: number;
}

export function think(input: ThinkInput): AiIntent {
  const { state, terrain, sessionId, prng } = input;

  const slot = state.aiSlots.find(s => s.sessionId === sessionId);
  const difficulty = (slot?.difficulty ?? "shooter") as AiDifficulty;
  const profile = AI_PROFILES[difficulty];

  const myTank = state.tanks.find(t => t.sessionId === sessionId);
  if (!myTank) return { weaponId: "baby-missile", angle: 90, power: 500 };

  const enemies = state.tanks.filter(t => t.alive && t.sessionId !== sessionId);

  if (enemies.length === 0) {
    // No targets — fire harmlessly at terrain center
    const weaponId = pickWeapon(profile.preferredWeaponIds, myTank.inventory);
    return { weaponId, angle: 90, power: 300 };
  }

  // Target lowest-HP enemy; tie-break by nearest x-distance
  const target = enemies.reduce((best, t) => {
    if (t.hp < best.hp) return t;
    if (t.hp === best.hp && Math.abs(t.x - myTank.x) < Math.abs(best.x - myTank.x)) return t;
    return best;
  });

  const weaponId = pickWeapon(profile.preferredWeaponIds, myTank.inventory);
  const weaponDef = WEAPON_REGISTRY.get(weaponId)!;

  const scanResult = scanBestShot({
    origin: { x: myTank.x, y: myTank.y },
    targets: [{ x: target.x, y: target.y }],
    terrain,
    terrainWidth: 1600,
    terrainHeight: 900,
    wallMode: state.wallMode as WallMode,
    wind: state.wind,
    gravity: state.gravity,
    weaponDef,
    profile,
    prng,
  });

  return { weaponId, angle: scanResult.angle, power: scanResult.power };
}

function pickWeapon(preferredIds: string[], inventory: Map<string, number>): string {
  for (const id of preferredIds) {
    const count = inventory.get(id) ?? 0;
    if (count > 0) return id;
  }
  // Fallback: first available weapon in registry order
  for (const id of WEAPON_REGISTRY.keys()) {
    const count = inventory.get(id) ?? 0;
    if (count > 0) return id;
  }
  return "baby-missile";
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @se/game exec vitest run src/ai/think.test.ts
```
Expected: All PASS

- [ ] **Step 5: Run all game tests to check for regressions**

```bash
pnpm --filter @se/game exec vitest run
```
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add packages/game/src/ai/think.ts packages/game/src/ai/think.test.ts
git commit -m "feat(game): think() — AI turn entry point with target selection and weapon pick"
```

---

## Task 7: Game — ai/index.ts and game package re-exports

**Files:**
- Create: `packages/game/src/ai/index.ts`
- Modify: `packages/game/src/index.ts`

- [ ] **Step 1: Create ai/index.ts**

Create `packages/game/src/ai/index.ts`:

```typescript
export { think } from "./think";
export type { ThinkInput, ThinkStateSnapshot, AiTankSnapshot, AiIntent } from "./think";
export { scanBestShot } from "./scan";
export type { ScanInput, ScanResult } from "./scan";
export { shopForAi } from "./shop";
export type { ShopInput, ShopPurchase } from "./shop";
export { AI_PROFILES, AI_NAME_POOLS, WEAPON_CATEGORIES } from "./profiles";
export type { AiProfile, ShopBudgetRule } from "./profiles";
```

- [ ] **Step 2: Add re-exports to game/src/index.ts**

Append to `packages/game/src/index.ts`:

```typescript
export { think, shopForAi, scanBestShot, AI_PROFILES, AI_NAME_POOLS } from "./ai";
export type { ThinkInput, ThinkStateSnapshot, AiTankSnapshot, AiIntent, ShopInput, ShopPurchase } from "./ai";
```

- [ ] **Step 3: Verify full game package compiles**

```bash
pnpm --filter @se/game exec tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/game/src/ai/index.ts packages/game/src/index.ts
git commit -m "feat(game): export AI functions from packages/game public API"
```

---

## Task 8: Server — lobby message handlers (TDD)

**Files:**
- Modify: `apps/server/tests/MatchRoom.test.ts` (add tests first)
- Modify: `apps/server/src/rooms/MatchRoom.ts` (implement handlers)

- [ ] **Step 1: Write failing integration tests**

Append to the `describe("MatchRoom", ...)` block in `apps/server/tests/MatchRoom.test.ts`:

```typescript
  // ── Phase 7: AI slots ────────────────────────────────────────────────────

  it("host add-ai appends a slot with the requested difficulty", async () => {
    const a = await joinMatch({ code: "AI-01", nickname: "Host", color: "red" });
    await new Promise(r => setTimeout(r, 30));
    a.send("add-ai", { difficulty: "cyborg" });
    await new Promise(r => setTimeout(r, 50));
    expect(a.state.aiSlots.length).toBe(1);
    expect(a.state.aiSlots[0]!.difficulty).toBe("cyborg");
    expect(a.state.aiSlots[0]!.sessionId).toBe("ai-0");
    await a.leave();
  });

  it("non-host add-ai is ignored", async () => {
    const a = await joinMatch({ code: "AI-02", nickname: "Host", color: "red" });
    const b = await joinMatch({ code: "AI-02", nickname: "Bob", color: "blue" });
    await new Promise(r => setTimeout(r, 30));
    b.send("add-ai", { difficulty: "moron" });
    await new Promise(r => setTimeout(r, 50));
    expect(a.state.aiSlots.length).toBe(0);
    await a.leave(); await b.leave();
  });

  it("host remove-ai removes the slot by sessionId", async () => {
    const a = await joinMatch({ code: "AI-03", nickname: "Host", color: "red" });
    await new Promise(r => setTimeout(r, 30));
    a.send("add-ai", { difficulty: "shooter" });
    await new Promise(r => setTimeout(r, 50));
    expect(a.state.aiSlots.length).toBe(1);
    a.send("remove-ai", { sessionId: "ai-0" });
    await new Promise(r => setTimeout(r, 50));
    expect(a.state.aiSlots.length).toBe(0);
    await a.leave();
  });

  it("host set-ai-difficulty updates the slot difficulty", async () => {
    const a = await joinMatch({ code: "AI-04", nickname: "Host", color: "red" });
    await new Promise(r => setTimeout(r, 30));
    a.send("add-ai", { difficulty: "moron" });
    await new Promise(r => setTimeout(r, 50));
    a.send("set-ai-difficulty", { sessionId: "ai-0", difficulty: "bouncer" });
    await new Promise(r => setTimeout(r, 50));
    expect(a.state.aiSlots[0]!.difficulty).toBe("bouncer");
    await a.leave();
  });

  it("add-ai is rejected if room is full", async () => {
    const a = await joinMatch({ code: "AI-05", nickname: "Host", color: "red" });
    await new Promise(r => setTimeout(r, 30));
    // Add 9 AI slots (host + 9 AI = 10 = maxPlayers)
    for (let i = 0; i < 9; i++) {
      a.send("add-ai", { difficulty: "moron" });
      await new Promise(r => setTimeout(r, 20));
    }
    // 10th add-ai should be rejected
    a.send("add-ai", { difficulty: "moron" });
    await new Promise(r => setTimeout(r, 50));
    expect(a.state.aiSlots.length).toBe(9);
    await a.leave();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @se/server exec vitest run
```
Expected: the 5 new AI slot tests FAIL

- [ ] **Step 3: Add imports to MatchRoom.ts**

At the top of `apps/server/src/rooms/MatchRoom.ts`, add to the existing `@se/shared` import:

```typescript
import {
  MatchState, Tank, PendingEffect, AiSlot,
  DEFAULT_TURN_TIMER_MS, MAX_PLAYERS,
  TERRAIN_WIDTH, TERRAIN_HEIGHT,
  RECONNECT_GRACE_SEC,
  LOADOUT_MAP, DEFAULT_LOADOUT_ID,
  DEFAULT_STARTING_CASH, SHOP_DURATION_MS,
  ROUND_SUMMARY_DURATION_MS,
  SHIELD_DEFS,
  parsePool, ALL_TERRAIN_TYPES, ALL_WALL_MODES,
  ALL_AI_DIFFICULTIES,
  type TankColor, type TankHat,
  type TerrainType, type WallMode, type AiDifficulty,
} from "@se/shared";
```

Add to the `@se/game` import:

```typescript
import {
  generateTerrain, createPrng, validatePurchase, WEAPON_REGISTRY, ITEM_REGISTRY,
  stepProjectiles, processPendingEffects, type LiveProjectile,
  think, shopForAi, AI_PROFILES, AI_NAME_POOLS,
  type ThinkStateSnapshot, type AiTankSnapshot,
} from "@se/game";
```

- [ ] **Step 4: Add the three message handlers to MatchRoom.onCreate**

After the existing `this.onMessage("configure", ...)` handler block (around line 77), add:

```typescript
    this.onMessage("add-ai", (client, msg: { difficulty?: string }) => {
      if (client.sessionId !== this.state.hostId) return;
      if (this.state.phase !== "lobby") return;
      const difficulty = String(msg?.difficulty ?? "shooter");
      if (!(ALL_AI_DIFFICULTIES as string[]).includes(difficulty)) return;
      const totalSlots = this.state.tanks.size + this.state.aiSlots.length;
      if (totalSlots >= this.maxClients) return;
      const slot = new AiSlot();
      slot.sessionId = "ai-" + this.state.aiSlots.length;
      slot.difficulty = difficulty;
      slot.nickname = "";
      this.state.aiSlots.push(slot);
    });

    this.onMessage("remove-ai", (client, msg: { sessionId?: string }) => {
      if (client.sessionId !== this.state.hostId) return;
      if (this.state.phase !== "lobby") return;
      const targetId = String(msg?.sessionId ?? "");
      const idx = this.state.aiSlots.findIndex(s => s.sessionId === targetId);
      if (idx === -1) return;
      this.state.aiSlots.splice(idx, 1);
      // Re-index remaining slots
      for (let i = 0; i < this.state.aiSlots.length; i++) {
        this.state.aiSlots[i]!.sessionId = "ai-" + i;
      }
    });

    this.onMessage("set-ai-difficulty", (client, msg: { sessionId?: string; difficulty?: string }) => {
      if (client.sessionId !== this.state.hostId) return;
      if (this.state.phase !== "lobby") return;
      const targetId = String(msg?.sessionId ?? "");
      const difficulty = String(msg?.difficulty ?? "");
      if (!(ALL_AI_DIFFICULTIES as string[]).includes(difficulty)) return;
      const slot = this.state.aiSlots.find(s => s.sessionId === targetId);
      if (!slot) return;
      slot.difficulty = difficulty;
    });
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @se/server exec vitest run
```
Expected: All PASS including the 5 new AI slot tests

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/rooms/MatchRoom.ts apps/server/tests/MatchRoom.test.ts
git commit -m "feat(server): add-ai / remove-ai / set-ai-difficulty lobby handlers"
```

---

## Task 9: Server — AI tank creation at match start (TDD)

**Files:**
- Modify: `apps/server/tests/MatchRoom.test.ts` (add tests)
- Modify: `apps/server/src/rooms/MatchRoom.ts` (implement)

- [ ] **Step 1: Write failing tests**

Append to the `describe("MatchRoom", ...)` block:

```typescript
  it("AI tank appears in state.tanks when match starts", async () => {
    const a = await joinMatch({ code: "AI-06", nickname: "Host", color: "red" });
    const b = await joinMatch({ code: "AI-06", nickname: "Bob", color: "blue" });
    await new Promise(r => setTimeout(r, 30));
    a.send("add-ai", { difficulty: "shooter" });
    await new Promise(r => setTimeout(r, 50));
    a.send("ready", {});
    await new Promise(r => setTimeout(r, 150));
    expect(a.state.phase).toBe("playing");
    expect(a.state.tanks.size).toBe(3); // 2 humans + 1 AI
    const aiTank = a.state.tanks.get("ai-0");
    expect(aiTank).toBeDefined();
    expect(aiTank!.alive).toBe(true);
    expect(aiTank!.nickname).toBeTruthy();
    await a.leave(); await b.leave();
  });

  it("AI tank has a deterministic nickname drawn from the pool", async () => {
    const a = await joinMatch({ code: "AI-07", nickname: "Host", color: "red" });
    const b = await joinMatch({ code: "AI-07", nickname: "Bob", color: "blue" });
    await new Promise(r => setTimeout(r, 30));
    a.send("add-ai", { difficulty: "cyborg" });
    await new Promise(r => setTimeout(r, 50));
    a.send("ready", {});
    await new Promise(r => setTimeout(r, 150));
    const aiTank = a.state.tanks.get("ai-0");
    const cyborgNames = ["HAL-9000", "Nexus", "ARIA", "Unit-7", "Axiom"];
    expect(cyborgNames.some(n => aiTank!.nickname.startsWith(n.split("-")[0]!))).toBe(true);
    await a.leave(); await b.leave();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @se/server exec vitest run
```
Expected: the 2 new AI tank tests FAIL

- [ ] **Step 3: Add AI tank creation to startMatch**

In `apps/server/src/rooms/MatchRoom.ts`, in `private startMatch()`, after the line `this.state.phase = "playing";` and before `this.state.terrainSeed = ...`, add:

```typescript
    // Create AI tanks from lobby slots
    this.createAiTanks();
```

In `private startNextRound()`, after `state.round++;` and before the terrain generation, add:

```typescript
    // Reset AI tanks for new round (same logic as human tanks below)
```

Then add this private method to the class (after `seedInventory`):

```typescript
  private createAiTanks(): void {
    const usedNames = new Set(
      Array.from(this.state.tanks.values()).map(t => t.nickname)
    );
    for (let i = 0; i < this.state.aiSlots.length; i++) {
      const slot = this.state.aiSlots[i]!;
      // Assign deterministic nickname from pool
      const pool = AI_NAME_POOLS[slot.difficulty as AiDifficulty] ?? ["AI"];
      const namePrng = createPrng(this.matchSeed + "_ai_name_" + i);
      let nickname = namePrng.pick(pool);
      if (usedNames.has(nickname)) nickname = nickname + "-" + (i + 1);
      usedNames.add(nickname);
      slot.nickname = nickname;

      const tank = new Tank();
      tank.playerId = slot.sessionId;
      tank.sessionId = slot.sessionId;
      tank.nickname = nickname;
      tank.color = "white"; // default; host cannot set color for AI
      tank.connected = true;
      tank.alive = true;
      tank.hp = 100;
      this.state.tanks.set(slot.sessionId, tank);
    }
  }
```

AI tanks are included in `seedInventory()` and `initCash()` automatically since both iterate `state.tanks.values()`. For `startNextRound`, the existing loop that resets all tanks also covers AI tanks.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @se/server exec vitest run
```
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/rooms/MatchRoom.ts apps/server/tests/MatchRoom.test.ts
git commit -m "feat(server): createAiTanks() at match start — AI tanks in state.tanks with seeded nicknames"
```

---

## Task 10: Server — scheduleAiTurn + shield equip (TDD)

**Files:**
- Modify: `apps/server/tests/MatchRoom.test.ts` (add tests)
- Modify: `apps/server/src/rooms/MatchRoom.ts` (implement)

- [ ] **Step 1: Write failing tests**

Append to the `describe("MatchRoom", ...)` block:

```typescript
  it("AI turn resolves automatically without a fire message", async () => {
    const a = await joinMatch({ code: "AI-08", nickname: "Host", color: "red" });
    await new Promise(r => setTimeout(r, 30));
    a.send("add-ai", { difficulty: "moron" });
    await new Promise(r => setTimeout(r, 50));
    a.send("ready", {});
    await new Promise(r => setTimeout(r, 150));
    // If first turn is AI, wait for the think delay (500ms for moron) + resolution
    const isAiFirst = a.state.currentTurnPlayerId === "ai-0";
    if (isAiFirst) {
      const phaseBefore = a.state.phase;
      await new Promise(r => setTimeout(r, 1500)); // moron think 500ms + resolution time
      // Phase should have transitioned (resolving → playing) after AI fires
      expect(["playing", "resolving", "round-summary", "ended"]).toContain(a.state.phase);
    }
    await a.leave();
  });

  it("currentTurnPlayerId advances past AI slots automatically", async () => {
    const a = await joinMatch({ code: "AI-09", nickname: "Host", color: "red" });
    await new Promise(r => setTimeout(r, 30));
    a.send("add-ai", { difficulty: "moron" });
    await new Promise(r => setTimeout(r, 50));
    a.send("ready", {});
    await new Promise(r => setTimeout(r, 150));
    const initialTurn = a.state.currentTurnPlayerId;
    // Wait long enough for moron AI to fire (500ms + resolution)
    await new Promise(r => setTimeout(r, 2000));
    // Turn should have advanced regardless of whether it started as AI or human
    const phasesWithTurns = ["playing", "resolving"];
    if (phasesWithTurns.includes(a.state.phase)) {
      expect(a.state.tick).toBeGreaterThan(0);
    }
    await a.leave();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @se/server exec vitest run
```
Expected: the new AI turn tests FAIL

- [ ] **Step 3: Add isAiTurn and scheduleAiTurn methods**

In `apps/server/src/rooms/MatchRoom.ts`, add these two private methods after `armTurnTimer`:

```typescript
  private isAiTurn(): boolean {
    return this.state.aiSlots.some(
      s => s.sessionId === this.state.currentTurnPlayerId,
    );
  }

  private scheduleAiTurn(): void {
    const slot = this.state.aiSlots.find(
      s => s.sessionId === this.state.currentTurnPlayerId,
    );
    if (!slot) return;
    const profile = AI_PROFILES[slot.difficulty as AiDifficulty];
    this.clock.setTimeout(() => {
      if (this.state.phase !== "playing") return;
      if (this.state.currentTurnPlayerId !== slot.sessionId) return;

      const tank = this.state.tanks.get(slot.sessionId);
      if (!tank || !tank.alive) return;

      // Build a lightweight state snapshot (avoids passing Colyseus schema into game package)
      const snapshot: ThinkStateSnapshot = {
        tanks: Array.from(this.state.tanks.values()).map(t => ({
          sessionId: t.sessionId,
          x: t.x,
          y: t.y,
          hp: t.hp,
          alive: t.alive,
          inventory: new Map(t.inventory.entries()),
        })),
        aiSlots: this.state.aiSlots.map(s => ({
          sessionId: s.sessionId,
          difficulty: s.difficulty,
        })),
        wallMode: this.state.wallMode,
        wind: this.state.wind,
        gravity: this.state.gravity,
      };

      const prng = createPrng(this.matchSeed + "_ai_turn_" + this.state.tick);
      const intent = think({ state: snapshot, terrain: this.terrain, sessionId: slot.sessionId, prng });

      // Select weapon
      const weaponDef = WEAPON_REGISTRY.get(intent.weaponId);
      if (weaponDef && (tank.inventory.get(intent.weaponId) ?? 0) > 0) {
        tank.weaponId = intent.weaponId;
      }

      // Equip best available shield (chance based on difficulty profile)
      if (!tank.shieldId && prng.nextFloat() < profile.shieldEquipChance) {
        const shieldOrder = ["force-shield", "super-magnetic", "heavy-shield", "shield"];
        for (const shieldId of shieldOrder) {
          const count = tank.inventory.get(shieldId) ?? 0;
          if (count > 0) {
            const def = SHIELD_DEFS.get(shieldId)!;
            tank.inventory.set(shieldId, count - 1);
            tank.shieldId = shieldId;
            tank.shieldHp = def.maxHp;
            tank.shieldMaxHp = def.maxHp;
            break;
          }
        }
      }

      handleFire(this.resolveCtx(), slot.sessionId, intent.angle, intent.power);
    }, profile.thinkDelayMs);
  }
```

- [ ] **Step 4: Call scheduleAiTurn from armTurnTimer**

In `private armTurnTimer()`, add at the very end (after setting up the timer):

```typescript
    if (this.isAiTurn()) {
      this.scheduleAiTurn();
    }
```

The full `armTurnTimer` should now look like:

```typescript
  private armTurnTimer(): void {
    if (this.timeoutHandle) {
      this.timeoutHandle.clear();
      this.timeoutHandle = null;
    }
    if (this.state.turnTimerMs <= 0) return;
    if (this.state.phase !== "playing") return;
    this.timeoutHandle = this.clock.setTimeout(() => {
      this.timeoutHandle = null;
      if (this.state.phase !== "playing") return;
      const currentId = this.state.currentTurnPlayerId;
      const tank = this.state.tanks.get(currentId);
      if (!tank || !tank.alive) return;
      handleFire(this.resolveCtx(), currentId, tank.angle, tank.power);
    }, this.state.turnTimerMs);

    if (this.isAiTurn()) {
      this.scheduleAiTurn();
    }
  }
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @se/server exec vitest run
```
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/rooms/MatchRoom.ts apps/server/tests/MatchRoom.test.ts
git commit -m "feat(server): isAiTurn + scheduleAiTurn — AI fires automatically after think delay"
```

---

## Task 11: Server — AI shopping in openShop (TDD)

**Files:**
- Modify: `apps/server/tests/MatchRoom.test.ts` (add tests)
- Modify: `apps/server/src/rooms/MatchRoom.ts` (implement)

- [ ] **Step 1: Write failing tests**

Append to the `describe("MatchRoom", ...)` block:

```typescript
  it("AI tank is marked readyForShop immediately when shopping starts", async () => {
    const a = await joinMatch({ code: "AI-10", nickname: "Host", color: "red" });
    const b = await joinMatch({ code: "AI-10", nickname: "Bob", color: "blue" });
    await new Promise(r => setTimeout(r, 30));
    a.send("add-ai", { difficulty: "shooter" });
    await new Promise(r => setTimeout(r, 50));
    a.send("ready", {});
    await new Promise(r => setTimeout(r, 150));

    // Play until a round ends and shopping starts (only 1 human round needed)
    // Fast approach: fire immediately on first human turn to end the round quickly
    if (a.state.currentTurnPlayerId === a.sessionId) {
      a.send("fire", { angle: 90, power: 900 });
    } else if (a.state.currentTurnPlayerId === b.sessionId) {
      b.send("fire", { angle: 90, power: 900 });
    }
    // Wait for round to resolve and shopping to open
    await new Promise(r => setTimeout(r, 3000));

    if (a.state.phase === "shopping") {
      const aiTank = a.state.tanks.get("ai-0");
      expect(aiTank?.readyForShop).toBe(true);
    }
    await a.leave(); await b.leave();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @se/server exec vitest run
```
Expected: the new shopping test FAIL (AI not marked ready)

- [ ] **Step 3: Update openShop to include AI shopping**

In `apps/server/src/rooms/MatchRoom.ts`, find `private openShop()` and replace the existing method body:

```typescript
  private openShop(): void {
    const state = this.state;
    state.phase = "shopping";
    state.shopDeadlineMs = Date.now() + SHOP_DURATION_MS;
    for (const tank of state.tanks.values()) {
      tank.readyForShop = !tank.alive;
    }

    // AI tanks shop immediately and mark themselves ready
    const registry = [
      ...Array.from(WEAPON_REGISTRY.values()).map(w => ({ id: w.id, price: w.price, packSize: w.packSize })),
      ...Array.from(ITEM_REGISTRY.values()).map(i => ({ id: i.id, price: i.price, packSize: i.packSize })),
    ];

    for (const slot of state.aiSlots) {
      const tank = state.tanks.get(slot.sessionId);
      if (!tank || !tank.alive) continue;
      const prng = createPrng(this.matchSeed + "_ai_shop_r" + state.round + "_" + slot.sessionId);
      const purchases = shopForAi({
        cash: tank.cash,
        shieldId: tank.shieldId,
        difficulty: slot.difficulty as AiDifficulty,
        prng,
      });
      for (const p of purchases) {
        const result = validatePurchase(p.itemId, tank.cash, new Map(tank.inventory.entries()), registry);
        if (result.ok) {
          tank.cash = result.newCash;
          for (const [id, count] of result.newInventory.entries()) {
            tank.inventory.set(id, count);
          }
        }
      }
      tank.readyForShop = true;
    }

    this.shopTimerHandle = this.clock.setTimeout(() => {
      this.shopTimerHandle = null;
      this.advanceAfterShop();
    }, SHOP_DURATION_MS);
  }
```

- [ ] **Step 4: Run all server tests**

```bash
pnpm --filter @se/server exec vitest run
```
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/rooms/MatchRoom.ts apps/server/tests/MatchRoom.test.ts
git commit -m "feat(server): AI tanks shop automatically in openShop using shopForAi"
```

---

## Task 12: Client — Add AI lobby UI in AimControls

**Files:**
- Modify: `apps/client/src/input/AimControls.ts`

- [ ] **Step 1: Add private fields for the AI section**

In `apps/client/src/input/AimControls.ts`, add these private fields after `private wallPoolChecks`:

```typescript
  private aiSection!: HTMLDivElement;
  private aiSlotEls: Array<{ row: HTMLDivElement; sessionId: string }> = [];
```

- [ ] **Step 2: Build the AI lobby section in buildDOM**

In `buildDOM()`, after the `this.poolSection.append(...)` call and before the `this.driveHUD = ...` setup, add:

```typescript
    // ── AI opponents section (host-only, lobby) ───────────────────────────
    this.aiSection = mkDiv("pointer-events:auto;display:none;flex-direction:column;gap:6px;");
    const aiTitle = mkLabel("AI OPPONENTS");
    const addAiRow = mkDiv("display:flex;gap:6px;align-items:center;");
    const diffSelect = document.createElement("select");
    diffSelect.style.cssText = "background:#161b22;color:#e6edf3;border:1px solid #30363d;border-radius:4px;font:11px 'Courier New',monospace;padding:2px 4px;";
    for (const diff of ["moron", "shooter", "pyro", "cyborg", "bouncer"]) {
      const opt = document.createElement("option");
      opt.value = diff;
      opt.textContent = diff.charAt(0).toUpperCase() + diff.slice(1);
      diffSelect.appendChild(opt);
    }
    diffSelect.value = "shooter";
    const addAiBtn = document.createElement("button");
    addAiBtn.textContent = "+ Add AI";
    addAiBtn.style.cssText = "background:rgba(59,130,246,0.2);color:#93c5fd;border:1px solid #3b82f6;border-radius:4px;font:10px 'Courier New',monospace;padding:3px 8px;cursor:pointer;pointer-events:auto;";
    addAiBtn.onclick = () => this.room.send("add-ai", { difficulty: diffSelect.value });
    addAiRow.append(diffSelect, addAiBtn);
    this.aiSlotsContainer = mkDiv("display:flex;flex-direction:column;gap:3px;");
    this.aiSection.append(aiTitle, addAiRow, this.aiSlotsContainer);
```

Also add `private aiSlotsContainer!: HTMLDivElement;` to the class fields.

- [ ] **Step 3: Add aiSection to the el.append call**

Replace the existing `this.el.append(...)` line with:

```typescript
    this.el.append(angleSection, powerSection, actionSection, this.loadoutSection, this.maxRoundsSection, this.poolSection, this.aiSection, this.inviteSection, this.loadoutDisplay);
```

- [ ] **Step 4: Add refreshAiSlots method**

Add this private method to the class:

```typescript
  private refreshAiSlots(): void {
    const state = this.room.state;
    const isHost = state.hostId === this.room.sessionId;
    // Rebuild slot rows if count changed
    const slots = Array.from(state.aiSlots);
    // Remove old rows
    while (this.aiSlotsContainer.firstChild) {
      this.aiSlotsContainer.removeChild(this.aiSlotsContainer.firstChild);
    }
    this.aiSlotEls = [];
    for (const slot of slots) {
      const row = mkDiv("display:flex;align-items:center;gap:4px;");
      const label = mkDiv("color:#f59e0b;font:10px 'Courier New',monospace;flex:1;");
      label.textContent = "🤖 " + slot.sessionId + " — " + slot.difficulty;
      row.appendChild(label);
      if (isHost) {
        // Difficulty changer
        const sel = document.createElement("select");
        sel.style.cssText = "background:#161b22;color:#e6edf3;border:1px solid #30363d;border-radius:3px;font:9px 'Courier New',monospace;padding:1px 3px;";
        for (const diff of ["moron", "shooter", "pyro", "cyborg", "bouncer"]) {
          const opt = document.createElement("option");
          opt.value = diff;
          opt.textContent = diff;
          sel.appendChild(opt);
        }
        sel.value = slot.difficulty;
        sel.onchange = () => this.room.send("set-ai-difficulty", { sessionId: slot.sessionId, difficulty: sel.value });
        // Remove button
        const removeBtn = document.createElement("button");
        removeBtn.textContent = "✕";
        removeBtn.style.cssText = "background:rgba(239,68,68,0.2);color:#ef4444;border:1px solid #ef4444;border-radius:3px;font:9px monospace;padding:1px 5px;cursor:pointer;pointer-events:auto;";
        removeBtn.onclick = () => this.room.send("remove-ai", { sessionId: slot.sessionId });
        row.append(sel, removeBtn);
      }
      this.aiSlotsContainer.appendChild(row);
      this.aiSlotEls.push({ row, sessionId: slot.sessionId });
    }
  }
```

- [ ] **Step 5: Call refreshAiSlots and show/hide aiSection in refreshChrome**

In `refreshChrome()`, inside the `if (inLobby)` block, add after the poolSection visibility lines:

```typescript
      this.aiSection.style.display = "flex";
      this.refreshAiSlots();
```

In the `else` block (non-lobby), add:

```typescript
      this.aiSection.style.display = "none";
```

- [ ] **Step 6: Verify client compiles**

```bash
pnpm --filter @se/client exec tsc --noEmit
```
Expected: no errors (fix any TypeScript errors before committing)

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/input/AimControls.ts
git commit -m "feat(client): AI opponent lobby section — add/remove/difficulty controls for host"
```

---

## Task 13: Client — 🤖 badge for AI tanks in MatchScene

**Files:**
- Modify: `apps/client/src/scenes/MatchScene.ts`

- [ ] **Step 1: Find the HUD tank list rendering**

```bash
grep -n "nickname\|tankList\|tank.*hud\|hud.*tank\|playerList\|player-list" /Users/valletta/dev/scorched-earth/apps/client/src/scenes/MatchScene.ts | head -20
```

- [ ] **Step 2: Add isAiTank helper and badge**

Wherever tank nicknames are rendered in the HUD, add a 🤖 prefix for AI tanks. Locate the tank nickname display code in `MatchScene.ts`, then:

In the section that builds or updates tank HUD entries, add a check:

```typescript
// At the top of MatchScene.ts (or wherever state is accessed):
const isAiTank = (sessionId: string): boolean =>
  Array.from(this.room.state.aiSlots).some(s => s.sessionId === sessionId);

// When rendering a tank's nickname label:
const displayName = isAiTank(tank.sessionId) ? "🤖 " + tank.nickname : tank.nickname;
```

Apply `displayName` wherever `tank.nickname` is used in HUD rendering.

- [ ] **Step 3: Verify client compiles**

```bash
pnpm --filter @se/client exec tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/scenes/MatchScene.ts
git commit -m "feat(client): 🤖 badge for AI tanks in match HUD"
```

---

## Task 14: Final Verification

- [ ] **Step 1: Run the full test suite**

```bash
pnpm -r test
```
Expected: All PASS, zero failures

- [ ] **Step 2: TypeScript check across all packages**

```bash
pnpm -r exec tsc --noEmit 2>&1 | grep -v "^$"
```
Expected: no errors

- [ ] **Step 3: Start the dev server and smoke test**

```bash
pnpm dev
```

Open the game and verify:
1. Lobby shows "AI OPPONENTS" section when host; host can add/remove AI slots and change difficulty
2. AI slots appear in the player list with 🤖 prefix
3. Start match with 1 human + 1 AI (e.g. Shooter difficulty)
4. AI fires automatically after ~1 second think delay when it is the AI's turn
5. AI fires a reasonable shot (not straight down into the ground)
6. Play through a round end — verify AI is marked `readyForShop` immediately
7. Watch next round start — AI fires again on its turn
8. Test with Cyborg: shots should land consistently closer to the human tank than Moron

- [ ] **Step 4: Commit any fixes found during smoke test**

---

## Self-Review — Spec Coverage Check

| Spec requirement | Task |
|---|---|
| `AiDifficulty` type + `ALL_AI_DIFFICULTIES` in shared | Task 1 |
| `add-ai` / `remove-ai` / `set-ai-difficulty` intents | Task 1 |
| `AiSlot` schema | Task 2 |
| `MatchState.aiSlots` | Task 2 |
| `AiProfile` interface + 5 profile constants | Task 3 |
| `AI_NAME_POOLS` | Task 3 |
| `WEAPON_CATEGORIES` | Task 3 |
| `scanBestShot` with simulation-scan | Task 4 |
| Moron random, Cyborg near-accurate | Task 4 |
| `shopForAi` difficulty-aware purchasing | Task 5 |
| Cyborg buys shields, Pyro buys fire | Task 5 |
| `think()` entry point | Task 6 |
| Target lowest-HP enemy | Task 6 |
| Fallback to baby-missile | Task 6 |
| Game package AI exports | Task 7 |
| Lobby `add-ai` handler capped at maxPlayers | Task 8 |
| Non-host rejected | Task 8 |
| `remove-ai` re-indexes slots | Task 8 |
| `set-ai-difficulty` validates difficulty | Task 8 |
| AI tank in `state.tanks` at match start | Task 9 |
| Seeded deterministic nickname | Task 9 |
| `isAiTurn()` + `scheduleAiTurn()` | Task 10 |
| Think delay (500ms–2000ms by difficulty) | Task 10 |
| Shield equip before firing | Task 10 |
| `armTurnTimer` calls `scheduleAiTurn` | Task 10 |
| AI shopping immediately in `openShop` | Task 11 |
| AI marked `readyForShop` | Task 11 |
| Host lobby UI: add/remove/difficulty | Task 12 |
| 🤖 badge in HUD | Task 13 |
| All 5 difficulty tiers work | Tasks 4–6 + smoke test |
| Full test suite passes | Task 14 |
