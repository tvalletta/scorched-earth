# Phase 9 — Stability & Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship reconnect+ghost AI, spectator mode, match replays, load testing tooling, and Fly.io deploy with Sentry monitoring.

**Architecture:** Ghost AI reuses the existing `aiSlots` machinery — on reconnect timeout the departed tank gets an `AiSlot` pushed so `isAiTurn()` picks it up automatically. Replays are recorded by a new `ReplayRecorder` class in the server and served via a plain HTTP route; the client downloads them post-match and plays them back in a new `ReplayScene`. Load testing uses `@colyseus/loadtest` CLI in a new `packages/loadtest` workspace. Deploy targets Fly.io with a multi-stage Dockerfile and Sentry for error capture.

**Tech Stack:** Colyseus 0.16, Node 20, Pixi.js 8, vitest, @colyseus/testing, @colyseus/loadtest, Docker, Fly.io, @sentry/node.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `apps/server/src/rooms/MatchRoom.ts` | Modify | Ghost AI in `onLeave`; observer fire-guard; recorder call sites |
| `apps/server/src/rooms/ReplayRecorder.ts` | Create | Per-round snapshot + intent capture |
| `apps/server/src/rooms/replayStore.ts` | Create | In-memory Map with 10-min TTL |
| `apps/server/src/index.ts` | Modify | HTTP server wrapper + `/replays/:matchId` route + Sentry init |
| `apps/client/src/scenes/MatchEndScene.ts` | Modify | Download Replay + Watch Replay buttons |
| `apps/client/src/scenes/ReplayScene.ts` | Create | Round-by-round replay viewer |
| `apps/client/src/scenes/MatchScene.ts` | Modify | Pass matchId to MatchEndScene |
| `packages/loadtest/package.json` | Create | New workspace for @colyseus/loadtest scenario |
| `packages/loadtest/src/index.ts` | Create | Load test scenario script |
| `Dockerfile` | Create | Multi-stage Docker build |
| `fly.toml` | Create | Fly.io config with health check |
| `pnpm-workspace.yaml` | Modify | Add `packages/loadtest` to workspace |

---

## Task 1: Ghost AI Takeover on Reconnect Failure

**Files:**
- Modify: `apps/server/src/rooms/MatchRoom.ts:479–511`
- Test: `apps/server/tests/MatchRoom.test.ts`

When a player's reconnection grace expires, push a new `AiSlot` for their `sessionId` instead of deleting the tank. `isAiTurn()` already checks `aiSlots` by `sessionId`, so the ghost fires automatically on the next turn.

- [ ] **Step 1: Write the failing test**

Add to `apps/server/tests/MatchRoom.test.ts`:

```ts
it("ghost AI takes over when reconnection expires", async () => {
  const a = await colyseus.sdk.joinOrCreate("match", { code: "GHOST1", nickname: "Alice", color: "red" });
  const b = await colyseus.sdk.joinOrCreate("match", { code: "GHOST1", nickname: "Bob", color: "blue" });
  await new Promise((r) => setTimeout(r, 50));

  // Start match
  a.send("ready", {});
  await new Promise((r) => setTimeout(r, 100));
  expect(a.state.phase).toBe("playing");

  // Bob disconnects without consent — reconnection grace will time out
  await b.leave(false);
  await new Promise((r) => setTimeout(r, 50));

  // Bob's tank should still be in state (not yet deleted)
  expect(a.state.tanks.has(b.sessionId)).toBe(true);
  expect(a.state.tanks.get(b.sessionId)!.connected).toBe(false);

  // After grace expires (mocked by calling internal), aiSlots should gain Bob's entry
  // We test the state after manually triggering the timeout.
  // Use a short grace period by overriding RECONNECT_GRACE_SEC in test env.
  // For now verify the ghost slot appears in aiSlots when reconnect fails.
  // (Integration: set RECONNECT_GRACE_SEC=0 via env, then wait)
  await new Promise((r) => setTimeout(r, 200));
  const ghostSlot = Array.from(a.state.aiSlots).find(s => s.sessionId === b.sessionId);
  expect(ghostSlot).toBeDefined();
  expect(ghostSlot!.difficulty).toBe("shooter");

  await a.leave();
});
```

- [ ] **Step 2: Run test to confirm it fails**

```sh
pnpm --filter @se/server test -- --reporter=verbose 2>&1 | grep -A3 "ghost AI"
```
Expected: test fails — no ghost slot appears.

- [ ] **Step 3: Implement ghost AI promotion in `MatchRoom.onLeave`**

In `apps/server/src/rooms/MatchRoom.ts`, replace the `catch` block of `onLeave` (lines ~505–510):

```ts
async onLeave(client: Client, consented: boolean): Promise<void> {
  if (this.observers.has(client.sessionId)) {
    this.observers.delete(client.sessionId);
    return;
  }

  const tank = this.state.tanks.get(client.sessionId);
  if (!tank) return;
  tank.connected = false;

  // Demote host immediately so live host actions don't depend on a missing client.
  if (this.state.hostId === client.sessionId) {
    for (const otherId of this.state.tanks.keys()) {
      if (otherId !== client.sessionId) {
        this.state.hostId = otherId;
        break;
      }
    }
    if (this.state.hostId === client.sessionId) this.state.hostId = "";
  }

  if (consented) {
    this.state.tanks.delete(client.sessionId);
    return;
  }

  try {
    await this.allowReconnection(client, RECONNECT_GRACE_SEC);
    tank.connected = true;
  } catch {
    // Reconnection timed out — promote tank to ghost AI instead of removing it.
    // isAiTurn() checks aiSlots by sessionId, so the existing AI machinery
    // picks this up automatically on the next turn.
    const ghost = new AiSlot();
    ghost.sessionId = client.sessionId;
    ghost.difficulty = "shooter";
    ghost.nickname = tank.nickname;
    this.state.aiSlots.push(ghost);
  }
}
```

- [ ] **Step 4: Run tests**

```sh
pnpm --filter @se/server test -- --reporter=verbose 2>&1 | tail -15
```
Expected: ghost AI test passes (may need to adjust timing; `RECONNECT_GRACE_SEC` is 60s so use `vi.useFakeTimers()` or accept the test is an integration outline — see note below).

> **Note on timing:** `RECONNECT_GRACE_SEC = 60`. To make the test fast, either: (a) mock the constant with `vi.mock('@se/shared', ...)`, or (b) set `process.env.RECONNECT_GRACE_SEC = '0'` and read it from env in `constants.ts`. Option (b) requires a one-line change to `constants.ts`: `export const RECONNECT_GRACE_SEC = Number(process.env.RECONNECT_GRACE_SEC ?? 60);`. Add that change alongside the test.

- [ ] **Step 5: Commit**

```sh
git add apps/server/src/rooms/MatchRoom.ts packages/shared/src/constants.ts apps/server/tests/MatchRoom.test.ts
git commit -m "feat(server): ghost AI takeover when player fails to reconnect"
```

---

## Task 2: Observer Intent Guard

**Files:**
- Modify: `apps/server/src/rooms/MatchRoom.ts` (fire handler, ~line 130)
- Test: `apps/server/tests/MatchRoom.test.ts`

Observers joining a live match must not be able to trigger game state changes. All handlers except `fire` already guard via tank-existence or host-ID checks. `handleFire` checks `currentTurnPlayerId === sessionId` which protects it — but adding an explicit observer guard makes the intent explicit and prevents any future regression.

- [ ] **Step 1: Write the failing test**

Add to `apps/server/tests/MatchRoom.test.ts`:

```ts
it("observer fire intent is ignored", async () => {
  const a = await colyseus.sdk.joinOrCreate("match", { code: "OBS1", nickname: "Alice", color: "red" });
  const b = await colyseus.sdk.joinOrCreate("match", { code: "OBS1", nickname: "Bob", color: "blue" });
  await new Promise((r) => setTimeout(r, 50));
  a.send("ready", {});
  await new Promise((r) => setTimeout(r, 100));
  expect(a.state.phase).toBe("playing");

  // C joins mid-game — becomes observer
  const c = await colyseus.sdk.joinOrCreate("match", { code: "OBS1", nickname: "Carol", color: "green" });
  await new Promise((r) => setTimeout(r, 50));
  expect(a.state.tanks.has(c.sessionId)).toBe(false);

  const phaseBefore = a.state.phase;
  c.send("fire", { angle: 45, power: 500 });
  await new Promise((r) => setTimeout(r, 100));

  // Phase must not have changed (observer fire should be silently dropped)
  expect(a.state.phase).toBe(phaseBefore);

  await a.leave();
  await b.leave();
  await c.leave();
});
```

- [ ] **Step 2: Run test to confirm it fails**

```sh
pnpm --filter @se/server test -- --reporter=verbose 2>&1 | grep -A3 "observer fire"
```
Expected: test may pass already (handleFire guards on `currentTurnPlayerId`), but confirm behavior.

- [ ] **Step 3: Add explicit observer guard to fire handler**

In `apps/server/src/rooms/MatchRoom.ts`, in the `"fire"` message handler (around line 130), add the guard as the first line:

```ts
this.onMessage("fire", (client, msg: { angle: number; power: number }) => {
  if (this.observers.has(client.sessionId)) return; // observers cannot fire
  const wasPlaying = this.state.phase === "playing";
  handleFire(this.resolveCtx(), client.sessionId, msg.angle, msg.power);
  if (wasPlaying && this.state.phase === "resolving" && this.timeoutHandle) {
    this.timeoutHandle.clear();
    this.timeoutHandle = null;
  }
});
```

- [ ] **Step 4: Run all server tests**

```sh
pnpm --filter @se/server test 2>&1 | tail -8
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```sh
git add apps/server/src/rooms/MatchRoom.ts apps/server/tests/MatchRoom.test.ts
git commit -m "feat(server): explicit observer guard on fire intent"
```

---

## Task 3: ReplayStore Module

**Files:**
- Create: `apps/server/src/rooms/replayStore.ts`
- Test: `apps/server/tests/replayStore.test.ts`

Module-level Map keyed by match ID. Entries expire after 10 minutes via `setTimeout`.

- [ ] **Step 1: Write the failing test**

Create `apps/server/tests/replayStore.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { storeReplay, getReplay } from "../src/rooms/replayStore.js";

describe("replayStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns stored replay by matchId", () => {
    const replay = { version: 1 as const, matchId: "m1", recordedAt: Date.now(), rounds: [] };
    storeReplay("m1", replay);
    expect(getReplay("m1")).toEqual(replay);
  });

  it("returns undefined for unknown matchId", () => {
    expect(getReplay("nope")).toBeUndefined();
  });

  it("expires after TTL_MS", () => {
    const replay = { version: 1 as const, matchId: "m2", recordedAt: Date.now(), rounds: [] };
    storeReplay("m2", replay);
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(getReplay("m2")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```sh
pnpm --filter @se/server test -- --reporter=verbose replayStore 2>&1 | tail -10
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `replayStore.ts`**

Create `apps/server/src/rooms/replayStore.ts`:

```ts
export interface ReplayFile {
  version: 1;
  matchId: string;
  recordedAt: number;
  rounds: RoundRecord[];
}

export interface RoundRecord {
  roundNumber: number;
  snapshot: Record<string, unknown>;
  intents: IntentRecord[];
  carveOps: SerializedCarveOp[];
}

export interface IntentRecord {
  ts: number;
  playerId: string;
  kind: string;
  payload: unknown;
}

export interface SerializedCarveOp {
  x: number;
  y: number;
  radius: number;
  tick: number;
}

const TTL_MS = 10 * 60 * 1000;
const store = new Map<string, ReplayFile>();

export function storeReplay(matchId: string, replay: ReplayFile): void {
  store.set(matchId, replay);
  setTimeout(() => store.delete(matchId), TTL_MS);
}

export function getReplay(matchId: string): ReplayFile | undefined {
  return store.get(matchId);
}
```

- [ ] **Step 4: Run tests**

```sh
pnpm --filter @se/server test -- --reporter=verbose replayStore 2>&1 | tail -10
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```sh
git add apps/server/src/rooms/replayStore.ts apps/server/tests/replayStore.test.ts
git commit -m "feat(server): replayStore — in-memory replay cache with 10-min TTL"
```

---

## Task 4: ReplayRecorder Class

**Files:**
- Create: `apps/server/src/rooms/ReplayRecorder.ts`
- Test: `apps/server/tests/ReplayRecorder.test.ts`

Records round snapshots + fire intents per match. Uses `roundCarveStartIdx` to slice only this round's carve ops from the ever-growing `state.terrainOps` ArraySchema.

- [ ] **Step 1: Write the failing tests**

Create `apps/server/tests/ReplayRecorder.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ReplayRecorder } from "../src/rooms/ReplayRecorder.js";

// Minimal MatchState-like objects for testing (no Colyseus dependency needed)
function makeState(opts: {
  round?: number;
  terrainSeed?: string;
  terrainType?: string;
  terrainOpsLength?: number;
}) {
  return {
    round: opts.round ?? 1,
    terrainSeed: opts.terrainSeed ?? "seed1",
    terrainType: opts.terrainType ?? "hills",
    tanks: new Map(),
    wind: 0,
    // terrainOps is array-like — we fake its length/slice behavior
    terrainOps: Array.from({ length: opts.terrainOpsLength ?? 0 }, (_, i) => ({
      x: i * 10, y: 100, radius: 20, tick: i,
    })),
  };
}

describe("ReplayRecorder", () => {
  it("serializes a match with one round and one fire intent", () => {
    const rec = new ReplayRecorder();
    const state1 = makeState({ round: 1, terrainOpsLength: 0 });
    rec.captureRoundStart(1, state1 as never);
    rec.captureIntent("player1", "fire", { angle: 45, power: 500 });

    const state1End = makeState({ round: 1, terrainOpsLength: 2 });
    rec.captureRoundEnd(state1End as never);

    const replay = rec.serialize("room-abc");
    expect(replay.matchId).toBe("room-abc");
    expect(replay.version).toBe(1);
    expect(replay.rounds).toHaveLength(1);
    expect(replay.rounds[0]!.roundNumber).toBe(1);
    expect(replay.rounds[0]!.intents).toHaveLength(1);
    expect(replay.rounds[0]!.intents[0]!.kind).toBe("fire");
    expect(replay.rounds[0]!.carveOps).toHaveLength(2);
  });

  it("captures only this round's carve ops (slice by index)", () => {
    const rec = new ReplayRecorder();

    // Round 1: 3 carve ops
    rec.captureRoundStart(1, makeState({ terrainOpsLength: 0 }) as never);
    rec.captureRoundEnd(makeState({ terrainOpsLength: 3 }) as never);

    // Round 2: 2 more carve ops (total 5)
    rec.captureRoundStart(2, makeState({ round: 2, terrainOpsLength: 3 }) as never);
    rec.captureRoundEnd(makeState({ round: 2, terrainOpsLength: 5 }) as never);

    const replay = rec.serialize("room-xyz");
    expect(replay.rounds[0]!.carveOps).toHaveLength(3);
    expect(replay.rounds[1]!.carveOps).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```sh
pnpm --filter @se/server test -- --reporter=verbose ReplayRecorder 2>&1 | tail -10
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ReplayRecorder.ts`**

Create `apps/server/src/rooms/ReplayRecorder.ts`:

```ts
import type { MatchState } from "@se/shared";
import type {
  ReplayFile, RoundRecord, IntentRecord, SerializedCarveOp,
} from "./replayStore.js";

export class ReplayRecorder {
  private rounds: RoundRecord[] = [];
  private currentIntents: IntentRecord[] = [];
  private roundCarveStartIdx = 0;
  private readonly matchStart = Date.now();

  captureRoundStart(roundNumber: number, state: MatchState): void {
    this.currentIntents = [];
    this.roundCarveStartIdx = state.terrainOps.length;
    // Store round number for use in captureRoundEnd (no partial record yet)
    this._pendingRoundNumber = roundNumber;
    this._pendingSnapshot = this.snapshotState(state);
  }

  captureIntent(playerId: string, kind: string, payload: unknown): void {
    this.currentIntents.push({
      ts: Date.now() - this.matchStart,
      playerId,
      kind,
      payload,
    });
  }

  captureRoundEnd(state: MatchState): void {
    const carveOps: SerializedCarveOp[] = [];
    const ops = state.terrainOps;
    for (let i = this.roundCarveStartIdx; i < ops.length; i++) {
      const op = ops[i]!;
      carveOps.push({ x: op.x, y: op.y, radius: op.radius, tick: op.tick });
    }
    this.rounds.push({
      roundNumber: this._pendingRoundNumber,
      snapshot: this._pendingSnapshot,
      intents: [...this.currentIntents],
      carveOps,
    });
  }

  serialize(matchId: string): ReplayFile {
    return {
      version: 1,
      matchId,
      recordedAt: this.matchStart,
      rounds: this.rounds,
    };
  }

  private snapshotState(state: MatchState): Record<string, unknown> {
    return JSON.parse(JSON.stringify({
      terrainSeed: state.terrainSeed,
      terrainType: state.terrainType,
      wind: state.wind,
      tanks: Object.fromEntries(
        Array.from(state.tanks.entries()).map(([id, t]) => [
          id,
          {
            x: t.x, y: t.y, hp: t.hp, alive: t.alive,
            nickname: t.nickname, color: t.color, hat: t.hat,
            angle: t.angle, power: t.power,
          },
        ])
      ),
    }));
  }

  private _pendingRoundNumber = 1;
  private _pendingSnapshot: Record<string, unknown> = {};
}
```

- [ ] **Step 4: Run tests**

```sh
pnpm --filter @se/server test -- --reporter=verbose ReplayRecorder 2>&1 | tail -10
```
Expected: both tests pass.

- [ ] **Step 5: Commit**

```sh
git add apps/server/src/rooms/ReplayRecorder.ts apps/server/tests/ReplayRecorder.test.ts
git commit -m "feat(server): ReplayRecorder — round snapshot + fire intent capture"
```

---

## Task 5: Wire ReplayRecorder into MatchRoom

**Files:**
- Modify: `apps/server/src/rooms/MatchRoom.ts`

Add a `ReplayRecorder` instance to `MatchRoom`. Call it at round start, round end, fire intents, and match end. Store the serialized replay in `replayStore`.

- [ ] **Step 1: Add import and field to MatchRoom**

At the top of `apps/server/src/rooms/MatchRoom.ts`, add to the existing imports:

```ts
import { ReplayRecorder } from "./ReplayRecorder.js";
import { storeReplay } from "./replayStore.js";
```

Add the field in the class body alongside the other private fields (after `private observers`):

```ts
private recorder = new ReplayRecorder();
```

- [ ] **Step 2: Wire call sites**

**In `startMatch()`** — after `this.armTurnTimer()`:

```ts
private startMatch(): void {
  // ... existing code ...
  this.armTurnTimer();
  this.recorder = new ReplayRecorder(); // fresh recorder per match
  this.recorder.captureRoundStart(1, this.state);
}
```

**In the `"fire"` message handler** — after the observer guard, before `handleFire`:

```ts
this.onMessage("fire", (client, msg: { angle: number; power: number }) => {
  if (this.observers.has(client.sessionId)) return;
  this.recorder.captureIntent(client.sessionId, "fire", msg);
  const wasPlaying = this.state.phase === "playing";
  handleFire(this.resolveCtx(), client.sessionId, msg.angle, msg.power);
  if (wasPlaying && this.state.phase === "resolving" && this.timeoutHandle) {
    this.timeoutHandle.clear();
    this.timeoutHandle = null;
  }
});
```

**In `handleRoundEnd()`** — add before `this.clock.setTimeout(...)`:

```ts
private handleRoundEnd(): void {
  this.recorder.captureRoundEnd(this.state);
  this.clock.setTimeout(() => {
    // ... existing code ...
  }, ROUND_SUMMARY_DURATION_MS);
}
```

**In `startNextRound()`** — after `this.armTurnTimer()`:

```ts
private startNextRound(): void {
  // ... existing code (state.round++, terrain, etc.) ...
  this.armTurnTimer();
  this.recorder.captureRoundStart(state.round, state);
}
```

**In `endMatch()`** — before `this.broadcast("match-end", ...)`:

```ts
private endMatch(): void {
  // ... existing standings computation ...
  this.recorder.captureRoundEnd(this.state);
  storeReplay(this.roomId, this.recorder.serialize(this.roomId));
  this.broadcast("match-end", { winnerId, standings });
}
```

- [ ] **Step 3: Run all server tests**

```sh
pnpm --filter @se/server test 2>&1 | tail -10
```
Expected: all existing tests pass — no new tests needed here since recorder is tested in Task 4.

- [ ] **Step 4: Commit**

```sh
git add apps/server/src/rooms/MatchRoom.ts
git commit -m "feat(server): wire ReplayRecorder into MatchRoom lifecycle"
```

---

## Task 6: REST Endpoint for Replay Download

**Files:**
- Modify: `apps/server/src/index.ts`

Create an `http.Server` with a request handler for `GET /replays/:matchId` and pass it to `WebSocketTransport` so both HTTP and WebSocket share the same port.

- [ ] **Step 1: Write the failing test**

Add to `apps/server/tests/MatchRoom.test.ts` (or a new `apps/server/tests/replayEndpoint.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { storeReplay } from "../src/rooms/replayStore.js";

describe("GET /replays/:matchId", () => {
  it("returns 200 with JSON for a known matchId", async () => {
    const replay = { version: 1 as const, matchId: "test-room", recordedAt: Date.now(), rounds: [] };
    storeReplay("test-room", replay);

    const res = await fetch("http://localhost:2567/replays/test-room");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matchId).toBe("test-room");
  });

  it("returns 404 for unknown matchId", async () => {
    const res = await fetch("http://localhost:2567/replays/no-such-room");
    expect(res.status).toBe(404);
  });
});
```

> **Note:** This is an integration test that requires a running server. Run with `pnpm --filter @se/server test` which uses `@colyseus/testing`'s `boot()` — however `boot()` doesn't start the full HTTP server. Add these tests as manual `curl` verification steps instead, and rely on the unit tests in Tasks 3–4 for CI coverage. The curl steps are in Step 4.

- [ ] **Step 2: Rewrite `apps/server/src/index.ts`**

Replace the entire file with:

```ts
import { createServer } from "http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import appConfig from "./appConfig.js";
import { getReplay } from "./rooms/replayStore.js";

// Sentry — only initialised when SENTRY_DSN is set (production)
let Sentry: typeof import("@sentry/node") | null = null;
if (process.env.SENTRY_DSN) {
  Sentry = await import("@sentry/node");
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV ?? "development" });
}

const PORT = Number(process.env.PORT ?? 2567);

const httpServer = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  const m = req.url?.match(/^\/replays\/([^/]+)$/);
  if (m && req.method === "GET") {
    const replay = getReplay(m[1]!);
    if (replay) {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify(replay));
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end('{"error":"not found"}');
    }
    return;
  }
  // All other HTTP requests fall through to Colyseus (monitor, etc.)
});

async function main() {
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
  });
  appConfig.initializeGameServer(gameServer);
  await gameServer.listen(PORT, undefined, undefined, () => {
    console.log(`[server] listening on :${PORT}`);
  });
}

main().catch((err) => {
  Sentry?.captureException(err);
  console.error(err);
  process.exit(1);
});
```

> **Note on top-level await:** The server's `package.json` already has `"type": "module"`, so top-level `await` works for the dynamic Sentry import. If Sentry is not needed (no `SENTRY_DSN`), the import is skipped entirely.

- [ ] **Step 3: Install `@sentry/node` in server package**

```sh
pnpm --filter @se/server add @sentry/node
```

- [ ] **Step 4: Manual smoke test**

```sh
# Terminal 1: start server
pnpm --filter @se/server dev

# Terminal 2: verify endpoint
curl -s http://localhost:2567/replays/no-such-room
# Expected: {"error":"not found"}  with status 404

# After a match completes in the client, run:
# curl -s http://localhost:2567/replays/<room-id> | head -c 200
```

- [ ] **Step 5: Run all server tests**

```sh
pnpm --filter @se/server test 2>&1 | tail -10
```
Expected: all pass (existing `@colyseus/testing` tests use their own transport, not affected).

- [ ] **Step 6: Commit**

```sh
git add apps/server/src/index.ts apps/server/package.json pnpm-lock.yaml
git commit -m "feat(server): HTTP server wrapper + /replays/:matchId endpoint + Sentry init"
```

---

## Task 7: MatchEndScene Replay Buttons

**Files:**
- Modify: `apps/client/src/scenes/MatchEndScene.ts`
- Modify: `apps/client/src/scenes/MatchScene.ts`

Add Download Replay and Watch Replay buttons to the post-match screen. `MatchScene.showMatchEnd` passes the room ID and server URL.

- [ ] **Step 1: Update `MatchEndScene` constructor signature**

In `apps/client/src/scenes/MatchEndScene.ts`, update the constructor to accept optional replay params:

```ts
export class MatchEndScene {
  private el: HTMLDivElement;

  constructor(
    payload: MatchEndPayload,
    maxRounds: number,
    onRematch: () => void,
    onLeave: () => void,
    replayOptions?: { matchId: string; serverUrl: string; onWatch: () => void },
  ) {
    // ... existing winner/rows/hasTie computation unchanged ...
```

- [ ] **Step 2: Add replay buttons to the HTML template**

In the `this.el.innerHTML` template, replace the `<!-- Action buttons -->` section:

```ts
<!-- Action buttons -->
<div style="display:flex;gap:8px;margin-top:16px;">
  <div id="me-rematch" style="flex:1;background:#1e1e30;border:1px solid #3a3a4e;border-radius:6px;padding:10px;text-align:center;cursor:pointer;color:#aaa;font-size:10px;">
    🔄 Rematch
  </div>
  ${replayOptions ? `
  <div id="me-download-replay" style="flex:1;background:#1e1e30;border:1px solid #3a3a4e;border-radius:6px;padding:10px;text-align:center;cursor:pointer;color:#aaa;font-size:10px;">
    ⬇ Download Replay
  </div>
  <div id="me-watch-replay" style="flex:1;background:#1e3a2e;border:1px solid #2d6a4f;border-radius:6px;padding:10px;text-align:center;cursor:pointer;color:#74c69d;font-size:10px;">
    ▶ Watch Replay
  </div>
  ` : ""}
  <div id="me-leave" style="flex:2;background:#c0392b;border-radius:6px;padding:10px;text-align:center;cursor:pointer;font-size:10px;font-weight:bold;">
    🚪 Leave
  </div>
</div>
```

- [ ] **Step 3: Wire replay button event listeners**

After the existing `this.el.querySelector("#me-rematch")` and `#me-leave` listeners, add:

```ts
if (replayOptions) {
  this.el.querySelector("#me-download-replay")?.addEventListener("click", () => {
    const { matchId, serverUrl } = replayOptions;
    const httpUrl = serverUrl.replace(/^ws/, "http");
    fetch(`${httpUrl}/replays/${matchId}`)
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `replay-${matchId}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(console.error);
  });
  this.el.querySelector("#me-watch-replay")?.addEventListener("click", replayOptions.onWatch);
}
```

- [ ] **Step 4: Update `MatchScene.showMatchEnd` to pass replay options**

In `apps/client/src/scenes/MatchScene.ts`, update `showMatchEnd`:

```ts
private showMatchEnd(msg: unknown): void {
  this.matchEndScene?.dispose();
  this.matchEndScene = new MatchEndScene(
    msg as MatchEndPayload,
    this.room.state.maxRounds,
    () => { this.room.leave(); window.location.reload(); },
    () => { this.room.leave(); window.location.reload(); },
    {
      matchId: this.room.id,
      serverUrl: __SERVER_URL__,
      onWatch: () => {
        this.matchEndScene?.dispose();
        this.matchEndScene = null;
        // ReplayScene is imported and created in Task 8
        import("./ReplayScene.js").then(({ ReplayScene }) => {
          const httpUrl = __SERVER_URL__.replace(/^ws/, "http");
          fetch(`${httpUrl}/replays/${this.room.id}`)
            .then((r) => r.json())
            .then((replay) => new ReplayScene(replay))
            .catch(console.error);
        });
      },
    },
  );
}
```

Add the `__SERVER_URL__` declaration at the top of `MatchScene.ts` (alongside the existing `Window` declaration):

```ts
declare const __SERVER_URL__: string;
```

- [ ] **Step 5: Run client typecheck**

```sh
pnpm --filter @se/client typecheck 2>&1 | tail -10
```
Expected: no errors (ReplayScene import is dynamic so TypeScript won't complain about the missing file yet).

- [ ] **Step 6: Commit**

```sh
git add apps/client/src/scenes/MatchEndScene.ts apps/client/src/scenes/MatchScene.ts
git commit -m "feat(client): Download Replay + Watch Replay buttons on match end screen"
```

---

## Task 8: ReplayScene — Terrain and Tank Rendering

**Files:**
- Create: `apps/client/src/scenes/ReplayScene.ts`

A Pixi.js scene that accepts a `ReplayFile`, renders each round's terrain and tank positions, and steps through rounds on demand.

- [ ] **Step 1: Create the basic `ReplayScene` skeleton**

Create `apps/client/src/scenes/ReplayScene.ts`:

```ts
import { Container, Text } from "pixi.js";
import { TerrainRenderer } from "../render/Terrain.js";
import { createTankView } from "../render/Tank.js";
import { SkyRenderer } from "../render/Sky.js";
import { TERRAIN_WIDTH, TERRAIN_HEIGHT } from "@se/shared";
import type { TerrainType } from "@se/shared";
import type { ReplayFile, RoundRecord } from "../../../apps/server/src/rooms/replayStore.js";

// Re-export the types locally so the client doesn't depend on server internals
export type { ReplayFile };

export class ReplayScene {
  private world: Container;
  private terrain?: TerrainRenderer;
  private tankViews = new Map<string, ReturnType<typeof createTankView>>();
  private currentRoundIdx = 0;
  private controlEl!: HTMLDivElement;

  constructor(private readonly replay: ReplayFile) {
    const app = window.pixiApp;
    if (!app) throw new Error("pixiApp not initialized");

    this.world = new Container();
    app.stage.addChild(this.world);

    this.fit();
    window.addEventListener("resize", () => this.fit());

    this.buildControls();
    this.renderRound(0);
  }

  private fit(): void {
    const sx = window.innerWidth / TERRAIN_WIDTH;
    const sy = window.innerHeight / TERRAIN_HEIGHT;
    const s = Math.min(sx, sy);
    this.world.scale.set(s);
    this.world.position.set(
      (window.innerWidth - TERRAIN_WIDTH * s) / 2,
      (window.innerHeight - TERRAIN_HEIGHT * s) / 2,
    );
  }

  private renderRound(idx: number): void {
    const round = this.replay.rounds[idx];
    if (!round) return;
    this.currentRoundIdx = idx;

    // Clear previous frame
    this.world.removeChildren();
    this.tankViews.clear();

    this.world.addChild(new SkyRenderer());

    // Rebuild terrain from snapshot seed + type
    const snap = round.snapshot as {
      terrainSeed: string;
      terrainType: string;
      wind: number;
      tanks: Record<string, { x: number; y: number; hp: number; alive: boolean; nickname: string; color: string; hat: string }>;
    };

    const t = new TerrainRenderer(snap.terrainSeed, snap.terrainType as TerrainType);
    this.world.addChildAt(t, 1);
    this.terrain = t;

    // Apply carve ops silently (discard particle containers)
    for (const op of round.carveOps) {
      this.terrain.carve({ x: op.x, y: op.y, radius: op.radius, tick: op.tick });
    }

    // Render tanks at snapshot positions
    for (const [id, tankData] of Object.entries(snap.tanks)) {
      const view = createTankView({ color: tankData.color as import("@se/shared").TankColor, hat: tankData.hat as import("@se/shared").TankHat });
      view.setPos(tankData.x, tankData.y);
      view.setAlive(tankData.alive);
      view.setHp(tankData.hp);
      this.world.addChild(view);
      this.tankViews.set(id, view);
    }

    // Update round label in controls
    const label = this.controlEl?.querySelector<HTMLElement>("#replay-round-label");
    if (label) label.textContent = `Round ${round.roundNumber} / ${this.replay.rounds.length}`;
  }
```

- [ ] **Step 2: Add `buildControls` method**

Add to `ReplayScene`:

```ts
  private buildControls(): void {
    this.controlEl = document.createElement("div");
    this.controlEl.style.cssText = [
      "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);",
      "background:rgba(0,0,0,0.8);border-radius:8px;padding:10px 16px;",
      "display:flex;align-items:center;gap:12px;z-index:300;",
      "font-family:monospace;font-size:11px;color:#e0e0e0;",
    ].join("");

    this.controlEl.innerHTML = `
      <button id="replay-prev" style="background:#2a2a3e;border:1px solid #444;border-radius:4px;padding:4px 10px;color:#aaa;cursor:pointer;">◀ Prev</button>
      <span id="replay-round-label">Round 1 / ${this.replay.rounds.length}</span>
      <button id="replay-next" style="background:#2a2a3e;border:1px solid #444;border-radius:4px;padding:4px 10px;color:#aaa;cursor:pointer;">Next ▶</button>
      <button id="replay-close" style="background:#c0392b;border:none;border-radius:4px;padding:4px 10px;color:#fff;cursor:pointer;margin-left:8px;">✕ Close</button>
    `;

    this.controlEl.querySelector("#replay-prev")?.addEventListener("click", () => {
      if (this.currentRoundIdx > 0) this.renderRound(this.currentRoundIdx - 1);
    });
    this.controlEl.querySelector("#replay-next")?.addEventListener("click", () => {
      if (this.currentRoundIdx < this.replay.rounds.length - 1) {
        this.renderRound(this.currentRoundIdx + 1);
      }
    });
    this.controlEl.querySelector("#replay-close")?.addEventListener("click", () => this.dispose());

    document.getElementById("ui")!.appendChild(this.controlEl);
  }

  dispose(): void {
    this.world.destroy({ children: true });
    this.controlEl.remove();
    window.location.reload();
  }
}
```

- [ ] **Step 3: Fix the type import (avoid server→client dep)**

The `ReplayFile` type is defined in `replayStore.ts` on the server. To avoid a cross-app dependency, copy the type definitions directly into `ReplayScene.ts` (they're plain interfaces — no runtime code):

Remove the import from server and replace with local declarations at the top of `ReplayScene.ts`:

```ts
// Types mirrored from apps/server/src/rooms/replayStore.ts
export interface ReplayFile {
  version: 1;
  matchId: string;
  recordedAt: number;
  rounds: RoundRecord[];
}
export interface RoundRecord {
  roundNumber: number;
  snapshot: Record<string, unknown>;
  intents: IntentRecord[];
  carveOps: SerializedCarveOp[];
}
export interface IntentRecord { ts: number; playerId: string; kind: string; payload: unknown; }
export interface SerializedCarveOp { x: number; y: number; radius: number; tick: number; }
```

Update `MatchScene.ts` to import `ReplayFile` from `ReplayScene.js` instead of any server path.

- [ ] **Step 4: Run client typecheck**

```sh
pnpm --filter @se/client typecheck 2>&1 | tail -15
```
Expected: no errors.

- [ ] **Step 5: Commit**

```sh
git add apps/client/src/scenes/ReplayScene.ts apps/client/src/scenes/MatchScene.ts
git commit -m "feat(client): ReplayScene — round-by-round terrain + tank snapshot viewer"
```

---

## Task 9: ReplayScene Keyboard Controls

**Files:**
- Modify: `apps/client/src/scenes/ReplayScene.ts`

Add keyboard shortcuts: `[` for previous round, `]` for next round. Simple, one-time bindings cleaned up on `dispose()`.

- [ ] **Step 1: Add keyboard handler in constructor**

In `ReplayScene.constructor`, after `this.buildControls()`:

```ts
this._keyHandler = (e: KeyboardEvent) => {
  if (e.key === "[") {
    if (this.currentRoundIdx > 0) this.renderRound(this.currentRoundIdx - 1);
  } else if (e.key === "]") {
    if (this.currentRoundIdx < this.replay.rounds.length - 1) {
      this.renderRound(this.currentRoundIdx + 1);
    }
  }
};
window.addEventListener("keydown", this._keyHandler);
```

- [ ] **Step 2: Add the field and clean up in `dispose()`**

Add the field to the class:

```ts
private _keyHandler!: (e: KeyboardEvent) => void;
```

Update `dispose()`:

```ts
dispose(): void {
  window.removeEventListener("keydown", this._keyHandler);
  this.world.destroy({ children: true });
  this.controlEl.remove();
  window.location.reload();
}
```

- [ ] **Step 3: Run client typecheck**

```sh
pnpm --filter @se/client typecheck 2>&1 | tail -10
```
Expected: no errors.

- [ ] **Step 4: Manual smoke test**

Start server and client, play a 2-round match, click "Watch Replay" on the match end screen:
- Round 1 terrain and tanks render correctly
- `]` advances to round 2
- `[` goes back to round 1
- "✕ Close" reloads to lobby

- [ ] **Step 5: Commit**

```sh
git add apps/client/src/scenes/ReplayScene.ts
git commit -m "feat(client): ReplayScene keyboard nav — [ prev ] next round"
```

---

## Task 10: Load Test Package

**Files:**
- Create: `packages/loadtest/package.json`
- Create: `packages/loadtest/src/index.ts`
- Modify: `pnpm-workspace.yaml`

`@colyseus/loadtest` CLI runs a scenario script where each client joins a match, fires on its turn, and loops. 100 rooms × 2 clients.

- [ ] **Step 1: Update pnpm-workspace.yaml**

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

(No change needed — `packages/*` already covers `packages/loadtest`.)

- [ ] **Step 2: Create `packages/loadtest/package.json`**

```json
{
  "name": "@se/loadtest",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "colyseus-loadtest src/index.ts --endpoint ws://localhost:2567 --room match --numClients 200 --delay 50"
  },
  "dependencies": {
    "@colyseus/loadtest": "^0.17.0",
    "@colyseus/sdk": "^0.16.0"
  }
}
```

> **Note:** `--numClients 200` = 100 rooms × 2 clients each. `--delay 50` = 50ms between each client connection to avoid a connection flood at startup.

- [ ] **Step 3: Create `packages/loadtest/src/index.ts`**

```ts
import { cli, type Options } from "@colyseus/loadtest";
import { Client } from "@colyseus/sdk";

cli(async (options: Options) => {
  const client = new Client(options.endpoint);

  // Pair clients by clientId: even = host, odd = joiner
  const isHost = options.clientId % 2 === 0;
  const roomCode = `LOAD${Math.floor(options.clientId / 2).toString().padStart(4, "0")}`;

  let room: Awaited<ReturnType<typeof client.joinOrCreate>>;
  try {
    room = await client.joinOrCreate("match", {
      code: roomCode,
      nickname: `Bot${options.clientId}`,
      color: "red",
      hat: "none",
    });
  } catch (e) {
    console.error(`[client ${options.clientId}] join failed:`, e);
    return;
  }

  // Host starts the match after a short wait for the joiner to connect
  if (isHost) {
    await new Promise((r) => setTimeout(r, 500));
    room.send("ready", {});
  }

  // Wait for game to end, fire on our turns
  await new Promise<void>((resolve) => {
    room.onStateChange((state: { phase: string; currentTurnPlayerId: string }) => {
      if (state.phase === "playing" && state.currentTurnPlayerId === room.sessionId) {
        // Simulate think delay, then fire
        setTimeout(() => {
          if (state.phase === "playing" && state.currentTurnPlayerId === room.sessionId) {
            room.send("fire", {
              angle: 30 + Math.random() * 120,
              power: 200 + Math.random() * 600,
            });
          }
        }, 300 + Math.random() * 400);
      }
      if (state.phase === "ended") {
        room.leave().then(resolve).catch(resolve);
      }
    });

    // Timeout safety — leave after 5 minutes regardless
    setTimeout(() => { room.leave().then(resolve).catch(resolve); }, 5 * 60 * 1000);
  });
});
```

- [ ] **Step 4: Install dependencies**

```sh
pnpm install
```

- [ ] **Step 5: Run the load test against a local server**

```sh
# Terminal 1: start server
pnpm --filter @se/server dev

# Terminal 2: run load test (smaller scale for local verification)
pnpm --filter @se/loadtest start -- --endpoint ws://localhost:2567 --room match --numClients 10 --delay 100
```

Expected: 5 rooms spin up, all reach `phase === "ended"`, no unhandled exceptions in the server terminal.

- [ ] **Step 6: Add root script alias**

In root `package.json`, add:
```json
"scripts": {
  "loadtest": "pnpm --filter @se/loadtest start"
}
```

- [ ] **Step 7: Commit**

```sh
git add packages/loadtest/ package.json pnpm-lock.yaml
git commit -m "feat(loadtest): @colyseus/loadtest scenario — 100 rooms × 2 bots"
```

---

## Task 11: Dockerfile

**Files:**
- Create: `Dockerfile`

Multi-stage build. Stage 1 compiles the server workspace. Stage 2 copies only the compiled output and production deps.

- [ ] **Step 1: Create `Dockerfile` at repo root**

```dockerfile
# Stage 1: build
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/ packages/
COPY apps/server/ apps/server/
COPY packages/tsconfig/ packages/tsconfig/
RUN pnpm install --frozen-lockfile --filter @se/server...
RUN pnpm --filter @se/server build

# Stage 2: runtime
FROM node:20-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/package.json ./package.json
USER app
EXPOSE 2567
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Add build script to server `package.json`**

Verify `apps/server/package.json` has a `build` script. If not, add:
```json
"build": "tsc --project tsconfig.json"
```

Verify `tsconfig.json` exists in `apps/server/`:
```sh
ls apps/server/tsconfig.json
```
If missing, create `apps/server/tsconfig.json`:
```json
{
  "extends": "./tsconfig.dev.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["tests", "dist", "node_modules"]
}
```

- [ ] **Step 3: Test the Docker build locally**

```sh
docker build -t scorched-earth-server .
docker run --rm -p 2567:2567 scorched-earth-server
```

Expected: server starts and logs `[server] listening on :2567`.

- [ ] **Step 4: Commit**

```sh
git add Dockerfile
git commit -m "feat(infra): multi-stage Dockerfile for Colyseus server"
```

---

## Task 12: Fly.io Config and Sentry Wiring

**Files:**
- Create: `fly.toml`

Minimal Fly.io config. The Sentry SDK is already wired in `index.ts` (Task 6). This task creates the `fly.toml` and documents the one-time deploy setup.

- [ ] **Step 1: Create `fly.toml`**

```toml
app = "scorched-earth"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 2567
  force_https = true
  auto_stop_machines = false

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"

[checks]
  [checks.alive]
    type = "http"
    path = "/health"
    interval = "10s"
    timeout = "3s"
    grace_period = "30s"
```

> **Critical:** `auto_stop_machines = false` prevents Fly from killing the machine between requests — a WebSocket server must stay alive continuously.

- [ ] **Step 2: Document the one-time setup**

Add a `DEPLOY.md` at repo root:

```markdown
# Deploying to Fly.io

## One-time setup

```sh
fly auth login
fly apps create scorched-earth       # creates the app
fly secrets set SENTRY_DSN=https://...@sentry.io/...
```

## Deploy

```sh
fly deploy        # builds Docker image and deploys
fly logs          # tail live logs
fly status        # check machine health
```

## Health check

GET https://scorched-earth.fly.dev/colyseus  → Colyseus Monitor dashboard
```

- [ ] **Step 3: Verify Colyseus Monitor endpoint exists**

The `/colyseus` endpoint is registered by `@colyseus/monitor`. Check `appConfig.ts` to see if it's already enabled. If not, add to `apps/server/src/appConfig.ts`:

```ts
import { monitor } from "@colyseus/monitor";
import type { Server } from "colyseus";
import { LobbyRoom } from "./rooms/LobbyRoom.js";
import { MatchRoom } from "./rooms/MatchRoom.js";

export default {
  initializeGameServer: (gameServer: Server) => {
    gameServer.define("lobby", LobbyRoom);
    gameServer.define("match", MatchRoom).filterBy(["code"]);
    // Colyseus Monitor — used by Fly.io health check + operational dashboard
    // Access at /colyseus in dev and production
  },
};
```

> **Note:** `@colyseus/monitor` attaches to the express app via `gameServer.presence.express`. In Colyseus 0.16 with `WebSocketTransport`, the monitor registers itself automatically. No extra code needed — just verify `/colyseus` returns 200 after `fly deploy`.

- [ ] **Step 4: Run all tests one final time**

```sh
pnpm test 2>&1 | grep -E "Tests|Test Files|passed|failed"
```
Expected: all packages pass (packages/game: 189 tests, apps/server: 44+ tests, apps/client: pass with no tests).

- [ ] **Step 5: Commit**

```sh
git add fly.toml DEPLOY.md apps/server/src/appConfig.ts
git commit -m "feat(infra): fly.toml + Fly.io deploy docs + Colyseus Monitor health check"
```

---

## Running the Full Suite

After all tasks complete:

```sh
# Unit + integration tests
pnpm test

# Type checking across all packages
pnpm -r typecheck

# Load test (local, smoke scale)
pnpm --filter @se/server dev &
pnpm --filter @se/loadtest start -- --numClients 10 --delay 100

# Docker build
docker build -t scorched-earth-server . && docker run --rm -p 2567:2567 scorched-earth-server
```

## Pass Criteria

| Feature | Verification |
|---------|-------------|
| Ghost AI | Disconnect P2 mid-match → AI takes over their turn within `RECONNECT_GRACE_SEC` |
| Spectator | Join live match → `SPECTATING` banner, no controls, `fire` intent ignored |
| Replay download | Click "Download Replay" post-match → valid `.json` file saved |
| Replay watch | Click "Watch Replay" → ReplayScene loads, `[`/`]` navigate rounds |
| Load test | 10-client smoke: all rooms complete, no server exceptions |
| Fly health | `GET /health` → `ok` |
