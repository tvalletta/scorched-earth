# Lobby Waiting Room + Cosmetic Background Battle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken half-built lobby with one centered waiting-room panel over a client-side cosmetic AI battle; fix the invite link; unify the combatants roster (humans + AI) with a spectators strip; remove the duplicate lobby-config UI from the match scene.

**Architecture:** The lobby layer owns the Colyseus `Room` (created on load so the invite link is valid immediately) and hands the already-connected room to `MatchScene` when `phase` flips to `playing`. Pure logic (entry decision, invite link, roster view-model, battle ballistics) lives in testable modules; Pixi/DOM rendering is verified via Playwright. The background battle is fully client-side and never touches the network.

**Tech Stack:** TypeScript, PixiJS 8, colyseus.js 0.16, @colyseus/schema, vitest (node env, DOM stubbed), Playwright.

**Reference mockup:** `.superpowers/brainstorm/44379-1780064338/content/panel-v4.html` is the approved panel design (sections, colors, capacity behavior). Translate its markup/styling into `LobbyScene`.

**Spec:** `docs/superpowers/specs/2026-05-29-lobby-waiting-room-background-battle-design.md`

---

## File Structure

**New**
- `packages/shared/src/schema/Observer.ts` — `{ sessionId, nickname }` schema.
- `apps/client/src/lib/lobby.ts` — pure lobby logic: `parseRoomCode`, `inviteLink`, `buildLobbyView`.
- `apps/client/src/lib/lobby.test.ts`
- `apps/client/src/render/lobbyBattleSim.ts` — pure cosmetic ballistics/turn logic.
- `apps/client/src/render/lobbyBattleSim.test.ts`
- `apps/client/src/render/LobbyBattle.ts` — Pixi renderer wrapping the sim.
- `apps/client/src/scenes/LobbyController.ts` — orchestrates battle + panel + handoff.

**Modified**
- `packages/shared/src/constants.ts` — fix `HATS` to canonical 9.
- `packages/shared/src/index.ts` — export `Observer`.
- `packages/shared/src/schema/MatchState.ts` — add `observers`.
- `apps/server/src/rooms/MatchRoom.ts` — `set-identity` handler; observer schema in `onJoin`/`onLeave`.
- `apps/server/src/rooms/MatchRoom.test.ts` (or new spec file) — server tests.
- `apps/client/src/net/colyseusClient.ts` — typed join errors.
- `apps/client/src/main.ts` — boot `LobbyController`.
- `apps/client/src/scenes/LobbyScene.ts` — rewritten as the unified waiting room.
- `apps/client/src/scenes/MatchScene.ts` — remove lobby-phase UI handling.
- `apps/client/src/input/AimControls.ts` — remove lobby-config block.

**Commands**
- Client tests: `pnpm --filter @se/client test`
- Server tests: `pnpm --filter @se/server test`
- Shared build: `pnpm --filter @se/shared build`
- Typecheck all: `pnpm typecheck`
- Dev (both): `pnpm dev`

---

## Task 1: Shared schema — canonical hats, Observer, MatchState.observers

**Files:**
- Modify: `packages/shared/src/constants.ts:13`
- Create: `packages/shared/src/schema/Observer.ts`
- Modify: `packages/shared/src/schema/MatchState.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Fix the canonical hat list**

In `packages/shared/src/constants.ts`, replace line 13:

```typescript
export const HATS = ["none", "helm", "chef", "tophat", "beanie", "cowboy", "party", "viking", "santa"] as const;
```

(This matches the client `identity.ts` `Hat` type and the `drawHat` cases in `Tank.ts`. The only prior source reference to `HATS`/`"top-hat"` was this line; safe to change.)

- [ ] **Step 2: Create the Observer schema**

`packages/shared/src/schema/Observer.ts`:

```typescript
import { Schema, type } from "@colyseus/schema";

export class Observer extends Schema {
  @type("string") sessionId = "";
  @type("string") nickname = "";
}
```

- [ ] **Step 3: Add observers to MatchState**

In `packages/shared/src/schema/MatchState.ts`, add the import and field:

```typescript
import { Observer } from "./Observer";
// ... within class MatchState, after aiSlots:
@type([Observer]) observers = new ArraySchema<Observer>();
```

- [ ] **Step 4: Export Observer from the shared barrel**

In `packages/shared/src/index.ts`, add an export next to the other schema exports:

```typescript
export { Observer } from "./schema/Observer";
```

(Verify the existing export style in that file — match it, whether `export *` or named re-exports.)

- [ ] **Step 5: Build shared and typecheck**

Run: `pnpm --filter @se/shared build && pnpm typecheck`
Expected: PASS (no type errors). Shared must build before server/client pick up the new export.

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): canonical 9-hat list, Observer schema, MatchState.observers"
```

---

## Task 2: Server — set-identity handler + observer schema tracking

**Files:**
- Modify: `apps/server/src/rooms/MatchRoom.ts`
- Test: `apps/server/src/rooms/MatchRoom.setIdentity.test.ts` (new) — or append to existing server test file if one covers MatchRoom messages.

> Check first whether an existing MatchRoom test harness exists (`grep -rl "new MatchRoom\|MatchRoom" apps/server/src --include=*.test.ts`). Reuse its setup (how it instantiates a room + fake clients). If none exists, build a minimal harness in the new file following the pattern below.

- [ ] **Step 1: Write failing tests for set-identity + observers**

`apps/server/src/rooms/MatchRoom.setIdentity.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { MatchRoom } from "./MatchRoom.js";
import { COLORS, HATS } from "@se/shared";

// Minimal fake client
function fakeClient(sessionId: string) {
  const sent: Array<{ type: string; msg: unknown }> = [];
  return { sessionId, send: (type: string, msg: unknown) => sent.push({ type, msg }), sent } as any;
}

// Helper: build a room in lobby phase with one host tank
function lobbyRoomWithHost() {
  const room = new MatchRoom();
  // Colyseus Room normally calls onCreate via the server; call directly for unit test.
  (room as any).onCreate({ code: "TEST01" });
  const host = fakeClient("host");
  room.onJoin(host, { code: "TEST01", nickname: "Host", color: "red", hat: "none" } as any);
  return { room, host };
}

// Helper to invoke a registered onMessage handler
function dispatch(room: MatchRoom, type: string, client: any, msg: unknown) {
  const handlers = (room as any).onMessageHandlers ?? (room as any)["onMessageHandlers"];
  // Colyseus stores handlers internally; if not accessible, expose a test seam (see Step 3 note).
  handlers[type](client, msg);
}

describe("MatchRoom set-identity", () => {
  it("updates nickname/color/hat for the caller's tank during lobby", () => {
    const { room, host } = lobbyRoomWithHost();
    dispatch(room, "set-identity", host, { nickname: "  Boom  ", color: "cyan", hat: "viking" });
    const tank = room.state.tanks.get("host")!;
    expect(tank.nickname).toBe("Boom");
    expect(tank.color).toBe("cyan");
    expect(tank.hat).toBe("viking");
  });

  it("ignores unknown color/hat", () => {
    const { room, host } = lobbyRoomWithHost();
    dispatch(room, "set-identity", host, { color: "chartreuse", hat: "fedora" });
    const tank = room.state.tanks.get("host")!;
    expect(tank.color).toBe("red");
    expect(tank.hat).toBe("none");
  });

  it("ignores set-identity once phase != lobby", () => {
    const { room, host } = lobbyRoomWithHost();
    room.state.phase = "playing";
    dispatch(room, "set-identity", host, { nickname: "TooLate" });
    expect(room.state.tanks.get("host")!.nickname).toBe("Host");
  });

  it("ignores empty nickname", () => {
    const { room, host } = lobbyRoomWithHost();
    dispatch(room, "set-identity", host, { nickname: "   " });
    expect(room.state.tanks.get("host")!.nickname).toBe("Host");
  });
});

describe("MatchRoom observers in schema", () => {
  it("adds an Observer entry when joining a full lobby and removes it on leave", () => {
    const { room } = lobbyRoomWithHost();
    // Fill remaining 9 slots to reach capacity (10)
    for (let i = 0; i < 9; i++) {
      room.onJoin(fakeClient("p" + i), { code: "TEST01", nickname: "P" + i, color: "blue", hat: "none" } as any);
    }
    expect(room.state.tanks.size).toBe(10);
    const obs = fakeClient("obs1");
    room.onJoin(obs, { code: "TEST01", nickname: "Watcher", color: "red", hat: "none" } as any);
    expect(room.state.observers.length).toBe(1);
    expect(room.state.observers[0]!.nickname).toBe("Watcher");
    return room.onLeave(obs, true).then(() => {
      expect(room.state.observers.length).toBe(0);
    });
  });
});
```

> **Note on `dispatch`:** Colyseus's `Room.onMessage(type, cb)` stores callbacks privately. To keep tests clean, add a tiny test seam in `MatchRoom`: keep a `private testHandlers: Record<string, Function> = {}` populated alongside each `this.onMessage(...)` registration, OR refactor `set-identity` logic into a standalone exported function `applySetIdentity(state, sessionId, msg)` and unit-test that pure function directly (preferred — no seam needed). **Use the pure-function approach:** put `applySetIdentity` in `apps/server/src/rooms/identity.ts` and have the message handler call it. Rewrite the tests above to import and call `applySetIdentity(room.state, "host", {...})` instead of `dispatch`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @se/server test`
Expected: FAIL (`applySetIdentity` not defined / observers not populated).

- [ ] **Step 3: Create the pure identity helper**

`apps/server/src/rooms/identity.ts`:

```typescript
import { COLORS, HATS, type TankColor, type TankHat } from "@se/shared";
import type { MatchState } from "@se/shared";

export function applySetIdentity(
  state: MatchState,
  sessionId: string,
  msg: { nickname?: string; color?: string; hat?: string },
): void {
  if (state.phase !== "lobby") return;
  const tank = state.tanks.get(sessionId);
  if (!tank) return;
  if (typeof msg?.nickname === "string") {
    const n = msg.nickname.trim().slice(0, 24);
    if (n.length > 0) tank.nickname = n;
  }
  if (typeof msg?.color === "string" && (COLORS as readonly string[]).includes(msg.color)) {
    tank.color = msg.color as TankColor;
  }
  if (typeof msg?.hat === "string" && (HATS as readonly string[]).includes(msg.hat)) {
    tank.hat = msg.hat as TankHat;
  }
}
```

- [ ] **Step 4: Wire the handler + observer tracking in MatchRoom**

In `apps/server/src/rooms/MatchRoom.ts`:

Add import:
```typescript
import { applySetIdentity } from "./identity.js";
import { Observer } from "@se/shared";
```

Register the handler inside `onCreate` (next to the other `onMessage` calls):
```typescript
this.onMessage("set-identity", (client, msg: { nickname?: string; color?: string; hat?: string }) => {
  applySetIdentity(this.state, client.sessionId, msg);
});
```

In `onJoin`, extend the observer branch (currently `this.observers.add(client.sessionId); return;`):
```typescript
if (this.state.phase !== "lobby" || this.state.tanks.size >= this.maxClients) {
  this.observers.add(client.sessionId);
  const obs = new Observer();
  obs.sessionId = client.sessionId;
  obs.nickname = (options.nickname ?? "Spectator").slice(0, 24);
  this.state.observers.push(obs);
  return;
}
```

In `onLeave`, extend the observer branch (currently deletes from the Set and returns):
```typescript
if (this.observers.has(client.sessionId)) {
  this.observers.delete(client.sessionId);
  const i = this.state.observers.findIndex(o => o.sessionId === client.sessionId);
  if (i !== -1) this.state.observers.splice(i, 1);
  return;
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm --filter @se/server test`
Expected: PASS (all set-identity + observer tests green; existing tests still green).

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm typecheck
git add apps/server packages/shared
git commit -m "feat(server): set-identity message + observers surfaced in state"
```

---

## Task 3: Client pure lobby logic (entry decision, invite link, view-model)

**Files:**
- Create: `apps/client/src/lib/lobby.ts`
- Test: `apps/client/src/lib/lobby.test.ts`

The view-model is the single contract the `LobbyScene` DOM consumes. Defining it here locks the shape used in Task 7.

- [ ] **Step 1: Write failing tests**

`apps/client/src/lib/lobby.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseRoomCode, inviteLink, buildLobbyView } from "./lobby";

describe("parseRoomCode", () => {
  it("extracts a 6-char code from the path, uppercased", () => {
    expect(parseRoomCode("/k7p2qx")).toBe("K7P2QX");
    expect(parseRoomCode("/ABC123")).toBe("ABC123");
  });
  it("returns null for non-code paths", () => {
    expect(parseRoomCode("/")).toBeNull();
    expect(parseRoomCode("/toolong12")).toBeNull();
    expect(parseRoomCode("/abc")).toBeNull();
  });
});

describe("inviteLink", () => {
  it("joins origin and code with a slash", () => {
    expect(inviteLink("http://localhost:5183", "K7P2QX")).toBe("http://localhost:5183/K7P2QX");
    expect(inviteLink("https://scorched.earth", "ABC123")).toBe("https://scorched.earth/ABC123");
  });
});

describe("buildLobbyView", () => {
  // Minimal plain-object stand-ins for the schema shapes the function reads.
  const baseState = () => ({
    hostId: "host",
    roomCode: "K7P2QX",
    maxRounds: 5,
    loadoutId: "standard",
    tanks: new Map<string, any>([
      ["host", { sessionId: "host", nickname: "ChaosEagle", color: "red", hat: "none", connected: true }],
      ["g1", { sessionId: "g1", nickname: "SilentWolf", color: "blue", hat: "none", connected: true }],
    ]),
    aiSlots: [
      { sessionId: "ai-0", nickname: "Sgt. Boom", difficulty: "shooter" },
    ],
    observers: [{ sessionId: "obs1", nickname: "LateLarry" }],
  });

  it("marks the local client as host and YOU", () => {
    const v = buildLobbyView(baseState() as any, "host");
    expect(v.isHost).toBe(true);
    expect(v.isSpectator).toBe(false);
    const me = v.combatants.find(c => c.sessionId === "host")!;
    expect(me.isHost).toBe(true);
    expect(me.isYou).toBe(true);
    expect(me.kind).toBe("human");
  });

  it("lists humans then AI, with combatant count and capacity", () => {
    const v = buildLobbyView(baseState() as any, "g1");
    expect(v.isHost).toBe(false);
    expect(v.combatants.map(c => c.sessionId)).toEqual(["host", "g1", "ai-0"]);
    expect(v.combatantCount).toBe(3);
    expect(v.isFull).toBe(false);
    const ai = v.combatants.find(c => c.kind === "ai")!;
    expect(ai.difficulty).toBe("shooter");
  });

  it("flags isFull at 10 combatants", () => {
    const s = baseState();
    for (let i = 0; i < 8; i++) s.tanks.set("x" + i, { sessionId: "x" + i, nickname: "X" + i, color: "lime", hat: "none", connected: true });
    // 2 humans + 8 = 10 tanks, 1 ai => 11 > 10 -> isFull true (combatants capped at maxPlayers)
    const v = buildLobbyView(s as any, "host");
    expect(v.isFull).toBe(true);
  });

  it("detects spectator when local id is only in observers", () => {
    const v = buildLobbyView(baseState() as any, "obs1");
    expect(v.isSpectator).toBe(true);
    expect(v.spectators.map(o => o.nickname)).toContain("LateLarry");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @se/client test`
Expected: FAIL (`./lobby` not found).

- [ ] **Step 3: Implement lobby.ts**

`apps/client/src/lib/lobby.ts`:

```typescript
import { MAX_PLAYERS } from "@se/shared";

export function parseRoomCode(pathname: string): string | null {
  const m = pathname.match(/^\/([A-Za-z0-9]{6})$/);
  return m ? m[1]!.toUpperCase() : null;
}

export function inviteLink(origin: string, code: string): string {
  return `${origin}/${code}`;
}

export interface CombatantVM {
  sessionId: string;
  name: string;
  color: string;
  hat: string;
  kind: "human" | "ai";
  isHost: boolean;
  isYou: boolean;
  connected: boolean;
  difficulty?: string;
}

export interface SpectatorVM { sessionId: string; nickname: string; }

export interface LobbyView {
  isHost: boolean;
  isSpectator: boolean;
  roomCode: string;
  maxRounds: number;
  loadoutId: string;
  combatants: CombatantVM[];
  combatantCount: number;
  isFull: boolean;
  spectators: SpectatorVM[];
}

// Reads the live MatchState (or a plain stand-in with the same shape).
export function buildLobbyView(state: any, localSessionId: string): LobbyView {
  const humans: CombatantVM[] = [];
  for (const [sid, t] of state.tanks as Map<string, any>) {
    humans.push({
      sessionId: sid,
      name: t.nickname,
      color: t.color,
      hat: t.hat,
      kind: "human",
      isHost: sid === state.hostId,
      isYou: sid === localSessionId,
      connected: t.connected !== false,
    });
  }
  const ai: CombatantVM[] = Array.from(state.aiSlots as Iterable<any>).map((s) => ({
    sessionId: s.sessionId,
    name: s.nickname || "AI",
    color: "white",
    hat: "none",
    kind: "ai" as const,
    isHost: false,
    isYou: false,
    connected: true,
    difficulty: s.difficulty,
  }));
  const combatants = [...humans, ...ai];
  const spectators: SpectatorVM[] = Array.from(state.observers as Iterable<any>).map((o) => ({
    sessionId: o.sessionId, nickname: o.nickname,
  }));
  const isYouAnyTank = (state.tanks as Map<string, any>).has(localSessionId);
  return {
    isHost: localSessionId === state.hostId,
    isSpectator: !isYouAnyTank && spectators.some(s => s.sessionId === localSessionId),
    roomCode: state.roomCode,
    maxRounds: state.maxRounds,
    loadoutId: state.loadoutId,
    combatants,
    combatantCount: combatants.length,
    isFull: combatants.length >= MAX_PLAYERS,
    spectators,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @se/client test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/lib/lobby.ts apps/client/src/lib/lobby.test.ts
git commit -m "feat(client): pure lobby logic — room code, invite link, view-model"
```

---

## Task 4: Client net — typed join errors

**Files:**
- Modify: `apps/client/src/net/colyseusClient.ts`

- [ ] **Step 1: Add a typed error + classify join failures**

Append to `apps/client/src/net/colyseusClient.ts`:

```typescript
export class RoomNotFoundError extends Error {
  constructor(public code: string) {
    super(`Room ${code} not found`);
    this.name = "RoomNotFoundError";
  }
}
```

Wrap `joinMatch` so a not-found maps to `RoomNotFoundError` (Colyseus throws with a `.code` of `4212`/`MATCHMAKE_INVALID_ROOM_ID` or a message containing "not found"; check both):

```typescript
export async function joinMatch(
  code: string,
  meta: { nickname: string; color: string; hat: string },
): Promise<Room<MatchState>> {
  try {
    return await getClient().joinOrCreate<MatchState>("match", { code, ...meta });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (e?.code === 4212 || /not found|invalid room/i.test(msg)) {
      throw new RoomNotFoundError(code);
    }
    throw e;
  }
}
```

> Note: `joinOrCreate("match", {code})` will *create* a match room if matchmaking allows — verify the server's `match` room registration is `define`d such that a bad code does not silently create a fresh room with that code. If `joinOrCreate` auto-creates, switch the guest path to `join` (not `joinOrCreate`) so a missing code errors. Confirm against `apps/server/src/index.ts` room registration during implementation and adjust this wrapper to use `getClient().join(...)` for the guest path if needed.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @se/client typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/net/colyseusClient.ts
git commit -m "feat(client): RoomNotFoundError for invalid invite codes"
```

---

## Task 5: Cosmetic battle simulation (pure)

**Files:**
- Create: `apps/client/src/render/lobbyBattleSim.ts`
- Test: `apps/client/src/render/lobbyBattleSim.test.ts`

Pure, deterministic-friendly ballistics for the backdrop. No Pixi here.

- [ ] **Step 1: Write failing tests**

`apps/client/src/render/lobbyBattleSim.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { stepProjectile, aimAt, shouldReset, type SimProjectile } from "./lobbyBattleSim";

describe("stepProjectile", () => {
  it("applies gravity to vertical velocity over dt", () => {
    const p: SimProjectile = { x: 0, y: 0, vx: 100, vy: 0 };
    const next = stepProjectile(p, { gravity: 300, wind: 0, dt: 0.1 });
    expect(next.vy).toBeCloseTo(30, 5);     // 300 * 0.1
    expect(next.x).toBeCloseTo(10, 5);      // 100 * 0.1
  });
  it("nudges horizontal velocity by wind", () => {
    const p: SimProjectile = { x: 0, y: 0, vx: 0, vy: 0 };
    const next = stepProjectile(p, { gravity: 0, wind: 50, dt: 0.1 });
    expect(next.vx).toBeGreaterThan(0);
  });
});

describe("aimAt", () => {
  it("returns vx toward the target's horizontal direction", () => {
    const right = aimAt({ x: 0, y: 0 }, { x: 500, y: 0 }, 0);
    expect(right.vx).toBeGreaterThan(0);
    const left = aimAt({ x: 500, y: 0 }, { x: 0, y: 0 }, 0);
    expect(left.vx).toBeLessThan(0);
  });
  it("always launches upward (negative vy in screen space)", () => {
    const a = aimAt({ x: 0, y: 0 }, { x: 200, y: 0 }, 0);
    expect(a.vy).toBeLessThan(0);
  });
});

describe("shouldReset", () => {
  it("resets when one or fewer tanks are alive", () => {
    expect(shouldReset({ aliveCount: 1, elapsedMs: 0, maxMs: 25000 })).toBe(true);
    expect(shouldReset({ aliveCount: 0, elapsedMs: 0, maxMs: 25000 })).toBe(true);
  });
  it("resets when elapsed exceeds maxMs", () => {
    expect(shouldReset({ aliveCount: 4, elapsedMs: 26000, maxMs: 25000 })).toBe(true);
  });
  it("does not reset mid-battle", () => {
    expect(shouldReset({ aliveCount: 3, elapsedMs: 1000, maxMs: 25000 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @se/client test`
Expected: FAIL (`./lobbyBattleSim` not found).

- [ ] **Step 3: Implement lobbyBattleSim.ts**

`apps/client/src/render/lobbyBattleSim.ts`:

```typescript
export interface SimProjectile { x: number; y: number; vx: number; vy: number; }
export interface Vec2 { x: number; y: number; }

export function stepProjectile(
  p: SimProjectile,
  opts: { gravity: number; wind: number; dt: number },
): SimProjectile {
  const vx = p.vx + opts.wind * opts.dt;
  const vy = p.vy + opts.gravity * opts.dt;
  return { x: p.x + vx * opts.dt, y: p.y + vy * opts.dt, vx, vy };
}

// Cosmetic aim: lob a shot from `from` toward `to`. Screen space: +y is down,
// so "up" is negative vy. `noise` in [0,1) randomizes the arc.
export function aimAt(from: Vec2, to: Vec2, noise: number): { vx: number; vy: number } {
  const dir = Math.sign(to.x - from.x) || 1;
  const dist = Math.abs(to.x - from.x);
  const power = 260 + Math.min(dist, 1200) * 0.18 + noise * 80;
  const launchAngleRad = (50 + noise * 25) * (Math.PI / 180); // 50–75° above horizontal
  return {
    vx: dir * Math.cos(launchAngleRad) * power,
    vy: -Math.sin(launchAngleRad) * power,
  };
}

export function shouldReset(s: { aliveCount: number; elapsedMs: number; maxMs: number }): boolean {
  return s.aliveCount <= 1 || s.elapsedMs >= s.maxMs;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @se/client test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/render/lobbyBattleSim.ts apps/client/src/render/lobbyBattleSim.test.ts
git commit -m "feat(client): cosmetic battle simulation primitives"
```

---

## Task 6: LobbyBattle renderer (Pixi)

**Files:**
- Create: `apps/client/src/render/LobbyBattle.ts`

> Read the public APIs first: `apps/client/src/render/Terrain.ts`, `Tank.ts` (`createTankView`), `Projectile.ts`, `Explosion.ts`, and `Camera.ts` (`computeFit`). Reuse them; do not modify them. If a renderer requires the gameplay camera/state, wrap it minimally rather than changing it.

- [ ] **Step 1: Implement LobbyBattle**

`apps/client/src/render/LobbyBattle.ts` — a class that:
- Constructor `(app: Application)`: creates a `Container`, adds it to `app.stage` at the back (`app.stage.addChildAt(this.container, 0)`).
- `start()`: generate terrain (`generateTerrain` from `@se/game` with random seed + random `ALL_TERRAIN_TYPES`), render with `Terrain`; place 4 tanks at evenly-spread X (jittered), Y from terrain height; render with `createTankView`; fit with `computeFit`; begin the turn loop via `app.ticker`.
- Turn loop: every randomized interval, pick a random alive tank, a random other alive tank as target, call `aimAt` (+ random noise), spawn a `SimProjectile`, integrate each tick with `stepProjectile` using `gravity` and a per-battle random `wind`, render the projectile, and on impact (projectile y at/below terrain height at its x, or off-screen, or near a tank) play `Explosion`, carve a crater into the local heightmap copy + redraw terrain, apply cosmetic blast damage to nearby tanks (reduce a local `hp`, play death anim at 0).
- `shouldReset({aliveCount, elapsedMs, maxMs})` → fade container alpha to 0 (~600ms via ticker), regenerate terrain + 4 fresh tanks, fade back in.
- Pause/resume on `document.visibilitychange` (`document.hidden`).
- `dispose()`: stop ticker callback, remove visibilitychange listener, `container.destroy({ children: true })`.

Constants at top of file:
```typescript
const BATTLE_GRAVITY = 300;     // mirrors gameplay feel; cosmetic only
const BATTLE_MAX_MS = 25_000;
const TURN_MIN_MS = 1_600;
const TURN_MAX_MS = 2_600;
const TANK_COUNT = 4;
```

(Full body is straightforward wiring of the already-tested sim + existing renderers. No new pure logic — keep all math in `lobbyBattleSim.ts`.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @se/client typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/render/LobbyBattle.ts
git commit -m "feat(client): cosmetic lobby background battle renderer"
```

(Visual correctness is verified in Task 10 via Playwright.)

---

## Task 7: LobbyScene rewrite — unified waiting room

**Files:**
- Modify (rewrite): `apps/client/src/scenes/LobbyScene.ts`

The DOM structure mirrors the approved mockup `panel-v4.html`. `LobbyScene` owns the connected `Room`, renders the panel into `#ui`, binds to state via `buildLobbyView`, and sends messages.

- [ ] **Step 1: Implement the rewritten LobbyScene**

Class shape:
```typescript
import type { Room } from "colyseus.js";
import type { MatchState } from "@se/shared";
import { COLORS, HATS } from "@se/shared";
import { loadIdentity, saveIdentity } from "../lib/identity";
import { inviteLink, buildLobbyView, type LobbyView } from "../lib/lobby";

export class LobbyScene {
  private panel: HTMLDivElement;
  private room: Room<MatchState>;
  private code: string;
  private onStart: () => void;          // called by controller when phase -> playing
  private identityDebounce?: ReturnType<typeof setTimeout>;

  constructor(room: Room<MatchState>, code: string, onPlaying: () => void) { ... }

  private render(view: LobbyView): void { /* build innerHTML from view; rebind events */ }
  private bindStateListeners(): void {
    // re-render on: tanks add/remove/change, aiSlots add/remove/change,
    // observers add/remove, listen('hostId'), listen('maxRounds'), listen('loadoutId').
    // listen('phase') -> if 'playing' call this.onStart()
  }
  private sendIdentity(): void { this.room.send("set-identity", { nickname, color, hat }); } // debounced
  dispose(): void { /* clear debounce, remove panel */ }
}
```

DOM rules (translate `panel-v4.html`):
- Centered panel: `position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); width:min(600px,94vw); max-height:92vh; overflow:auto; z-index:300;`. Class `interactive` (keep — preserves pointer events over the canvas).
- Sections: INVITE FRIENDS (code chip + invite field `inviteLink(location.origin, code)` + blue Copy Invite button → `navigator.clipboard.writeText(...).catch(()=>{})`, transient "Copied!" 2s), YOUR SOLDIER (name/color/hat from `COLORS`/`HATS`), COMBATANTS roster (scroll container max-height 208px; rows from `view.combatants`; HOST/YOU badges; AI rows get difficulty `<select>` of `ALL_AI_DIFFICULTIES` + remove ✕, host-only; `+ Add AI` host-only, disabled+“Lobby full — N/10” when `view.isFull`; spectators strip from `view.spectators` when non-empty), MATCH SETUP strip (rounds stepper → `configure {maxRounds}` 1–20; loadout select → `configure {loadoutId}`; host-only interactive else read-only), START MATCH (host → `room.send("ready",{})`; guest → disabled “Waiting for host to start…”; spectator → hidden, show “👁 You're spectating”).
- Host gating everywhere keyed off `view.isHost`. Spectator view (`view.isSpectator`) replaces YOUR SOLDIER with a spectating note and hides Start.
- Identity inputs: name `input` (debounced 300ms) + color/hat clicks → `saveIdentity` + `sendIdentity()`.
- AI controls: `add-ai {difficulty}`, `remove-ai {sessionId}`, `set-ai-difficulty {sessionId, difficulty}`.

Keep all event handlers re-bound after each `render()` (the panel re-renders innerHTML on state change). Preserve scroll position of the roster across re-renders (read/restore `scrollTop`).

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @se/client typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/scenes/LobbyScene.ts
git commit -m "feat(client): rewrite LobbyScene as unified waiting room"
```

---

## Task 8: LobbyController + main.ts wiring

**Files:**
- Create: `apps/client/src/scenes/LobbyController.ts`
- Modify: `apps/client/src/main.ts`

- [ ] **Step 1: Implement LobbyController**

`apps/client/src/scenes/LobbyController.ts`:
- Constructor `(app: Application)`.
- `async enter()`:
  - `const code = parseRoomCode(location.pathname)`.
  - Start `LobbyBattle` immediately (so the screen is never blank, even if the network is slow/down).
  - Add the dim overlay div (`inset:0; background:rgba(4,2,16,0.30); z-index:200; pointer-events:none;`) into `#ui`.
  - If `code`: `try { room = await joinMatch(code, identity) } catch (RoomNotFoundError) { toast; history.replaceState('/'); code = null }`. On other errors, show a retry toast.
  - If no `code`: `const { room, code } = await createMatch(identity); history.replaceState({}, "", "/" + code)`.
  - Create `LobbyScene(room, code, () => this.toMatch(room, code))`.
- `toMatch(room, code)`: dispose battle + dim + lobbyScene; `new MatchScene(room, code)`.
- Helper `identity = loadIdentity()` → `{ nickname: name, color, hat }` mapping for create/join meta.

- [ ] **Step 2: Rewrite main.ts**

`apps/client/src/main.ts`:
```typescript
import { Application } from "pixi.js";
import { LobbyController } from "./scenes/LobbyController";

declare global { interface Window { pixiApp?: Application } }

async function main() {
  const app = new Application();
  await app.init({ resizeTo: window, background: 0xa6e1fa, antialias: true });
  document.getElementById("app")!.appendChild(app.canvas);
  window.pixiApp = app;
  await new LobbyController(app).enter();
}
main().catch(console.error);
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @se/client typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/scenes/LobbyController.ts apps/client/src/main.ts
git commit -m "feat(client): LobbyController orchestrates battle + waiting room + handoff"
```

---

## Task 9: Trim MatchScene + AimControls lobby-config

**Files:**
- Modify: `apps/client/src/scenes/MatchScene.ts`
- Modify: `apps/client/src/input/AimControls.ts`

The lobby phase is now fully owned by `LobbyScene`. `MatchScene` is constructed only when `phase === "playing"`, so its lobby-phase UI is dead code.

- [ ] **Step 1: Remove the lobby-config block from AimControls**

In `apps/client/src/input/AimControls.ts`, remove the host lobby UI: the `startBtn` (and its `ready` send), `loadoutSection`/`loadoutBtns`/`refreshLoadoutBtns`, the max-rounds section, the AI-slots section (`add-ai`/`remove-ai`/`set-ai-difficulty` UI), and the terrain/wall config UI (the `configure {terrainTypePool, wallModePool}` send). Keep all *gameplay* controls (angle, power, fire, move, weapon select, phase label for in-match states). Remove now-unused fields/methods and their references in `MatchScene` (e.g., calls that show/hide the lobby sections during `phase === "lobby"`).

> Keep the change surgical: grep for `startBtn`, `loadoutSection`, `loadoutBtns`, `add-ai`, `remove-ai`, `set-ai-difficulty`, `terrainTypePool`, and the rounds-stepper element ids, and remove those blocks + their wiring. Leave `select-weapon`, `fire`, `move` intact.

- [ ] **Step 2: Simplify MatchScene lobby handling**

In `apps/client/src/scenes/MatchScene.ts`, remove branches that render/manage lobby-phase config UI (e.g., `if (phase === "lobby") { showLobbyConfig... }`). A `MatchScene` may still briefly observe `phase === "lobby"` only if constructed early — but per Task 8 it is constructed on `playing`, so lobby branches can be removed. Keep `lastPhase` bookkeeping for the phases it does handle (playing/resolving/round-summary/shopping/ended).

- [ ] **Step 3: Typecheck + run existing client tests**

Run: `pnpm --filter @se/client typecheck && pnpm --filter @se/client test`
Expected: PASS (no references to removed members; all existing tests green).

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/input/AimControls.ts apps/client/src/scenes/MatchScene.ts
git commit -m "refactor(client): remove duplicate lobby-config UI from match scene"
```

---

## Task 10: End-to-end verification (Playwright) + polish pass

**Files:**
- Use Playwright MCP (live driving) and/or `tests/e2e/` if a harness exists.

- [ ] **Step 1: Boot the stack**

Run: `pnpm dev` (client on :5183 per `vite.config.ts`, server on :2567). Confirm both up.

- [ ] **Step 2: Single-client checks**
- Navigate to client root. Assert: background battle canvas animates (4 tanks, shells, explosions); panel is centered; `ROOM CODE` chip shows a 6-char code; URL path is `/CODE`; invite field shows `origin/CODE`.
- Click Copy Invite → clipboard contains `origin/CODE` (read via `navigator.clipboard.readText()` in `browser_evaluate`); button shows "Copied!".
- Screenshot → compare against `panel-v4.html` intent.

- [ ] **Step 3: Two-client join**
- Open a second context at the copied invite URL. Assert the second player appears in the host's COMBATANTS roster live; guest sees read-only setup + "Waiting for host to start…".

- [ ] **Step 4: Host config + capacity**
- Host adds AI until 10/10; assert Add-AI disables with "Lobby full — 10 / 10"; roster scrolls. Join an 11th client; assert it appears in the SPECTATORS strip.

- [ ] **Step 5: Start handoff**
- Host clicks START MATCH; assert both clients leave the lobby (battle + panel gone) and render the live match on the same terrain — no blue screen, no rejoin.

- [ ] **Step 6: Resilience**
- Background the tab; assert the battle pauses (no console errors); refocus resumes.

- [ ] **Step 7: Full suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: All green.

- [ ] **Step 8: Polish pass**
- Fix any visual deltas from the mockup (spacing, colors, scrollbar, dim level). Re-screenshot.
- Commit polish:
```bash
git add -A
git commit -m "polish(lobby): align waiting room with approved mockup; e2e verified"
```

---

## Self-Review Notes (coverage check)

- Spec §3 (server: Observer, MatchState.observers, set-identity, onJoin/onLeave) → Tasks 1, 2. ✓
- Spec §4 (entry decision, colyseusClient, invite link, identity edit) → Tasks 3, 4, 7, 8. ✓
- Spec §5 (Layout A panel, 4 sections, host/guest, capacity, spectators) → Task 7. ✓
- Spec §6 (cosmetic battle) → Tasks 5, 6. ✓
- Spec §7–8 (sequences, handoff state machine) → Tasks 8, 9. ✓
- Spec §9 (edge cases: not-found, full, host leave, clipboard, server down, backgrounded) → Tasks 4, 7, 8, 10. ✓
- Spec §10 (tests) → unit tests in Tasks 2, 3, 5; Playwright in Task 10. ✓
- Spec §11 file-change summary → matches File Structure above. ✓
- Spec §12 open questions (ALL_TANK_COLORS/HATS; renderer APIs; ticker vs setTimeout) → resolved: use existing `COLORS`/`HATS` (HATS fixed in Task 1); read renderer APIs in Task 6; use `app.ticker` in Task 6. ✓
