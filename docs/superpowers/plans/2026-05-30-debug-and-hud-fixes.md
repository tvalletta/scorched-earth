# HUD Redesign, Camera/Weapon/Respawn Fixes, and Debug/Telemetry System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the dead-skull-on-respawn, camera zoom/pan, and weapon-selection bugs; redesign the turn indicator into "Layout C" (ring timer + roster); add a debug-capture + automated-regression system; and polish the cave/floating-island terrain art.

**Architecture:** Client = PixiJS v8 (`apps/client`), server = Colyseus v0.16 (`apps/server`), shared schemas/pure code = `packages/shared` + `packages/game`. New shared modules (logger, invariants) are isomorphic and zero-dep. Debug capture posts bundles to a new server `/debug` endpoint that writes to disk with retention. Regression is Vitest (server/game) + Playwright (e2e). Each phase is independent and ships on its own.

**Tech Stack:** TypeScript, PixiJS v8.2, Colyseus v0.16, Vite, Vitest, Playwright, Sentry (server, opt-in), `@anthropic-ai/sdk` (dev script only).

**Spec:** `docs/superpowers/specs/2026-05-30-debug-and-hud-fixes-design.md`

**Verification convention:** `pnpm typecheck` is already red on `main`. Gate each task on **per-package typecheck + the affected test suite**, never repo-wide typecheck:
- Client: `pnpm --filter @se/client typecheck` (or `exec tsc --noEmit`) — see `apps/client/package.json` for the exact script name; if absent use `pnpm --filter @se/client exec tsc --noEmit`.
- Server tests: `pnpm --filter @se/server test`
- Game tests: `pnpm --filter @se/game test`
- Shared: `pnpm --filter @se/shared exec tsc --noEmit`

---

## File Structure

| File | Responsibility | New? |
|---|---|---|
| `packages/shared/src/log.ts` | Isomorphic leveled logger + RingBuffer | new |
| `packages/shared/src/invariants.ts` | Pure match/camera invariant checks (shared by client/server/CI) | new |
| `packages/shared/src/index.ts` | Re-export the above | modify |
| `apps/client/src/render/Tank.ts` | Skull lifecycle fix | modify |
| `apps/client/src/render/Tank.skull.test.ts` | Skull cleanup unit test | new |
| `apps/client/src/render/Camera.ts` | Cursor-anchored zoom, smooth steps, bounds, pointer-capture, un-latch | modify |
| `apps/client/src/render/Camera.test.ts` | computeFit/clamp/min-scale unit tests | new (or extend existing) |
| `apps/client/src/hud/TurnHud.ts` | Ring timer + roster (Layout C) | new |
| `apps/client/src/hud/HudBar.ts` | Carousel dirty-check + off-turn gating; remove `#hud-timer` | modify |
| `apps/client/src/scenes/MatchScene.ts` | Rewire PlayerStrip→TurnHud; drop updateTimer | modify |
| `apps/client/src/hud/PlayerStrip.ts`, `TurnTimer.ts`, `PlayerList.ts` | delete (after grep) | delete |
| `apps/server/src/rooms/MatchRoom.ts` | `select-weapon` turn check | modify |
| `apps/client/src/debug/capture.ts` | Client debug-bundle builder + triggers + POST | new |
| `apps/client/src/debug/invariantWatch.ts` | Throttled runtime invariant checker | new |
| `apps/client/src/main.ts` | Wire capture (error hooks, hotkey) | modify |
| `apps/client/vite.config.ts` | inject `__BUILD_ID__` | modify |
| `apps/server/src/debug/debugStore.ts` | Disk persistence + retention/rotation | new |
| `apps/server/src/index.ts` | `/debug` POST + GET, server error bundle, `build` in `/health` | modify |
| `apps/server/tests/debugStore.test.ts` | Retention/rotation unit test | new |
| `apps/server/tests/invariant-match.test.ts` | Headless full-match invariant runner | new |
| `apps/server/tests/replay-determinism.test.ts` | Replay re-sim determinism | new |
| `scripts/art-critique.mjs` | Screenshot → Claude vision critique (dev tool) | new |
| `apps/client/src/render/Terrain.ts` | Organic cave/island art | modify |
| `tests/e2e/hud.spec.ts` | TurnHud smoke (no banner, roster, active row) | new |

---

## Phase 1 — Shared Foundation: Logger + Invariants

### Task 1: RingBuffer + Logger

**Files:**
- Create: `packages/shared/src/log.ts`
- Test: `packages/shared/src/log.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/log.test.ts
import { describe, it, expect, vi } from "vitest";
import { RingBuffer, createLogger } from "./log";

describe("RingBuffer", () => {
  it("keeps only the last N entries", () => {
    const rb = new RingBuffer(3);
    for (let i = 0; i < 5; i++) rb.push({ t: i, level: "info", scope: "x", msg: String(i) });
    expect(rb.snapshot().map((e) => e.msg)).toEqual(["2", "3", "4"]);
  });
});

describe("createLogger", () => {
  it("respects the level threshold and writes to the ring", () => {
    const rb = new RingBuffer(10);
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const log = createLogger("net", { level: "info", ring: rb });
    log.debug("hidden");
    log.info("shown", { a: 1 });
    expect(rb.snapshot().map((e) => e.msg)).toEqual(["shown"]);
    expect(rb.snapshot()[0]!.scope).toBe("net");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("child() prefixes scope", () => {
    const rb = new RingBuffer(10);
    const log = createLogger("room", { level: "debug", ring: rb }).child("turn");
    log.debug("hi");
    expect(rb.snapshot()[0]!.scope).toBe("room:turn");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @se/shared exec vitest run src/log.test.ts`
Expected: FAIL — `Cannot find module './log'`.

- [ ] **Step 3: Implement `log.ts`**

```ts
// packages/shared/src/log.ts
export type LogLevel = "debug" | "info" | "warn" | "error";
export interface LogEvent { t: number; level: LogLevel; scope: string; msg: string; data?: unknown; }

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export class RingBuffer {
  private buf: LogEvent[] = [];
  constructor(private capacity = 300) {}
  push(e: LogEvent): void {
    this.buf.push(e);
    if (this.buf.length > this.capacity) this.buf.splice(0, this.buf.length - this.capacity);
  }
  snapshot(): LogEvent[] { return this.buf.slice(); }
  clear(): void { this.buf = []; }
}

export interface Logger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
  child(scope: string): Logger;
}

export interface LoggerOpts { level?: LogLevel; ring?: RingBuffer; }

export function createLogger(scope: string, opts: LoggerOpts = {}): Logger {
  const threshold = ORDER[opts.level ?? "info"];
  const emit = (level: LogLevel, msg: string, data?: unknown) => {
    if (ORDER[level] < threshold) return;
    const e: LogEvent = { t: Date.now(), level, scope, msg, data };
    opts.ring?.push(e);
    const line = `[${scope}] ${msg}`;
    if (data !== undefined) console[level](line, data); else console[level](line);
  };
  return {
    debug: (m, d) => emit("debug", m, d),
    info: (m, d) => emit("info", m, d),
    warn: (m, d) => emit("warn", m, d),
    error: (m, d) => emit("error", m, d),
    child: (s) => createLogger(`${scope}:${s}`, opts),
  };
}
```

- [ ] **Step 4: Export from index + run tests**

Edit `packages/shared/src/index.ts` — add: `export * from "./log";`

Run: `pnpm --filter @se/shared exec vitest run src/log.test.ts && pnpm --filter @se/shared exec tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/log.ts packages/shared/src/log.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): isomorphic leveled logger + ring buffer"
```

---

### Task 2: Invariants module

**Files:**
- Create: `packages/shared/src/invariants.ts`
- Test: `packages/shared/src/invariants.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/invariants.test.ts
import { describe, it, expect } from "vitest";
import { checkMatchInvariants, checkCameraFinite } from "./invariants";

const baseTank = { sessionId: "a", hp: 100, alive: true, x: 10, y: 20, angle: 90, power: 500 };
const baseState = {
  phase: "playing", round: 1, maxRounds: 5, currentTurnPlayerId: "a",
  tanks: [baseTank],
};

describe("checkMatchInvariants", () => {
  it("passes a healthy state", () => {
    expect(checkMatchInvariants(baseState)).toEqual([]);
  });
  it("flags hp out of range", () => {
    const v = checkMatchInvariants({ ...baseState, tanks: [{ ...baseTank, hp: 140 }] });
    expect(v.map((x) => x.name)).toContain("hp-range");
  });
  it("flags alive/hp inconsistency", () => {
    const v = checkMatchInvariants({ ...baseState, tanks: [{ ...baseTank, hp: 0, alive: true }] });
    expect(v.map((x) => x.name)).toContain("alive-consistency");
  });
  it("flags NaN position", () => {
    const v = checkMatchInvariants({ ...baseState, tanks: [{ ...baseTank, x: NaN }] });
    expect(v.map((x) => x.name)).toContain("finite-position");
  });
  it("flags a turn pointer that is not a live tank during playing", () => {
    const v = checkMatchInvariants({ ...baseState, currentTurnPlayerId: "ghost" });
    expect(v.map((x) => x.name)).toContain("turn-pointer");
  });
});

describe("checkCameraFinite", () => {
  it("flags non-finite scale", () => {
    expect(checkCameraFinite({ x: 0, y: 0, scale: NaN }).map((v) => v.name)).toContain("camera-finite");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @se/shared exec vitest run src/invariants.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `invariants.ts`**

```ts
// packages/shared/src/invariants.ts
export interface Violation { name: string; detail: string; }

export interface TankLike {
  sessionId: string; hp: number; alive: boolean;
  x: number; y: number; angle: number; power: number;
}
export interface MatchStateLike {
  phase: string; round: number; maxRounds: number;
  currentTurnPlayerId: string;
  tanks: TankLike[];
}

const finite = (n: number) => Number.isFinite(n);

export function checkMatchInvariants(s: MatchStateLike): Violation[] {
  const v: Violation[] = [];
  for (const t of s.tanks) {
    if (t.hp < 0 || t.hp > 100) v.push({ name: "hp-range", detail: `${t.sessionId} hp=${t.hp}` });
    if (t.alive !== t.hp > 0) v.push({ name: "alive-consistency", detail: `${t.sessionId} alive=${t.alive} hp=${t.hp}` });
    if (![t.x, t.y, t.angle, t.power].every(finite))
      v.push({ name: "finite-position", detail: `${t.sessionId} x=${t.x} y=${t.y} a=${t.angle} p=${t.power}` });
  }
  if (s.round < 1 || s.round > s.maxRounds) v.push({ name: "round-range", detail: `round=${s.round}/${s.maxRounds}` });
  if (s.phase === "playing") {
    const turn = s.tanks.find((t) => t.sessionId === s.currentTurnPlayerId);
    if (!turn || !turn.alive) v.push({ name: "turn-pointer", detail: `turn=${s.currentTurnPlayerId}` });
  }
  return v;
}

export function checkCameraFinite(cam: { x: number; y: number; scale: number }): Violation[] {
  return finite(cam.x) && finite(cam.y) && finite(cam.scale)
    ? []
    : [{ name: "camera-finite", detail: `x=${cam.x} y=${cam.y} scale=${cam.scale}` }];
}
```

- [ ] **Step 4: Export + run tests**

Edit `packages/shared/src/index.ts` — add: `export * from "./invariants";`

Run: `pnpm --filter @se/shared exec vitest run src/invariants.test.ts && pnpm --filter @se/shared exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/invariants.ts packages/shared/src/invariants.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): pure match/camera invariant checks"
```

---

## Phase 2 — Skull Respawn Fix

### Task 3: Skull lifecycle in Tank.ts

**Files:**
- Modify: `apps/client/src/render/Tank.ts:99-140`
- Test: `apps/client/src/render/Tank.skull.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/client/src/render/Tank.skull.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Text } from "pixi.js";
import { createTankView } from "./Tank";

// Minimal fake ticker that lets us advance time deterministically.
class FakeTicker {
  private fns = new Set<(t: { deltaMS: number }) => void>();
  add(fn: (t: { deltaMS: number }) => void) { this.fns.add(fn); }
  remove(fn: (t: { deltaMS: number }) => void) { this.fns.delete(fn); }
  count() { return this.fns.size; }
  tick(ms: number) { for (const fn of [...this.fns]) fn({ deltaMS: ms }); }
}

describe("Tank skull lifecycle", () => {
  let ticker: FakeTicker;
  beforeEach(() => {
    ticker = new FakeTicker();
    (window as any).pixiApp = { ticker };
  });

  function skullCount(view: any): number {
    return view.children.filter((c: unknown) => c instanceof Text).length;
  }

  it("adds a skull on death and removes it on respawn, with no leaked tickers", () => {
    const view = createTankView({ color: "red", hat: "none" });
    const baseTickers = ticker.count();

    view.setAlive(false);
    // advance past the 50ms hold + 500ms death tween so the skull spawns
    ticker.tick(60);
    ticker.tick(520);
    expect(skullCount(view)).toBe(1);

    view.setAlive(true);
    expect(skullCount(view)).toBe(0);
    expect(view.alpha).toBe(1);
    expect(ticker.count()).toBe(baseTickers); // all death/float tickers removed
  });

  it("is idempotent when setAlive(true) fires repeatedly", () => {
    const view = createTankView({ color: "blue", hat: "none" });
    view.setAlive(false); ticker.tick(60); ticker.tick(520);
    view.setAlive(true);
    view.setAlive(true);
    expect((view.children as unknown[]).filter((c) => c instanceof Text).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @se/client exec vitest run src/render/Tank.skull.test.ts`
Expected: FAIL — after `setAlive(true)` the skull is still a child (count 1, not 0) and ticker count is above baseline.

> If the client package has no vitest configured, add `vitest` + a `vitest.config.ts` with `environment: "jsdom"` first (mirror `apps/server/vitest.config.ts`), and a `test` script in `apps/client/package.json`. Commit that setup separately as `chore(client): add vitest (jsdom)`.

- [ ] **Step 3: Implement the fix**

Replace the `let dying = false;` line and the `root.setAlive = ...` block (Tank.ts lines ~86, 99-140) with:

```ts
  let currentAngleDeg = 90;
  let dying = false;
  let skull: Text | null = null;
  let deathTick: ((t: { deltaMS: number }) => void) | null = null;
  let floatTick: ((t: { deltaMS: number }) => void) | null = null;

  const ticker = () =>
    (window as { pixiApp?: { ticker: { add: (fn: (t: { deltaMS: number }) => void) => void; remove: (fn: (t: { deltaMS: number }) => void) => void } } }).pixiApp?.ticker;

  const clearDeathFx = () => {
    const tk = ticker();
    if (deathTick) { tk?.remove(deathTick); deathTick = null; }
    if (floatTick) { tk?.remove(floatTick); floatTick = null; }
    if (skull) { root.removeChild(skull); skull.destroy(); skull = null; }
  };
```

(Move the existing `const setBarrelAngle = ...` below these declarations if needed; it already exists.)

Then the `setAlive` assignment:

```ts
  root.setAlive = (alive) => {
    hpBar.visible = alive;
    if (!alive && !dying) {
      dying = true;
      root.tint = 0xffffff;
      const tk = ticker();
      if (tk) {
        let elapsed = 0;
        const startAngle = currentAngleDeg;
        const startAlpha = root.alpha;
        deathTick = (t: { deltaMS: number }) => {
          elapsed += t.deltaMS;
          if (elapsed < 50) { root.tint = 0xffffff; return; }
          root.tint = 0xffffff;
          const progress = Math.min((elapsed - 50) / 500, 1);
          const eased = progress * progress;
          setBarrelAngle(startAngle + (270 - startAngle) * eased);
          root.alpha = startAlpha - (startAlpha - 0.3) * eased;
          if (progress >= 1) {
            if (deathTick) { tk.remove(deathTick); deathTick = null; }
            skull = new Text({ text: "💀", style: { fontSize: 16 } });
            skull.anchor.set(0.5, 1);
            skull.position.set(0, -20);
            root.addChild(skull);
            let floatElapsed = 0;
            const floatY = skull.y;
            floatTick = (ft: { deltaMS: number }) => {
              floatElapsed += ft.deltaMS;
              if (skull) skull.y = floatY - (floatElapsed / 600) * 20;
              if (floatElapsed >= 600 && floatTick) { tk.remove(floatTick); floatTick = null; }
            };
            tk.add(floatTick);
          }
        };
        tk.add(deathTick);
      }
    } else if (alive) {
      dying = false;
      clearDeathFx();
      root.alpha = 1;
      root.tint = 0xffffff;
      setBarrelAngle(currentAngleDeg);
    }
  };
```

Also update `root.destroy`:

```ts
  root.destroy = () => { clearDeathFx(); root.removeFromParent(); };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @se/client exec vitest run src/render/Tank.skull.test.ts`
Expected: PASS (skull removed on respawn, ticker count back to baseline).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/render/Tank.ts apps/client/src/render/Tank.skull.test.ts
git commit -m "fix(client): remove skull + cancel tickers on tank respawn"
```

---

## Phase 3 — Weapon Selection Fix

### Task 4: Live root-cause confirmation (systematic-debugging)

**No code change yet — confirm before fixing.**

- [ ] **Step 1: Reproduce + instrument**

Start dev (`pnpm dev` or the project's run skill). Open two clients (two browser tabs/windows) and start a match vs the other client or AI. Temporarily add at the top of `renderCarousel` in `apps/client/src/hud/HudBar.ts`:

```ts
console.count("renderCarousel");
```

On **your** turn, watch the console: confirm `renderCarousel` fires ~60×/sec, and that clicking a weapon card rarely/never logs a `select-weapon` send (add `console.log("send select", key)` before each `this.room.send('select-weapon', ...)`).

Expected observation: the carousel re-renders every frame; clicks are dropped because the node is replaced between mousedown and mouseup. **Remove the temporary logs before proceeding.**

- [ ] **Step 2: Record the finding**

If confirmed, proceed to Task 5. If the cause is different (e.g. an overlay intercepting clicks), note it and adapt Task 5 accordingly. Commit nothing from this task.

---

### Task 5: Carousel dirty-check + off-turn gating + server turn-check

**Files:**
- Modify: `apps/client/src/hud/HudBar.ts`
- Modify: `apps/server/src/rooms/MatchRoom.ts` (the `select-weapon` handler, ~lines 153-161)

- [ ] **Step 1: Add server-side test (failing)**

In `apps/server/tests/` add a focused test (or extend an existing MatchRoom test). Example new file `apps/server/tests/selectWeapon.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { MatchRoom } from "../src/rooms/MatchRoom";

// Use the same harness pattern other MatchRoom tests use (see MatchRoom.test.ts).
// Pseudocode shape — adapt to the project's existing test helpers:
describe("select-weapon turn check", () => {
  it("ignores select-weapon from a player when it is not their turn", async () => {
    // 1. boot a room, join two clients A and B, start match (phase=playing)
    // 2. ensure currentTurnPlayerId === A
    // 3. give B an inventory entry for "big-nuke"
    // 4. invoke the select-weapon handler as B
    // 5. expect B.weaponId unchanged (still default), because it is A's turn
  });
});
```

Fill the steps using the helpers in `apps/server/tests/MatchRoom.test.ts` (room creation, join, `room.onMessage` invocation). The assertion: B's `weaponId` is unchanged when B selects off-turn.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @se/server test selectWeapon`
Expected: FAIL — B's weaponId currently changes (no turn check).

- [ ] **Step 3: Add the server turn check**

In `MatchRoom.ts`, inside `this.onMessage("select-weapon", ...)`, add the guard after the phase check:

```ts
this.onMessage("select-weapon", (client, msg: { weaponId?: string }) => {
  if (this.state.phase !== "playing") return;
  if (this.state.currentTurnPlayerId !== client.sessionId) return; // NEW
  const tank = this.state.tanks.get(client.sessionId);
  if (!tank) return;
  const weaponId = String(msg?.weaponId ?? "");
  const count = tank.inventory.get(weaponId) ?? null;
  if (count === null || count === 0) return;
  tank.weaponId = weaponId;
});
```

- [ ] **Step 4: Run server test to verify pass**

Run: `pnpm --filter @se/server test selectWeapon`
Expected: PASS.

- [ ] **Step 5: Client — dirty-check the carousel + gate off-turn**

In `HudBar.ts`, add fields:

```ts
  private renderedKey: string | null = null;
  private renderedInvSig = "";
  private carouselEnabled = true;
```

Replace the `if (myTank) { ... }` block in `update(state)` with:

```ts
    if (myTank) {
      if (myTank.angle !== this.currentAngle) {
        this.currentAngle = myTank.angle; this.setAngleReadout(); this.drawDial();
      }
      if (myTank.power !== this.currentPower) {
        this.currentPower = myTank.power; this.setPowerReadout();
      }
      this.localInventory = new Map(myTank.inventory.entries());
      this.selectedKey = myTank.weaponId || this.selectedKey || "baby-missile";
      const invSig = [...this.localInventory].map(([k, v]) => `${k}:${v}`).join("|");
      if (this.selectedKey !== this.renderedKey || invSig !== this.renderedInvSig) {
        this.renderCarousel(this.selectedKey);
        this.renderedKey = this.selectedKey;
        this.renderedInvSig = invSig;
      }
      this.setCarouselEnabled(isMyTurn);
    }
```

Add the gating method:

```ts
  private setCarouselEnabled(enabled: boolean): void {
    if (enabled === this.carouselEnabled) return;
    this.carouselEnabled = enabled;
    const carousel = this.el.querySelector<HTMLDivElement>("#hud-carousel");
    const prev = this.el.querySelector<HTMLButtonElement>("#hud-prev");
    const next = this.el.querySelector<HTMLButtonElement>("#hud-next");
    for (const node of [carousel, prev, next]) {
      if (!node) continue;
      node.style.pointerEvents = enabled ? "auto" : "none";
      node.style.opacity = enabled ? "1" : "0.5";
    }
  }
```

Gate the keyboard cycle in `onKeyDown` so `q`/`e` only fire on your turn:

```ts
      case 'q': case 'Q': if (this.isMyTurn()) this.scrollCarousel(-1); break;
      case 'e': case 'E': if (this.isMyTurn()) this.scrollCarousel(1); break;
```

Add helper:

```ts
  private isMyTurn(): boolean {
    return this.room.state.currentTurnPlayerId === this.room.sessionId;
  }
```

- [ ] **Step 6: Verify client typecheck + live**

Run: `pnpm --filter @se/client exec tsc --noEmit`
Expected: no errors.

Live check (two clients): on your turn, clicking weapon cards reliably selects (center highlight moves, trajectory updates). Off-turn the carousel is dimmed and unclickable.

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/hud/HudBar.ts apps/server/src/rooms/MatchRoom.ts apps/server/tests/selectWeapon.test.ts
git commit -m "fix(weapons): dirty-check carousel render, gate off-turn, add server turn check"
```

---

## Phase 4 — Camera Fixes

### Task 6: Min-scale + clamp helpers (pure, tested)

**Files:**
- Modify: `apps/client/src/render/Camera.ts` (add exported pure helpers + world-band consts)
- Test: `apps/client/src/render/Camera.test.ts` (create or extend)

- [ ] **Step 1: Write failing tests**

```ts
// apps/client/src/render/Camera.test.ts
import { describe, it, expect } from "vitest";
import { computeFit, minScaleFor, clampPan, WORLD_LEFT, WORLD_RIGHT, WORLD_TOP, WORLD_BOTTOM } from "./Camera";

describe("minScaleFor", () => {
  it("returns the scale at which the world band exactly covers the viewport", () => {
    const vp = { width: 1600, height: 900 };
    const s = minScaleFor(vp);
    const worldW = WORLD_RIGHT - WORLD_LEFT;
    const worldH = WORLD_BOTTOM - WORLD_TOP;
    expect(s).toBeCloseTo(Math.max(vp.width / worldW, vp.height / worldH), 5);
  });
});

describe("clampPan", () => {
  it("prevents revealing space to the left of the world", () => {
    const vp = { width: 800, height: 600 };
    const scale = 1;
    // try to pan so world-left maps to x=200 (would show void on the left)
    const { x } = clampPan(200, 0, scale, vp);
    // after clamp, world-left must be at or left of screen 0
    expect(WORLD_LEFT * scale + x).toBeLessThanOrEqual(0 + 1e-6);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @se/client exec vitest run src/render/Camera.test.ts`
Expected: FAIL — `minScaleFor`/`clampPan`/consts not exported.

- [ ] **Step 3: Implement helpers + consts at top of Camera.ts**

Add near the top (after imports):

```ts
// Visible world band used for camera bounds (NOT the taller physics bounds).
export const WORLD_LEFT = 0;
export const WORLD_RIGHT = 1600;     // TERRAIN_WIDTH
export const WORLD_TOP = -150;       // headroom above peaks for high shots
export const WORLD_BOTTOM = 1020;    // ~TERRAIN_HEIGHT(900) + 120 underside
export const MAX_SCALE = 2.0;
export const ZOOM_SENSITIVITY = 0.0008; // wheel feel; tune in-app

export function minScaleFor(vp: { width: number; height: number }): number {
  const worldW = WORLD_RIGHT - WORLD_LEFT;
  const worldH = WORLD_BOTTOM - WORLD_TOP;
  return Math.max(vp.width / worldW, vp.height / worldH);
}

/** Clamp world position so no viewport pixel maps outside the world band.
 * If the scaled world is smaller than the viewport on an axis, center it. */
export function clampPan(
  x: number, y: number, scale: number, vp: { width: number; height: number },
): { x: number; y: number } {
  const clampAxis = (pos: number, worldMin: number, worldMax: number, vpLen: number) => {
    const scaledLen = (worldMax - worldMin) * scale;
    if (scaledLen <= vpLen) {
      // center: midpoint of world maps to midpoint of viewport
      return vpLen / 2 - ((worldMin + worldMax) / 2) * scale;
    }
    const minPos = vpLen - worldMax * scale; // world-right edge at viewport-right
    const maxPos = -worldMin * scale;        // world-left edge at viewport-left
    return Math.min(maxPos, Math.max(minPos, pos));
  };
  return {
    x: clampAxis(x, WORLD_LEFT, WORLD_RIGHT, vp.width),
    y: clampAxis(y, WORLD_TOP, WORLD_BOTTOM, vp.height),
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @se/client exec vitest run src/render/Camera.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/render/Camera.ts apps/client/src/render/Camera.test.ts
git commit -m "feat(camera): world-band min-scale + pan clamp helpers"
```

---

### Task 7: Wire cursor-anchored zoom, pointer-capture drag, bounds, un-latch

**Files:**
- Modify: `apps/client/src/render/Camera.ts` (`attachInputListeners`, `update`, `fitToTanks`, `onTurnStart`, add `clampToBounds`)

- [ ] **Step 1: Add `minScale()`/`clampToBounds()` instance methods + NaN guard**

Add inside the `Camera` class:

```ts
  private minScale(): number { return minScaleFor(this.viewport); }

  private clampToBounds(): void {
    this.targetScale = Math.max(this.minScale(), Math.min(MAX_SCALE, this.targetScale));
    const p = clampPan(this.targetX, this.targetY, this.targetScale, this.viewport);
    this.targetX = p.x; this.targetY = p.y;
  }
```

In `update(dt)`, before writing transforms, guard NaN:

```ts
    if (!Number.isFinite(this.targetX) || !Number.isFinite(this.targetY) || !Number.isFinite(this.targetScale)) {
      this.targetX = this.viewport.width / 2; this.targetY = this.viewport.height / 2; this.targetScale = 1;
    }
```

- [ ] **Step 2: Replace the wheel handler (cursor-anchored, smooth)**

In `attachInputListeners`, replace the `wheel` listener with:

```ts
    canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const oldScale = this.targetScale;
      const factor = Math.exp(-e.deltaY * ZOOM_SENSITIVITY);
      const newScale = Math.max(this.minScale(), Math.min(MAX_SCALE, oldScale * factor));
      const wx = (sx - this.targetX) / oldScale;
      const wy = (sy - this.targetY) / oldScale;
      this.targetX = sx - wx * newScale;
      this.targetY = sy - wy * newScale;
      this.targetScale = newScale;
      this.userOverride = true;
      this.clampToBounds();
    }, { passive: false });
```

- [ ] **Step 3: Replace mouse drag with Pointer Events + capture**

Replace the `mousedown`/`mousemove`/`mouseup` trio with:

```ts
    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      this.isDragging = true;
      this.shakeIntensity = 0;
      this.trackingSuspended = true;
      this.dragStartMouseX = e.clientX;
      this.dragStartMouseY = e.clientY;
      this.dragStartWorldX = this.world.position.x;
      this.dragStartWorldY = this.world.position.y;
    });
    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.dragStartMouseX;
      const dy = e.clientY - this.dragStartMouseY;
      this.targetX = this.dragStartWorldX + dx;
      this.targetY = this.dragStartWorldY + dy;
      this.userOverride = true;
      this.clampToBounds();
      this.world.position.set(this.targetX, this.targetY);
    });
    const endDrag = () => { this.isDragging = false; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    window.addEventListener('blur', endDrag);
```

- [ ] **Step 4: Clamp after fit + un-latch override on new turn**

In `fitToTanks`, after setting targets, add `this.clampToBounds();`.

Change `onTurnStart()` to also clear the latch:

```ts
  onTurnStart(): void {
    this.trackingSuspended = false;
    this.userOverride = false;
  }
```

(`resetView()` and the double-click / `R` handlers stay as-is.)

- [ ] **Step 5: Verify typecheck + live**

Run: `pnpm --filter @se/client exec tsc --noEmit`
Expected: no errors.

Live: wheel zoom keeps the point under the cursor fixed; one notch is gentle; cannot pan/zoom into void; dragging out of the window then releasing never freezes; after a manual pan the camera resumes following on the next turn.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/render/Camera.ts
git commit -m "fix(camera): cursor-anchored smooth zoom, world bounds, pointer-capture drag, un-latch follow"
```

---

## Phase 5 — TurnHud Redesign (Layout C)

### Task 8: Build TurnHud component

**Files:**
- Create: `apps/client/src/hud/TurnHud.ts`
- Test: `apps/client/src/hud/TurnHud.test.ts`

- [ ] **Step 1: Write the failing test (jsdom)**

```ts
// apps/client/src/hud/TurnHud.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { TurnHud } from "./TurnHud";

function mkState(over: Partial<any> = {}) {
  const tanks = new Map<string, any>([
    ["A", { sessionId: "A", nickname: "Red", color: "red", hp: 82, alive: true }],
    ["B", { sessionId: "B", nickname: "Blue", color: "blue", hp: 40, alive: true }],
    ["C", { sessionId: "C", nickname: "Green", color: "green", hp: 0, alive: false }],
  ]);
  return {
    phase: "playing", currentTurnPlayerId: "A", turnTimerMs: 30000,
    turnDeadlineMs: Date.now() + 18000, round: 1, maxRounds: 5,
    tanks, aiSlots: new Map(), ...over,
  };
}

describe("TurnHud", () => {
  beforeEach(() => { document.body.innerHTML = '<div id="ui"></div>'; });

  it("renders one roster row per tank and marks the active player", () => {
    const hud = new TurnHud("A");
    hud.update(mkState());
    const rows = hud.el.querySelectorAll("[data-session]");
    expect(rows.length).toBe(3);
    expect(hud.el.querySelector('[data-session="A"]')!.classList.contains("active")).toBe(true);
    expect(hud.el.querySelector('[data-session="B"]')!.classList.contains("active")).toBe(false);
  });

  it("shows a skull and dims dead players", () => {
    const hud = new TurnHud("A");
    hud.update(mkState());
    const dead = hud.el.querySelector('[data-session="C"]')!;
    expect(dead.textContent).toContain("💀");
  });

  it("renders the countdown numeral (ceil of remaining seconds)", () => {
    const hud = new TurnHud("A");
    hud.update(mkState({ turnDeadlineMs: Date.now() + 4200 }));
    const num = hud.el.querySelector("#turnhud-num")!;
    expect(Number(num.textContent)).toBe(5);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @se/client exec vitest run src/hud/TurnHud.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement TurnHud**

```ts
// apps/client/src/hud/TurnHud.ts
import type { MatchState } from "@se/shared";

const COLOR_CSS: Record<string, string> = {
  red: "#e63946", blue: "#3a86ff", green: "#80b918", yellow: "#fca311",
  cyan: "#00b4d8", magenta: "#b5179e", orange: "#f4a261", white: "#f1f1f1",
  pink: "#f48fb1", lime: "#a6d96a",
};
const R = 42;
const C = 2 * Math.PI * R; // ≈ 263.9

function hpColor(hp: number): string {
  return hp > 50 ? "#22c55e" : hp > 25 ? "#eab308" : "#ef4444";
}

export class TurnHud {
  el: HTMLDivElement;
  private sig = "";

  constructor(private localSessionId: string) {
    this.el = document.createElement("div");
    this.el.className = "turnhud";
    this.el.style.cssText =
      "position:fixed;top:0;left:0;right:0;height:0;pointer-events:none;z-index:90;" +
      "font-family:system-ui,sans-serif;";
    this.el.innerHTML = `
      <div id="turnhud-ring" style="position:fixed;top:14px;left:14px;width:96px;height:96px;">
        <svg width="96" height="96" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r="${R}" fill="rgba(8,6,24,0.55)" stroke="rgba(255,255,255,0.12)" stroke-width="6"/>
          <circle id="turnhud-arc" cx="48" cy="48" r="${R}" fill="none" stroke="#ffd24a" stroke-width="6"
            stroke-linecap="round" transform="rotate(-90 48 48)"
            stroke-dasharray="${C}" stroke-dashoffset="0"/>
        </svg>
        <div id="turnhud-num" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
          font:900 40px Impact,fantasy;color:#ffd24a;text-shadow:0 2px 8px rgba(0,0,0,0.6);">--</div>
      </div>
      <div id="turnhud-roster" style="position:fixed;top:14px;right:14px;display:flex;flex-direction:column;gap:5px;
        max-height:60vh;overflow:hidden;"></div>`;
    document.getElementById("ui")!.appendChild(this.el);
  }

  update(state: MatchState): void {
    if (state.phase !== "playing") { this.el.style.display = "none"; return; }
    this.el.style.display = "block";

    // Ring
    const remaining = Math.max(0, state.turnDeadlineMs - Date.now());
    const denom = state.turnTimerMs || 30000;
    const frac = Math.max(0, Math.min(1, remaining / denom));
    const urgent = remaining <= 5000;
    const arc = this.el.querySelector<SVGCircleElement>("#turnhud-arc")!;
    const num = this.el.querySelector<HTMLDivElement>("#turnhud-num")!;
    arc.style.strokeDashoffset = String(C * (1 - frac));
    arc.style.stroke = urgent ? "#ef4444" : "#ffd24a";
    num.style.color = urgent ? "#ef4444" : "#ffd24a";
    num.textContent = String(Math.ceil(remaining / 1000));
    this.el.querySelector<HTMLDivElement>("#turnhud-ring")!.style.transform =
      urgent ? `scale(${1 + 0.06 * Math.sin(Date.now() / 120)})` : "none";

    // Roster — structural rebuild only on signature change; else update in place.
    const tanks = Array.from(state.tanks.values());
    const sig = tanks.map((t) => `${t.sessionId}:${t.alive ? 1 : 0}`).join("|");
    const roster = this.el.querySelector<HTMLDivElement>("#turnhud-roster")!;
    if (sig !== this.sig) {
      this.sig = sig;
      roster.innerHTML = tanks.map((t) => {
        const isAi = state.aiSlots?.has?.(t.sessionId);
        const you = t.sessionId === this.localSessionId;
        const name = `${isAi ? "🤖 " : ""}${you ? "You" : t.nickname}${t.alive ? "" : " 💀"}`;
        return `<div data-session="${t.sessionId}" class="thp-row" style="display:flex;align-items:center;gap:8px;
          background:rgba(8,6,24,0.75);border:1px solid rgba(255,255,255,0.12);border-radius:8px;
          padding:5px 9px;min-width:160px;opacity:${t.alive ? 1 : 0.4};">
          <span style="width:10px;height:10px;border-radius:50%;flex-shrink:0;background:${COLOR_CSS[t.color] ?? "#fff"};"></span>
          <span class="thp-name" style="flex:1;font:bold 11px system-ui;color:#fff;white-space:nowrap;">${name}</span>
          <span class="thp-bar" style="width:64px;height:5px;border-radius:3px;background:rgba(255,255,255,0.16);overflow:hidden;">
            <span class="thp-fill" style="display:block;height:100%;width:${t.hp}%;background:${hpColor(t.hp)};"></span>
          </span>
          <span class="thp-num" style="font:bold 10px monospace;color:#cbd5e1;width:22px;text-align:right;">${t.alive ? t.hp : "—"}</span>
        </div>`;
      }).join("");
    } else {
      for (const t of tanks) {
        const row = roster.querySelector<HTMLDivElement>(`[data-session="${t.sessionId}"]`);
        if (!row) continue;
        const fill = row.querySelector<HTMLSpanElement>(".thp-fill")!;
        fill.style.width = `${t.hp}%`;
        fill.style.background = hpColor(t.hp);
        row.querySelector<HTMLSpanElement>(".thp-num")!.textContent = t.alive ? String(t.hp) : "—";
      }
    }
    // active highlight (every frame, cheap)
    roster.querySelectorAll<HTMLDivElement>(".thp-row").forEach((row) => {
      const active = row.getAttribute("data-session") === state.currentTurnPlayerId;
      row.classList.toggle("active", active);
      row.style.border = active ? "2px solid #ffd24a" : "1px solid rgba(255,255,255,0.12)";
      row.style.boxShadow = active ? "0 0 14px rgba(255,210,74,0.55)" : "none";
    });
  }

  destroy(): void { this.el.remove(); }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter @se/client exec vitest run src/hud/TurnHud.test.ts`
Expected: PASS (3 rows, active class on A, skull on C, numeral 5).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/hud/TurnHud.ts apps/client/src/hud/TurnHud.test.ts
git commit -m "feat(hud): TurnHud — depleting ring timer + player roster (Layout C)"
```

---

### Task 9: Rewire MatchScene + strip HudBar timer + delete dead HUD files

**Files:**
- Modify: `apps/client/src/scenes/MatchScene.ts`
- Modify: `apps/client/src/hud/HudBar.ts`
- Delete: `apps/client/src/hud/PlayerStrip.ts`, `TurnTimer.ts`, `PlayerList.ts`

- [ ] **Step 1: Confirm dead files are unreferenced**

Run: `grep -rn "PlayerStrip\|TurnTimer\|PlayerList" apps/client/src`
Expected: only the files themselves + the `PlayerStrip` usage in `MatchScene.ts`. If `TurnTimer`/`PlayerList` are imported anywhere else, do not delete those — note it.

- [ ] **Step 2: Rewire MatchScene**

In `MatchScene.ts`:
- Replace `import { PlayerStrip } from '../hud/PlayerStrip';` → `import { TurnHud } from '../hud/TurnHud';`
- Replace field `private playerStrip: PlayerStrip | null = null;` → `private turnHud: TurnHud | null = null;`
- Replace `this.playerStrip = new PlayerStrip(room.sessionId);` → `this.turnHud = new TurnHud(room.sessionId);`
- In the ticker, remove `this.hudBar?.updateTimer(room.state.turnDeadlineMs);` and replace `this.playerStrip?.update(room.state);` → `this.turnHud?.update(room.state);`
- In `onPhaseChange`, replace the two `this.playerStrip` lines with `this.turnHud` equivalents (toggle `display`).
- In the observer-mode block, replace `this.playerStrip.el.style.display = 'none'` → `this.turnHud.el.style.display = 'none'`.

- [ ] **Step 3: Remove the timer from HudBar**

In `HudBar.ts`:
- Delete the `<!-- Timer -->` block (the `#hud-timer` div) from `buildHTML()`.
- Delete the `updateTimer(deadlineMs)` method.

- [ ] **Step 4: Delete dead files**

```bash
git rm apps/client/src/hud/PlayerStrip.ts
# only if Step 1 confirmed unreferenced:
git rm apps/client/src/hud/TurnTimer.ts apps/client/src/hud/PlayerList.ts
```

- [ ] **Step 5: Typecheck + live**

Run: `pnpm --filter @se/client exec tsc --noEmit`
Expected: no errors (no dangling references).

Live: no "YOUR TURN" banner; ring + roster show; bottom bar has no second timer box.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/scenes/MatchScene.ts apps/client/src/hud/HudBar.ts
git commit -m "refactor(hud): swap PlayerStrip for TurnHud, drop redundant HudBar timer, delete dead HUD files"
```

---

## Phase 6 — Debug Capture (client + server) + Build ID

### Task 10: Build ID injection + /health build field

**Files:**
- Modify: `apps/client/vite.config.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Inject `__BUILD_ID__` in vite.config.ts**

In `apps/client/vite.config.ts`, compute a build id and add to `define`:

```ts
import { execSync } from "node:child_process";
const BUILD_ID = (() => {
  let sha = "nogit";
  try { sha = execSync("git rev-parse --short HEAD").toString().trim(); } catch {}
  return `${sha}-${new Date().toISOString()}`;
})();
// in defineConfig({ define: { ... } }):
//   __BUILD_ID__: JSON.stringify(BUILD_ID),
```

Add to the existing `define` block (alongside `__SERVER_URL__`). Add `declare const __BUILD_ID__: string;` where used.

- [ ] **Step 2: Add `build` to /health**

In `apps/server/src/index.ts`, where `/health` responds `"ok"`, return JSON instead:

```ts
res.end(JSON.stringify({ status: "ok", build: process.env.BUILD_ID ?? "dev" }));
```

(Set `BUILD_ID` in the server build/deploy later; default `"dev"` is fine.)

- [ ] **Step 3: Verify**

Run: `pnpm --filter @se/client exec tsc --noEmit` and `pnpm --filter @se/server exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/client/vite.config.ts apps/server/src/index.ts
git commit -m "chore: inject __BUILD_ID__ (client) and expose build in /health (server)"
```

---

### Task 11: Server debugStore with retention

**Files:**
- Create: `apps/server/src/debug/debugStore.ts`
- Test: `apps/server/tests/debugStore.test.ts`

- [ ] **Step 1: Write failing retention test**

```ts
// apps/server/tests/debugStore.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DebugStore } from "../src/debug/debugStore";

function bundle(id: string) {
  return { id, reason: "manual" as const, ts: Date.now(), build: "test",
    userAgent: "x", url: "http://x", logs: [], screenshotPng: undefined };
}

describe("DebugStore retention", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "dbg-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("keeps only the newest maxCount bundles", () => {
    const store = new DebugStore({ dir, maxCount: 3, maxDays: 9999, maxMb: 9999 });
    for (let i = 0; i < 6; i++) store.save(bundle(`id${i}`));
    const jsons = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    expect(jsons.length).toBe(3);
    expect(jsons).toEqual(["id3.json", "id4.json", "id5.json"]);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @se/server test debugStore`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement debugStore**

```ts
// apps/server/src/debug/debugStore.ts
import { mkdirSync, writeFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { LogEvent } from "@se/shared";

export interface DebugBundle {
  id: string;
  reason: "uncaught" | "manual" | "invariant";
  detail?: string;
  ts: number;
  build: string;
  userAgent: string;
  url: string;
  matchId?: string;
  sessionId?: string;
  phase?: string;
  logs: LogEvent[];
  state?: unknown;
  screenshotPng?: string; // base64 (no data: prefix)
}

export interface RetentionOpts { dir: string; maxCount?: number; maxDays?: number; maxMb?: number; }

export class DebugStore {
  private dir: string;
  private maxCount: number;
  private maxDays: number;
  private maxMb: number;

  constructor(opts: RetentionOpts) {
    this.dir = opts.dir;
    this.maxCount = opts.maxCount ?? 200;
    this.maxDays = opts.maxDays ?? 7;
    this.maxMb = opts.maxMb ?? 500;
    mkdirSync(this.dir, { recursive: true });
    this.prune();
  }

  save(bundle: DebugBundle): void {
    const { screenshotPng, ...meta } = bundle;
    writeFileSync(join(this.dir, `${bundle.id}.json`), JSON.stringify(meta));
    if (screenshotPng) {
      writeFileSync(join(this.dir, `${bundle.id}.png`), Buffer.from(screenshotPng, "base64"));
    }
    this.prune();
  }

  get(id: string): unknown | null {
    try { return JSON.parse(require("node:fs").readFileSync(join(this.dir, `${id}.json`), "utf8")); }
    catch { return null; }
  }

  private prune(): void {
    let ids = this.listByMtimeDesc();
    // age
    const cutoff = Date.now() - this.maxDays * 86400_000;
    for (const e of ids) if (e.mtime < cutoff) this.remove(e.id);
    ids = this.listByMtimeDesc();
    // count
    for (const e of ids.slice(this.maxCount)) this.remove(e.id);
    ids = this.listByMtimeDesc();
    // size
    let total = ids.reduce((s, e) => s + e.size, 0);
    const cap = this.maxMb * 1024 * 1024;
    for (let i = ids.length - 1; i >= 0 && total > cap; i--) { this.remove(ids[i]!.id); total -= ids[i]!.size; }
  }

  private listByMtimeDesc(): Array<{ id: string; mtime: number; size: number }> {
    const map = new Map<string, { id: string; mtime: number; size: number }>();
    for (const f of readdirSync(this.dir)) {
      const id = f.replace(/\.(json|png)$/, "");
      if (id === f) continue;
      const st = statSync(join(this.dir, f));
      const cur = map.get(id) ?? { id, mtime: 0, size: 0 };
      cur.mtime = Math.max(cur.mtime, st.mtimeMs);
      cur.size += st.size;
      map.set(id, cur);
    }
    return [...map.values()].sort((a, b) => b.mtime - a.mtime);
  }

  private remove(id: string): void {
    for (const ext of [".json", ".png"]) {
      try { rmSync(join(this.dir, `${id}${ext}`)); } catch {}
    }
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `pnpm --filter @se/server test debugStore`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/debug/debugStore.ts apps/server/tests/debugStore.test.ts
git commit -m "feat(server): debug bundle store with count/age/size retention"
```

---

### Task 12: /debug endpoints + server error bundle

**Files:**
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Wire the store + POST/GET /debug**

In `apps/server/src/index.ts`:

```ts
import { DebugStore } from "./debug/debugStore";

const DEBUG_ENABLED = (process.env.DEBUG_CAPTURE_ENABLED ?? (process.env.NODE_ENV !== "production" ? "1" : "0")) === "1";
const debugStore = DEBUG_ENABLED
  ? new DebugStore({
      dir: process.env.DEBUG_DIR ?? "./data/debug",
      maxCount: Number(process.env.DEBUG_RETENTION_MAX ?? 200),
      maxDays: Number(process.env.DEBUG_RETENTION_DAYS ?? 7),
      maxMb: Number(process.env.DEBUG_RETENTION_MB ?? 500),
    })
  : null;
```

Add routes in the existing HTTP request handler (mirror the `/health` and `/replays/:id` style):

```ts
// POST /debug  — body: DebugBundle JSON
if (req.method === "POST" && req.url === "/debug") {
  if (!debugStore) { res.writeHead(404).end(); return; }
  const chunks: Buffer[] = [];
  let size = 0;
  req.on("data", (c) => { size += c.length; if (size > 8 * 1024 * 1024) req.destroy(); else chunks.push(c); });
  req.on("end", () => {
    try {
      const bundle = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      debugStore.save(bundle);
      Sentry?.captureMessage(`[debug-bundle] ${bundle.reason}`, {
        level: bundle.reason === "manual" ? "info" : "warning",
        extra: { id: bundle.id, matchId: bundle.matchId, phase: bundle.phase, detail: bundle.detail },
      } as any);
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, id: bundle.id }));
    } catch { res.writeHead(400).end(); }
  });
  return;
}
// GET /debug/:id
if (req.method === "GET" && req.url?.startsWith("/debug/")) {
  if (!debugStore) { res.writeHead(404).end(); return; }
  const id = req.url.slice("/debug/".length);
  const data = debugStore.get(id);
  if (!data) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(data));
  return;
}
```

- [ ] **Step 2: Server error → bundle + Sentry**

Extend the existing top-level error handler (where `Sentry?.captureException(err)` is) to also save a minimal bundle when `debugStore` exists:

```ts
debugStore?.save({
  id: `${Date.now()}-srv`, reason: "uncaught", detail: String((err as Error)?.message ?? err),
  ts: Date.now(), build: process.env.BUILD_ID ?? "dev", userAgent: "server", url: "server",
  logs: [], // (wire serverRing.snapshot() if a server ring is added)
});
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter @se/server exec tsc --noEmit && pnpm --filter @se/server test`
Expected: typechecks; existing tests still pass.

Manual: `curl -XPOST localhost:2567/debug -d '{"id":"t1","reason":"manual","ts":0,"build":"x","userAgent":"x","url":"x","logs":[]}'` → `{ "ok": true, "id": "t1" }`; `data/debug/t1.json` exists.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/index.ts
git commit -m "feat(server): /debug capture endpoint + server-error bundle, retention-gated"
```

---

### Task 13: Client capture + invariant watch + wiring

**Files:**
- Create: `apps/client/src/debug/capture.ts`, `apps/client/src/debug/invariantWatch.ts`
- Modify: `apps/client/src/main.ts`, `apps/client/src/scenes/MatchScene.ts`

- [ ] **Step 1: Implement `capture.ts`**

```ts
// apps/client/src/debug/capture.ts
import type { Application } from "pixi.js";
import { RingBuffer, type LogEvent } from "@se/shared";

declare const __BUILD_ID__: string;
declare const __SERVER_URL__: string;

export const debugRing = new RingBuffer(300);

interface CaptureCtx {
  app?: Application;
  matchId?: () => string | undefined;
  sessionId?: () => string | undefined;
  phase?: () => string | undefined;
  stateSnapshot?: () => unknown;
}
let ctx: CaptureCtx = {};
export function setCaptureContext(c: CaptureCtx): void { ctx = { ...ctx, ...c }; }

const lastByReason = new Map<string, number>();

export async function capture(reason: "uncaught" | "manual" | "invariant", detail?: string): Promise<void> {
  const key = `${reason}:${detail ?? ""}`;
  const now = Date.now();
  if (reason === "invariant" && now - (lastByReason.get(key) ?? 0) < 10_000) return; // rate limit
  lastByReason.set(key, now);

  let screenshotPng: string | undefined;
  try {
    if (ctx.app) {
      const url = await ctx.app.renderer.extract.base64(ctx.app.stage);
      screenshotPng = url.split(",")[1]; // strip data: prefix
    }
  } catch { /* WebGL context loss — omit screenshot */ }

  const bundle = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    reason, detail, ts: now,
    build: typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev",
    userAgent: navigator.userAgent, url: location.href,
    matchId: ctx.matchId?.(), sessionId: ctx.sessionId?.(), phase: ctx.phase?.(),
    logs: debugRing.snapshot() as LogEvent[],
    state: ctx.stateSnapshot?.(),
    screenshotPng,
  };

  const http = (typeof __SERVER_URL__ !== "undefined" ? __SERVER_URL__ : "ws://localhost:2567").replace(/^ws/, "http");
  try {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 5000);
    await fetch(`${http}/debug`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(bundle), signal: controller.signal,
    });
    clearTimeout(to);
  } catch { /* swallow; capture must never throw into the app */ }
}

export function installCaptureTriggers(): void {
  window.addEventListener("error", (e) => { void capture("uncaught", e.message); });
  window.addEventListener("unhandledrejection", (e) => { void capture("uncaught", String((e as PromiseRejectionEvent).reason)); });
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) { e.preventDefault(); void capture("manual"); toast("Debug snapshot sent"); }
  });
}

function toast(msg: string): void {
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.cssText = "position:fixed;bottom:120px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);" +
    "color:#ffd24a;font:bold 12px system-ui;padding:8px 16px;border-radius:8px;z-index:9999;pointer-events:none;";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}
```

- [ ] **Step 2: Implement `invariantWatch.ts`**

```ts
// apps/client/src/debug/invariantWatch.ts
import { checkMatchInvariants, checkCameraFinite, type MatchStateLike } from "@se/shared";
import { capture } from "./capture";

export class InvariantWatch {
  private lastRun = 0;
  constructor(private getState: () => MatchStateLike, private getCam: () => { x: number; y: number; scale: number }) {}

  tick(): void {
    const now = Date.now();
    if (now - this.lastRun < 1000) return;
    this.lastRun = now;
    const v = [...checkMatchInvariants(this.getState()), ...checkCameraFinite(this.getCam())];
    for (const violation of v) {
      console.error(`[invariant] ${violation.name}: ${violation.detail}`);
      void capture("invariant", violation.name);
    }
  }
}
```

- [ ] **Step 3: Wire into main.ts + MatchScene**

In `apps/client/src/main.ts`, after the Pixi app is created, call `installCaptureTriggers()` and `setCaptureContext({ app })`.

In `MatchScene.ts`:
- `import { setCaptureContext } from "../debug/capture";` and `import { InvariantWatch } from "../debug/invariantWatch";`
- In `onFirstState` (or constructor), call:

```ts
setCaptureContext({
  matchId: () => this.room.roomId,
  sessionId: () => this.room.sessionId,
  phase: () => this.room.state.phase,
  stateSnapshot: () => ({
    phase: this.room.state.phase, round: this.room.state.round, wind: this.room.state.wind,
    currentTurnPlayerId: this.room.state.currentTurnPlayerId,
    tanks: Array.from(this.room.state.tanks.values()).map((t) => ({
      sessionId: t.sessionId, hp: t.hp, alive: t.alive, x: t.x, y: t.y, weaponId: t.weaponId,
    })),
  }),
});
```

- Create an `InvariantWatch` whose `getState` maps `room.state` into `MatchStateLike` (tanks → array with `sessionId,hp,alive,x,y,angle,power`) and `getCam` reads `this.camera` (expose `get scaleX()`/`worldX`/`worldY` on Camera if needed). Call `this.invariantWatch.tick()` in the ticker.

> Add a `get scale(): number { return this.world.scale.x; }` getter on `Camera` for the watch.

- [ ] **Step 4: Verify**

Run: `pnpm --filter @se/client exec tsc --noEmit`
Expected: no errors.

Live: press `Ctrl+Shift+D` → toast appears, server writes a bundle (`data/debug/<id>.json` + `.png`). Throwing a test error (`throw new Error("x")` in console) creates an `uncaught` bundle.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/debug/capture.ts apps/client/src/debug/invariantWatch.ts apps/client/src/main.ts apps/client/src/scenes/MatchScene.ts apps/client/src/render/Camera.ts
git commit -m "feat(client): debug capture (uncaught/manual/invariant) + runtime invariant watch"
```

---

## Phase 7 — Visual-Critique Script + Terrain Art Polish

### Task 14: art-critique.mjs (dev tool)

**Files:**
- Create: `scripts/art-critique.mjs`

- [ ] **Step 1: Implement the script**

```js
// scripts/art-critique.mjs
// Usage: node scripts/art-critique.mjs --image path/to.png
//   or:  node scripts/art-critique.mjs --url http://localhost:5173 --scenario cave
import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith("--")) a.push([v.slice(2), arr[i + 1]]); return a;
}, []));

if (!process.env.ANTHROPIC_API_KEY) { console.error("Set ANTHROPIC_API_KEY"); process.exit(1); }

async function getImageB64() {
  if (args.image) return readFileSync(args.image).toString("base64");
  // Playwright path: boot a match into args.scenario and screenshot #pixi canvas.
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(args.url ?? "http://localhost:5173");
  // TODO-hook: drive lobby → start match with terrain/wall mode per args.scenario
  // (reuse selectors from tests/e2e/full-match.spec.ts). For now, wait + shoot a screenshot.
  await page.waitForTimeout(4000);
  const buf = await page.locator("canvas").first().screenshot();
  await browser.close();
  return buf.toString("base64");
}

const RUBRIC = `You are an art director reviewing a 2D artillery game (Worms Armageddon-style, cartoon-realistic).
Assess the screenshot on these axes and return ONLY JSON:
{ "caves": {"score":1-5,"note":""}, "island": {"score":1-5,"note":""},
  "fill": {"score":1-5,"note":""}, "overall": {"score":1-5,"note":""} }
- caves: do stalactites/stalagmites read as organic rock, or too geometric/uniform?
- island: floating-island underside chunky/organic with tapering + trailing rocks, or a flat wedge?
- fill: terrain textured (grass rim + dirt/rock body, top highlight, darker interior) or flat color?
- overall: is the cartoon-realistic target met? Give one concrete fix in each note.`;

const client = new Anthropic();
const img = await getImageB64();
const resp = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 600,
  system: [{ type: "text", text: RUBRIC, cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: [
    { type: "image", source: { type: "base64", media_type: "image/png", data: img } },
    { type: "text", text: "Review this screenshot." },
  ] }],
});
console.log(resp.content.map((c) => (c.type === "text" ? c.text : "")).join("\n"));
```

- [ ] **Step 2: Verify it runs (no-op without key) + with key**

Run: `node scripts/art-critique.mjs` (no key) → prints "Set ANTHROPIC_API_KEY" and exits 1.
With key + `--image` of any current game screenshot → prints the JSON verdict.

> The Playwright scenario-driving (`TODO-hook`) is wired against the existing e2e selectors during this step; if that's deferred, keep the `--image` path fully working and note the `--scenario` path as follow-up.

- [ ] **Step 3: Commit**

```bash
git add scripts/art-critique.mjs
git commit -m "feat(dev): art-critique script — screenshot to Claude vision rubric"
```

---

### Task 15: Organic cave + floating-island terrain art

**Files:**
- Modify: `apps/client/src/render/Terrain.ts`

- [ ] **Step 1: Capture a baseline critique**

Run a dev server, screenshot a cave (absorb mode) and a floating-island view, run `node scripts/art-critique.mjs --image <shot>.png`. Record the baseline scores/notes (expect low `caves`/`island` with "too geometric").

- [ ] **Step 2: Make the silhouette + features organic**

In `Terrain.ts`, for the cave ceiling stalactites and the island underside (find the polygon/teeth drawing code):
- Drive feature geometry from the existing seed (so renders are stable). Use a small seeded PRNG (`@se/game` exposes `createPrng`).
- **Stalactites:** instead of uniform triangles, draw irregular tapering forms: per-feature randomized `width ∈ [6,20]`, `length ∈ [10,40]`, a slight horizontal lean, rounded tip (quadratic curve), and 2 size classes (big anchors every few units + small filler between). Randomize spacing.
- **Island underside:** replace any clean wedge with a chunky bulbous contour (jittered vertices) tapering to a rounded point, plus 3–6 small trailing rock blobs beneath.
- **Silhouette rule:** jitter every contour vertex by `±2–4px` so no long straight edges remain.
- **Fill/shading:** add a vertical gradient (lighter near surface, darker deep) using layered fills or a tint; draw a 1–2px lighter highlight stroke along the top edge; scatter a handful of darker speckle dots for rock texture.

Keep all of this **render-only** — do not touch heightmaps or the server-provided ceiling data.

- [ ] **Step 3: Iterate against the critique loop**

Re-screenshot + re-run `art-critique.mjs` until `caves` and `island` axes score **≥4/5** with no "too geometric" note. Spot-check 3 seeds in the running app.

- [ ] **Step 4: Verify typecheck**

Run: `pnpm --filter @se/client exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/render/Terrain.ts
git commit -m "polish(terrain): organic cave stalactites + floating-island underside (Worms-style)"
```

---

## Phase 8 — Regression Suites

### Task 16: Headless invariant match runner

**Files:**
- Create: `apps/server/tests/invariant-match.test.ts`

- [ ] **Step 1: Write the test**

Drive a full match through the server room/sim using the existing test harness (see `MatchRoom.test.ts` / `roundFlow.test.ts` for how rooms are booted and turns advanced). After every turn and round transition, assert invariants hold:

```ts
import { describe, it, expect } from "vitest";
import { checkMatchInvariants, type MatchStateLike } from "@se/shared";
// import room/harness helpers used by the other server tests

function toLike(state: any): MatchStateLike {
  return {
    phase: state.phase, round: state.round, maxRounds: state.maxRounds,
    currentTurnPlayerId: state.currentTurnPlayerId,
    tanks: Array.from(state.tanks.values()).map((t: any) => ({
      sessionId: t.sessionId, hp: t.hp, alive: t.alive, x: t.x, y: t.y, angle: t.angle, power: t.power,
    })),
  };
}

describe("full match holds invariants", () => {
  for (const seed of ["s1", "s2", "s3"]) {
    it(`seed ${seed}: 1v1+AI to completion`, async () => {
      // boot room with seed, join A, add AI, start match
      // loop: while phase !== "ended": after each fire/turn advance, assert:
      //   expect(checkMatchInvariants(toLike(state))).toEqual([])
      // include a guard that the turn pointer advances (no infinite loop / stuck turn)
    });
  }
});
```

Fill the loop using the project's harness (the same calls `roundFlow.test.ts` uses to fire and advance turns). The assertion after each step is the key line.

- [ ] **Step 2: Run**

Run: `pnpm --filter @se/server test invariant-match`
Expected: PASS for all seeds; if a real invariant breaks, that's a genuine bug to fix before merge.

- [ ] **Step 3: Commit**

```bash
git add apps/server/tests/invariant-match.test.ts
git commit -m "test(server): headless full-match invariant runner"
```

---

### Task 17: Replay determinism test

**Files:**
- Create: `apps/server/tests/replay-determinism.test.ts`

- [ ] **Step 1: Write the test**

Using `ReplayRecorder` + the replay JSON it produces (see `ReplayRecorder.test.ts` and `replayStore.ts`), record a short match, then re-simulate from the recorded seed + intents and assert the final state matches:

```ts
import { describe, it, expect } from "vitest";
// import recorder + re-sim helpers

describe("replay re-simulation is deterministic", () => {
  it("re-simulating a recorded match yields identical tank state + carves", async () => {
    // 1. play a scripted short match, capturing the replay (seed + intents + carve ops)
    // 2. re-run the simulation from the replay seed + intents
    // 3. expect identical: tank hp/x/y per sessionId, round outcome, sorted carve-op set
  });
});
```

- [ ] **Step 2: Run**

Run: `pnpm --filter @se/server test replay-determinism`
Expected: PASS (identical outcome). A mismatch indicates a determinism/desync regression.

- [ ] **Step 3: Commit**

```bash
git add apps/server/tests/replay-determinism.test.ts
git commit -m "test(server): replay re-simulation determinism"
```

---

### Task 18: Playwright HUD smoke

**Files:**
- Create: `tests/e2e/hud.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/hud.spec.ts
import { test, expect } from "@playwright/test";
// Reuse the join/start flow from full-match.spec.ts.

test("TurnHud shows ring + roster, no YOUR TURN banner", async ({ page }) => {
  // ...join + start a match (copy helper from full-match.spec.ts)...
  await page.waitForFunction(() => (window as any).__room?.state?.phase === "playing");

  // No old banner text anywhere
  await expect(page.getByText("YOUR TURN")).toHaveCount(0);

  // Ring present
  await expect(page.locator("#turnhud-ring")).toBeVisible();

  // One roster row per tank, active row matches currentTurnPlayerId
  const playerCount = await page.evaluate(() => (window as any).__room.state.tanks.size);
  await expect(page.locator("#turnhud-roster [data-session]")).toHaveCount(playerCount);
  const activeId = await page.evaluate(() => (window as any).__room.state.currentTurnPlayerId);
  await expect(page.locator(`#turnhud-roster [data-session="${activeId}"].active`)).toHaveCount(1);
});
```

- [ ] **Step 2: Run**

Run: `pnpm --filter ... exec playwright test tests/e2e/hud.spec.ts` (use the project's e2e run command from `tests/e2e/playwright.config.ts` / root scripts).
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/hud.spec.ts
git commit -m "test(e2e): TurnHud smoke — ring, roster, active row, no banner"
```

---

## Final Verification

- [ ] `pnpm --filter @se/shared exec vitest run` — logger + invariants green.
- [ ] `pnpm --filter @se/client exec vitest run` — Tank skull, Camera, TurnHud green.
- [ ] `pnpm --filter @se/server test` — selectWeapon, debugStore, invariant-match, replay-determinism green.
- [ ] e2e: full-match + hud specs green.
- [ ] Manual smoke (two clients): respawn shows no skull; ring+roster correct; weapons selectable on-turn only; camera zoom-to-cursor/bounds/no-freeze; `Ctrl+Shift+D` writes a bundle; terrain caves/islands look organic.
- [ ] Per-package typecheck green for each touched package (repo-wide `pnpm typecheck` remains pre-existing-red — do not gate on it).

---

## Self-Review Notes (author)

- **Spec coverage:** §1 skull → T3; §2 HUD → T8/T9; §3 camera → T6/T7; §4 weapons → T4/T5; §5 logger/invariants/capture/retention/critique → T1/T2/T10–T14; §6 terrain art → T15; regression (§5.6) → T16–T18. All covered.
- **Type consistency:** `DebugBundle` shape identical in `debugStore.ts` (server) and `capture.ts` (client); `MatchStateLike`/`TankLike` from `@se/shared` used uniformly by invariants, client watch, and CI runner; `RingBuffer`/`LogEvent` shared.
- **Known harness gaps to fill at execution time (not placeholders in shipped code, but test-scaffolding to complete against existing helpers):** T5/T16/T17 reference the existing server test harness calls (room boot, join, fire, advance-turn) — copy the exact helper usage from `MatchRoom.test.ts`/`roundFlow.test.ts`/`ReplayRecorder.test.ts`. T14's Playwright `--scenario` driving and T15's exact Terrain drawing edits are guided by intent + the critique loop; iterate to the stated acceptance scores.
