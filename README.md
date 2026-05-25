# Scorched Earth Web

A multiplayer browser reimplementation of Wendell Hicken's 1991 DOS classic. Up to 10 players share a room code, take turns aiming and firing, and watch the terrain get blown apart in real time. Built with TypeScript, PixiJS v8, and Colyseus for authoritative multiplayer.

**Current status — Phase 1:** 10-player rooms, Baby Missile weapon, wind + gravity ballistics, destructible terrain, Cartoon-Illustrative graphics.

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | 22+ |
| pnpm | 9+ |

Install pnpm if you don't have it: `npm install -g pnpm`

---

## Setup

```bash
# 1. Install dependencies (run once)
pnpm install

# 2. Install Playwright browser (needed for E2E tests only)
pnpm exec playwright install chromium
```

---

## Running the game

Open two terminals from the project root:

```bash
# Terminal 1 — game server (Colyseus on port 2567)
pnpm --filter @se/server dev

# Terminal 2 — web client (Vite on port 5173)
pnpm --filter @se/client dev
```

Or run both together in one terminal:

```bash
pnpm dev
```

Then open **http://127.0.0.1:5173** in two browser tabs (or share the URL with another player on the same machine or network).

### How to start a match

1. **Tab 1 (host):** Enter a nickname → click **Create match** → note the 6-character room code shown on screen
2. **Tab 2 (guest):** Enter a nickname → paste the code → click **Join**
3. **Tab 1 (host):** Click **Start match**

### How to play

- Use the **Angle** slider or **← →** arrow keys to aim (hold **Shift** for ×5 steps)
- Use the **Power** slider or **↑ ↓** arrow keys to adjust power (hold **Shift** for ×10 steps)
- Press **Space** or click **FIRE** to shoot
- A 30-second turn timer advances play automatically if you don't fire
- Last tank standing wins; terrain is permanently destroyed by every explosion

---

## Tests

```bash
pnpm -r test          # Vitest unit + integration tests (packages/game, apps/server)
pnpm test:e2e         # Playwright end-to-end smoke tests
pnpm -r typecheck     # TypeScript check across all packages
```

---

## Project layout

```
packages/
  game/       Pure TS — physics simulation, terrain generation/carving, PRNG, weapons
  shared/     Colyseus schemas, intent types, shared constants
  tsconfig/   Shared TypeScript config presets
apps/
  server/     Colyseus server — LobbyRoom (room codes) + MatchRoom (authoritative game state)
  client/     Vite + PixiJS v8 client — scenes, renderers, HUD, input
tests/
  e2e/        Playwright end-to-end tests
docs/
  superpowers/specs/    Design documents and phase roadmap
  superpowers/plans/    Implementation plans
```

---

## Further reading

- [`SPEC.md`](SPEC.md) — full game vision and north-star feature list
- [`docs/superpowers/specs/2026-05-22-roadmap.md`](docs/superpowers/specs/2026-05-22-roadmap.md) — 11-phase build plan
- [`docs/superpowers/specs/2026-05-22-phase-1-multiplayer-skeleton-design.md`](docs/superpowers/specs/2026-05-22-phase-1-multiplayer-skeleton-design.md) — Phase 1 design doc

---

## License

TBD (private)
