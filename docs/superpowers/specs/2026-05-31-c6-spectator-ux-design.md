# C6 — Spectator UX (remaining delta) — Design

**Date:** 2026-05-31
**Status:** Approved (brainstorming) — small change; implement directly with TDD (no separate plan/subagent pipeline).
**Resolves:** Audit conflict **C6** (see `DECISIONS-2026-05-31-audit-resolutions.md`).

## Context

The audit assessed spectator UX at commit `59abdce`, **before** the camera/TurnHud work merged. On
current `main`, most of C6 already exists:
- **Detection:** `MatchScene` sets `isObserver` when the local client has no tank (`!state.tanks.has(sessionId)`).
- **Badge:** `showObserverBanner()` shows a top-center "SPECTATING" pill.
- **HUD suppression:** the interactive `HudBar` (aim/fire) is hidden for spectators.
- **Camera:** `trackProjectile` + `fitToLivingTanks` run for everyone, so the spectator camera already
  follows the action.

This spec covers only the remaining delta.

## Decisions
- **Show the TurnHud to spectators** (turn-timer ring + player roster/HP). It is informational, not the
  player-only aim controls, so it improves spectating. Only `HudBar` stays hidden.
- **Badge:** text/glyph only — `"SPECTATING"` → `"👁 Spectating"` (keep the existing pill style).
- **Camera:** unchanged this pass.

## Changes (`apps/client/src/scenes/MatchScene.ts`)
1. **Ticker:** `if (!this.isObserver) this.turnHud?.update(room.state);` → `this.turnHud?.update(room.state);`
   (always update; `TurnHud.update` already self-manages per-phase visibility).
2. **Observer block:** remove `if (this.turnHud) this.turnHud.el.style.display = 'none';` (keep the
   `HudBar` hide). The `isObserver` field becomes unread, so **remove the field** (`private isObserver`)
   and its assignment — dead-code cleanup.
3. **`showObserverBanner()`:** badge text `"SPECTATING"` → `"👁 Spectating"`.

## Behavior for a spectator
`TurnHud` renders all players from `state.tanks`. A spectator's `sessionId` matches no tank, so
`you = (t.sessionId === localSessionId)` is false for every row ⇒ no "You" label (correct), nicknames
used; the active-turn highlight (`currentTurnPlayerId`) still works. `aiSlots` markers (🤖) still render.

## Testing
- **`TurnHud.test.ts` (jsdom):** new case — construct `TurnHud("SPECTATOR")` (a `localSessionId` that
  matches no tank); assert all 3 roster rows render with their nicknames, **none** contains "You", and
  the active player (`A`) row has the `active` class. (Locks in spectator-correct rendering.)
- **tsc:** only the pre-existing `ReplayScene.ts:83` error.
- **Manual smoke:** join an in-progress room as a spectator → see "👁 Spectating" badge + the roster +
  the camera following shots; no aim/fire bar.

## Edge cases
- Spectator joins mid-match: `onFirstState` runs the observer block (HudBar hidden, badge shown); the
  ticker now updates the TurnHud every frame for the spectator too.
- Phase transitions (shopping/round-summary/ended): `TurnHud.update` hides itself when `phase !== "playing"`,
  same as for players — spectators get the same behavior.
