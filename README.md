# Scorched Earth Web

A multiplayer browser reimplementation of the 1991 DOS classic. Phase 1 ships the multiplayer skeleton: 10-player rooms, one weapon (Baby Missile), wind + gravity ballistics, destructible terrain, and Cartoon-Illustrative graphics.

See [`SPEC.md`](SPEC.md) for the long-form vision, [`docs/superpowers/specs/2026-05-22-roadmap.md`](docs/superpowers/specs/2026-05-22-roadmap.md) for the phased build plan, and [`docs/superpowers/specs/2026-05-22-phase-1-multiplayer-skeleton-design.md`](docs/superpowers/specs/2026-05-22-phase-1-multiplayer-skeleton-design.md) for the current phase.

## Quick start

```bash
# Once
pnpm install
pnpm exec playwright install chromium

# Run server (terminal 1)
pnpm --filter @se/server dev

# Run client (terminal 2)
pnpm --filter @se/client dev
# → open http://127.0.0.1:5173 in two browser tabs
# → tab 1: enter nickname, click "Create match", copy the 6-char code
# → tab 2: enter nickname, paste the code, click "Join"
# → tab 1 (host): click "Start match"
# → both players take turns; adjust angle/power with the sliders or arrow keys, Space or "FIRE" to fire
```

## Tests

```bash
pnpm -r test          # vitest: unit + integration (@se/game, @se/server)
pnpm test:e2e         # Playwright: full-match + reconnect smoke
pnpm -r typecheck     # tsc across all packages
```

## Workspace layout

```
packages/game        # pure TS — physics, terrain, damage, PRNG, weapons
packages/shared      # Colyseus schemas + intents + constants
packages/tsconfig    # shared tsconfig presets
apps/server          # Colyseus server (LobbyRoom + MatchRoom)
apps/client          # Vite + PixiJS v8 client
tests/e2e            # Playwright end-to-end
```

## Phase 1 status

- 30+ commits, 51 unit/integration tests + 2 E2E passing
- See `docs/superpowers/plans/2026-05-22-phase-1-multiplayer-skeleton.md` for the implementation plan and `docs/superpowers/specs/` for the design docs

## License

TBD (private)
