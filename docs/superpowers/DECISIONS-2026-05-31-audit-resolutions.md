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
- **Resulting actions.** ✅ **SHIPPED** (merged to `main` `8e4fcfc`, 2026-05-31). Scope confirmed during
  brainstorming as **full adoption** (replace the whole shield system, not just add 3): the 5 May-26
  shields with the `hpCostFraction` model + absorb/deflect/bend/explode physics, universal plasma
  shield-pierce, Auto-Shield auto-equip, Reactive Armor blast via the standard chain-kill pipeline.
  Spec: `2026-05-31-phase4-shields-may26-adoption-design.md`; plan: `2026-05-31-phase4-shields-may26.md`.
  Battery was **already +250** in code (no change needed). Implemented via subagent-driven TDD; a final
  whole-feature review caught + fixed an incomplete migration (old shields lingered in `ITEM_REGISTRY`/AI
  shop), a deflect-oscillation bug, and reactive-blast scoring. All suites green.
  - ⧗ (follow-up) Add an explicit supersession header to `2026-05-27-phase4-design.md` §3.1–3.3.
  - ⧗ (follow-up, pre-existing) AI auto-shop now offers the new shields, but verify AI shield-equip rate
    feels right in playtest.

## C2 — Phase-5 "absorb" semantics → **code is correct (cave); fix the spec text**

- **Decision.** The shipped behavior (absorb = carveable cave ceiling, from the world-depth spec) is
  authoritative. The Phase-5 spec's original "edge-explode absorb" wording is stale.
- **Resulting actions.** ✅ Added a "Superseded" callout to `2026-05-27-phase-5-terrain-variety-walls-design.md`
  describing the cave semantics and cross-referencing the world-depth spec. (Doc-only; no code change.)

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
  - ✅ Clarified in `2026-05-22-roadmap.md` (status callout): numbering is P9=Audio, P10=Mobile/A11y,
    P11=Stability & Launch; the shipped `2026-05-28-phase-9-stability-launch-*` files are Phase 11
    content (mislabeled), and Audio + Mobile/A11y are recorded as still-planned (not cut).
  - ⧗ Slot Audio + Mobile/A11y into the upcoming roadmap with target phases (specs to follow).

## C5 — Phase-1 physics constants deviate from spec → **document the final tuned values**

- **Decision.** The shipped (tuned) gravity/velocity/wind constants are authoritative; the Phase-1
  spec numbers were initial estimates.
- **Resulting actions.** ✅ Recorded the as-built constants in the Phase-1 spec (gravity 250 px/s²,
  velocity = power px/s, wind ×`WIND_ACCEL_SCALE`=5.0, dt=1/60, `PLAY_CEILING_Y`/`PLAY_FLOOR_MARGIN`;
  screen-space units). (Doc-only.)

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

- **Decision.** ✅ Investigated. The **explosion** crater IS centered on impact — `applyStepEvent`'s
  `terrain-impact` handler carves at `op.x = Math.round(impactX)` / `op.y = Math.round(impactY)` (no
  offset). The audit's "crater not centered" refers to the **`crater` terrain-type generator** (one of
  the 9 terrain shapes), whose basin is offset by design — a cosmetic generation choice, not a bug.
  No action needed; accept as intended. (Re-open only if a specific shot visibly carves off-center.)

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
