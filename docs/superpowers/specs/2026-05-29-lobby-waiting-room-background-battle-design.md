# Lobby Redesign: Unified Waiting Room + Cosmetic Background Battle — Design

**Date:** 2026-05-29
**Status:** Approved (design phase)
**Author:** brainstorming session
**Supersedes / completes:** Phase 8 §2.3 (AI Demo Battle, deferred) and §2.5 (Host Sees Joiners, never implemented)

---

## 1. Overview

The lobby a player sees today is a flat light-blue screen with a small dark panel docked to the far right. Three things are wrong with it, all traceable to the lobby being only half-built:

1. **No background battle.** `main.ts` paints a flat blue (`0xa6e1fa`) and mounts an HTML panel. The "AI Demo Battle" (Phase 8 §2.3) was explicitly deferred and never built.
2. **The share link is broken.** The "Share Link" button copies `location.href`, but in the create flow **no room exists yet** — the room code is only minted when the host clicks Start Match. So the copied link is a bare `localhost` with no code; a second player pasting it does not land in the same room.
3. **The panel is cramped and oddly placed.** It is right-docked, small, and visually busy; the share button is styled gray and reads as disabled.

The root structural cause is that there are **two disconnected lobby concepts**:

- `LobbyScene` (the HTML panel) — an identity/entry screen. No room. This is where the broken share button lives.
- `MatchScene` in `phase === "lobby"` (driven by `AimControls`) — the *real* waiting room: the room exists, its code is in the URL, the host configures rounds/loadout/AI, and clicking Start sends the `"ready"` message. Other players can join here by code.

The rounds control is duplicated across both, and the share button sits on the one screen where sharing is impossible.

This redesign **collapses the two into a single unified waiting room**, builds a **client-side cosmetic background battle**, and fixes the share/invite flow so a working invite link exists from the moment the lobby loads.

### 1.1 Goals

- A working invite link (room code embedded) available the instant the lobby renders.
- One centered, roomy, clearly-sectioned waiting-room panel over a live (cosmetic) battle background.
- A single combatants roster that lists host, human players, and AI opponents together, plus a separate spectators strip.
- Remove the duplicate lobby-config UI inside the match scene.

### 1.2 Non-goals (YAGNI)

- No real networked demo room (rejected in favor of a cosmetic client-side loop).
- No color-conflict resolution (duplicate colors remain allowed, matching current `onJoin` behavior). Noted as possible future work.
- No lobby chat, no spectator chat, no ready-check for non-host players.
- No change to in-match gameplay, shop, replay, or scoring.

### 1.3 Locked decisions (from brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Lobby layout | **A — centered, large panel over a full-bleed, dimmed battle** |
| 2 | Room / share flow | **One unified waiting room; room created on load; same panel is the waiting room** |
| 3 | Background battle engine | **Client-side cosmetic loop** (reuses render classes + local ballistic physics) |

---

## 2. Architecture Overview

### 2.1 Scene lifecycle (new)

```
main.ts
  └─ creates PixiJS Application (background still 0xa6e1fa as a fallback)
  └─ creates LobbyController
        ├─ LobbyBattle      (PixiJS container: cosmetic battle, behind everything)
        ├─ dim overlay      (HTML div, z-index between canvas and panel)
        └─ LobbyScene       (HTML panel: owns the Colyseus Room + waiting-room UI)

LobbyScene subscribes to room state.
When state.phase transitions "lobby" → "playing":
  LobbyController disposes LobbyBattle + dim + LobbyScene
  and constructs MatchScene(room, code)   // same room handle, no rejoin
```

**Key change:** the Colyseus `Room` is created/joined by the lobby layer and **handed to `MatchScene` already connected**. `MatchScene` no longer renders any lobby-phase configuration UI.

### 2.2 Component responsibilities

| Component | File | Responsibility | Depends on |
|-----------|------|----------------|------------|
| `LobbyController` | `apps/client/src/scenes/LobbyController.ts` (new) | Orchestrates lobby: creates battle + panel, owns phase→playing handoff to MatchScene | `LobbyBattle`, `LobbyScene`, `MatchScene` |
| `LobbyScene` | `apps/client/src/scenes/LobbyScene.ts` (rewritten) | Owns the Room; renders the 4-section waiting-room panel; sends `set-identity`, `configure`, `add-ai`, `remove-ai`, `set-ai-difficulty`, `ready`; live-binds roster/spectators to state | `colyseusClient`, `identity` |
| `LobbyBattle` | `apps/client/src/render/LobbyBattle.ts` (new) | Self-contained cosmetic 4-tank battle in a Pixi container; no networking | `Terrain`, `Tank`, `Projectile`, `Explosion` render classes; `generateTerrain` (`@se/game`) |
| `colyseusClient` | `apps/client/src/net/colyseusClient.ts` (extended) | `createMatch` (host) and `joinMatch` (guest) return a connected room + code; new error typing for not-found / full | `colyseus.js` |
| `MatchScene` | `apps/client/src/scenes/MatchScene.ts` (trimmed) | Gameplay only; lobby-phase code paths removed | — |
| `AimControls` | `apps/client/src/input/AimControls.ts` (trimmed) | Remove lobby-config block (start button, loadout buttons, rounds stepper, AI slot UI, terrain config) | — |
| `MatchState` | `packages/shared/src/schema/MatchState.ts` (extended) | Add `observers` array | `Observer` schema |
| `Observer` | `packages/shared/src/schema/Observer.ts` (new) | `{ sessionId, nickname }` | — |
| `MatchRoom` | `apps/server/src/rooms/MatchRoom.ts` (extended) | New `set-identity` handler (lobby only); populate/clear `observers` in `onJoin`/`onLeave` | — |

---

## 3. Server Changes

### 3.1 New schema: `Observer`

`packages/shared/src/schema/Observer.ts`

```typescript
import { Schema, type } from "@colyseus/schema";

export class Observer extends Schema {
  @type("string") sessionId = "";
  @type("string") nickname = "";
}
```

### 3.2 `MatchState` addition

```typescript
// MatchState.ts
import { Observer } from "./Observer";
// ...
@type([Observer]) observers = new ArraySchema<Observer>();
```

No other state fields change. (All host config the panel needs — `maxRounds`, `loadoutId`, `terrainTypePool`, `wallModePool`, `aiSlots`, `tanks`, `hostId`, `roomCode`, `phase` — already exist.)

### 3.3 New message: `set-identity` (lobby only)

Lets a connected player edit their soldier in the waiting room and have it propagate to everyone's roster.

**Client → server:** `room.send("set-identity", { nickname?: string; color?: TankColor; hat?: TankHat })`

**Handler (added in `MatchRoom.onCreate`):**

```typescript
this.onMessage("set-identity", (client, msg: { nickname?: string; color?: string; hat?: string }) => {
  if (this.state.phase !== "lobby") return;          // identity locked once match starts
  const tank = this.state.tanks.get(client.sessionId);
  if (!tank) return;                                  // observers cannot set identity
  if (typeof msg?.nickname === "string") {
    const n = msg.nickname.trim().slice(0, 24);
    if (n.length > 0) tank.nickname = n;
  }
  if (typeof msg?.color === "string" && (ALL_TANK_COLORS as string[]).includes(msg.color)) {
    tank.color = msg.color as TankColor;
  }
  if (typeof msg?.hat === "string" && (ALL_TANK_HATS as string[]).includes(msg.hat)) {
    tank.hat = msg.hat as TankHat;
  }
});
```

> `ALL_TANK_COLORS` / `ALL_TANK_HATS` — validation arrays. If these constants do not yet exist in `@se/shared`, add them alongside the existing `TankColor` / `TankHat` types (the client already enumerates them in `identity.ts`). The implementation plan must verify and add if missing.

**No conflict resolution:** duplicate colors are allowed (unchanged from today). Out of scope.

### 3.4 Observer tracking in `onJoin` / `onLeave`

`onJoin` (existing observer branch, extended to record the schema entry):

```typescript
onJoin(client, options: JoinOptions) {
  if (this.state.phase !== "lobby" || this.state.tanks.size >= this.maxClients) {
    this.observers.add(client.sessionId);                 // existing server-side Set
    const obs = new Observer();
    obs.sessionId = client.sessionId;
    obs.nickname = (options.nickname ?? "Spectator").slice(0, 24);
    this.state.observers.push(obs);                        // NEW: surface in schema
    return;
  }
  // ... existing player path unchanged
}
```

`onLeave` (observer branch, extended to remove the schema entry):

```typescript
if (this.observers.has(client.sessionId)) {
  this.observers.delete(client.sessionId);
  const i = this.state.observers.findIndex(o => o.sessionId === client.sessionId);
  if (i !== -1) this.state.observers.splice(i, 1);          // NEW
  return;
}
```

> Note: a player who becomes an observer (joined while full) keeps the existing semantics. Players never auto-promote from observer to combatant in the lobby (out of scope). If a slot frees up, they remain a spectator for that match.

---

## 4. Client: Room / Share Flow

### 4.1 Entry decision (on app load)

```
parse code from URL path  /^\/([A-Z0-9]{6})$/i  → code | null

if code:                       // GUEST path
    join existing room with code + localStorage identity
    on success: this client is host only if it is the first tank (server decides hostId)
    on failure:
        - "not found"  → show toast "Room <code> not found", strip code from URL, fall back to HOST path
        - "full" / "in progress" → join succeeds as observer (server returns observer); panel renders spectator view
else:                          // HOST path
    createMatch(identity) → { room, code }
    history.replaceState({}, "", "/" + code)   // code in URL immediately → invite link valid
```

**Empty-room safety:** `MatchRoom` uses Colyseus default `autoDispose = true`, so rooms created by visitors who leave without starting are disposed automatically. Creating a room per host-visit is acceptable.

### 4.2 `colyseusClient` changes

- `createMatch(meta)` — unchanged in spirit (lobby → `matchCreated` → join match). Continues to return `{ room, code }`. The **timing** moves earlier (called on load for the host path, not on Start Match click).
- `joinMatch(code, meta)` — unchanged signature. Add typed error handling so the caller can distinguish "not found" from transport errors (inspect Colyseus error code / message).
- Both already pass `{ code, ...meta }` so the joining tank gets the player's identity immediately.

### 4.3 Invite link format

- Copied value: `` `${location.origin}/${code}` `` (e.g. `http://localhost:5184/K7P2QX`, `https://scorched.earth/K7P2QX` in prod).
- The displayed invite text in the panel shows the host (`location.host`) + `/CODE`.
- Copy uses `navigator.clipboard.writeText(...)` with the existing `.catch(() => {})` guard; on success the button shows a transient "Copied!" state for 2s.

### 4.4 Identity editing in the lobby

- Name input (debounced ~300ms), color swatch click, hat click each: (a) update localStorage via `saveIdentity`, and (b) `room.send("set-identity", {...})`.
- The local player's own roster row updates from server state like everyone else's (single source of truth = `state.tanks`), avoiding optimistic/again-from-server flicker.

---

## 5. Client: Waiting-Room Panel (Layout A)

### 5.1 Container & background

- **Battle canvas:** the PixiJS app canvas (full window), rendering `LobbyBattle` behind everything.
- **Dim overlay:** a fixed `div`, `inset:0`, `background:rgba(4,2,16,0.30)`, `z-index:200`, `pointer-events:none`.
- **Panel:** centered with `position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); width:min(600px,94vw); max-height:92vh; z-index:300; overflow:auto`. Dark navy arcade styling consistent with existing shop/round-summary theme. Entrance: fade + slight scale-up (replaces the old slide-from-right).

### 5.2 Sections (top to bottom)

All section cards share: `background:rgba(255,255,255,0.035); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding`. Each has a header label (orange, letter-spaced) with a trailing divider rule.

**Title:** `SCORCHED EARTH` (Impact, orange, glow).

1. **INVITE FRIENDS** (full width)
   - Room-code chip: label `ROOM CODE` + value (monospace, gold, e.g. `K7P2QX`).
   - Invite URL field (read-only, monospace, ellipsis on overflow).
   - **Copy Invite** button — solid blue gradient, clearly clickable (fixes the grayed-out look). Shows "Copied!" for 2s on click.

2. **YOUR SOLDIER** (left half) — host and guests alike
   - `NAME` text input (maxlength 24).
   - `COLOR` — 10 swatches; selected has orange ring.
   - `HAT` — 9 options (none + 8 hats); selected has orange border.

3. **COMBATANTS · N / 10** (right half) — unified roster
   - Header count shows `<combatants> / 10`.
   - Scrollable list, `max-height ≈ 208px`, custom orange scrollbar. Fixed height keeps the panel from exceeding the viewport regardless of count.
   - **Row (human):** color dot · name · badges (`HOST` if `sessionId === hostId`, `YOU` if it's the local client). Disconnected (reconnecting) players render at reduced opacity.
   - **Row (AI):** neutral dot · `🤖 <name>` · `AI` badge · difficulty `<select>` (`moron / shooter / pyro / cyborg / bouncer`) · remove `✕`. The difficulty select and remove are **host-only** (disabled/hidden for guests).
   - **+ Add AI opponent** button under the list — host-only. Disabled with label "Lobby full — 10 / 10" when `tanks.size + aiSlots.length >= 10`.
   - **Spectators strip** (footer of this card, only if `observers.length > 0`): divider + `👁 SPECTATORS · K` + comma-separated nicknames (truncated past ~3 with "+N more").

4. **MATCH SETUP** (full width, slim strip) — host-only controls; read-only display for guests
   - `ROUNDS` stepper (− value +), 1–20, sends `configure { maxRounds }`.
   - vertical divider.
   - `LOADOUT` `<select>` (Starter / Standard / Bonanza), sends `configure { loadoutId }`.
   - (Terrain/wall pool config from the old AimControls lobby is **out of scope for the panel v1**; defaults are used. It can be added later as an "Advanced" disclosure. The server messages remain available.)

5. **START MATCH** (full width, orange CTA)
   - Host: enabled whenever `phase === "lobby"` and at least one human is present (the host always satisfies this). Sends `room.send("ready", {})`.
   - Guest: replaced by a disabled strip reading "Waiting for host to start…".

### 5.3 Host vs guest rendering

A single render path keyed off `isHost = (localSessionId === state.hostId)`:

| Element | Host | Guest |
|--------|------|-------|
| Invite section | ✓ | ✓ |
| Your Soldier | ✓ | ✓ |
| Combatants roster (view) | ✓ | ✓ |
| AI difficulty / remove / Add AI | enabled | hidden/disabled |
| Match Setup controls | interactive | read-only values |
| Start button | ✓ | "Waiting for host…" |

**Host migration:** if `hostId` changes (host left; server reassigns), the panel re-renders to grant/revoke host controls live.

### 5.4 Live binding

Subscribe with Colyseus schema callbacks:
- `tanks` (add/remove/change) → re-render roster + combatant count + start-button state.
- `aiSlots` (add/remove/change) → re-render roster.
- `observers` (add/remove) → re-render spectators strip.
- `hostId` listener → re-render host/guest affordances.
- `maxRounds`, `loadoutId` listeners → update setup strip.
- `phase` listener → on `"playing"`, trigger handoff (§2.1).

---

## 6. Client: Cosmetic Background Battle (`LobbyBattle`)

### 6.1 Principle

Purely decorative, fully client-side, no networking, robust to server downtime. It reuses the existing **render** classes and **mirrors** the real physics constants but uses its own lightweight integrator (it does not import the server tick loop).

### 6.2 Construction

- Add a `Container` to the stage **below** the UI and dim overlay.
- Generate terrain: `generateTerrain({ seed: random, type: random ∈ ALL_TERRAIN_TYPES, width: TERRAIN_WIDTH, height: TERRAIN_HEIGHT })`.
- Render terrain with the existing `Terrain` renderer.
- Place 4 tanks at 4 spread X positions (evenly spaced across the width with jitter; Y = terrain height at X). Random distinct colors from the palette; random hats. Render with existing `Tank` renderer.
- Camera: fit the whole battlefield to the window (simple scale-to-fit; this is a backdrop, not the gameplay camera).
- Each tank gets a cosmetic `hp` (start 100).

### 6.3 Turn loop

A self-scheduling loop (driven by the Pixi ticker or `setTimeout`):

```
every TURN_INTERVAL (1.6–2.6s, randomized):
  shooter = random alive tank
  target  = random other alive tank
  aim     = ballistic-ish angle/power toward target + noise (so shots miss/vary)
  spawn a projectile (baby-missile visual) with vx, vy from aim
  integrate at 60fps locally:
     vy += GRAVITY * dt
     vx += WIND * k * dt
     x += vx*dt; y += vy*dt
     render Projectile each step
     on terrain/tank/edge collision OR offscreen:
        play Explosion at impact (existing Explosion renderer)
        carve a crater into the local terrain heightmap + redraw terrain
        cosmetic damage to tanks within blast radius (reduce hp; 0 → death anim)
        end this turn
```

- `GRAVITY`, `WIND` magnitude mirror real constants for believable arcs. Wind is a fixed random value per battle.
- Optional realism upgrade (stretch): use `scanBestShot`/`think` from `@se/game` to aim — left out of v1 to keep the module dependency-light; randomized aim is sufficient for a backdrop.

### 6.4 Reset conditions

- When `≤ 1` tank remains alive, **or** after `BATTLE_MAX_MS ≈ 25s`: fade the container to ~0 over ~600ms, regenerate terrain + 4 fresh full-hp tanks, fade back in. Endless loop.

### 6.5 Performance & lifecycle

- Pause the loop on `document.visibilitychange` (hidden) and resume on visible.
- `dispose()` clears timers/ticker callbacks, destroys the container and all child graphics, removes listeners. Called by `LobbyController` on phase→playing handoff.

---

## 7. Data Flow / Sequences

### 7.1 Host creates a lobby (no code in URL)

```
load → no code → createMatch(identity)
  client → LobbyRoom "createMatch" → server mints code → "matchCreated" {code}
  client → joinOrCreate("match", {code, ...identity})
  server MatchRoom.onCreate (phase=lobby), onJoin → tank added, hostId = me
  client: replaceState("/CODE"); LobbyScene binds state; LobbyBattle starts
panel shows: my row (HOST, YOU), working invite link, host controls, Start enabled
```

### 7.2 Guest joins via invite link (code in URL)

```
load → code present → joinMatch(code, identity)
  server onJoin (phase=lobby, not full) → tank added (not host)
  client: LobbyScene binds state
panel shows: roster incl. host + me (YOU), read-only setup, "Waiting for host…"
host's panel: roster gains my row live (tanks.onAdd)
```

### 7.3 Guest joins a full / in-progress room

```
server onJoin → observer branch → observers.add + state.observers.push({id, nick})
client: panel renders spectator view (no soldier edit effect on match; shows "Spectating")
all panels: spectators strip shows my nickname
```

> Spectator view detail: the local client can tell it is an observer because `state.tanks` has no entry for its `sessionId` while `state.observers` does. In that case the Your Soldier section is replaced by a "👁 You're spectating" note, and Start is hidden.

### 7.4 Identity edit

```
user types name / picks color / picks hat
client: saveIdentity(local) + room.send("set-identity", {...})
server: updates my tank (lobby only)
all panels: tanks.onChange → my row updates everywhere
```

### 7.5 Host adds AI / changes difficulty / starts

```
host clicks +Add AI → room.send("add-ai", {difficulty})
  server: pushes AiSlot (if total < 10) → aiSlots.onAdd → roster row appears on all panels
host clicks Start → room.send("ready", {})
  server.startMatch(): phase = "playing", terrain generated, AI tanks created, placement, etc.
  ALL clients: phase listener fires "playing"
    LobbyController disposes LobbyBattle + dim + LobbyScene
    constructs MatchScene(room, code)  // already-connected room
```

---

## 8. State Machine (client lobby → match)

```
        ┌────────────────────────── phase listener ──────────────────────────┐
        │                                                                     │
[boot] → CONNECTING ──ok──→ LOBBY(panel+battle) ──phase="playing"──→ MATCH(MatchScene)
        │                        │
        │                        ├─ host edits config / roster (lobby only)
        │                        └─ players/observers join & leave (live)
        └──join error──→ ERROR(toast) ──(not-found)──→ fall back to host create
                                       └─(transport)──→ retry / message
```

`phase` values other than `"lobby"`/`"playing"` are not reachable from the lobby (a freshly created room is always `lobby`; the only transition the lobby triggers is `ready` → `playing`).

---

## 9. Edge Cases & Failure Modes

| Case | Handling |
|------|----------|
| Invite link to a non-existent/expired code | `joinMatch` rejects "not found" → toast, strip code from URL, fall back to creating a new room as host. |
| Room full (10 combatants) when joining | Server returns observer; panel renders spectator view; user appears in spectators strip. |
| Joining a room whose match already started | Same as full → observer (existing `phase !== "lobby"` branch). |
| Host leaves during lobby | Server reassigns `hostId` to another tank (existing logic); remaining panels re-render; new host gains controls. If no tanks remain, room auto-disposes. |
| Last combatant leaves before Start | Room empties → `autoDispose` cleans it up. The leaver navigated away, so no client is affected. |
| Add AI when already at 10 slots | Server ignores (existing `totalSlots >= maxClients` guard); client disables the button proactively. |
| Duplicate colors among players | Allowed (no conflict resolution). In-match tanks may share a color; acceptable for v1. |
| `set-identity` after match start | Server ignores (`phase !== "lobby"` guard). |
| Clipboard API unavailable / denied | `writeText().catch(()=>{})`; still show "Copied!" optimistically OR show "Press Ctrl/Cmd-C" fallback (select the invite field text). |
| Server down on load | Lobby connect fails → error toast with retry; `LobbyBattle` still renders (it is offline), so the screen is never blank blue. |
| Tab backgrounded | `LobbyBattle` pauses to save CPU; resumes on focus. |
| Very long nicknames in roster | Row name uses ellipsis overflow; full name on hover (`title`). |
| Many observers | Spectators strip truncates to first ~3 names + "+N more". |

---

## 10. Testing Plan

### 10.1 Server unit tests (vitest)
- `set-identity`: updates nickname/color/hat for caller's tank in lobby; rejects when `phase !== "lobby"`; rejects unknown color/hat; ignores for observers (no tank).
- `observers` schema: `onJoin` while full/in-progress pushes an `Observer`; `onLeave` removes it; nickname captured from join options.
- Existing host-gated handlers (`add-ai`, `configure`, `ready`) remain green.

### 10.2 Client unit tests
- Entry decision: code-in-URL → join path; no code → create path; not-found → fallback to create (mock `colyseusClient`).
- Invite link format: `origin + "/" + code`.
- Roster render: combatant count, HOST/YOU badges, AI rows with difficulty select, capacity disabling of Add-AI, spectators strip visibility.
- Host vs guest affordances toggle off `hostId`.
- `LobbyBattle`: constructs without throwing; `dispose()` removes all children and clears timers (no leaked ticker callbacks); reset regenerates tanks; pauses when hidden.

### 10.3 Manual / Playwright verification (acceptance)
1. Load lobby → background battle animates (terrain + 4 tanks firing); panel centered; invite link shows a real code; Copy Invite copies `origin/CODE`.
2. Open the copied link in a second browser context → second player appears in the host's roster live; guest sees read-only setup + "Waiting for host…".
3. Host adds 2 AI, changes one difficulty, sets rounds → reflected on guest's roster/setup.
4. Fill to 10 combatants, then join an 11th → 11th becomes a spectator and shows in the spectators strip; Add-AI disabled at 10/10; roster scrolls.
5. Host clicks Start → both clients transition into the match on the same terrain/room (no rejoin, no flat blue screen).
6. Backgrounding the tab pauses the battle; refocus resumes.

The Playwright MCP run must screenshot states 1, 2, and 4 and confirm against the approved mockups.

---

## 11. File-Change Summary

**New**
- `packages/shared/src/schema/Observer.ts`
- `apps/client/src/scenes/LobbyController.ts`
- `apps/client/src/render/LobbyBattle.ts`
- (tests) `apps/server` set-identity/observer specs; `apps/client` lobby/battle specs

**Modified**
- `packages/shared/src/schema/MatchState.ts` (+`observers`)
- `packages/shared/src/constants.ts` (add `ALL_TANK_COLORS`/`ALL_TANK_HATS` if missing)
- `apps/server/src/rooms/MatchRoom.ts` (+`set-identity`, observer schema in onJoin/onLeave)
- `apps/client/src/net/colyseusClient.ts` (typed join errors; usage timing)
- `apps/client/src/main.ts` (boot `LobbyController` instead of `LobbyScene`)
- `apps/client/src/scenes/LobbyScene.ts` (rewritten as the unified waiting room)
- `apps/client/src/scenes/MatchScene.ts` (remove lobby-phase UI paths)
- `apps/client/src/input/AimControls.ts` (remove lobby-config block: start btn, loadout, rounds, AI slots, terrain config)

---

## 12. Open Questions for Implementation Plan

- Confirm whether `ALL_TANK_COLORS` / `ALL_TANK_HATS` already exist in `@se/shared`; if not, add them (client `identity.ts` already lists the values).
- Confirm the exact public API of the existing `Terrain` / `Tank` / `Projectile` / `Explosion` renderers so `LobbyBattle` can reuse them without modification; if a renderer assumes the gameplay camera/state, add a thin cosmetic adapter rather than changing the renderer.
- Decide ticker vs `setTimeout` for the battle loop (prefer the existing Pixi ticker for frame alignment).
