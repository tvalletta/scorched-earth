# Phase 3 — Economy & Shop (Design)

**Status:** Approved, ready for implementation planning.
**Date:** 2026-05-26.
**Parent docs:** `2026-05-22-roadmap.md` (phase plan), `SPEC.md` (full-game north star).
**Phase 2 design:** `2026-05-25-phase-2-damage-weapon-variety-design.md`
**Next:** `/superpowers:writing-plans` against this doc.

---

## Goal

Extend the Phase 2 skeleton with multi-round match support, a between-round economy (cash earned from damage, kills, and survival), a shop screen where players spend cash on weapons, a round summary screen with rank trends, and a match-end scoreboard. Every match now has a defined arc: earn → buy → fight → repeat.

---

## In Scope

- **Multi-round matches** — host configures 1–20 rounds (default 5) in the lobby
- **Cash system** — players start with $10,000; earn cash each round from damage dealt, kills, and survival; cash carries between rounds
- **Cash formula:** `100 × damage_dealt + 1000 × kills + 500 (if survived)`
- **Shop screen** — between rounds; grid cards + cart sidebar + round earnings breakdown; 30s countdown; short-circuits when all living players click Ready
- **Buy intent** — players purchase weapon packs; inventory is additive (stacks on top of carried-over ammo)
- **Round summary screen** — auto-advances after 5s; stats table (damage, kills, cash earned, cumulative total) with rank-change trend badges (▲▼—)
- **Match-end scoreboard** — winner banner, rounds-won table with dot-pip visualization, Rematch / New Room / Leave actions
- **Winner condition** — most rounds won; tiebreaker = most cash at match end
- **Fresh terrain each round** — new terrain seed derived from match seed + round number; carve log resets between rounds
- **`configure` intent extension** — host sets `maxRounds` in lobby alongside existing options

## Out of Scope (deferred)

| Feature | Phase |
|---|---|
| Shields, parachute, Patriot | 4 |
| Falling-tank damage | 4 |
| Terrain types & wall modes | 5 |
| Remaining 24 weapons | 6 |
| AI opponents | 7 |

---

## Cross-Phase Invariants Maintained

All Phase 1–2 invariants continue unchanged:
1. Deterministic `packages/game` — pure TS, seeded PRNG, no DOM/Node imports
2. Authoritative server — clients send intents, server owns all state and timing
3. State vs. events split — cash, round, and readyForShop in schema; summary payloads as broadcast events
4. Append-only terrain mutation log (reset each round, not carried over)
5. TDD discipline in `packages/game` — economy functions written test-first, ≥90% coverage target

---

## Architecture

### New files

```
packages/game/src/
  economy.ts          ← pure cash calculation + shop purchase validation

apps/client/src/scenes/
  RoundSummaryScene.ts   ← DOM overlay: stats table, rank trends, countdown
  ShopScene.ts           ← DOM overlay: earnings, weapon grid, cart sidebar, countdown
  MatchEndScene.ts       ← DOM overlay: winner banner, final table, action buttons
```

### Modified files

```
packages/shared/src/schema/MatchState.ts   ← round, maxRounds, roundsWon map
packages/shared/src/schema/Tank.ts         ← cash, damageDealtThisRound, killsThisRound, readyForShop
packages/shared/src/intents.ts             ← buy intent, ready-for-shop intent
apps/server/src/rooms/MatchRoom.ts         ← maxRounds configure, phase transitions
apps/server/src/rooms/resolveTurn.ts       ← cash award on round end, new round setup
apps/client/src/scenes/MatchScene.ts       ← mount/unmount overlay scenes on phase change
apps/client/src/scenes/LobbyScene.ts       ← maxRounds picker UI
```

---

## Section 1 — Data Model

### `MatchPhase` extension (`packages/shared/src/schema/MatchState.ts`)

```ts
export type MatchPhase =
  | "lobby"
  | "playing"
  | "resolving"
  | "round-summary"   // NEW: 5s auto-advance, broadcasts round results
  | "shopping"        // NEW: 30s countdown, players buy weapons
  | "ended";          // unchanged — set only at true match end (after final round)
```

### `MatchState` new fields

```ts
@type("number") round = 1;
@type("number") maxRounds = 5;
@type({ map: "number" }) roundsWon = new MapSchema<number>();
@type("number") shopDeadlineMs = 0;       // epoch ms when shopping phase ends
@type("number") summaryDeadlineMs = 0;    // epoch ms when round-summary ends
```

### `Tank` new fields

```ts
@type("number") cash = 10_000;
@type("number") damageDealtThisRound = 0;
@type("number") killsThisRound = 0;
@type("boolean") readyForShop = false;
```

`damageDealtThisRound` and `killsThisRound` reset to 0 at the start of each round. `cash` and `inventory` carry over. `readyForShop` resets to `false` at the start of each shopping phase.

### `Intent` extension (`packages/shared/src/intents.ts`)

```ts
| { kind: "buy"; weaponId: string }
| { kind: "ready-for-shop" }
| { kind: "configure"; turnTimerMs?: number; loadoutId?: string; maxRounds?: number }
```

---

## Section 2 — Economy (pure, `packages/game/src/economy.ts`)

```ts
export interface RoundEarnings {
  damageReward: number;   // 100 × damage_dealt
  killReward: number;     // 1000 × kills
  survivalBonus: number;  // 500 if survived, else 0
  total: number;
}

export function computeRoundEarnings(
  damageDealt: number,
  kills: number,
  survived: boolean,
): RoundEarnings

export interface PurchaseResult {
  ok: true;
  newCash: number;
  newInventory: Map<string, number>;
} | {
  ok: false;
  reason: "insufficient_funds" | "unknown_weapon";
}

export function validatePurchase(
  weaponId: string,
  currentCash: number,
  currentInventory: Map<string, number>,
  weaponRegistry: Map<string, WeaponDef & { price: number; packSize: number }>,
): PurchaseResult
```

`WEAPON_REGISTRY` entries gain `price` and `packSize` fields (Baby Missile has `price: 0, packSize: Infinity`). Both functions are pure — no side effects — and covered by unit tests before implementation.

---

## Section 3 — Round Flow (server)

### End-of-round sequence (triggered in `resolveTurn.ts` when `alive.length <= 1`)

1. Award winner a rounds-won increment: `state.roundsWon.set(winnerId, (state.roundsWon.get(winnerId) ?? 0) + 1)`
2. For each tank: call `computeRoundEarnings`, add total to `tank.cash`, store breakdown for broadcast
3. Broadcast `"round-summary"` event with per-player breakdown payload (damage, kills, survived, earned, previousRank, newRank)
4. Set `state.phase = "round-summary"`, `state.summaryDeadlineMs = now + 5_000`
5. Schedule after 5s → open shopping phase

### Opening shopping phase

1. Set `state.phase = "shopping"`, `state.shopDeadlineMs = now + 30_000`
2. Reset all `tank.readyForShop = false`
3. Schedule after 30s → start next round (or end match)

### `ready-for-shop` intent handler

- Sets `tank.readyForShop = true` for the sender
- If all living players have `readyForShop = true`: cancel the 30s timer and start next round immediately

### Starting the next round

If `state.round >= state.maxRounds`:
- Set `state.phase = "ended"`, broadcast `"match-end"` with final standings

Otherwise:
- Increment `state.round`
- Derive new `state.terrainSeed` from `match.seed + "_r" + state.round`
- Clear `state.terrainOps`
- Reset all tanks: restore HP to 100, reset `damageDealtThisRound`, `killsThisRound`, `readyForShop`, reposition on fresh terrain
- Set `state.phase = "playing"`, pick new `currentTurnPlayerId`, roll new wind

### `buy` intent handler (during `"shopping"` phase only)

- Look up weapon in registry; reject if unknown
- Call `validatePurchase`; reject if insufficient funds
- Deduct cost from `tank.cash`, add pack to `tank.inventory`

---

## Section 4 — Client Scenes

All three scenes are **DOM overlays** (same pattern as the existing weapon toolbar and HP bars). `MatchScene` mounts/unmounts them by watching `state.phase`.

### `RoundSummaryScene`

- Mounts when `state.phase === "round-summary"`
- Reads the `"round-summary"` broadcast event for per-player breakdown data
- Renders the stats table: rank, player, damage, kills, earned, cumulative cash
- Rank trend badge: compare `previousRank` vs `newRank` from event payload → ▲N green / ▼N red / — grey
- Gold progress bar drains from 100% → 0% over 5s using `summaryDeadlineMs`
- Unmounts on phase change

### `ShopScene`

- Mounts when `state.phase === "shopping"`
- **Left column**: earnings breakdown (this round's damage reward, kill reward, survival bonus, previous balance, total) + weapon grid cards
- **Weapon card**: icon, name, pack size, price; green border + BUY button if affordable; muted if not
- BUY button sends `{ kind: "buy", weaponId }` intent; card updates optimistically (client deducts cash locally, server confirms via schema sync)
- **Right sidebar**: current inventory, running cart (items purchased this session + running total spent), remaining cash
- **Ready button**: sends `{ kind: "ready-for-shop" }` intent; button disables and shows "Waiting…" after click
- Countdown bar drains from 100% → 0% over 30s using `shopDeadlineMs`
- "N of M players ready" shown below the Ready button
- Unmounts on phase change

### `MatchEndScene`

- Mounts when `state.phase === "ended"`
- Winner banner: gold border, player name, "Won X of Y rounds · $Z earned"
- Final standings table: rank, player, rounds won (dot pips ●●●○○), total damage, total kills, final cash
- Tiebreaker note (shown only if a tie exists): "Tiebreaker: most cash"
- Action buttons: Rematch (host-only, sends `configure` + `ready`), New Room (navigate to lobby), Leave (disconnect)

---

## Section 5 — Lobby Changes

### `maxRounds` picker

- Visible to host only, alongside existing turn timer and loadout controls
- Slider or stepper: 1–20, default 5, step 1
- Sends `{ kind: "configure", maxRounds: N }` on change

### Lobby display for guests

- "Best of N rounds" label shown to all players next to the room code

---

## Section 6 — Weapon Pricing

`WEAPON_REGISTRY` entries extended with `price` and `packSize`. Prices from SPEC §5:

| Weapon | Price | Pack |
|---|---|---|
| Baby Missile | 0 (free, infinite) | ∞ |
| Missile | 2,000 | 5 |
| Baby Nuke | 5,000 | 3 |
| Nuke | 10,000 | 2 |
| Funky Bomb | 8,000 | 3 |
| MIRV | 12,000 | 2 |

Phase 6 weapons will add more rows when implemented. The shop renders whatever weapons exist in the registry — no hardcoded list in the UI.

---

## Section 7 — Testing

### `packages/game` (TDD-first, ≥90% coverage)

- `computeRoundEarnings`: damage-only, kills-only, survived, not-survived, combined
- `validatePurchase`: affordable, unaffordable, unknown weapon, exact-cash boundary

### `apps/server` (integration, ≥70% coverage)

- Full round-end flow: cash awarded, phase transitions to round-summary → shopping → playing
- `buy` intent accepted during shopping, rejected during playing
- `ready-for-shop` short-circuits timer when all players ready
- Multi-round match ends correctly after `maxRounds` rounds
- Match-end triggers when `round >= maxRounds`

### E2E (Playwright smoke)

- 2-player match, 2 rounds: verify round-summary appears, shop opens, player can buy, next round starts
- Verify match-end scoreboard appears after final round

---

## Section 8 — Defaults & Constants

```ts
// packages/shared/src/constants.ts
export const DEFAULT_MAX_ROUNDS = 5;
export const DEFAULT_STARTING_CASH = 10_000;
export const ROUND_SUMMARY_DURATION_MS = 5_000;
export const SHOP_DURATION_MS = 30_000;
export const DAMAGE_REWARD_RATE = 100;   // $ per damage point
export const KILL_REWARD = 1_000;        // $ per kill
export const SURVIVAL_BONUS = 500;       // $ for surviving the round
```

---

*End of Phase 3 design doc.*
