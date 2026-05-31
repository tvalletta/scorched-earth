/**
 * Headless full-match invariant runner
 *
 * Drives a complete match (2 human clients, no AI) from lobby → playing →
 * round-summary → ended, asserting checkMatchInvariants() returns zero
 * violations after every observable state transition.
 *
 * Modelled on MatchRoom.test.ts and roundFlow.test.ts: boots Colyseus via
 * `boot(appConfig)`, joins with `colyseus.sdk.joinOrCreate("match", ...)`,
 * and drives the match with "configure" / "ready" / "fire" messages exactly
 * as the existing tests do.
 *
 * Match configuration for speed:
 *   - maxRounds: 1   (avoids the 45 s shopping timer)
 *   - turnTimerMs: 5000  (safety net only — the test sends explicit "fire"
 *       messages immediately on each turn, so the timer never triggers)
 *   - 2 human clients; the current-turn player always fires angle=90
 *     (straight up, power=500) with a nuke selected.  The projectile arcs
 *     straight up and lands back on the firing tank, dealing 60 HP of
 *     self-damage on the first hit (impact offset = crater radius) and 100 HP
 *     on the second (direct hit after the crater already formed).  This
 *     guarantees the first player to shoot dies within 2 turns, ending the
 *     match in ≤ 4 total turns — no wind or terrain-dependent targeting needed.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { checkMatchInvariants, type MatchStateLike } from "@se/shared";
import appConfig from "../src/appConfig";

// ── Colyseus test server ──────────────────────────────────────────────────────

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  colyseus = await boot(appConfig);
});

afterAll(async () => {
  await colyseus.shutdown();
});

beforeEach(async () => {
  await colyseus.cleanup();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert the live Colyseus schema state into the plain MatchStateLike that
 * checkMatchInvariants() accepts.
 */
function toLike(state: any): MatchStateLike {
  return {
    phase: state.phase,
    round: state.round,
    maxRounds: state.maxRounds,
    currentTurnPlayerId: state.currentTurnPlayerId,
    tanks: Array.from(state.tanks.values()).map((t: any) => ({
      sessionId: t.sessionId,
      hp: t.hp,
      alive: t.alive,
      x: t.x,
      y: t.y,
      angle: t.angle,
      power: t.power,
    })),
  };
}

/**
 * Assert no invariant violations on the current state.
 * On failure, include violation details in the error message.
 */
function assertNoViolations(state: any, label: string): void {
  const violations = checkMatchInvariants(toLike(state));
  expect(
    violations,
    `Invariant violation at ${label}: ${JSON.stringify(violations)}`,
  ).toHaveLength(0);
}

/**
 * Wait up to `timeoutMs` for `predicate(state)` to become true, polling every
 * `intervalMs`.  Returns true if the condition was met, false if it timed out.
 */
async function waitForState(
  clientRoom: any,
  predicate: (state: any) => boolean,
  timeoutMs = 15_000,
  intervalMs = 100,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate(clientRoom.state)) return true;
    // Yield to the event loop.  waitForNextPatch() resolves on the next Colyseus
    // state broadcast, potentially waking us earlier than intervalMs.
    const nextPatch = clientRoom.waitForNextPatch?.() as Promise<void> | undefined;
    await Promise.race([
      nextPatch ?? Promise.resolve(),
      new Promise<void>((r) => setTimeout(r, intervalMs)),
    ]);
  }
  return predicate(clientRoom.state);
}

// ── Invariant runner ──────────────────────────────────────────────────────────

/**
 * Drive a full 2-human match from lobby to "ended", asserting invariants
 * after every state transition.
 *
 * Strategy: every turn, the active player fires angle=90 (straight up) with a
 * nuke selected.  The projectile returns to the firing tank's column:
 *   - Shot 1: impact offset ≈ crater radius → ~60 HP self-damage.
 *   - Shot 2: direct hit on same x → 100 HP self-damage, tank dies.
 * The match ends in ≤ 4 turns (typically 3), regardless of wind, terrain type,
 * or tank placement.
 *
 * @param roomCode  Room code (drives matchSeed → different terrain/placements).
 */
async function runFullMatchWithInvariants(roomCode: string): Promise<void> {
  // ── Join two human clients ───────────────────────────────────────────────
  const a = await colyseus.sdk.joinOrCreate<any>("match", {
    code: roomCode,
    nickname: "Alpha",
    color: "red",
  });
  await new Promise((r) => setTimeout(r, 30));

  const b = await colyseus.sdk.joinOrCreate<any>("match", {
    code: roomCode,
    nickname: "Beta",
    color: "blue",
  });
  await new Promise((r) => setTimeout(r, 50));

  // maxRounds=1 avoids the 45 s shopping timer.
  a.send("configure", { maxRounds: 1 });
  await new Promise((r) => setTimeout(r, 30));

  // 5 s fallback turn timer — the test sends explicit "fire" immediately, so
  // this timer should never trigger in the normal flow.
  a.send("configure", { turnTimerMs: 5_000 });
  await new Promise((r) => setTimeout(r, 30));

  // ── Lobby invariant ──────────────────────────────────────────────────────
  assertNoViolations(a.state, "lobby:initial");

  // ── Start match ──────────────────────────────────────────────────────────
  a.send("ready", {});
  const startedPlaying = await waitForState(a, (s) => s.phase === "playing", 5_000);
  expect(startedPlaying, `Match never left lobby for ${roomCode}`).toBe(true);
  assertNoViolations(a.state, "playing:match-started");

  // ── Main loop ─────────────────────────────────────────────────────────────
  // Safety cap: with the self-shot strategy each player dies in ≤ 2 turns,
  // so the match ends in ≤ 4 turns.  Use a generous cap to guard against
  // unexpected hangs without masking real failures.
  const MAX_TURNS = 20;
  let turnsPlayed = 0;

  while (a.state.phase !== "ended") {
    const phase = a.state.phase as string;

    // ── resolving: tick loop is running; wait for it to finish ───────────
    if (phase === "resolving") {
      const ok = await waitForState(a, (s) => s.phase !== "resolving", 15_000);
      if (!ok) throw new Error(`Stuck in 'resolving' (${roomCode})`);
      continue;
    }

    // ── round-summary: maxRounds=1 → auto-advances to 'ended' after 5 s ──
    if (phase === "round-summary") {
      assertNoViolations(a.state, "round-summary");
      const ok = await waitForState(a, (s) => s.phase !== "round-summary", 10_000);
      if (!ok) throw new Error(`Stuck in 'round-summary' (${roomCode})`);
      continue;
    }

    // ── shopping: should not be reached with maxRounds=1 ─────────────────
    if (phase === "shopping") {
      assertNoViolations(a.state, "shopping");
      a.send("ready-for-shop", {});
      b.send("ready-for-shop", {});
      const ok = await waitForState(a, (s) => s.phase !== "shopping", 55_000);
      if (!ok) throw new Error(`Stuck in 'shopping' (${roomCode})`);
      continue;
    }

    // ── playing: assert invariants, then fire immediately ─────────────────
    if (phase === "playing") {
      if (++turnsPlayed > MAX_TURNS) {
        throw new Error(
          `Match did not reach 'ended' within ${MAX_TURNS} turns (${roomCode}). ` +
            `phase=${a.state.phase}, turn=${a.state.currentTurnPlayerId}`,
        );
      }

      assertNoViolations(a.state, `playing:turn-${turnsPlayed}`);

      const prevTick = a.state.tick as number;
      const turnId   = a.state.currentTurnPlayerId as string;
      const firer    = turnId === a.sessionId ? a : (turnId === b.sessionId ? b : null);

      if (firer) {
        // Select nuke if available (radius=60, damage=100, 2 in standard loadout).
        // Falls back to missile (radius=30, damage=60) then baby-missile (infinite).
        const myTank = a.state.tanks.get(firer.sessionId) as any;
        const inventory = myTank?.inventory as Map<string, number> | undefined;
        for (const w of ["nuke", "missile", "baby-missile"] as const) {
          const count = inventory?.get(w) ?? (w === "baby-missile" ? 1 : 0);
          if (count !== 0) { // -1 = infinite; > 0 = have some
            firer.send("select-weapon", { weaponId: w });
            break;
          }
        }

        // Angle=90 fires straight up; the shot returns to the same x column,
        // landing on (or very close to) the firing tank — guaranteed self-damage
        // regardless of wind, terrain type, or opponent position.
        firer.send("fire", { angle: 90, power: 500 });
      }
      // If firer is null (e.g., turn player is somehow not a/b), the 5 s turn
      // timer will handle it.

      // Wait for tick to advance (turn completed) OR phase to change.
      const advanced = await waitForState(
        a,
        (s) => s.phase !== "playing" || (s.tick as number) > prevTick,
        15_000,
      );

      if (!advanced) {
        throw new Error(
          `Tick did not advance within 15 s (${roomCode}, ` +
            `turn=${turnsPlayed}, prevTick=${prevTick}, phase=${a.state.phase})`,
        );
      }

      if (a.state.phase === "playing") {
        assertNoViolations(a.state, `playing:after-turn-${turnsPlayed}`);
      }
      continue;
    }

    // Unknown phase.
    throw new Error(`Unexpected phase '${phase}' (${roomCode})`);
  }

  // ── Final invariant check ────────────────────────────────────────────────
  expect(a.state.phase, `Match ended in unexpected phase (${roomCode})`).toBe("ended");
  assertNoViolations(a.state, "ended:final");

  await a.leave();
  await b.leave();
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("full match holds invariants", () => {
  // Three distinct room codes — the code drives the matchSeed, so different
  // terrain shapes and tank placements are exercised.  With the self-shot
  // strategy each match completes in ≤ 4 turns (~20 s), so three tests run
  // comfortably within the 3-minute per-test budget even under CI load.
  for (const roomCode of ["INV001", "INV002", "INV003"]) {
    it(
      `room ${roomCode}: drives to completion with zero violations`,
      async () => {
        await runFullMatchWithInvariants(roomCode);
      },
      180_000, // 3-minute per-test budget; typical match finishes in < 30 s
    );
  }
});
