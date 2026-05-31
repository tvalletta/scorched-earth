# Spec-vs-Implementation Audit — Scorched Earth Web

**Date:** 2026-05-30
**Auditor:** Claude (parallel read-only audit, one agent per spec, verified against code on branch `feat/debug-hud-camera-fixes` @ `59abdce`)
**Scope:** All 13 design specs in `docs/superpowers/specs/` + the roadmap + `SPEC.md`, cross-checked against `apps/`, `packages/`, infra, and tests.

> **Branch note.** The former `scorched-earth-impl` worktree has been folded back into the main checkout, which now sits on `feat/debug-hud-camera-fixes`. That branch = merged `main` (`0ac1b02`) + the debug-and-hud spec/plan/fix commits + **uncommitted working-tree art changes** (`Explosion.ts`, `Projectile.ts`, `MatchScene.ts`, `tickLoop.ts`). All Phase 1–9 / lobby / world-depth features were merged to `main` long ago, so their audits are unaffected by the branch.

**Legend:** ✅ built as specced · 🟡 partial / differs in degree · 🔴 missing / not built · 🔀 deviates (built differently) · ❓ spec gap (undefined) · ⚔️ conflicts with another spec

---

## Executive summary

The game's **shipped core is in very good shape**: Phases 1–7, the lobby, and the world-depth/cave/HUD overhaul are implemented, tested, and largely faithful to their specs. The problems are concentrated in three places:

1. **The newest spec (Debug & HUD Fixes, 2026-05-30) is ~10% built.** 3 of ~30 tasks landed (skull cleanup, weapon-carousel re-render fix, scroll-wheel select). **The entire telemetry/debug subsystem, the TurnHud redesign, and all the camera fixes are not started.** This is the single biggest "specced but not built" gap and maps directly to both of your current work streams.

2. **Spec governance is broken in three spots:** Phase 4 has **two conflicting specs with no supersession note**; Phase 6 (Specialty Weapons) **has no spec at all** (the weapons were built anyway); and the roadmap's **Phase 9 (Audio) and Phase 10 (Mobile/A11y) were silently skipped** when "Stability & Launch" was pulled forward and mislabeled "Phase 9."

3. **Phase 8 (Visual Polish) has real holes:** 7 per-weapon particle systems and the dusk/night terrain darkening (`ambientMult`) were never implemented. The **uncommitted art work on the current branch is partially filling this** (new explosion styles + projectile trails) — i.e., your "UI rendering" stream is retroactively completing Phase 8.

| Spec | Verdict | Biggest issue |
|---|---|---|
| Phase 1 — Multiplayer Skeleton | ✅ solid | physics constants deviate from spec (likely intentional tuning) |
| Phase 2 — Damage & Weapons | ✅ solid | 8 damage rebalances (documented in commits); missing server unit tests |
| Phase 3 — Economy & Shop | ✅ solid | shop timer 45s vs 30s (intentional) |
| Phase 4 — Defenses & Movement | 🟡 partial | **TWO conflicting specs**; 2 shields + Auto-Shield not built; netcode migration ✅ done |
| Phase 5 — Terrain & Walls | ✅ solid | crater not centered; absorb semantics later repurposed |
| Phase 6 — Specialty Weapons | ⚠️ no spec | **no design doc exists**; weapons built ungoverned |
| Phase 7 — AI Opponents | ✅ solid | Bouncer wall/terrain heuristics are passive, not active |
| Phase 8 — Visual Polish | 🟡 partial | **7 weapon particle systems + terrain `ambientMult` missing** |
| Phase 9/11 — Stability & Launch | 🟡 partial | **renumbered; Audio + Mobile/A11y skipped**; spectator client UX + replay playback incomplete |
| Lobby Waiting Room | ✅ solid | one cosmetic timing deviation |
| World Depth / Cave / HUD | ✅ solid | Playwright visual sweep unconfirmed |
| Debug & HUD Fixes (active) | 🔴 ~10% built | **telemetry system, TurnHud, all camera fixes not started** |

---

## 1. Cross-cutting / structural findings

These are the issues that span specs and should be decided at the project level.

### 1.1 ⚔️ Phase 4 has two conflicting, both-"Approved" specs
- `2026-05-26-phase-4-defenses-movement-design.md` — **5 shields** (Force Field, Deflector, Magnetic, Reactive Armor, Auto Shield), `hpCostFraction` physics, Battery **+250 HP**.
- `2026-05-27-phase4-design.md` — **4 shields** (Shield, Heavy, Super Magnetic, Force), full-damage absorb physics, Battery **+100 HP**, 24 weapons, PendingEffect queue.
- **Neither marks the other as superseded.** Implementation follows the May-27 spec (4 shields confirmed in `packages/shared/src/shields.ts`), so **Deflector Shield, Reactive Armor, and Auto Shield were never built**. Battery in code restores by inventory logic using the May-26 value, not May-27's — i.e. the two specs were cherry-picked inconsistently.
- **Action needed:** mark one Phase-4 spec authoritative; explicitly cut or schedule the 2 missing shields + auto-equip.

### 1.2 ⚠️ Phase 6 (Specialty Weapons) has no spec or plan
- Roadmap allots Phase 6 to ~25 specialty weapons. **No `*-phase-6-*` design or plan file exists.**
- The weapons were built anyway (28 in `packages/game/src/weapons/` + `group1-4` files): roller, heavy-roller, leapfrog, napalm, hot-napalm, fireball, dirt-clod/ball, liquid-dirt, sandhog, tunneler, plasma-ball/blast/wave, laser, tracer, smoke, deaths-head, deaths-knell, triple-warhead, pineapple, funky-nuke, etc.
- **This is a governance gap, not a code gap** — there is no document defining weapon categories, damage curves, or acceptance criteria, which is a risk for replay versioning (Phase 11) and future balance work.
- **Action needed:** write a retroactive Phase-6 spec documenting the weapon catalog as-built, or fold it formally into Phase 2/4 docs.

### 1.3 🔴 Roadmap phases 9 (Audio) & 10 (Mobile/A11y) skipped without record
- Roadmap: P9 = Audio, P10 = Mobile & Accessibility, P11 = Stability & Launch.
- The spec titled `phase-9-stability-launch` pulled **P11 content forward** and relabeled it Phase 9. **Audio and Mobile/A11y are entirely unbuilt** (confirmed: no audio engine beyond a dead `AudioContext` stub in `ShopScene.ts`; no touch controls, colorblind palettes, or reduced-motion handling).
- No DECISION note or CHANGELOG entry explains the scope cut.
- **Action needed:** update the roadmap to reflect the actual phase numbering and record whether Audio + Mobile/A11y are cut, deferred, or still planned.

### 1.4 ❓ Physics constants deviate from Phase-1 spec
- `gravity = 250` (spec: 9.8), `VELOCITY_SCALE = 1.0` (spec: 0.5), baby-missile damage 40 (spec: 25). The spec never defined units or a measurable tuning target ("~half terrain width"), so these are almost certainly deliberate empirical tuning — but they are undocumented deviations. Low priority; note for the record.

---

## 2. Per-spec audit detail

### Phase 1 — Multiplayer Skeleton — ✅ solid (architecturally sound)
| Item | Status | Evidence | Note |
|---|---|---|---|
| GRAVITY | 🔀 | `MatchState.ts:22` =250 vs spec 9.8 | undocumented tuning; spec gave no units |
| VELOCITY_SCALE | 🔀 | `simulate.ts:7` =1.0 vs spec 0.5 | tuning |
| Baby Missile dmg | 🔀 | `baby-missile.ts:6` =40 vs spec 25 | later rebalanced |
| Later-phase schema fields present early | 🟡 | `MatchState.ts`, `Tank.ts` | economy/shield/fuel/AI/observer fields exist in P1 schema — scope creep, not a bug |
Core (Colyseus rooms, room codes, terrain gen, wind/gravity physics, carve ops, win detection, controls, renderers, 53 tests) all ✅.

### Phase 2 — Damage & Weapon Variety — ✅ solid
| Item | Status | Evidence | Note |
|---|---|---|---|
| 8 weapon damage values | 🔀 | `missile.ts:3`, `baby-nuke.ts:3`, `funky-bomb.ts:6`, `mirv.ts:6,25`, `death-explosion.ts:3` | intentional rebalances (commits `032eaa1`, `7c82139`) |
| Server resolveTurn unit tests | 🟡 | no `resolveTurn.test.ts` | chain-kill/inventory only covered at e2e level |
All 5 core weapons, falloff curve, splash, death explosions, chain-kill depth cap (10), HP bars, loadout presets ✅.

### Phase 3 — Economy & Shop — ✅ solid
| Item | Status | Evidence | Note |
|---|---|---|---|
| Shop countdown | 🔀 | `constants.ts:29` =45s vs spec 30s | intentional (commit `de4df56`) |
Cash formula (100×dmg + 1000×kills + 500 survival), shop UI, inventory stacking, 1–20 rounds, round-summary, match-end scoreboard, tiebreaker (rounds→cash), fresh terrain per round — all ✅ with full unit + e2e tests.

### Phase 4 — Defenses & Movement — 🟡 partial (see §1.1)
| Item | Status | Evidence | Note |
|---|---|---|---|
| Netcode trajectory-batch → tick-stream | ✅ | `MatchRoom.ts:332` 60Hz loop; `tickLoop.ts` broadcasts live positions | **migration fully done** |
| Shield catalog | ⚔️🔴 | `shields.ts:12-34` 4 shields | Deflector Shield + Reactive Armor (May-26 spec) **not built** |
| Auto Shield auto-equip | 🔴 | none found | not implemented |
| Battery HP restore | ⚔️ | `MatchRoom.ts:211-221` | May-26=+250 vs May-27=+100; code inconsistent with May-27 |
| Absorb shield physics + Force Shield 25% reflect | ✅ | `step.ts:130-150` | matches May-27 |
| Patriot homing/intercept, Parachute + fall damage, fuel/driving + slope check | ✅ | `step.ts`, `tickLoop.ts`, `MatchRoom.ts:164-191` | |
| 22 new weapons (groups 1–4) | ✅ | `weapons/group[1-4]-*.ts` | with tests |
| Laser instant-beam logic | ❓ | referenced in `resolveTurn.ts`, absent in `step.ts` | resolution path unclear |
| PendingEffect burn/smoke zones | 🟡 | `tickLoop.ts:218-234`, `MatchRoom.ts:293` | wired but untested |

### Phase 5 — Terrain Variety & Walls — ✅ solid
| Item | Status | Evidence | Note |
|---|---|---|---|
| Crater center | 🔀 | `generate.ts:166` random 30–70% vs spec `width/2` | possibly unintentional |
| RoundInfo HUD pill | 🔀 | created `5f3e1e7`, deleted `bf5d6f6` | intentionally removed in HUD consolidation |
| absorb mode semantics | ⚔️ | repurposed to "cave" by world-depth spec | intentional cross-spec change |
All 9 terrain generators, all 4 wall modes (in both `step` and `simulate`), host pool pickers, seeded `prng.pick`, trajectory-preview wall awareness — ✅ with tests.

### Phase 6 — Specialty Weapons — ⚠️ no spec (see §1.2)
All roadmap-listed specialty weapons appear present in code; no governing document exists.

### Phase 7 — AI Opponents — ✅ solid
| Item | Status | Evidence | Note |
|---|---|---|---|
| Bouncer wall-exploit preference | 🟡🔀 | `profiles.ts:101` | roller/leapfrog in preference list but `scanBestShot` doesn't bias by wall mode — passive, not active |
| Bouncer flat-terrain logic | 🟡 | `think.ts` | "when terrain is flat" condition absent |
| All-AI spectating / host-disconnect | 🔴 | — | deferred to Phase 11 |
5 difficulties (Moron/Shooter/Pyro/Cyborg/Bouncer) with correct scan grids + noise, lobby add/remove/set-difficulty, seeded AI names, think/scan/shop, shield equip, all weapons/terrain/walls, no `Math.random()`, full tests — ✅.

### Phase 8 — Visual Polish — 🟡 partial
| Item | Status | Evidence | Note |
|---|---|---|---|
| 7 per-weapon particle systems | 🔴 | `Explosion.ts:7-13` STYLE_BY_WEAPON | Laser, Cluster, MIRV, Roller, Leapfrog, Burrow, Parachute all fall through to 'standard' |
| Terrain `ambientMult` dusk/night darkening | 🔴 | not in `Sky.ts`/`Terrain.ts` | defined in spec §4.2, never implemented |
| Sky layer-2 ordering | 🟡 | `Sky.ts:83` | distant hills (0.08) where spec says near clouds (0.15) |
| Night star count | 🟡 | `Sky.ts:68` =90 vs spec 20–30 | cosmetic |
Hats (8), parallax sky (6 layers), 4 time-of-day variants, tank death animation, screen-shake formula, camera auto-framing, layered terrain art — ✅.
> **Note:** the **uncommitted** `Explosion.ts` (+181 lines, 6 styles) and `Projectile.ts` (trails) on the current branch are partially closing the particle-system gap.

### Phase 9/11 — Stability & Launch — 🟡 partial (see §1.3)
| Item | Status | Evidence | Note |
|---|---|---|---|
| Audio (roadmap P9) | 🔴 | dead `AudioContext` stub in `ShopScene.ts` | not built |
| Mobile & A11y (roadmap P10) | 🔴 | none | not built |
| Reconnect + ghost-AI takeover | 🟡 | `MatchRoom.ts:530-553` | implemented; **ghost promotion not tested** (e2e only checks `connected=false`) |
| Spectator — client UX | 🟡🔴 | `MatchScene.ts`, `HudBar.ts:74` | server-side ✅; **no isSpectator detection, no "👁 Spectating" badge, no camera tracking** — only fire button disabled |
| Replay playback | 🟡 | `ReplayScene.ts` | renders static snapshots, **not animated re-sim**; speed controls (1×/2×) missing |
| Observer intent guard | 🟡 | `MatchRoom.ts:144` | only `fire` guarded explicitly vs spec's "guard all intents" |
Reconnect grace, replay recorder + REST endpoint + download, load-test package (100 rooms), Dockerfile, `fly.toml`, Sentry, `/health` — ✅.

### Lobby Waiting Room + Background Battle — ✅ solid
| Item | Status | Evidence | Note |
|---|---|---|---|
| Cosmetic battle turn interval | 🔀 | `LobbyBattle.ts:12-13` 1.4–2.4s vs spec 1.6–2.6s | cosmetic |
Waiting room, invite/copy, identity editor, roster + AI rows, host gating, spectator strip, pure battle sim + renderer, room-not-found handling, phase handoff — ✅, fully tested, merged to `main`.

### World Depth / Cave / HUD Polish — ✅ solid
| Item | Status | Evidence | Note |
|---|---|---|---|
| Playwright visual sweep | ⚠️ | plan task 11 | no `.spec.ts` found; verification unconfirmed/deferred |
| AI cave avoidance | 🔀 | `think.ts` | documented known limitation, out of scope |
| `generateCaveFloor` | 🔀 | reuses `generateTerrain` | spec explicitly allowed this deferral |
Dual-heightmap (floor + ceiling), cave gen/carve/collision, trajectory-preview ceiling awareness, server cave wiring + replay fields, consolidated single bottom HUD, MIRV flat fan, seam-free resizable sky, organic underside — ✅ with unit tests.

---

## 3. The active branch — Debug & HUD Fixes (`feat/debug-hud-camera-fixes` @ `59abdce`) — 🔴 ~10% built

This is the freshest spec and the least complete. **Confirmed by direct filesystem check** that the named modules do not exist.

**Done (3 of ~30):**
- ✅ §1 Dead-skull cleanup on revive — `Tank.ts:87-88,145,149`
- ✅ §4 Weapon-carousel dirty-check (no per-frame rebuild) — `HudBar.ts:36,79-80`
- ✅ §4 Scroll-wheel weapon cycling — `HudBar.ts:218-225`

**Not started (confirmed absent):**
| Area | Spec § | Evidence of absence |
|---|---|---|
| **TurnHud redesign** (ring timer + roster, replaces PlayerStrip) | §2 | no `apps/client/src/hud/TurnHud.ts` |
| **Camera fixes** (cursor-anchored zoom, world-band bounds, minScale, pointer-capture stuck-drag fix, un-latch auto-follow, NaN guard, camera tests) | §3 | `Camera.ts` unchanged in commits |
| **Weapon off-turn gating** (client `setCarouselEnabled(isMyTurn)` call + server turn check in select-weapon) | §4.2 | method exists, never called; `MatchRoom` handler unchanged |
| **Logger module** (`RingBuffer`, `createLogger`) | §5.1 | no `packages/shared/src/log.ts` |
| **Invariants module** (`checkMatchInvariants`, `checkCameraFinite`) | §5.2 | no `packages/shared/src/invariants.ts` |
| **Client debug capture bundle + invariant watch** | §5.2/5.5 | no `apps/client/src/debug/` |
| **Server /debug endpoint + retention (200 bundles / 7 days)** | §5.3 | no `apps/server/src/debug/` |
| **Build-ID injection** (`__BUILD_ID__` in client, `/health` on server) | §5.7 | `vite.config.ts` / `index.ts` unchanged |
| **Regression tests** (invariant-match, replay-determinism, Playwright HUD smoke, skull test) | §5.6 | files absent |
| **Art-critique script** | §5.9 | no `scripts/art-critique.mjs` |
| **Terrain art polish** (organic stalactites/island, no straight edges) | §6 | `Terrain.ts` unchanged |

**Uncommitted, out-of-scope for this spec** (the "UI rendering" work stream): `Explosion.ts` (+181, 6 styles), `Projectile.ts` (trails + per-weapon color), `MatchScene.ts` (explosion event handler), `tickLoop.ts` (broadcast explosion weaponId). These are unrelated to the debug-and-hud spec and should be committed separately.

**Mapping to your two work streams:**
- **"Fix UI rendering"** → partly the uncommitted explosion/projectile art (Phase 8 gap-fill), plus the unbuilt §2 TurnHud, §3 camera, and §6 terrain art.
- **"Improve telemetry + fix bugs"** → the **entire §5 debug/telemetry subsystem is unbuilt**, and the §3 camera/respawn bug fixes are not started (only the §1 skull and §4 weapon fixes landed).

---

## 4. Conflicts & ambiguities catalog (for decisions)

| # | Type | Where | Needs a decision? |
|---|---|---|---|
| C1 | ⚔️ Conflict | Two Phase-4 specs (shields 5-vs-4, Battery 250-vs-100) | **Yes** — pick authoritative spec |
| C2 | ⚔️ Conflict | Phase-5 absorb (edge-explode) vs world-depth absorb (cave) | Resolved in code (cave); update Phase-5 spec text |
| C3 | ⚠️ Gap | Phase 6 has no spec | **Yes** — write retro spec or fold in |
| C4 | 🔴 Scope | Roadmap P9 Audio + P10 Mobile/A11y skipped, mislabeled | **Yes** — update roadmap, record cut/defer |
| C5 | ❓ Ambiguity | Phase-1 gravity/velocity units + tuning target undefined | Document final values |
| C6 | ❓ Ambiguity | Phase-9 spectator HUD: badge+camera vs fire-disable-only | **Yes** — define intended spectator UX |
| C7 | ❓ Ambiguity | Phase-9 replay: deterministic re-sim vs snapshot playback | **Yes** — define replay fidelity |
| C8 | 🔀 Possible bug | Phase-5 crater not centered | Confirm intended |

---

## 5. Recommended next actions (priority order)

1. **Commit the stray UI art work** (explosion/projectile) on its own branch so it isn't lost or conflated with the debug spec.
2. **Decide the Phase-4 shield conflict (C1)** and either build or formally cut Deflector Shield, Reactive Armor, Auto-Shield.
3. **Build the §5 telemetry/debug subsystem** — it's the core of your telemetry work stream and is 0% done.
4. **Build §2 TurnHud + §3 camera fixes** — the HUD/camera bugs you set out to fix are still open.
5. **Close the Phase-8 gaps** that the art work touches: the 7 weapon particle systems + `ambientMult` terrain darkening.
6. **Resolve documentation debt:** write the Phase-6 spec (C3), fix roadmap numbering + Audio/Mobile decision (C4), and patch the Phase-5 absorb text (C2).
7. **Fill test gaps:** ghost-AI promotion e2e, server resolveTurn unit tests, PendingEffect burn/smoke, the world-depth Playwright sweep.
8. **Define the open ambiguities** (C6 spectator UX, C7 replay fidelity) before finishing Phase 9/11.

---
*End of audit.*
