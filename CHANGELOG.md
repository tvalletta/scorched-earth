## Phase 2 — 2026-05-25

- Added 5 new weapons: Missile, Baby Nuke, Nuke, Funky Bomb (8-way split), MIRV (5-way fan)
- Compound trajectory simulation: split weapons fan out children at apex
- Death explosion (radius 40, damage 30) with recursive chain-kill resolution
- Per-player inventory seeded from host-selected loadout (Starter / Standard / Bonanza)
- Scrollable weapon toolbar with smooth vector icons and 1–6 hotkeys
- Floating HP bars above tanks (green→yellow→red) + HP in PlayerList sidebar
- Host loadout picker in lobby; all players see current loadout selection

## Phase 1 — 2026-05-22

- Colyseus server with room codes and lobby (2–10 players)
- Baby Missile weapon with wind + gravity physics
- Terrain carving, single-round play, win detection
- 53 tests passing (unit + integration + E2E)
