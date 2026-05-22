# Phase 1 — Multiplayer Skeleton (Design)

**Status:** Draft, awaiting user approval.
**Date:** 2026-05-22.
**Parent docs:** `2026-05-22-roadmap.md` (phase plan), `SPEC.md` (full-game north star).
**Next:** On approval → `/superpowers:writing-plans` against this doc.

---

## Goal

Two real browsers, on different machines, complete a full match of Scorched Earth — from typing a 6-character room code to one player winning — in under 5 minutes from cold start. The match has up to 10 tanks, one weapon (Baby Missile, infinite), wind + gravity, destructible terrain, and decent Cartoon-Illustrative graphics. Single round per match; rematch button returns to lobby.

This phase establishes every load-bearing system (networking, deterministic physics, render pipeline, scene management, state schema) that every subsequent phase will build on. **No phase 1 decision should make a later phase's job harder.**

---

## In scope

- Colyseus server with `LobbyRoom` (singleton, matchmaking + room codes) and `MatchRoom` (one per active match)
- 6-character alphanumeric room codes (`[A-Z0-9]{6}`); copy-link button
- Up to 10 players per match
- Color + nickname + hat selection (4 starter hats: none, chef, top-hat, beanie)
- One terrain type: **Random** (Perlin-noise hills)
- Wind variance per turn (−10 to +10, integer)
- Gravity (single value: 9.8; configurability lands in Phase 3)
- Aim controls: mouse drag (primary), keyboard ← → ↑ ↓ (fallback, 1°/1 power, Shift = 5°/10 power)
- **One weapon: Baby Missile** (free, infinite ammo, radius 20, damage 25)
- Projectile physics: ballistic + wind + gravity, sub-tick collision against terrain
- Terrain destruction: circular carve on impact, column collapse fills voids
- Tank HP (100), splash damage with linear falloff from impact center
- Death detection + last-alive-wins
- Wall mode: **None** (projectiles vanish off-screen)
- Single round per match; "Rematch" button returns all players to lobby
- 30s turn timer (host-configurable; 0 = no timer)
- Reconnect: 60s grace via Colyseus `allowReconnection`; tank skips its turn if disconnected on its turn
- Host migration on host disconnect (oldest sessionId becomes new host)
- Cartoon-Illustrative art direction at "decent placeholder" fidelity (per `2026-05-22-roadmap.md` and the brainstorm visual companion)
- Vitest unit + integration tests, Playwright E2E + visual smoke

## Explicitly out of scope (deferred to listed phase)

| Feature | Deferred to phase |
|---|---|
| Other 29 weapons | 2, 6 |
| Damage variety (different weapon classes) | 2 |
| Shields, parachute, battery, Patriot | 4 |
| Tank driving / fuel | 4 |
| Falling-tank damage | 4 |
| Multi-round play / economy / shop | 3 |
| Other 8 terrain types | 5 |
| Other 3 wall modes | 5 |
| AI bots | 7 |
| SFX, music, voice | 9 |
| Touch / mobile UX | 10 |
| Spectator mode | 11 |
| Match replays | 11 |
| Public deployment | 11 (Phase 1 runs on localhost) |

---

## Cross-phase invariants this phase establishes

(See `2026-05-22-roadmap.md` for the full list. Phase 1 puts these in place.)

1. **Deterministic `packages/game`** — pure TS, no DOM/Node imports, seeded PRNG.
2. **Authoritative Colyseus server** — clients send intents, server owns state.
3. **State (Colyseus schema) vs. events (broadcasts)** split — schema for late-joiner reconstruction, events for transient animation triggers.
4. **Append-only terrain mutation log** — `CarveOp[]` in state; clients regenerate terrain from seed + replay ops.
5. **TDD discipline in `packages/game`** — test before implementation, ≥90% coverage.

---

## Architecture

### Repo layout (pnpm workspaces)

```
scorched-earth/
├── packages/
│   ├── game/                       # Pure TS. Physics, terrain, damage. No DOM, no Node.
│   │   └── src/
│   │       ├── physics/simulate.ts
│   │       ├── physics/damage.ts
│   │       ├── terrain/generate.ts
│   │       ├── terrain/carve.ts
│   │       ├── rng/prng.ts
│   │       └── weapons/baby-missile.ts
│   ├── shared/                     # Colyseus schema, intent types, constants.
│   │   └── src/
│   │       ├── schema/MatchState.ts
│   │       ├── schema/Tank.ts
│   │       ├── schema/CarveOp.ts
│   │       ├── intents.ts
│   │       └── constants.ts
│   └── tsconfig/                   # Shared tsconfig presets.
├── apps/
│   ├── server/                     # Colyseus. Depends on @se/game + @se/shared.
│   │   └── src/
│   │       ├── index.ts            # boots Colyseus
│   │       ├── rooms/LobbyRoom.ts
│   │       ├── rooms/MatchRoom.ts
│   │       ├── rooms/turnController.ts
│   │       ├── rooms/resolveTurn.ts
│   │       └── codeGen.ts          # 6-char room codes
│   └── client/                     # Vite + PixiJS + colyseus.js. Depends on @se/game + @se/shared.
│       └── src/
│           ├── main.ts
│           ├── scenes/LobbyScene.ts
│           ├── scenes/MatchScene.ts
│           ├── render/Terrain.ts
│           ├── render/Sky.ts
│           ├── render/Tank.ts
│           ├── render/Projectile.ts
│           ├── render/Explosion.ts
│           ├── hud/WindArrow.ts
│           ├── hud/TurnTimer.ts
│           ├── hud/PlayerList.ts
│           └── input/AimControls.ts
├── docs/superpowers/specs/
├── tests/
│   └── e2e/                        # Playwright
└── pnpm-workspace.yaml
```

### Why `packages/game` is shared between server and client

- Server uses it for authoritative simulation.
- Client uses it for terrain *regeneration* from the seed (so we don't ship the heightmap; we ship seed + carve op list).
- A pure-TS package is testable in isolation and prevents environment-coupling bugs.

---

## Data flow

### Connection

```
Client opens app
  → connects to Colyseus WS endpoint (ws://localhost:2567 in dev)
  → joinOrCreate("lobby")                # singleton LobbyRoom
  → user picks nickname/color/hat
  → user clicks "Create" OR enters room code
  → joinByCode(code, { nickname, color, hat })   # MatchRoom

Host configures (turn timer)
  → presses Start
  → MatchRoom: phase = "playing", generates terrain, places tanks, broadcasts state
```

### Turn loop

```
while alive_count > 1:
  currentTurnPlayerId = next alive player in turn order
  wind = randomInt(-10, +10)             # via packages/game/rng (seeded)
  turnDeadlineMs = now() + turnTimerMs
  broadcast state                        # Colyseus syncs automatically

  await one of:
    - intent FIRE from current player (with locked angle, power)
    - turn timer expiration → auto-fire with last AIM, or default (90°, 500) if none

  // server simulates entire trajectory in packages/game
  result = simulateProjectile({
    weapon: "baby-missile",
    origin: tank.position,
    angle, power, wind, gravity,
    terrain: currentTerrain,
    walls: "none",
    targets: tanks,
  })
  // result: { samples: [{x,y,t}, ...], impact, terrainCarve, damages, durationMs }

  broadcast event "trajectory-resolved" with result
  // Clients animate from samples over result.durationMs

  await sleep(result.durationMs + 200ms buffer)

  apply terrain carve to canonical terrain
  apply damages
  apply tank-death rule (HP ≤ 0 → alive = false)
  push state updates (terrainOps, tank.hp, tank.alive)

if alive_count <= 1:
  broadcast event "match-end" with winnerId (or "" for draw)
  phase = "ended"
  after 5s → all players returned to lobby room
```

### Two notable design calls

1. **`AIM` is local-only in Phase 1.** The aiming player updates angle/power on their own client; only the final `FIRE` message hits the server. Saves bandwidth, avoids "wiggling cannon" UX issues. Spectators (Phase 11) won't see live aim — that's acceptable because spectators don't exist in Phase 1.

2. **Server waits `durationMs + 200ms` before committing damage and starting the next turn.** Damage is computed *before* the wait; the wait is purely visual pacing so clients can finish the animation. Race-free because damage is computed once and broadcast once.

---

## Components

### `packages/game`

| Module | Function signatures (target) |
|---|---|
| `terrain/generate.ts` | `generateTerrain(seed: string, type: TerrainType, width: number): Int16Array` |
| `terrain/carve.ts` | `applyCarve(heightmap: Int16Array, op: CarveOp): Int16Array`, `carveInPlace(heightmap: Int16Array, op: CarveOp): void` |
| `physics/simulate.ts` | `simulateProjectile(input: SimInput): TrajectoryResult`. Integrates at fixed dt=1/60s; emits one sample per tick; downsamples to ≤100 samples per shot if needed (long shots in low gravity); always includes first + impact samples. |
| `physics/damage.ts` | `computeDamage(impact: Point, weapon: WeaponDef, targets: TargetInfo[]): DamageEntry[]` |
| `weapons/baby-missile.ts` | `export const babyMissile: WeaponDef = { radius: 20, damage: 25, windImmune: false }` |
| `rng/prng.ts` | `createPrng(seed: string): { nextFloat(): number; nextInt(min, max): number }` (xoshiro128**) |

All functions are pure. No `Math.random()`. No globals.

### `apps/server`

| Component | Responsibility |
|---|---|
| `index.ts` | Boots Colyseus server, defines transport, registers rooms. |
| `LobbyRoom` | Singleton (`autoDispose=false`). Tracks open MatchRooms. Generates room codes. Forwards `createMatch` → spawn MatchRoom; `listMatches` → returns open rooms. |
| `MatchRoom` | One instance per match. Holds `MatchState`. Implements turn controller. Validates intents. Calls `simulateProjectile`. Broadcasts results. |
| `MatchRoom/turnController.ts` | Helpers: `nextTurnPlayer(state) → playerId`, `startTurn(state)`, `expireTurn(state)`. |
| `MatchRoom/resolveTurn.ts` | Builds `SimInput`, calls `simulateProjectile`, broadcasts result, schedules state commit. |
| `codeGen.ts` | `generateRoomCode(existingCodes: Set<string>): string` — uniformly random `[A-Z0-9]{6}`, retries on collision. |

### `apps/client`

| Scene/Component | Responsibility |
|---|---|
| `LobbyScene` | Nickname / color / hat picker, "Create" button, "Join by code" input, list of open matches (refreshed from LobbyRoom state). |
| `MatchScene` | Owns the PIXI Application + stage. Subscribes to MatchRoom state changes via colyseus.js. Wires up renderers + HUD + input. |
| `render/Terrain` | Reads heightmap (regenerated from `terrainSeed` + replayed `terrainOps`), draws as PIXI Graphics polygon. Re-renders on new carve op. Scatters grass-tuft sprites every ~40px on the top surface. |
| `render/Sky` | Cartoon sky: light-blue gradient + a few cloud sprites. (Parallax deferred to Phase 8.) |
| `render/Tank` | Body + turret + hat. Turret angle interpolates toward `tank.angle` via lerp at 0.2/frame. Outline stroke per Cartoon-Illustrative direction. |
| `render/Projectile` | Plays `TrajectoryResult.samples` over `durationMs`. Circle + dashed motion-trail. Removed at impact. |
| `render/Explosion` | Particle burst on impact via PIXI ParticleContainer. ~80 particles, 600ms lifespan, mix of fireball + smoke + ember colors. |
| `hud/WindArrow` | Top-center arrow. Length proportional to `|wind|`. Direction by sign. Label "Calm" if `|wind| <= 1`. |
| `hud/TurnTimer` | Countdown ring around current player's portrait. Color shifts amber → red as deadline approaches. |
| `hud/PlayerList` | Right-side panel: color swatch, name, HP bar per player. Crossed-out when `alive = false`. |
| `input/AimControls` | Mouse drag from tank → vector (angle = vector angle, power = |vector| clamped 0–1000). Keyboard ← → angle (1°/5° w/ Shift), ↑ ↓ power (1/10 w/ Shift). Fire on click of "Fire" button or Space. |

### `packages/shared`

- `schema/MatchState.ts`, `schema/Tank.ts`, `schema/CarveOp.ts` — `@colyseus/schema` classes (see Data Models below).
- `intents.ts` — discriminated-union types for `AIM`, `FIRE`, `CONFIGURE`, `READY`, `CHAT` (chat is Phase 1 minimal: text only).
- `constants.ts` — `TERRAIN_WIDTH = 1600`, `TERRAIN_HEIGHT = 900`, `MAX_PLAYERS = 10`, `DEFAULT_TURN_TIMER_MS = 30_000`, `RECONNECT_GRACE_SEC = 60`, `BABY_MISSILE_RADIUS = 20`, `BABY_MISSILE_DAMAGE = 25`, `VELOCITY_SCALE` — starting value `0.5`; tune empirically in implementation so a power-500 / 45° shot on default gravity / 0 wind travels ~half terrain width.

---

## Data models

### Colyseus `MatchState` (authoritative, replicated)

```ts
class MatchState extends Schema {
  @type("string") phase: "lobby" | "playing" | "resolving" | "ended" = "lobby";
  @type("string") roomCode: string;
  @type("string") hostId: string;
  @type("number") tick: number = 0;
  @type("number") wind: number = 0;             // -10..+10
  @type("number") gravity: number = 9.8;
  @type("string") terrainSeed: string;          // e.g. "K3X9P2-v1"
  @type("string") terrainType: string = "random";
  @type("number") terrainVersion: number = 0;   // bumped on carve
  @type([CarveOp]) terrainOps = new ArraySchema<CarveOp>();
  @type("string") currentTurnPlayerId: string = "";
  @type("number") turnDeadlineMs: number = 0;
  @type("number") turnTimerMs: number = 30_000;
  @type("number") maxPlayers: number = 10;
  @type({ map: Tank }) tanks = new MapSchema<Tank>();
  @type("string") winnerId: string = "";        // set when phase="ended"
}

class Tank extends Schema {
  @type("string") playerId: string;
  @type("string") sessionId: string;
  @type("string") nickname: string;
  @type("string") color: string;                // "red" | "blue" | "green" | "yellow" | "cyan" | "magenta" | "orange" | "white" | "pink" | "lime"
  @type("string") hat: string = "none";         // "none" | "chef" | "top-hat" | "beanie"
  @type("number") x: number;
  @type("number") y: number;
  @type("number") hp: number = 100;
  @type("number") angle: number = 90;           // 0-180
  @type("number") power: number = 500;          // 0-1000
  @type("boolean") alive: boolean = true;
  @type("boolean") connected: boolean = true;
}

class CarveOp extends Schema {
  @type("number") x: number;
  @type("number") y: number;
  @type("number") radius: number;
  @type("number") tick: number;
}
```

### Non-state messages (Colyseus `broadcast`)

| Event | Payload | Purpose |
|---|---|---|
| `trajectory-resolved` | `{ samples: { x: number, y: number, t: number }[], impact: { x, y }, weaponId: string, ownerId: string, durationMs: number }` | One-shot per shot. Client animates trail from samples. |
| `damage-applied` | `{ damages: { playerId: string, before: number, after: number }[] }` | Sent after playback so client can flash HP bars. |
| `match-end` | `{ winnerId: string }` | Trigger end-of-match UI. |
| `chat` | `{ from: string, text: string, ts: number }` | Phase 1 minimal: text only, no emote wheel. |

**Why split state vs events:** schemas auto-sync on *every* delta. Trajectory samples (~30 points per shot) would replicate to every client on every state mutation if put in the schema. Broadcast events fire once and don't bloat the schema diff.

**Why `terrainOps` *is* in state:** late-joiners and reconnecting clients need the full history to reconstruct the terrain. An append-only ArraySchema is the simplest correct way.

### Client-side terrain reconstruction

```ts
// On join, after MatchState arrives:
const terrain = generateTerrain(state.terrainSeed, "random", TERRAIN_WIDTH);
for (const op of state.terrainOps) {
  carveInPlace(terrain, op);
}
// Listen for new ops via Colyseus state callbacks:
state.terrainOps.onAdd((op) => {
  carveInPlace(terrain, op);
  terrainRenderer.requestRedraw();
});
```

### Intent shapes (client → server)

```ts
type Intent =
  | { kind: "aim"; angle: number; power: number }   // local-only in Phase 1 (NOT sent)
  | { kind: "fire"; angle: number; power: number }
  | { kind: "configure"; turnTimerMs: number }       // host only
  | { kind: "ready" }
  | { kind: "chat"; text: string };
```

`AIM` is reserved in the type for Phase 11 spectator support; Phase 1 does not send it.

---

## Error handling

### Bad client behavior

| Scenario | Server response |
|---|---|
| Client sends `FIRE` when not their turn | Drop, log warning with `playerId` and `currentTurnPlayerId`. |
| Client sends `FIRE` with angle outside 0–180 or power outside 0–1000 | Clamp to range; log. |
| Client sends intents >30/sec | Rate-limited via MatchRoom middleware; drop excess silently. |
| Client sends `CONFIGURE` and isn't the host | Drop, log. |
| Client sends gibberish / wrong intent shape | Drop, no log spam (could be malicious flood). |

### Connectivity

| Scenario | Behavior |
|---|---|
| Player disconnects mid-aim | `tank.connected = false`. 60s reconnect grace via Colyseus `allowReconnection(60)`. Tank persists. |
| Player disconnects mid-turn (it is their turn) | Turn timer continues. On expiration: auto-fire with their last `AIM` values, or default `(angle=90, power=500)` if no aim has been set this turn. |
| Player doesn't reconnect within 60s | Tank stays as a "ghost" — does nothing on its turn (skip). Still takes damage from incoming shots. Dies normally if HP hits 0. |
| Host disconnects | One of the remaining players is promoted to host (oldest sessionId). Match continues. |
| All players disconnect | MatchRoom auto-disposes after 60s idle. |
| Server crashes mid-match | Match is lost. Clients reconnect to lobby, see no active match. (Phase 11 will add persistence.) |

### Simulation edge cases

| Scenario | Handling |
|---|---|
| Projectile goes off-screen | walls=None: vanishes silently. `samples` end at the boundary timestamp; no impact event. |
| Projectile grazes terrain edge | `simulateProjectile` does sub-pixel collision: first time-step where `y > heightAt(x)` is the impact. |
| Two tanks at same column post-carve | Tanks are points (no driving in Phase 1). Post-carve, each tank's `y` clamps to `heightAt(tank.x)`. No falling damage in Phase 1. |
| Tank spawned mid-terrain (bad initial placement) | Pre-spawn step: for each tank, find the column's surface and place tank on top. Tanks spaced with min 100px separation; collisions resolved by jittering ±20px. |
| Damage round-off | All HP math in integers. Damage = `floor(maxDamage * (1 - dist/radius))`. Below 0 clamps to 0. |
| Tie — last two tanks die from one explosion | Both die. `winnerId = ""`. Match ends as a draw. UI shows "Mutually Assured Destruction" toast. |

### Server validation invariants (dev: assert, prod: soft-fail and log)

- `0 ≤ angle ≤ 180`
- `0 ≤ power ≤ 1000`
- `tank.hp ≥ 0`
- `samples.length ≥ 1` for every resolved shot
- `terrain[x] ≥ 0` after every carve

---

## Testing strategy

Tooling: **Vitest** (unit + integration), **@colyseus/testing** (room tests), **Playwright** (E2E + visual smoke). All new logic in `packages/game` is TDD-first.

### `packages/game` (target ≥90% coverage)

| Module | Key test cases |
|---|---|
| `terrain/generate` | Same seed → same heightmap (determinism). Different seeds → different. Heights always within `[0, TERRAIN_HEIGHT]`. |
| `terrain/carve` | Removes only inside-circle pixels. Column collapse drops upper terrain into voids. Idempotent on column floor. |
| `physics/simulate` | Known-input regression: vertical shot (angle=90, power=500, wind=0, gravity=normal) lands at origin. wind=+10 shifts impact right by expected delta. Off-screen exit produces no impact. Sub-pixel collision detected. |
| `physics/damage` | Linear falloff: at radius/2, damage = floor(maxDamage/2). Outside radius, damage = 0. Direct hit = maxDamage. Multiple targets in radius all damaged. |
| `rng/prng` | Same seed → same sequence. Reasonably uniform distribution over 10k samples. |

### `apps/server` (target ≥70% coverage)

| Scenario | Assertion |
|---|---|
| `LobbyRoom.createMatch` | Returns 6-char `[A-Z0-9]` code; 1000 sequential creates produce 1000 unique codes (or retries on collision). |
| `MatchRoom` join | Tank schema entry added; `phase` stays `"lobby"` until host starts. |
| `MatchRoom` turn ordering | After start, `currentTurnPlayerId` rotates through alive tanks in stable order. |
| `MatchRoom` FIRE auth | Non-current player firing → intent dropped, state unchanged. |
| `MatchRoom` turn timeout | If no FIRE before deadline → server auto-fires with last AIM or defaults. |
| `MatchRoom` reconnect | Drop client → reconnect within 60s → same tank, same HP, same color, `connected=true`. |
| `MatchRoom` host migration | Host leaves → next-oldest session becomes host (`hostId` updated). |
| `MatchRoom` damage commit | After playback window, `Tank.hp` reflects expected damages; `winnerId` set if only one alive. |

### `apps/client` (limited unit + E2E)

Most PixiJS visual code is impractical to unit-test in isolation; we cover with E2E + screenshot diffs.

- **Unit (Vitest):** Colyseus state → UI state mappers. Aim-input math (mouse drag vector → angle + power). HUD formatters (wind label, timer color).
- **E2E (Playwright):**
  - "Two players play a full match" — spins up server + two headless browsers, scripts P1 to fire at P2 until win, asserts match-end screen.
  - "Reconnect mid-match" — drops one client, reconnects after 30s, asserts state restored.
  - "Lobby create + join" — tab 1 creates room, tab 2 joins by code, both see each other in lobby list.
- **Visual smoke (Playwright screenshots):** lobby screen, first-shot-in-flight, explosion frame, match-end screen, at 1280×720 and 1920×1080. Diff against baselines on PR.

### CI

- Single GitHub Actions workflow: install pnpm, run `pnpm test`, run `pnpm test:e2e` (headed Playwright with `xvfb` on Linux). Fail on coverage thresholds.

---

## Acceptance criteria (definition of done)

- ✅ Two real browsers on different machines complete a full match (lobby → fire → win → return-to-lobby) in <5 minutes from cold start.
- ✅ Server runs 10 concurrent 10-player matches at <50% CPU on a 2-core dev box.
- ✅ `packages/game` test coverage ≥90%; all functions deterministic.
- ✅ `apps/server` test coverage ≥70%.
- ✅ Reconnect within 60s preserves tank state (HP, color, hat, position).
- ✅ Host migration works when host disconnects mid-match.
- ✅ All HUD elements render correctly at 720p and 1080p.
- ✅ Visual smoke screenshots match baselines (or have approved PR diffs).
- ✅ Full match completes with no console errors on either client.
- ✅ This doc updated to "Status: implemented" with a date.

---

## Open questions for this phase

| Question | Default if unanswered before plan |
|---|---|
| Hosting target for Phase 1 demos? | Localhost only. Public deploy lives in Phase 11. |
| Final game title / brand? | Working title "Scorched Earth (working title)". Brand decision deferred. |
| Game loop frame rate cap? | 60fps. |
| Initial canvas resolution? | 1600×900 logical, scaled to viewport with letterboxing. |

---

## Migration notes for later phases (recorded for future-me)

- **Phase 2 (Damage & Weapons):** Will add `WeaponId` enum, weapon catalog with stats. Generalize `simulateProjectile` to dispatch by weapon (some weapons split mid-air, some bounce, etc.). The signature stays.
- **Phase 3 (Economy):** Adds `Tank.cash`, `Tank.inventory`, shop state machine. `phase` enum gains `"shop"` value. Multi-round changes require `currentRound: number` on MatchState.
- **Phase 4 (Defenses + Movement):** Requires **netcode migration from B → A**. Patriot intercepts need server tick stream to evaluate projectile positions in-flight. Plan: implement tick-stream path in parallel with batch path; toggle per match. Once Phase 4 ships, batch path can be deleted.
- **Phase 5 (Terrain & Walls):** Adds `WallMode` enum to MatchState. `simulateProjectile` already takes a `walls` arg in Phase 1; just extend.
- **Phase 11 (Replays):** All match RNG already flows through `terrainSeed` + per-turn wind draws; replay = re-run from seed + intent log. Plan to record intent log to a file from Phase 1 onward (even though playback comes later).

---

*End of Phase 1 design.*
