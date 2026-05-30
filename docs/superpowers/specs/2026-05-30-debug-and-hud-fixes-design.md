# Design Spec — HUD Redesign, Camera/Weapon/Respawn Fixes, and Debug/Telemetry System

- **Date:** 2026-05-30
- **Branch (current):** `feat/lobby-waiting-room-background-battle`
- **Status:** Approved direction; pending spec review → implementation plan.

## 0. Overview & Scope

This spec covers five work items, designed together but implementable as independent units:

1. **Bug — dead-skull persists on respawn** (client render).
2. **Redesign — turn indicator / HUD top → "Layout C"** (new `TurnHud` component).
3. **Bug cluster — camera zoom/pan** (cursor-anchored zoom, smooth steps, world bounds, stuck-state fixes).
4. **Bug — weapon selection unreliable on your turn** (per-frame carousel re-render eating clicks; missing server turn-check).
5. **Feature — debug capture + automated regression** (structured logging, error/manual/invariant capture bundles, headless invariant runner, replay determinism test).

**Tech context:** pnpm monorepo. Client = Vite + **PixiJS v8.2** (`apps/client`). Server = **Colyseus v0.16** (`apps/server`). Shared schemas/constants = `packages/shared`. Pure sim = `packages/game`. Tests = **Vitest** (server + game) and **Playwright** (`tests/e2e`). Sentry is wired server-side, opt-in via `SENTRY_DSN`. A replay recorder already captures intents + terrain ops and serves them at `GET /replays/:id`.

**Verification gates (per project convention):** `pnpm typecheck` is already red on `main`, so gate on **per-package typecheck + the affected test suites**, not the repo-wide typecheck. (See memory: pre-existing-typecheck-failures.)

---

## 1. Dead-Skull Persists on Respawn

### 1.1 Problem
`apps/client/src/render/Tank.ts` `createTankView().setAlive(alive)`:
- On `alive=false` (and not already `dying`): plays a death tween, then appends a `Text('💀')` child to `root` and starts a float ticker.
- On `alive=true`: resets `dying=false`, `alpha=1`, `tint=0xffffff` — **but never removes the skull child or cancels its float ticker.**

Server is correct: `MatchRoom.startNextRound()` sets `tank.hp=100; tank.alive=tank.connected;` and the client `onChange` listener calls `view.setAlive(true)`. So the tank is alive and playable; the skull is orphaned art.

**Why only non-host tanks show it:** the round winner (frequently the host) never died, so its view never created a skull. Every tank that actually died in the prior round carries a stale skull into the next round, regardless of host status.

### 1.2 Fix
Refactor `setAlive` to own the skull lifecycle:

```ts
let dying = false;
let skull: Text | null = null;
let deathTick: ((t:{deltaMS:number})=>void) | null = null;
let floatTick: ((t:{deltaMS:number})=>void) | null = null;

function clearDeathFx() {
  const ticker = (window as any).pixiApp?.ticker;
  if (deathTick) { ticker?.remove(deathTick); deathTick = null; }
  if (floatTick) { ticker?.remove(floatTick); floatTick = null; }
  if (skull) { skull.destroy(); root.removeChild(skull); skull = null; }
}

root.setAlive = (alive) => {
  hpBar.visible = alive;
  if (!alive && !dying) {
    dying = true;
    // ...existing death tween; assign deathTick = onTick; floatTick = onFloat;
    // create `skull` (assign to the outer var, not a local) inside onTick completion.
  } else if (alive) {
    dying = false;
    clearDeathFx();
    root.alpha = 1;
    root.tint = 0xffffff;
    setBarrelAngle(currentAngleDeg); // restore upright barrel
  }
};
```

### 1.3 Edge cases
- `setAlive(true)` fires repeatedly via `onChange` while already alive → `clearDeathFx()` is idempotent (null guards).
- Tank dies, round ends mid-death-tween (tween still running) → `clearDeathFx()` cancels `deathTick` too, not just `floatTick`.
- `destroy()` must also call `clearDeathFx()` to avoid a dangling ticker after `tanks.onRemove`.

### 1.4 Acceptance
- After a round where tank X died, on the next round X renders upright, full HP bar, no skull, barrel at its angle.
- No leaked tickers (assert ticker callback count returns to baseline in a unit test, see §5.4).

---

## 2. HUD / Turn Indicator — "Layout C"

### 2.1 Goal
Remove the top orange/blue "YOUR TURN" banner (`PlayerStrip`) and the small redundant timers. Replace with:
- **Timer ring** (top-left): large central numeral inside a circular arc that depletes as the turn runs down; red + pulse in final 5s.
- **Roster** (top-right): one compact row per player — color dot · name · HP bar · HP number. Current player highlighted gold. Dead = 💀 + dimmed (`opacity:0.4`). Center screen stays clear for aiming.

### 2.2 New component: `apps/client/src/hud/TurnHud.ts`
Replaces `PlayerStrip.ts`. DOM-based (consistent with existing HUD), mounted into `#ui`.

**Public API**
```ts
export class TurnHud {
  el: HTMLDivElement;             // wrapper; display toggled by phase
  constructor(localSessionId: string);
  update(state: MatchState): void;   // called each frame from MatchScene ticker
  destroy(): void;
}
```

**Structure**
```
.turnhud (wrapper, pointer-events:none, z-index:90)
 ├─ #turnhud-ring  (top:14px;left:14px)   — SVG, 96×96
 │    ├─ <circle> track  (static, faint)
 │    ├─ <circle> progress (stroke-dasharray arc; rotates -90°)
 │    └─ <div> numeral   (absolute-centered, Impact 40px)
 └─ #turnhud-roster (top:14px;right:14px) — flex column, gap 5px
      └─ .thp-row * N  (dot · name · hpbar · hpnum)  [.active adds gold border+glow]
```

**Ring math (SVG circle, r=42, C=2πr≈263.9):**
```
remaining = max(0, turnDeadlineMs - Date.now())
frac      = clamp(remaining / turnTimerMs, 0, 1)     // turnTimerMs from state
progress circle: stroke-dasharray = C; stroke-dashoffset = C * (1 - frac)
urgent = remaining <= 5000  → stroke #ef4444, numeral #ef4444, CSS pulse (scale 1↔1.08, 1s)
else                         → stroke #ffd24a, numeral #ffd24a
numeral text = ceil(remaining/1000)
```
When `phase !== "playing"` the wrapper is hidden (`display:none`), matching how `MatchScene.onPhaseChange` toggles `PlayerStrip` today.

**Roster row data** (per `tank` in `state.tanks`, iteration order = join order):
```
dot color   = COLOR_HEX_CSS[tank.color]
name        = (aiSlots has sessionId ? '🤖 ' : '') + tank.nickname  (+ ' 💀' if !alive)
hp bar      = width tank.hp%, color green>50 / yellow>25 / red<=25 (reuse existing thresholds)
hp number   = tank.hp (hidden or '—' if !alive)
.active     = tank.sessionId === state.currentTurnPlayerId  → 2px #ffd24a border + glow
dead row    = opacity 0.4
local "You" = if tank.sessionId === localSessionId, name renders "You"
```
Color CSS map mirrors `Tank.ts COLOR_HEX` (red `#e63946`, blue `#3a86ff`, green `#80b918`, yellow `#fca311`, cyan `#00b4d8`, magenta `#b5179e`, orange `#f4a261`, white `#f1f1f1`, pink `#f48fb1`, lime `#a6d96a`).

**Update strategy (perf):** build the roster `innerHTML` only when a structural signature changes (set of sessionIds + each tank's `alive`); otherwise update existing rows' HP bar width / number / `.active` class in place by `data-session` lookup. The ring numeral/arc update every frame (cheap: text + two style writes). *(This mirrors the dirty-check we add to the weapon carousel in §4 — same class of bug.)*

### 2.3 Wiring changes in `MatchScene.ts`
- Replace `import { PlayerStrip }` → `import { TurnHud }`; field `playerStrip` → `turnHud`.
- Construct `this.turnHud = new TurnHud(room.sessionId)`.
- Ticker: replace `this.playerStrip?.update(state)` with `this.turnHud?.update(state)`. Remove `this.hudBar?.updateTimer(...)` call (timer now lives in TurnHud).
- Phase toggle + observer-mode hide: swap `playerStrip` references for `turnHud`.

### 2.4 Cleanup in `HudBar.ts`
- Remove the `#hud-timer` element from `buildHTML()` and the `updateTimer()` method (ring replaces it). Keep wind/round/terrain status and angle/power/fire/carousel/fuel unchanged.

### 2.5 Dead code removal
- Delete `apps/client/src/hud/PlayerStrip.ts`, `TurnTimer.ts`, `PlayerList.ts` (not referenced after this change — confirm with a grep before deleting). If any are still imported elsewhere, leave and note.

### 2.6 Edge cases
- 1 player (vs AI only) → roster still lists all tanks.
- ≥6 players → roster column may exceed viewport height; cap with `max-height:60vh; overflow:hidden` (rows are short; acceptable for expected ≤8 players).
- Observer (no local tank) → whole HUD hidden as today; TurnHud also hidden.
- `turnTimerMs` configurable (host can change) → ring uses live `state.turnTimerMs` as denominator, never a constant.

### 2.7 Acceptance
- No "YOUR TURN" banner anywhere.
- Ring arc visibly depletes; numeral counts down; red+pulse last 5s.
- Roster shows every player's color/name/HP; current player glows gold; dead dimmed with 💀.
- Bottom bar no longer shows a second timer box.

---

## 3. Camera / Zoom / Pan (`apps/client/src/render/Camera.ts`)

### 3.1 Problems (all confirmed in source)
1. **Wheel zoom ignores cursor** → zooms around world origin (0,0), i.e. visually the top-left.
2. **Steps too drastic** — fixed ±10% (`deltaY>0?0.9:1.1`).
3. **No bounds** — pan is unclamped (`targetX/Y = dragStartWorld + d`), zoom-out clamps only at `0.4` (can show empty space beyond the map).
4. **"Stops working" — two distinct bugs:**
   - **Stuck drag:** `mousedown` sets `isDragging=true`; `mouseup` is on `window`. If the pointer leaves the window or focus is lost mid-drag, `mouseup` never fires → `isDragging` latches true → subsequent input blocked.
   - **Latched override:** the first drag sets `userOverride=true`, which is only cleared by `resetView()` (double-click / `R`). While set, `fitToTanks()` and `trackProjectile()` both early-return forever → camera silently stops auto-following after any manual pan.

### 3.2 Fixes

**(a) Cursor-anchored zoom.** Convert cursor screen point to world, apply scale, re-derive target position so the world point under the cursor is invariant:
```ts
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  const oldScale = this.targetScale;
  const factor = Math.exp(-e.deltaY * ZOOM_SENSITIVITY);   // smooth, continuous
  let newScale = clamp(oldScale * factor, this.minScale(), MAX_SCALE);
  // world point under cursor (using *target* transform for stability while LERPing):
  const wx = (sx - this.targetX) / oldScale;
  const wy = (sy - this.targetY) / oldScale;
  this.targetX = sx - wx * newScale;
  this.targetY = sy - wy * newScale;
  this.targetScale = newScale;
  this.userOverride = true;           // manual zoom counts as override (until next turn)
  this.clampToBounds();
}, { passive: false });
```
- `ZOOM_SENSITIVITY ≈ 0.0015` → a typical mouse notch (`deltaY≈100`) ≈ ±14%? No — tune so a notch ≈ ±3–5%. With `0.0015`, `exp(-0.0015*100)=0.86` (−14%), too much; use **`ZOOM_SENSITIVITY = 0.0008`** → notch ≈ ±8%, and reduce further if it still feels fast. Trackpads send small `deltaY` → naturally fine-grained. Final value to be dialed in during implementation; spec target: **a single mouse notch changes zoom by ≤ ~8%, trackpad noticeably finer.**

**(b) Bounds.**
- **World extent constant** (new, in `Camera.ts` or `constants.ts`): horizontal `[0, TERRAIN_WIDTH]` (0–1600); vertical a *visible band* `[WORLD_VIEW_TOP, WORLD_VIEW_BOTTOM]` — proposed `WORLD_VIEW_TOP = -150` (headroom above peaks for high shots) and `WORLD_VIEW_BOTTOM = TERRAIN_HEIGHT + 120` (≈1020, just past the island underside). We deliberately do **not** use the full physics bounds (`PLAY_CEILING_Y=-600 … +1400`) — that band is far taller than the art and would permit zooming out into void.
- `minScale()` = `max(viewport.w / worldW, viewport.h / worldBandH)` so the world always covers the viewport (cannot zoom out past the map). `MAX_SCALE = 2.0` (unchanged).
- `clampToBounds()` clamps `targetX/Y` so the visible world band stays covering the viewport:
```
worldW = TERRAIN_WIDTH; worldH = WORLD_VIEW_BOTTOM - WORLD_VIEW_TOP;
scaledW = worldW*scale; scaledH = worldH*scale;
// x: if scaledW>=vw keep band covering screen; else center
minX = vw - (WORLD_RIGHT*scale); maxX = -(WORLD_LEFT*scale)   // derive from extent
targetX = clamp(targetX, minX, maxX)  (or center when world smaller than viewport)
// same for y using WORLD_VIEW_TOP/BOTTOM
```
Call `clampToBounds()` after wheel, after drag-move, and inside `fitToTanks`. (Exact min/max derivation written carefully in implementation; invariant: **no screen pixel maps to outside the world band**, except letterbox-centering when the band is smaller than the viewport.)

**(c) Stuck-drag → Pointer Events + capture.**
```ts
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId);
  this.isDragging = true; ...
});
canvas.addEventListener('pointermove', (e) => { if(!this.isDragging) return; ... this.clampToBounds(); });
const end = () => { this.isDragging = false; };
canvas.addEventListener('pointerup', end);
canvas.addEventListener('pointercancel', end);
window.addEventListener('blur', end);
```
`setPointerCapture` guarantees the matching `pointerup` even outside the canvas; `pointercancel` + window `blur` are belt-and-suspenders.

**(d) Un-latch auto-follow.** `userOverride` should be a *per-turn* manual override, not permanent:
- In `onTurnStart()` (already called on phase→playing) set `userOverride = false` and `trackingSuspended = false`, so each new turn the camera resumes auto-fit/follow.
- Optionally also reset on `fire` (when the local player shoots) so projectile tracking re-engages even if they panned during aiming. Keep `R`/double-click as an explicit manual reset too.

### 3.3 NaN guard
Add an `isFinite` guard in `update()` before writing `world.scale/position`; if any target is non-finite, recenter via `fitToLivingTanks` fallback (defends against malformed state and feeds invariant capture in §5).

### 3.4 Edge cases
- Viewport resize (`window resize` already calls `fitToLivingTanks`) must re-run `clampToBounds` (min-scale depends on viewport).
- Very small viewport where even min-scale can't fit both dims → `minScale` uses `max(...)` so the larger dimension governs; the smaller dimension letterboxes (centered). Acceptable.
- Zoom at a clamp boundary: anchoring math still runs, then `clampToBounds` nudges; cursor anchor may drift slightly at the hard edge — acceptable.

### 3.5 Acceptance
- Wheel zoom keeps the point under the cursor fixed.
- One notch is a gentle change; no jarring jumps.
- Cannot pan or zoom to reveal area outside the world band (no empty void).
- Dragging the pointer out of the window and releasing never freezes the camera.
- After a manual pan, the camera resumes auto-following on the next turn (and after firing).

---

## 4. Weapon Selection Unreliable (`apps/client/src/hud/HudBar.ts`, `apps/server/src/rooms/MatchRoom.ts`)

### 4.1 Problem
- **Primary (client):** `HudBar.update(state)` runs every frame (MatchScene ticker) and unconditionally calls `renderCarousel(selectedKey)`, which sets `#hud-carousel.innerHTML = ...` and re-binds click listeners. At 60fps the weapon card nodes are destroyed/recreated continuously; a user click (mousedown→mouseup) that crosses a frame boundary lands on a node that no longer exists, so the `click` event never fires. This makes selection feel dead — most noticeable when you're actively trying to act (your turn). *To be confirmed live via systematic-debugging before the fix is finalized.*
- **Secondary (server):** `onMessage("select-weapon")` has no `currentTurnPlayerId === client.sessionId` check (unlike `move`/`fire`/`equip-shield`/`use-battery`). Any player can change their `weaponId` any time during `playing`. Not the cause of the reported symptom, but a correctness gap.

### 4.2 Fix
**Client — stop the per-frame rebuild (dirty-check):**
```ts
// HudBar fields
private renderedKey: string | null = null;
private renderedInvSig = '';

update(state) {
  ...
  const isMyTurn = state.currentTurnPlayerId === this.room.sessionId;
  if (myTank) {
    this.localInventory = new Map(myTank.inventory.entries());
    this.selectedKey = myTank.weaponId || this.selectedKey;
    const invSig = [...this.localInventory].map(([k,v])=>`${k}:${v}`).join('|');
    if (this.selectedKey !== this.renderedKey || invSig !== this.renderedInvSig) {
      this.renderCarousel(this.selectedKey);
      this.renderedKey = this.selectedKey;
      this.renderedInvSig = invSig;
    }
    this.setCarouselEnabled(isMyTurn);   // visual + pointer gating
  }
}
```
- `renderCarousel` now runs only when selection or inventory actually changes → click nodes are stable.
- `setCarouselEnabled(isMyTurn)`: when not your turn, dim the carousel (`opacity:0.5`) and set `pointer-events:none` on the cards + prev/next buttons (consistent with the disabled fire button). Keyboard `q/e` weapon cycling likewise gated on `isMyTurn`.

**Server — add turn check:**
```ts
this.onMessage("select-weapon", (client, msg) => {
  if (this.state.phase !== "playing") return;
  if (this.state.currentTurnPlayerId !== client.sessionId) return;   // NEW
  const tank = this.state.tanks.get(client.sessionId);
  ...
});
```

### 4.3 Live verification (systematic-debugging, before coding the fix)
- Reproduce in the running app (two clients): on your turn, click weapon cards; confirm `select-weapon` is/isn't sent (network log / server log).
- Instrument: log in `renderCarousel` to confirm it fires ~60×/s; confirm a click handler attached one frame is gone the next.
- Only then apply the dirty-check fix and re-verify selection works on your turn and is correctly blocked off-turn.

### 4.4 Edge cases
- Inventory depletes to 0 mid-turn (ammo used) → invSig changes → carousel re-renders, depleted weapon greyed (existing `∞`/`×n` logic retained).
- Selecting a weapon updates `tank.weaponId` server-side → state change → `selectedKey` differs from `renderedKey` → one re-render. No loop (renderedKey updated).

### 4.5 Acceptance
- On your turn, clicking any owned weapon reliably selects it (highlight + trajectory updates).
- Off your turn the carousel is visibly disabled and sends nothing; server rejects off-turn `select-weapon`.

---

## 5. Debug Capture + Automated Regression

### 5.1 Structured logger — `packages/shared/src/log.ts` (new)
Isomorphic, zero-dep, tree-shakeable.
```ts
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LogEvent { t: number; level: LogLevel; scope: string; msg: string; data?: unknown; }
export interface Logger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
  child(scope: string): Logger;
}
export function createLogger(scope: string, opts?: { level?: LogLevel; ring?: RingBuffer }): Logger;
```
- Threshold via `LogLevel` order; default `info` (override with `?debug=1` query param on client, `LOG_LEVEL` env on server).
- Each call `console[level]` with a `[scope]` prefix (keeps existing console behavior) **and** pushes a `LogEvent` into an optional ring buffer.
- `RingBuffer` (also in this file): fixed capacity (default **300** events), `push`, `snapshot(): LogEvent[]`.

**Adoption (incremental):** introduce loggers at the key seams without a big-bang rewrite — `MatchScene` (`scope:'match'`), `colyseusClient` (`scope:'net'`), `MatchRoom` (`scope:'room'`), physics entry. Replace the most useful ad-hoc `console.log`s; leave the rest.

### 5.2 Client capture — `apps/client/src/debug/capture.ts` (new)
A singleton wired in `apps/client/src/main.ts`.

**Bundle shape (`DebugBundle`):**
```ts
interface DebugBundle {
  id: string;                 // `${Date.now()}-${rand}`
  reason: 'uncaught' | 'manual' | 'invariant';
  detail?: string;            // error message / invariant name
  ts: number;
  build: string;              // __BUILD_ID__ injected by Vite (git sha + time)
  userAgent: string;
  url: string;
  matchId?: string;           // room.roomId
  sessionId?: string;
  phase?: string;
  logs: LogEvent[];           // ring buffer snapshot
  state?: unknown;            // shallow MatchState snapshot (tanks: id,hp,alive,x,y,weaponId; phase; round; currentTurnPlayerId; wind; gravity; terrainSeed)
  screenshotPng?: string;     // base64 PNG (data part only)
}
```

**Screenshot:** `await app.renderer.extract.base64(app.stage)` (PixiJS v8 `extract`), wrapped in try/catch (WebGL context loss → omit screenshot, still send the rest).

**Triggers (all three, per decision):**
1. **Uncaught:** `window.onerror` + `window.onunhandledrejection` → `capture('uncaught', err.message)`. (Augments existing `main.ts` error handler rather than replacing it.)
2. **Manual hotkey:** `Ctrl+Shift+D` → `capture('manual')`, with a brief on-screen toast "Debug snapshot sent (#id)".
3. **Invariant:** a lightweight client-side checker (see §5.5) calls `capture('invariant', name)` (rate-limited: max 1 per invariant per 10s to avoid floods).

**Transport:** `POST ${httpServerUrl}/debug` with the JSON bundle (screenshot inline as base64). `httpServerUrl = __SERVER_URL__.replace(/^ws/, 'http')`. Fire-and-forget with a 5s timeout; failures are swallowed (logged at `warn`). No client-side download (per decision: server sink).

### 5.3 Server capture endpoint — `apps/server/src/index.ts` + `apps/server/src/debug/debugStore.ts` (new)
- `POST /debug` (JSON body, limit ~8 MB for the inline PNG): validate minimal shape, then `debugStore.save(bundle)`:
  - Write `data/debug/<id>.json` (bundle minus screenshot) and `data/debug/<id>.png` (decoded screenshot) to disk. Mirror the existing `replayStore` file-writing pattern; directory configurable via `DEBUG_DIR` env (default `./data/debug`), created on boot.
  - If Sentry is initialized, `Sentry.captureMessage('[debug-bundle] '+reason, { level, extra: { id, matchId, phase, detail } })` so bundles are discoverable in Sentry with a pointer to the disk file. (Screenshot/logs stay on disk; Sentry gets metadata only.)
- `GET /debug/:id` returns the JSON bundle (dev convenience; behind the same trust model as `/replays/:id`).
- **Server-side exceptions:** wrap the existing top-level handler so server errors also build a minimal server bundle (no screenshot): `{ reason:'uncaught', logs: serverRing.snapshot(), state summary, stack }` → `debugStore.save` + Sentry (extends the current `Sentry?.captureException`).

**Security/limits:** `/debug` is intended for dev/staging. Gate behind `DEBUG_CAPTURE_ENABLED` env (default **on** in non-production, **off** in production) and a body-size cap; reject when disabled with 404. No auth beyond that (same posture as replays).

### 5.4 Shared invariants module — `packages/shared/src/invariants.ts` (new)
Pure functions reused by client checker, server runtime, and CI runner — single source of truth.
```ts
export interface Violation { name: string; detail: string; }
export function checkMatchInvariants(state: MatchStateLike): Violation[];
// checks:
//  - hp ∈ [0,100] for every tank
//  - alive === (hp > 0)            (consistency)
//  - x,y,angle,power finite        (no NaN)
//  - exactly one currentTurnPlayerId that is a live tank (during 'playing')
//  - round ∈ [1, maxRounds]
export function checkCameraFinite(cam: {x:number;y:number;scale:number}): Violation[];
```
(`MatchStateLike` is a structural subset so the pure module needn't import Colyseus.)

### 5.5 Client invariant checker — `apps/client/src/debug/invariantWatch.ts` (new)
- Runs on a throttle (e.g. every 1s) from the MatchScene ticker: `checkMatchInvariants(room.state)` + `checkCameraFinite(camera)` + an **orphaned-skull** check (skull child present while `tank.alive`).
- On any violation → `logger.error` + `capture('invariant', name)` (rate-limited per §5.2).

### 5.6 Automated regression (CI)
**(a) Headless invariant match runner — `apps/server/tests/invariant-match.test.ts` (Vitest).**
- Drive a `MatchRoom` (or the underlying sim directly) through full matches from fixed seeds + scripted intents (fire/move/buy), advancing turns to completion across all rounds.
- After every turn/round, assert `checkMatchInvariants(state).length === 0`.
- Run a small matrix of seeds + player counts (1v1, 1vAI, 4-player) to exercise turn rotation, respawn, shop.
- Guards: no stuck turn (turn advances within expected bounds), no NaN, HP/alive consistency, skull-cleanup is render-only so it's covered separately in (c).

**(b) Replay determinism test — `apps/server/tests/replay-determinism.test.ts` (Vitest).**
- Record a match's intents+seed via the existing `ReplayRecorder`; re-simulate from the replay and assert the resulting state (tank positions/HP/round outcome, terrain carve set) is **identical**. Catches physics/desync regressions.

**(c) Tank render-cleanup unit test — `apps/client/.../Tank.skull.test.ts` (Vitest, jsdom or mocked ticker).**
- Mock `window.pixiApp.ticker`; call `setAlive(false)` → run ticker past death+float → assert a skull child exists; call `setAlive(true)` → assert skull child removed and ticker callbacks deregistered (count back to baseline). Directly locks the §1 fix.

**(d) Playwright HUD smoke — extend `tests/e2e`.**
- After match start, assert the TurnHud ring + roster exist, no `.player-strip`/"YOUR TURN" text present, roster row count == player count, the `.active` row matches `window.__room.state.currentTurnPlayerId`. (Optional screenshot baseline for the HUD region.)

### 5.7 Build id
Inject `__BUILD_ID__` in `apps/client/vite.config.ts` via `define` (git short sha + ISO time) and expose a matching value on the server (`/health` already exists; add `build` to its JSON) so bundles are traceable to a build.

### 5.8 Acceptance
- `Ctrl+Shift+D` writes `<id>.json` + `<id>.png` under `DEBUG_DIR` and (if DSN set) a Sentry breadcrumb/message.
- Throwing a client error auto-creates a bundle; tripping an invariant (e.g. forced NaN) auto-creates one.
- `pnpm --filter @se/server test` runs the invariant + replay-determinism suites green; `pnpm --filter @se/client test` runs the skull test green.

---

## 6. File-Level Change Summary

| Area | Files |
|---|---|
| Skull | `apps/client/src/render/Tank.ts` (+ `Tank.skull.test.ts`) |
| HUD | **new** `apps/client/src/hud/TurnHud.ts`; edit `MatchScene.ts`, `HudBar.ts`; **delete** `PlayerStrip.ts`, `TurnTimer.ts`, `PlayerList.ts` (after grep) |
| Camera | `apps/client/src/render/Camera.ts` (+ extend `Camera`/`computeFit` tests); maybe `constants.ts` for world-band consts |
| Weapons | `apps/client/src/hud/HudBar.ts`; `apps/server/src/rooms/MatchRoom.ts` |
| Logger | **new** `packages/shared/src/log.ts`; export in `packages/shared/src/index.ts` |
| Invariants | **new** `packages/shared/src/invariants.ts`; export in index |
| Client capture | **new** `apps/client/src/debug/capture.ts`, `invariantWatch.ts`; edit `main.ts`, `MatchScene.ts`, `vite.config.ts` |
| Server capture | **new** `apps/server/src/debug/debugStore.ts`; edit `index.ts` |
| CI tests | **new** `apps/server/tests/invariant-match.test.ts`, `replay-determinism.test.ts`; extend `tests/e2e` |

## 7. Sequencing (for the implementation plan)
1. Logger + invariants (shared foundation, no UI risk).
2. Skull fix (+ test).
3. Weapon fix (live-debug → dirty-check + server turn-check).
4. Camera fixes.
5. TurnHud redesign + HudBar/MatchScene rewire + dead-code deletion.
6. Debug capture (client + server endpoint + build id).
7. Regression suites (invariant runner, replay determinism, Playwright HUD).

Each step gated by per-package typecheck + the relevant test suite (not repo-wide typecheck).

## 8. Open Risks / Notes
- Weapon root-cause is a strong hypothesis but **must be confirmed live** before the fix lands (systematic-debugging).
- Camera world-band constants (`WORLD_VIEW_TOP/BOTTOM`) and `ZOOM_SENSITIVITY` are tuning values; final numbers dialed in against the running game.
- `/debug` PNG payloads can be large; body cap + `DEBUG_CAPTURE_ENABLED` keep production safe.
- Deleting `TurnTimer.ts`/`PlayerList.ts` assumes they're unreferenced — verify by grep first; if referenced, keep and note.
