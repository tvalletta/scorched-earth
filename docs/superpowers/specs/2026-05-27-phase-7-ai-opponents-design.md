# Phase 7 — AI Opponents Design Spec

**Date:** 2026-05-27
**Status:** Approved
**Depends on:** Phase 4 (shields, weapons, tick-stream), Phase 5 (terrain types, wall modes)

---

## Vision

Five computer-controlled opponents — Moron, Shooter, Pyro, Cyborg, Bouncer — that the host can add to any match directly from the lobby. Each AI is indistinguishable from a human player in the schema and turn order; the server drives their turns programmatically when `currentTurnPlayerId` maps to an AI slot.

---

## Cross-Phase Constraints (from roadmap)

- AI logic in `packages/game` must be pure (no DOM, no Node built-ins, no Colyseus imports)
- All RNG goes through the seeded `Prng` — no `Math.random()` in AI code
- AI tanks use the same `Tank` schema as human players
- The authoritative server decides all outcomes; AI "decisions" are server-side function calls

---

## 1. Data Models

### 1.1 AiDifficulty

```typescript
// packages/shared/src/constants.ts
export type AiDifficulty = "moron" | "shooter" | "pyro" | "cyborg" | "bouncer";
export const ALL_AI_DIFFICULTIES: AiDifficulty[] = ["moron", "shooter", "pyro", "cyborg", "bouncer"];
```

### 1.2 AiSlot Schema

New Colyseus schema in `packages/shared/src/schema/AiSlot.ts`:

```typescript
import { Schema, type } from "@colyseus/schema";

export class AiSlot extends Schema {
  @type("string") sessionId = "";    // deterministic: "ai-0", "ai-1", etc.
  @type("string") difficulty: string = "shooter";
  @type("string") nickname = "";     // drawn from themed pool at match start
}
```

### 1.3 MatchState additions

```typescript
// packages/shared/src/schema/MatchState.ts
@type([AiSlot]) aiSlots = new ArraySchema<AiSlot>();
```

`aiSlots` is the server's authoritative list of which tank sessionIds are AI-controlled and at what difficulty. It is read-only for clients (used to label AI tanks in the HUD).

### 1.4 AiProfile (pure game logic, not replicated)

```typescript
// packages/game/src/ai/profiles.ts
export interface AiProfile {
  difficulty: AiDifficulty;
  scanAngles: number;      // number of angle candidates in scan grid
  scanPowers: number;      // number of power candidates in scan grid
  noiseDeg: number;        // ±degrees of random noise added to best shot
  thinkDelayMs: number;    // ms to wait before firing
  shieldEquipChance: number; // 0–1 probability of equipping available shield
  preferredWeaponIds: string[]; // ordered preference list; falls back to any available
  shopBudgetRules: ShopBudgetRule[]; // ordered spending rules
}

export interface ShopBudgetRule {
  category: "fire" | "direct" | "area" | "terrain" | "shield" | "any";
  fractionOfCash: number; // max fraction of remaining cash to spend on this category
}
```

#### Profile constants

| Difficulty | scanAngles | scanPowers | noiseDeg | thinkDelayMs | shieldEquipChance |
|---|---|---|---|---|---|
| moron | 0 (random) | 0 (random) | 90 | 500 | 0.00 |
| shooter | 18 | 5 | 20 | 1000 | 0.25 |
| pyro | 18 | 5 | 25 | 1000 | 0.50 |
| cyborg | 36 | 10 | 5 | 1500 | 1.00 |
| bouncer | 36 | 10 | 2 | 2000 | 1.00 |

#### Weapon preferences by difficulty

- **moron** — random from inventory
- **shooter** — `["missile", "baby-nuke", "nuke", "baby-missile"]`
- **pyro** — `["napalm", "hot-napalm", "fireball", "funky-bomb", "napalm", "baby-nuke"]` (napalm repeated for weight)
- **cyborg** — distance-weighted: `<300px` → funky-bomb/pineapple; `300–800px` → nuke/mirv; `>800px` → laser/plasma-wave; fallback → missile
- **bouncer** — like cyborg + considers roller/leapfrog when terrain is flat; prefers wall-exploiting paths when wallMode is reflect/wrap

#### Shop budget rules

| Difficulty | Rules (in order) |
|---|---|
| moron | `any` 100% — spends randomly until cash gone |
| shooter | `direct` 60%, `shield` 20%, `any` 20% |
| pyro | `fire` 70%, `shield` 15%, `any` 15% |
| cyborg | `shield` 20%, `direct` 40%, `area` 25%, `any` 15% |
| bouncer | `shield` 25%, `direct` 35%, `area` 20%, `terrain` 10%, `any` 10% |

Weapon categories:
- **fire** — napalm, hot-napalm, fireball
- **direct** — missile, baby-nuke, nuke, baby-missile, deaths-head, triple-warhead, plasma-ball, plasma-blast
- **area** — mirv, funky-bomb, funky-nuke, pineapple, deaths-knell
- **terrain** — dirt-clod, dirt-ball, liquid-dirt, sandhog, tunneler

### 1.5 AI Naming Pool

```typescript
// packages/game/src/ai/profiles.ts
export const AI_NAME_POOLS: Record<AiDifficulty, string[]> = {
  moron:   ["Doofus", "Blunder", "Oopsie", "Fumbles", "Wobbles"],
  shooter: ["Deadeye", "Markus", "Sniper", "Bullseye", "Crosshair"],
  pyro:    ["Inferno", "Cinders", "Blazer", "Torch", "Scorch"],
  cyborg:  ["HAL-9000", "Nexus", "ARIA", "Unit-7", "Axiom"],
  bouncer: ["Ricochet", "Phantom", "Echo", "Wraith", "Specter"],
};
```

Names are drawn deterministically using `prng.pick(AI_NAME_POOLS[difficulty])` keyed to `matchSeed + "_ai_" + slotIndex`. Duplicates across slots of the same difficulty get a numeric suffix (e.g. "Deadeye-2").

---

## 2. API — Lobby Intents (host only, lobby phase only)

### 2.1 add-ai

**Request:**
```typescript
{ kind: "add-ai"; difficulty: AiDifficulty }
```

**Server behavior:**
1. Reject if `client.sessionId !== state.hostId` or `state.phase !== "lobby"`
2. Reject if `aiSlots.length + state.tanks.size >= maxPlayers` (`state.tanks.size` = connected human count in lobby)
3. Generate `sessionId = "ai-" + aiSlots.length`
4. Push new `AiSlot` to `state.aiSlots`

**Response:** State patch — `aiSlots` grows by one entry, visible to all clients.

### 2.2 remove-ai

**Request:**
```typescript
{ kind: "remove-ai"; sessionId: string }
```

**Server behavior:**
1. Reject if not host or not in lobby
2. Find slot by sessionId, remove from `aiSlots`
3. Re-index remaining slots (sessionIds "ai-0", "ai-1", ... stay contiguous)

### 2.3 set-ai-difficulty

**Request:**
```typescript
{ kind: "set-ai-difficulty"; sessionId: string; difficulty: AiDifficulty }
```

**Server behavior:**
1. Reject if not host or not in lobby
2. Find slot, update `difficulty` field

---

## 3. Turn Flow

### 3.1 isAiTurn check

After `armTurnTimer()` sets `state.currentTurnPlayerId`, the server checks:

```typescript
private isAiTurn(): boolean {
  return this.state.aiSlots.some(
    (s) => s.sessionId === this.state.currentTurnPlayerId
  );
}
```

### 3.2 scheduleAiTurn

When `isAiTurn()` is true:

```typescript
private scheduleAiTurn(): void {
  const slot = this.state.aiSlots.find(
    (s) => s.sessionId === this.state.currentTurnPlayerId
  )!;
  const profile = AI_PROFILES[slot.difficulty as AiDifficulty]; // Record<AiDifficulty, AiProfile> exported from profiles.ts
  this.clock.setTimeout(() => {
    const intent = think({
      state: this.state,
      terrain: this.terrain,
      sessionId: slot.sessionId,
      prng: createPrng(this.matchSeed + "_ai_turn_" + this.state.tick),
    });
    // Apply weapon selection
    const tank = this.state.tanks.get(slot.sessionId)!;
    if (tank.inventory.get(intent.weaponId) ?? 0 > 0) {
      tank.weaponId = intent.weaponId;
    }
    // Fire
    handleFire(this.resolveCtx(), slot.sessionId, intent.angle, intent.power);
  }, profile.thinkDelayMs);
}
```

### 3.3 Turn timer interaction

The turn timer (`turnTimerMs`) still fires for AI turns. If the AI's `thinkDelayMs` is always less than `turnTimerMs` (guaranteed by design — max think is 2000ms vs default 30000ms), the AI always fires before timeout. The timeout handler just calls `advanceTurn()` as normal if it fires first (edge case: very short turn timer configs ≤ 2s).

### 3.4 Shield equip before firing

Before `handleFire`, if `shieldEquipChance` roll succeeds and the AI has an unequipped shield in inventory:

```typescript
if (prng.nextFloat() < profile.shieldEquipChance) {
  const bestShield = pickBestShield(tank.inventory);
  if (bestShield && !tank.shieldId) {
    // apply equip-shield intent inline (same logic as onMessage("equip-shield"))
    applyEquipShield(tank, bestShield);
  }
}
```

`pickBestShield` returns the highest-tier shield the tank has ≥1 of (tier order: magnetic > force > deflector > absorbing > basic).

---

## 4. Scan Algorithm (packages/game/src/ai/scan.ts)

### 4.1 Interface

```typescript
export interface ScanInput {
  origin: Point;
  targets: Array<{ x: number; y: number; sessionId: string }>;
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
  angle: number;   // degrees [0, 180]
  power: number;   // [100, 900]
}
```

### 4.2 Algorithm

```
function scanBestShot(input: ScanInput): ScanResult:

  if profile.scanAngles === 0:           // Moron
    return { angle: prng.nextInt(10, 170), power: prng.nextInt(100, 900) }

  angleStep = 170 / (profile.scanAngles - 1)   // 10° to 180°
  powerStep = 800 / (profile.scanPowers - 1)    // 100 to 900

  bestScore = Infinity
  bestAngle = 90
  bestPower = 500

  for angleIdx in 0..scanAngles-1:
    angle = 10 + angleIdx * angleStep
    for powerIdx in 0..scanPowers-1:
      power = 100 + powerIdx * powerStep
      result = simulateProjectile({ weapon, origin, angle, power, wind, gravity,
                                    terrain, terrainWidth, terrainHeight, wallMode,
                                    targets: [] })
      score = minDistanceToAnyTarget(result.samples, targets)
      if score < bestScore:
        bestScore = score
        bestAngle = angle
        bestPower = power

  // Add difficulty noise
  noiseDeg = (prng.nextFloat() * 2 - 1) * profile.noiseDeg
  return {
    angle: clamp(bestAngle + noiseDeg, 0, 180),
    power: bestPower,
  }
```

`minDistanceToAnyTarget` — for each trajectory sample point `(sx, sy)`, compute Euclidean distance to each target `(tx, ty)`; return the global minimum across all samples and targets.

### 4.3 Target selection

AI fires at the living enemy with the lowest HP. If all enemies have equal HP, picks the nearest by x-distance. `think.ts` resolves target selection before calling `scanBestShot`.

---

## 5. Shopping Algorithm (packages/game/src/ai/shop.ts)

### 5.1 Interface

```typescript
export interface ShopInput {
  tank: { cash: number; inventory: Map<string, number>; shieldId: string };
  difficulty: AiDifficulty;
  prng: Prng;
}

export interface ShopOutput {
  purchases: Array<{ itemId: string; quantity: number; cost: number }>;
}
```

### 5.2 Algorithm

```
function shopForAi(input: ShopInput): ShopOutput:
  purchases = []
  remainingCash = tank.cash

  for rule in profile.shopBudgetRules:
    budget = remainingCash * rule.fractionOfCash
    candidates = WEAPON_REGISTRY items matching rule.category
               + (if category === "shield") SHIELD_DEFS items
    if rule.category === "any": candidates = all purchasable items

    while budget > 0 and candidates not empty:
      // moron difficulty: pick randomly; all others: pick highest damage-per-cash ratio
      item = (difficulty === "moron") ? prng.pick(candidates) : highestValueItem(candidates)
      if item.cost <= budget:
        qty = floor(budget / item.cost)  // buy as many as affordable
        purchases.push({ itemId: item.id, quantity: qty, cost: qty * item.cost })
        budget -= qty * item.cost
        remainingCash -= qty * item.cost
      candidates.remove(item)

  return { purchases }
```

Purchases are applied server-side using `validatePurchase` to ensure no exploit bugs.

---

## 6. think.ts Interface

```typescript
export interface ThinkInput {
  state: MatchState;          // readonly view: tanks, wallMode, wind, gravity, terrainType
  terrain: Int16Array;
  sessionId: string;          // the AI tank's sessionId
  prng: Prng;                 // seeded with matchSeed + "_ai_turn_" + tick
}

export interface AiIntent {
  weaponId: string;
  angle: number;   // [0, 180]
  power: number;   // [100, 900]
}

export function think(input: ThinkInput): AiIntent
```

`think` is the only public export from `packages/game/src/ai/`. It orchestrates: target selection → weapon selection → `scanBestShot` → returns intent.

---

## 7. Client Display

### 7.1 Lobby

The client renders `state.aiSlots` in the player list alongside human `state.tanks`. Each AI entry shows:
- 🤖 icon prefix
- Nickname (from `aiSlot.nickname`)
- Difficulty badge (colored per tier)
- Host-only: remove button (✕) and difficulty dropdown

### 7.2 In-match HUD

AI tanks appear identically to human tanks in the tank list. A small 🤖 badge is shown next to the nickname to distinguish them. No other special treatment.

### 7.3 Aim controls

When `currentTurnPlayerId` is an AI, the `AimControls` panel is hidden (or disabled) on all human clients — it's not that human's turn regardless. No change needed to existing logic since `AimControls` already gates on `currentTurnPlayerId === mySessionId`.

---

## 8. Match Start — AI Tank Creation

When `startMatch()` runs, for each `AiSlot`:
1. Create a `Tank` instance with `sessionId = slot.sessionId`, `nickname = slot.nickname`, `connected = true`, `alive = true`
2. Add to `state.tanks` in the same order as human tanks (AI slots appended after humans)
3. Seed inventory via `seedInventory()` — same loadout as humans
4. AI tanks participate in `placeTanksOn()` — placed in terrain slots like any tank

### 8.1 Nickname assignment (at startMatch)

```typescript
for (let i = 0; i < state.aiSlots.length; i++) {
  const slot = state.aiSlots[i];
  const pool = AI_NAME_POOLS[slot.difficulty];
  const prng = createPrng(matchSeed + "_ai_name_" + i);
  let name = prng.pick(pool);
  // Deduplicate: if name already used by another slot, append index
  if (usedNames.has(name)) name = name + "-" + (i + 1);
  usedNames.add(name);
  slot.nickname = name;
}
```

---

## 9. Edge Cases & Failure Modes

| Scenario | Handling |
|---|---|
| AI is the only remaining tank | `checkRoundEnd` runs normally — AI wins the round |
| All tanks are AI | Match plays out fully; human spectators watch via observer mode |
| Turn timer < AI think delay | AI think fires first if `thinkDelayMs < turnTimerMs`; if timer fires first, `advanceTurn()` skips the AI's fired shot (normal expiry behavior) |
| AI has empty inventory | Falls back to `baby-missile` (always available from loadout seed) |
| AI target tank has no living enemies | AI fires at terrain center (defensive non-move); prevents hang |
| Host disconnects mid-match | Phase 11 "ghost-AI takeover" handles this; Phase 7 only covers AI slots added intentionally |
| `simulateProjectile` returns 0 samples | `scanBestShot` treats it as Infinity score; picks next best candidate |
| AI slot removed after match starts | Not possible — remove-ai only works in lobby phase |

---

## 10. File Map

| File | Status | Change |
|---|---|---|
| `packages/shared/src/schema/AiSlot.ts` | Create | New schema |
| `packages/shared/src/schema/MatchState.ts` | Modify | Add `aiSlots` |
| `packages/shared/src/constants.ts` | Modify | Add `AiDifficulty`, `ALL_AI_DIFFICULTIES` |
| `packages/shared/src/intents.ts` | Modify | Add `add-ai`, `remove-ai`, `set-ai-difficulty` intents |
| `packages/shared/src/index.ts` | Modify | Export `AiSlot`, `AiDifficulty` |
| `packages/game/src/ai/profiles.ts` | Create | `AiProfile` type, 5 profile constants, name pools |
| `packages/game/src/ai/scan.ts` | Create | `scanBestShot` — simulation-scan aiming algorithm |
| `packages/game/src/ai/shop.ts` | Create | `shopForAi` — difficulty-aware purchasing |
| `packages/game/src/ai/think.ts` | Create | `think` — public AI turn entry point |
| `packages/game/src/ai/scan.test.ts` | Create | Unit tests: Cyborg hits within 50px, Moron miss rate |
| `packages/game/src/ai/shop.test.ts` | Create | Unit tests: budget rule enforcement per difficulty |
| `packages/game/src/ai/think.test.ts` | Create | Unit tests: output always valid AiIntent |
| `packages/game/src/ai/index.ts` | Create | Export `think`, `AI_PROFILES`, `AI_NAME_POOLS`, `AiProfile`, `AiIntent` |
| `packages/game/src/index.ts` | Modify | Re-export `think`, `AiDifficulty`, `AI_PROFILES` from `./ai` |
| `apps/server/src/rooms/MatchRoom.ts` | Modify | `add-ai`/`remove-ai`/`set-ai-difficulty` handlers; `scheduleAiTurn`; AI tank creation at match start; AI shopping in `openShop` |
| `apps/server/tests/MatchRoom.test.ts` | Modify | Integration tests: AI turn resolves automatically; AI pool configure |
| `apps/client/src/input/AimControls.ts` | Modify | Show "＋ Add AI" button + difficulty dropdown when host in lobby |
| `apps/client/src/scenes/MatchScene.ts` | Modify | Render 🤖 badge for AI tanks |

---

## 11. Test Coverage Targets

- `packages/game/src/ai/` — ≥90% line coverage (pure functions, easy to test)
- `apps/server/` — ≥70% (integration tests cover AI turn auto-resolution)
- `apps/client/` — smoke only (lobby add/remove AI visually correct)

---

## Acceptance Criteria

1. Host can add 1–(maxPlayers−1) AI opponents in the lobby, each with a chosen difficulty
2. AI tanks appear in the player list with a 🤖 badge and difficulty label
3. When it is an AI's turn, the shot fires automatically after the think delay with no human input
4. AI difficulty is visibly different: Moron fires wild, Bouncer lands consistently close
5. AI tanks shop between rounds using difficulty-appropriate logic
6. AI tanks equip shields according to their `shieldEquipChance`
7. All 5 difficulty tiers work with all 9 terrain types and all 4 wall modes
8. Full test suite passes; no regressions to Phases 1–6
