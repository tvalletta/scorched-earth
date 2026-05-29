# Phase 9 — Stability & Launch Design

**Milestone:** M9 from SPEC.md  
**Branch:** `feat/phase-9-stability-launch`  
**Date:** 2026-05-28  
**Phase 8 dependency:** None — all five subsystems are independent of mobile/accessibility work.

---

## Overview

Phase 9 ships five subsystems in dependency order. Each is independently testable before the next begins.

| # | Subsystem | Server | Client | Infra |
|---|-----------|--------|--------|-------|
| 1 | Reconnect + Ghost AI | ✓ | — | — |
| 2 | Spectator Mode | ✓ | ✓ | — |
| 3 | Match Replays | ✓ | ✓ | — |
| 4 | Load Testing | — | — | ✓ |
| 5 | Deploy + Monitoring | ✓ | — | ✓ |

---

## 1. Reconnect + Ghost AI Takeover

### Goal

When a player fails to reconnect within the 60-second grace window, their tank is taken over by a ghost AI rather than removed. The match continues uninterrupted.

### Current State

`MatchRoom.onLeave` calls `allowReconnection(client, RECONNECT_GRACE_SEC)`. On success, `tank.connected` is restored. On failure (catch block), the tank is deleted from `state.tanks`.

### New Behavior

Replace the `catch` block's `state.tanks.delete(client.sessionId)` with a ghost AI promotion:

```ts
} catch {
  // Promote disconnected tank to ghost AI instead of removing it
  const ghost = new AiSlot();
  ghost.sessionId = client.sessionId;
  ghost.difficulty = "shooter";
  ghost.nickname = tank.nickname;
  this.state.aiSlots.push(ghost);
  // Tank remains in state.tanks — ghost plays from here
}
```

### Why This Works Without New AI Code

`isAiTurn()` checks `this.state.aiSlots.find(s => s.sessionId === this.state.currentTurnPlayerId)`. Because the ghost `AiSlot.sessionId` matches the existing `Tank.playerId`, the turn scheduler immediately recognizes the ghost and calls `scheduleAiTurn()` on the next turn. All AI machinery (`think()`, `shopForAi()`) operates on `ThinkStateSnapshot` derived from `MatchState` — the ghost tank's inventory, HP, and position are already in there.

### Edge Cases

| Case | Behavior |
|------|----------|
| Ghost player tries to rejoin | `onJoin` sees `state.phase !== "lobby"`, adds them to `observers`. They spectate only — slot is not reclaimed. |
| Disconnected player was host | Host demotion already runs in `onLeave` before `allowReconnection` is called. No change needed. |
| All human players disconnect | Ghost AI slots fill all turns. Match runs to completion and `onDispose` fires normally. |
| Ghost is eliminated | `tank.alive = false`. Same handling as any AI tank — they're skipped in turn order. |

### Difficulty Default

`"shooter"` — mid-range difficulty. Not punishing (the ghost isn't trying to humiliate the surviving players) but competent enough to keep the round interesting.

### Schema Changes

None. `AiSlot` already exists in `MatchState.aiSlots`.

### Testing

- Unit test: `onLeave` with `consented: false` + reconnection timeout → `aiSlots` gains one entry matching the departed `sessionId`
- Integration: two-player match, disconnect P2 mid-game, confirm AI takes over turn

---

## 2. Spectator Mode

### Goal

Players who join a match in progress watch in read-only mode with a camera that follows the active player's turn.

### Server Side

**`onJoin` (no change needed):** already routes mid-game joiners to `observers`. Lobby joiners who arrive after match starts land in `observers` naturally.

**Intent guard (new):** at the top of `onMessage`, before any handler dispatch:

```ts
onMessage(client: Client, message: unknown): void {
  if (this.observers.has(client.sessionId)) return; // spectators silent
  // ... existing handler dispatch
}
```

Chat is intentionally excluded from this guard — chat intents flow through a separate handler path and spectators can chat.

**Observer cleanup:** `onLeave` already deletes from `observers`. No change needed.

### Client Side

**Spectator detection** — in `MatchScene`, after first `onStateChange`:

```ts
const isSpectator = !room.state.tanks.has(room.sessionId);
```

**When spectator mode is active:**
- Disable all keyboard and mouse input handlers (`InputManager` or equivalent)
- Replace the bottom HUD control panel (aim slider, power slider, fire button, weapon selector) with a single `👁 Spectating` badge at the same DOM/canvas position
- Camera: switch from tracking `myTank` to tracking `state.tanks.get(state.currentTurnPlayerId)` — re-evaluate on each `currentTurnPlayerId` change with a smooth tween to the new position
- Chat remains open and interactive

**Implementation scope:** ~40 lines of new client code, all within `MatchScene.ts` and the HUD component.

### Schema Changes

None. `observers` is a server-side `Set<string>` (not schema-synced). Client detects spectator status locally.

### Testing

- Server: observer sends fire intent → no state change, no error
- Client: join mid-match → spectator badge visible, controls absent, camera tracks active player across turns

---

## 3. Match Replays

### Goal

Server records each match as a replay file (round snapshots + intent log). Post-match screen offers download and inline watch. Replay is available via REST for 10 minutes after match end.

### Data Model

```ts
interface ReplayFile {
  version: 1;
  matchId: string;        // Colyseus room ID
  recordedAt: number;     // Unix ms
  rounds: RoundRecord[];
}

interface RoundRecord {
  roundNumber: number;
  snapshot: object;       // JSON.parse(JSON.stringify(MatchState)) at round start
  intents: IntentRecord[];
  carveOps: SerializedCarveOp[];
}

interface IntentRecord {
  ts: number;             // ms since match start
  playerId: string;
  kind: string;           // "fire" | "aim" | "buy" | "sell" | "ready-for-shop"
  payload: unknown;       // intent body
}

interface SerializedCarveOp {
  x: number; y: number; radius: number; tick: number;
}
```

### ReplayRecorder Class

New file: `apps/server/src/rooms/ReplayRecorder.ts`

```ts
class ReplayRecorder {
  private rounds: RoundRecord[] = [];
  private currentIntents: IntentRecord[] = [];
  private roundCarveStartIdx = 0;  // index into state.terrainOps at round start
  private matchStart = Date.now();

  captureRoundStart(roundNumber: number, state: MatchState): void
  captureIntent(playerId: string, kind: string, payload: unknown): void
  captureRoundEnd(state: MatchState): void
  // Captures only ops added this round: state.terrainOps.slice(roundCarveStartIdx),
  // then advances roundCarveStartIdx for next round.
  serialize(matchId: string): ReplayFile
}
```

**Call sites in MatchRoom:**

| Event | Call |
|-------|------|
| `startRound()` | `recorder.captureRoundStart(state.round, state)` |
| Each handled intent | `recorder.captureIntent(client.sessionId, kind, payload)` |
| Round transitions to `round-summary` | `recorder.captureRoundEnd(state)` |
| `onDispose()` | Store serialized replay in module-level cache |

### Server Storage

Module-level `Map<string, ReplayFile>` in `apps/server/src/rooms/replayStore.ts`:

```ts
// replayStore.ts
const store = new Map<string, ReplayFile>();
const TTL_MS = 10 * 60 * 1000; // 10 minutes

export function storeReplay(matchId: string, replay: ReplayFile): void {
  store.set(matchId, replay);
  setTimeout(() => store.delete(matchId), TTL_MS);
}

export function getReplay(matchId: string): ReplayFile | undefined {
  return store.get(matchId);
}
```

### REST Endpoint

Added to `apps/server/src/index.ts` alongside the existing Colyseus server setup:

```
GET /replays/:matchId
  200  application/json   ReplayFile
  404  { error: "not found" }
```

No authentication — replays are ephemeral and match IDs are unguessable room codes.

### Client — ReplayScene

New file: `apps/client/src/scenes/ReplayScene.ts`

**Entry point:** `MatchEndScene` adds two buttons:
- **"Download Replay"** — fetches `GET /replays/:matchId`, triggers `<a download="replay-{matchId}.json">` with the JSON blob
- **"Watch Replay"** — fetches the replay JSON, passes it to `ReplayScene`

**ReplayScene rendering:**
1. On load: restore terrain from `rounds[0].snapshot`; apply `rounds[0].carveOps` in sequence
2. Render all tanks at their snapshot positions
3. Step through `IntentRecord[]` for the round: fire intents drive `stepProjectiles` calls using the existing physics; carve ops are applied as terrain mutations
4. On round end: advance to next `RoundRecord`, restore its snapshot, repeat

**Playback controls:**
| Control | Action |
|---------|--------|
| `Space` | Play / pause |
| `[` | Previous round |
| `]` | Next round |
| `1` | 1× speed |
| `2` | 2× speed |

**Speed implementation:** `setInterval` tick rate is halved for 2× (16ms → 8ms effective frame step).

**No live server connection required** — `ReplayScene` operates entirely from the downloaded JSON.

### Testing

- Unit: `ReplayRecorder.serialize()` → correct structure, all rounds present
- Unit: `replayStore` TTL — entry deleted after 10 minutes (use fake timers)
- Integration: complete 2-round match → fetch `/replays/:id` → valid `ReplayFile`
- Client: `ReplayScene` loads replay and renders first round without crashing

---

## 4. Load Testing

### Goal

Verify the server handles 100 concurrent matches on a single instance: all rooms complete a round, p99 turn latency < 500ms, no memory leak over a 10-minute soak.

### Package

New pnpm workspace: `packages/loadtest/`

```
packages/loadtest/
  package.json         # @se/loadtest, uses @colyseus/loadtest
  src/
    index.ts           # scenario script
    scenario.ts        # client behavior
```

### Scenario

Each simulated client:
1. Connect to server, create a `LobbyRoom`
2. Start match (host `start-match` intent)
3. Wait for `phase === "playing"`
4. On each turn where `currentTurnPlayerId === room.sessionId`: wait 500ms, send `fire` intent with random `{ angle, power }`
5. On `phase === "ended"`: disconnect, wait 1s, loop

Two clients join each room so match reaches the 2-player minimum to start.

### Run Command

```sh
pnpm loadtest -- \
  --endpoint ws://localhost:2567 \
  --rooms 100 \
  --clients-per-room 2 \
  --duration 600
```

Root `package.json` alias: `"loadtest": "pnpm --filter @se/loadtest start"`.

### Pass Criteria

| Metric | Target |
|--------|--------|
| Rooms completing ≥1 round | 100 / 100 |
| p99 turn latency | < 500ms |
| Server RSS after 60s warmup | Flat (< 5% growth over 9 minutes) |
| Unhandled server exceptions | 0 |

Turn latency is measured in the scenario script: `Date.now()` at intent send, recorded timestamp of the state update where `phase` transitions back from `resolving` to `playing`.

### CI Note

Load test is not part of `pnpm test`. It runs manually pre-deploy or in a dedicated CI job against a staging instance. A separate npm script `"loadtest:staging"` targets the staging URL.

---

## 5. Deploy + Monitoring

### Dockerfile

Multi-stage build at repo root:

**Stage 1 — build:**
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @se/server build
```

**Stage 2 — runtime:**
```dockerfile
FROM node:20-alpine AS runtime
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json .
USER app
EXPOSE 2567
CMD ["node", "dist/index.js"]
```

### fly.toml

```toml
app = "scorched-earth"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 2567
  force_https = true
  auto_stop_machines = false   # WebSocket server must stay alive

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"

[checks]
  [checks.alive]
    type = "http"
    path = "/colyseus"
    interval = "10s"
    timeout = "3s"
    grace_period = "30s"
```

`auto_stop_machines = false` is critical — Fly's machine autostop would kill active WebSocket connections.

### Sentry

Install: `@sentry/node` in `apps/server/`.

Init in `apps/server/src/index.ts` before room registration:

```ts
import * as Sentry from "@sentry/node";
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV });
}
```

Capture in `MatchRoom.onError`:

```ts
onError(client: Client, error: Error): void {
  Sentry.captureException(error, { extra: { sessionId: client.sessionId } });
}
```

Set secret: `fly secrets set SENTRY_DSN=https://...@sentry.io/...`

### Metrics

**Colyseus Monitor** — built-in, enabled by default in `@colyseus/tools`. Accessible at `GET /colyseus`. Shows active rooms, client count, CPU/memory. No additional setup.

**Fly Metrics** — automatic: CPU, memory, network, request latency visible in the Fly.io dashboard. No instrumentation needed.

**No Prometheus/Grafana** — out of scope for v1. Colyseus Monitor + Fly Metrics covers the operational visibility needed at launch scale.

### Environment Variables

| Variable | Source | Purpose |
|----------|--------|---------|
| `PORT` | Fly (automatic) | Server listen port (defaults to 2567) |
| `NODE_ENV` | fly.toml | `"production"` — enables Sentry, disables verbose logging |
| `SENTRY_DSN` | Fly secret | Sentry ingest URL |

### Deployment Workflow

```sh
fly auth login                 # one-time
fly launch --no-deploy         # creates app, writes fly.toml if missing
fly secrets set SENTRY_DSN=... # one-time
fly deploy                     # builds Docker image, deploys
fly logs                       # tail production logs
fly status                     # check machine health
```

---

## Implementation Order & Dependencies

```
① Ghost AI      → no deps, touches only MatchRoom.onLeave
② Spectator     → no deps, touches MatchRoom.onMessage + client MatchScene
③ Replays       → depends on stable match flow (① done is sufficient)
④ Load test     → depends on ①②③ being stable (run against them)
⑤ Deploy        → can start Dockerfile in parallel with ①-③; Sentry wired last
```

## Files Changed (Projected)

| File | Change |
|------|--------|
| `apps/server/src/rooms/MatchRoom.ts` | Ghost AI in `onLeave`; intent guard in `onMessage`; replay recorder call sites |
| `apps/server/src/rooms/ReplayRecorder.ts` | New |
| `apps/server/src/rooms/replayStore.ts` | New |
| `apps/server/src/index.ts` | Sentry init; `GET /replays/:matchId` route |
| `apps/client/src/scenes/MatchScene.ts` | Spectator mode detection + camera |
| `apps/client/src/scenes/ReplayScene.ts` | New |
| `apps/client/src/scenes/MatchEndScene.ts` | Download + Watch buttons |
| `packages/loadtest/` | New workspace |
| `Dockerfile` | New |
| `fly.toml` | New |

## Test Coverage

Each subsystem ships with unit tests (vitest) covering the server-side logic and integration tests covering the happy path end-to-end. `ReplayScene` and spectator HUD are covered by Playwright e2e. Load test is a separate opt-in command.
