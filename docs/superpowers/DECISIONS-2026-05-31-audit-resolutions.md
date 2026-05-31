# Audit Resolutions — Decisions of 2026-05-31

Resolves the conflicts & ambiguities catalogued in
[`AUDIT-2026-05-30-spec-vs-implementation.md`](./AUDIT-2026-05-30-spec-vs-implementation.md) §4.
Each entry records the **decision**, its **rationale**, and the **resulting actions** (with
owner spec/plan to follow). This file is the authoritative DECISION note the audit found missing.

> Status legend for actions: ☐ not started · ⧗ spec/plan needed · ✅ done

---

## C1 — Phase-4 shields conflict → **May-26 spec is authoritative; build the missing shields**

- **Decision.** The May-26 spec (`2026-05-26-phase-4-defenses-movement-design.md`) is authoritative.
  The May-27 spec (`2026-05-27-phase4-design.md`) is **superseded** for the shield catalog and
  Battery value (its other content — 24-weapon list, PendingEffect queue, netcode — remains valid
  where not in conflict).
- **Rationale.** The richer 5-shield model is the intended design; the shipped 4-shield build was an
  under-implementation, not a deliberate cut.
- **Resulting actions.**
  - ⧗ Build the 3 missing shields: **Deflector Shield, Reactive Armor, Auto-Shield** (incl. auto-equip).
  - ☐ Change **Battery** HP restore to **+250** (currently inconsistent; `MatchRoom.ts:211-221`).
  - ☐ Add supersession header to `2026-05-27-phase4-design.md` pointing here + to the May-26 spec.
  - **Needs a spec/plan** before implementation (game logic in `packages/shared/src/shields.ts`,
    `packages/game`, server resolve, + tests).

## C2 — Phase-5 "absorb" semantics → **code is correct (cave); fix the spec text**

- **Decision.** The shipped behavior (absorb = carveable cave ceiling, from the world-depth spec) is
  authoritative. The Phase-5 spec's original "edge-explode absorb" wording is stale.
- **Resulting actions.** ☐ Patch `2026-05-27-phase-5-terrain-variety-walls-design.md` to describe the
  cave semantics and cross-reference the world-depth spec. (Doc-only; no code change.)

## C3 — Phase-6 specialty weapons (28 built, no spec) → **write a retroactive as-built spec**

- **Decision.** Author a retroactive Phase-6 design spec documenting the weapon catalog as it exists.
- **Rationale.** Needed for replay versioning (C7) and future balance work; closes the governance gap.
- **Resulting actions.** ⧗ Write `docs/superpowers/specs/2026-05-3x-phase-6-specialty-weapons-design.md`
  cataloguing all 28 weapons (`packages/game/src/weapons/` + group1-4): category, damage curve, radius,
  special mechanics (rollOnImpact, burrow, leapCount, plasmaWave, tracerMode, terrainDeposit),
  inventory/cost, and acceptance criteria. Doc-only, but sizeable.

## C4 — Roadmap Audio (P9) + Mobile/A11y (P10) → **keep planned; schedule now**

- **Decision.** Audio and Mobile/Accessibility are **still-planned phases**, not cut. The roadmap was
  mis-numbered when "Stability & Launch" (true P11) was pulled forward and relabeled "Phase 9".
- **Resulting actions.**
  - ☐ Fix roadmap numbering in `2026-05-22-roadmap.md`: restore P9 = Audio, P10 = Mobile/A11y,
    P11 = Stability & Launch; relabel the shipped "phase-9-stability-launch" docs as Phase 11.
  - ⧗ Slot Audio + Mobile/A11y into the upcoming roadmap with target phases (specs to follow).

## C5 — Phase-1 physics constants deviate from spec → **document the final tuned values**

- **Decision.** The shipped (tuned) gravity/velocity/wind constants are authoritative; the Phase-1
  spec numbers were initial estimates.
- **Resulting actions.** ☐ Record the final constants (`packages/shared/src/constants.ts`,
  `packages/game` physics) + units in the Phase-1 spec as the tuning target. (Doc-only.)

## C6 — Spectator client UX → **full: spectating badge + camera tracking**

- **Decision.** Spectators get a proper experience: detect spectator mode, show a "👁 Spectating"
  badge, hide player-only HUD, and have the camera follow the action.
- **Rationale.** Server-side spectating already works; the client is the gap.
- **Resulting actions.** ⧗ Build spectator detection + badge + camera-follow in `MatchScene`/HUD.
  **Needs a spec/plan.** Coordinates with the new camera work on `feat/debug-hud-camera-fixes`
  (the `Camera` already supports tracking; reuse `trackProjectile`/`fitToTanks`, skip `isObserver`
  suppression for the camera while keeping HUD suppression).

## C7 — Replay fidelity → **deterministic re-simulation**

- **Decision.** Replays store **seed + per-turn intents** and re-run the simulation to reproduce a
  match (not per-tick snapshots).
- **Rationale.** Compact storage; the sim is deterministic and now guarded by the replay-determinism
  regression suite merged from the telemetry stream.
- **Resulting actions.** ⧗ Complete replay playback on the deterministic-re-sim model; ensure
  `ReplayRecorder` captures all intents (it already records fire/configure). **Needs a plan** for the
  playback UI (`ReplayScene` currently has a pre-existing typecheck error at `ReplayScene.ts:83`).

## C8 — Phase-5 crater not centered → **confirm intended**

- **Decision.** Pending confirmation; treat as low-priority. If unintended, file as a bug.
- **Resulting actions.** ☐ Verify crater-offset behavior vs intent; document or open a bug.

---

## Note: audit code recommendations already resolved (as of 2026-05-31)

The audit's §5 code recommendations were largely completed by the parallel work streams:

- ✅ **#1** Stray UI art committed (`874e2a0`, per-weapon explosions + projectile trails).
- ✅ **#3** Telemetry/debug subsystem built & merged to `main` (`e467ab8`): logger, invariants,
  server debug store + `/debug`, build-ID, client capture, art-critique, regression suites, CI.
- ✅ **#4** TurnHud + camera fixes built on `feat/debug-hud-camera-fixes` (min-scale/clamp,
  cursor-anchored zoom, pointer-capture drag, un-latch follow, TurnHud Layout C).
- ✅ **#2 (physics)** Projectile/tank direct-contact collision merged to `main` (`9c28dba`).
- 🟡 **#5** Partially done — the art work added explosion/projectile signatures; the **7 specific
  weapon particle systems** (Laser, Cluster, MIRV, Roller, Leapfrog, Burrow, Parachute) and terrain
  **`ambientMult`** dusk/night darkening remain open.
- ✅ Fixed the flaky `invariant-match` regression test (`4352a8b`).
