# Scorched Earth: Web Multiplayer — Build Spec

A faithful reimplementation of Wendell Hicken's 1991 DOS classic *Scorched Earth* ("The Mother of All Games") as a real-time multiplayer web game. Original turn-based artillery mechanics, modern graphics, modern netcode.

---

## 1. Vision & Pillars

**Vision.** Drop into a browser, get a lobby code, and within 30 seconds you're aiming a tank at your friends across a procedurally generated mountain range while a Funky Bomb cluster-rains down on your shield.

**Design pillars (in priority order):**

1. **Mechanically faithful.** Angle/power aiming, wind, gravity, destructible terrain, 30+ weapons, shields, parachutes, the economy, the falling-tank damage rule — all preserved. Veterans should immediately recognize the math.
2. **Modern presentation.** Particle explosions, soft lighting, parallax skies, smooth 60fps animation, satisfying weapon weight. The *feel* is 2026; the *rules* are 1991.
3. **Effortless multiplayer.** No installs, no accounts required. Share a 6-character room code, play. Drop-in spectators. Reconnect on disconnect.
4. **Fair and deterministic.** Authoritative server simulation. No client can cheat trajectories or damage.
5. **Cross-device.** Desktop primary, but touch controls work on tablet/phone.

**Out of scope (v1):** ranked ladders, accounts/profiles, persistent cosmetics, a single-player campaign. AI opponents are in scope as fillers for short lobbies.

---

## 2. Original Mechanics Reference

The original 1991 game (DOS, VGA, EGA) is the source of truth. The behaviors below MUST be preserved unless explicitly called out as modernized.

### 2.1 Turn structure

- Up to **10 players** per match (originally 2–10).
- **Simultaneous-resolution turns**: each player locks in angle/power/weapon during a shared turn window; all shots fire in randomized order (or simultaneously — see 4.7). The original was strictly sequential by player order; we offer both modes.
- **Aiming controls:**
  - **Angle:** 0°–180°. 0° = pointing left, 90° = straight up, 180° = pointing right. Increments of 1°.
  - **Power:** 0–1000. Larger power = more initial projectile velocity.
- **Wind:** Randomized at round start; redrawn each turn in the original. Range −10 to +10 (we keep this scale). Wind affects horizontal acceleration of most (not all) projectiles.
- **Gravity:** Constant downward acceleration. Configurable per match (Low, Normal, High).

### 2.2 Projectile physics

Standard ballistic motion with wind drag:

```
x(t+dt) = x(t) + vx * dt
y(t+dt) = y(t) + vy * dt
vx(t+dt) = vx(t) + wind_accel * dt          // unless projectile is wind-immune
vy(t+dt) = vy(t) + gravity * dt
```

- `vx_initial = power * cos(angle_rad) * VELOCITY_SCALE`
- `vy_initial = -power * sin(angle_rad) * VELOCITY_SCALE` (screen-space, y down)
- `VELOCITY_SCALE` tuned so a power-500 / 45° shot on Normal gravity / 0 wind travels ~half the screen width on a 1600×900 terrain.

### 2.3 Damage model

- Each weapon defines a **damage radius** and **max damage** at center, falling off linearly to 0 at the edge.
- Direct hits: full damage to the unit.
- Splash hits: linear falloff from center.
- Shields **absorb** damage (see 6.2). Damage that exceeds remaining shield HP rolls over to the tank.
- Tanks have **100 HP** (preserved from original). Below 0 HP, the tank explodes (its own death explosion can damage neighbors — chain kills are a feature).

### 2.4 Terrain

- 2D heightmap (one height value per pixel column). Originally 640 columns; we use 1600 to match modern screens but expose a `TERRAIN_WIDTH` constant.
- **Destructible:** explosions carve craters. Above-crater terrain **falls** to fill the crater (gravity simulation per column).
- **Tank falling damage:** if terrain beneath a tank is destroyed and the tank falls > N pixels without a Parachute equipped, the tank takes `(fall_distance - safe_threshold) * fall_damage_factor` damage. With a Parachute: no damage, parachute is consumed.
- **Terrain types** (selectable at match start, originally 9): Mountains, Hills, Valleys, Random, Flat (with rolling), Cliffs, Crater, Sky High (very tall peaks), Plateau. Generation is parameterized — see §7.

### 2.5 Walls

- **None** (projectiles vanish off-screen).
- **Wraparound** (projectiles re-enter on opposite side).
- **Reflecting** (projectiles bounce, lose 10% velocity per bounce).
- **Absorbing** (projectiles vanish at wall, no damage).

(All four preserved from original.)

### 2.6 Economy

- Players earn cash per round based on damage dealt and kills (formula: `100 * damage_dealt + 1000 * kills + survival_bonus`).
- Between rounds: **shop screen** with weapons/items priced as in the original (preserved exactly — see §5, §6).
- Cash carries between rounds in a match. Unused weapons/shields carry over.
- Match length: configurable 1–20 rounds. Winner = most total damage dealt, or last-alive cumulative kills (configurable).

### 2.7 Order of fire

In a sequential round, order is randomized at round start (original behavior), then proceeds player-by-player. In simultaneous mode (modern addition), all shots resolve together with deterministic collision ordering by spawn time.

---

## 3. Game Modes

| Mode | Players | Description |
|---|---|---|
| **Classic** | 2–10 | Sequential turns, full economy, full weapons. Faithful original. |
| **Blitz** | 2–10 | Simultaneous turns, 20s aim timer, full weapons. Fast. |
| **Sudden Death** | 2–10 | No economy, fixed weapon loadout, 1 round, last-alive wins. |
| **Free-for-all bots** | 1+ | Fill empty slots with AI difficulty Easy/Medium/Hard/Cyborg/Moron (original AI names preserved). |
| **Spectator** | unlimited | Watch any room with a code. |

---

## 4. Core Mechanics — Detailed

### 4.1 Aim controls

- **Mouse/touch:** drag a crosshair from the tank turret. Angle = vector angle, power = vector length (clamped 0–1000).
- **Keyboard:** Arrow keys (← → adjust angle 1°, Shift = 5°), ↑ ↓ adjust power 1 (Shift = 10).
- **Number pad shortcuts:** preserve original (0–9 quick-select weapon).
- **Aim preview line:** dotted ghost arc showing first ~30 frames of trajectory **only if** the player owns a Tracer (item) or has Auto Defense at sufficient level — otherwise no preview. (Original behavior; this is a balance feature, not a quality-of-life cut.)

### 4.2 Tracers

- Owning **Tracer** ammo: fires a no-damage shell to show full trajectory. Consumed on use.
- Owning **Computer** / **Auto Defense Level N**: auto-aims a percentage of the time. Same accuracy curve as original.

### 4.3 Wind display

- Top-of-screen arrow showing direction and magnitude (numeric −10 to +10), refreshed at start of each turn.
- Wind variance setting: Calm / Normal / Tornado.

### 4.4 Falling-tank damage

```
fall_damage = max(0, fall_pixels - SAFE_FALL) * FALL_DAMAGE_FACTOR
```

Defaults: `SAFE_FALL = 30`, `FALL_DAMAGE_FACTOR = 0.5`. Parachute consumes one charge and negates damage.

### 4.5 Chain explosions

When a tank dies, it produces a "Death Explosion" with radius 40 and damage 30. This can chain-kill neighbors, which can chain-kill more neighbors. Original behavior; spectacular and preserved.

### 4.6 Round end

A round ends when ≤ 1 tank remains. After a 5-second victory pose / camera pan, the shop screen opens (Classic mode) or the next round starts (Sudden Death).

### 4.7 Match end

A match ends when the configured round count is reached. Final scoreboard shows kills, damage dealt, damage taken, accuracy, and cash earned.

### 4.8 AI opponents

Five difficulty levels, names preserved:

| Name | Behavior |
|---|---|
| **Moron** | Random angle/power, basic weapons only. |
| **Shooter** | Aims roughly at nearest enemy, ignores wind. |
| **Pyro** | Decent aim, prefers napalm-type weapons. |
| **Cyborg** | Solves ballistic equation with ±5% error, accounts for wind. |
| **Bouncer** | Cyborg + uses walls (in Reflecting mode). |

---

## 5. Weapons Catalog

All 30 original weapons preserved with original names and prices. Damage/radius values are the canonical values from the 1991 game's data tables; we'll allow ±10% rebalance after playtesting.

| # | Weapon | Price ($) | Pack | Radius | Damage | Notes |
|---|---|---|---|---|---|---|
| 1 | Baby Missile | free | ∞ | 20 | 25 | Free starter ammo, infinite. |
| 2 | Missile | 2,000 | 5 | 30 | 50 | |
| 3 | Baby Nuke | 5,000 | 3 | 45 | 75 | |
| 4 | Nuke | 10,000 | 2 | 60 | 100 | |
| 5 | Funky Bomb | 8,000 | 3 | — | varies | Splits into 8 colored sub-bombs at apex. |
| 6 | MIRV | 12,000 | 2 | — | varies | Splits into 5 missiles in downward fan. |
| 7 | Death's Head | 75,000 | 1 | 80 | 150 | Massive blast, expensive. |
| 8 | Napalm | 6,000 | 3 | 50 | 60 | Burns terrain into a slow-drip flame for 2 turns. |
| 9 | Tracer | 1,000 | 5 | 0 | 0 | Shows full trajectory, no damage. |
| 10 | Leapfrog | 6,000 | 3 | 25 | 30 (×3) | Hits, then bounces with 70% velocity, hits, bounces. |
| 11 | Roller | 7,000 | 3 | 25 | 40 | Rolls along terrain until obstacle or off-screen. |
| 12 | Heavy Roller | 14,000 | 2 | 35 | 60 | |
| 13 | Dirt Clod | 1,500 | 5 | — | 0 | Adds terrain on impact, no damage. Stack for cover. |
| 14 | Dirt Ball | 3,000 | 3 | — | 0 | Bigger dirt deposit. |
| 15 | Liquid Dirt | 5,000 | 2 | — | 0 | Sprays a wide dirt arc. |
| 16 | Sandhog | 7,500 | 2 | — | 0 | Burrows down through terrain, creates tunnel. |
| 17 | Tunneler | 9,000 | 2 | — | 30 | Sandhog with damage on emerge. |
| 18 | Plasma Ball | 5,000 | 3 | 35 | 70 | Bright; ignores 50% of shield. |
| 19 | Plasma Blast | 10,000 | 2 | 50 | 110 | Same, larger. |
| 20 | Laser | 20,000 | 1 | line | 80 | Travels in a straight line at 90% lightspeed (instant), pierces. |
| 21 | Smoke | 800 | 5 | — | 0 | Visual obscurity; trolls. |
| 22 | Plasma Wave | 18,000 | 1 | 80 | 90 | Horizontal expanding plasma sheet. |
| 23 | Fireball | 4,000 | 3 | 30 | 45 | Sets terrain on fire (slow chip damage to anyone in zone). |
| 24 | Hot Napalm | 11,000 | 2 | 60 | 80 | Bigger napalm. |
| 25 | Death's Knell | 50,000 | 1 | 70 | 130 | Cheaper Death's Head. |
| 26 | Pineapple | 25,000 | 1 | — | varies | MIRV's sibling; 9 cluster bombs. |
| 27 | Funky Nuke | 30,000 | 1 | — | varies | 8 Baby Nukes from a Funky split. |
| 28 | Patriot | 15,000 | 2 | 25 | 0 | **Defensive**: shoots down incoming high-arc projectiles within 200px. |
| 29 | Triple Warhead | 20,000 | 1 | 40 | 70 (×3) | Splits into 3 missiles before impact. |
| 30 | Wimpy Pack | 5,000 | 1 | ∞ Baby M | — | Bundle of 30 Baby Missiles. |

**Order of fire when multiple shots are present** (Leapfrog, MIRV, Funky, etc.): submunitions inherit parent velocity at split point.

---

## 6. Items & Defenses Catalog

### 6.1 Defenses (consumed on use)

| Item | Price | Pack | HP | Notes |
|---|---|---|---|---|
| Parachute | 200 | 1 | — | Consumed when tank falls > SAFE_FALL. Negates fall damage. |
| Shield | 5,000 | 1 | 50 | Absorbs damage. |
| Heavy Shield | 12,000 | 1 | 150 | |
| Super Magnetic Shield | 25,000 | 1 | 250 | Slightly deflects projectiles within 10px. |
| Force Shield | 50,000 | 1 | 500 | Reflects 25% of damage back at attacker. |

Only one shield active at a time. Manually toggle on/off (uses no fuel; turning on costs the shield slot).

### 6.2 Shield damage rule

```
damage_to_shield = min(incoming, shield_hp)
shield_hp -= damage_to_shield
overflow = incoming - damage_to_shield
tank_hp -= overflow
if shield_hp == 0: shield removed
```

### 6.3 Utilities

| Item | Price | Effect |
|---|---|---|
| Battery | 2,000 | Recharges shield by 100 HP. |
| Tracer (auto-buy) | 1,000 | See §5. |
| Auto Defense | 5,000–50,000 | Auto-aim aid per Level (1–5). |
| Computer | 100,000 | Best Auto Defense + perfect ballistic solver. (Top-tier — rare.) |

### 6.4 Movement (preserved from original — yes, tanks can drive)

- **Fuel**: 100 units per round, regenerates 100 between rounds.
- 1 fuel = 1 horizontal pixel of movement.
- Tanks drive left/right before firing; cannot move after firing in the same turn.
- Cannot drive over a slope steeper than ~45° (climbs slowly up to that).

---

## 7. Terrain Generation

Heightmap of `TERRAIN_WIDTH` columns. Each terrain type uses a different procedural generator:

| Type | Generator |
|---|---|
| **Random** | 1D Perlin noise, octaves=4, persistence=0.5. |
| **Mountains** | Perlin noise + sharp peak boosters (random Gaussian peaks added). |
| **Hills** | Smoothed sine waves with random phases. |
| **Valleys** | Inverted hills with deep central trough. |
| **Cliffs** | Random vertical step transitions every 100–300 cols. |
| **Crater** | Single deep cosine basin in the center. |
| **Sky High** | Mountains × 1.8 height, narrow tank platforms. |
| **Plateau** | Flat-tops at multiple elevations connected by cliffs. |
| **Flat** | Constant height ± low-amplitude noise. |

After generation: **smooth pass** (3-tap moving average × 2), **place tank platforms** (find N flat-ish spots for tank starts, equally spaced horizontally, jiggled vertically).

Color palette by terrain type — see §9.2.

---

## 8. Multiplayer Architecture

### 8.1 Authoritative server

- All physics, RNG, damage, terrain mutation runs on the server.
- Clients send **intents** (`AIM`, `FIRE`, `BUY`, `MOVE`, `TOGGLE_SHIELD`, `LEAVE`).
- Server broadcasts **state deltas** (`TERRAIN_CARVE`, `PROJECTILE_TICK`, `TANK_HP`, `WIND_CHANGE`, `TURN_START`, `ROUND_END`).
- **Why authoritative:** anti-cheat for trajectories, deterministic replay, easy spectator support.

### 8.2 Tick model

- Aim/turn phase: event-driven (no tick needed — players poke at controls).
- Resolution phase (projectile in flight): server runs at **60 simulation ticks/sec**; broadcasts **30 update msgs/sec** with position snapshots; client interpolates between.
- A typical projectile lives 1–4 seconds in-flight. Bandwidth per match for 10 simultaneous projectiles: ~6 KB/s per client.

### 8.3 Rooms / lobby

- Room codes: 6 uppercase alphanumeric (e.g. `K3X9P2`). Codes ephemeral; reused after 24h idle.
- Lobby state: host configures terrain type, wall mode, gravity, wind, round count, AI fillers.
- Game starts when host clicks Start AND all players are ready, OR all slots are AI.
- **Reconnect:** if a player drops mid-match, their tank becomes a "ghost" AI (Shooter difficulty) until they rejoin; rejoin window 90 seconds.

### 8.4 Spectators

- Anyone with the room code can join `mode=spectate`. Read-only stream of all state deltas + chat read access.

### 8.5 Chat

- Per-room text chat, server-rate-limited (1 msg/sec). Profanity filter optional (host toggle).
- Emote wheel (8 emotes, original-game-themed: "Take that!", "Nuke!", "Mommy!", "Pinpoint!", "Ouch!", "Wind?!", "GG", "Reload").

---

## 9. Visual & Audio Style

### 9.1 Art direction

> **"1991 game's soul, 2026 game's body."**

- 2D side-view, no 3D camera. Camera pans/zooms during projectile flight.
- **Parallax sky:** 3-layer cloud parallax, time-of-day variation per match (Day, Dusk, Night, Storm).
- **Terrain:** smooth gradients with sub-pixel anti-aliasing on edges. Each terrain type has a distinct palette (Mountains = slate + snow caps; Crater = volcanic red/black; Sky High = pastel + ice; etc.). Grass tufts and rocks scatter procedurally on top surfaces.
- **Tanks:** chunky, low-poly-look 2D sprites with bold colors (each player picks from a 10-color palette: Red, Blue, Green, Yellow, Cyan, Magenta, Orange, White, Pink, Lime — the original 10). Treads animate when driving. Turret rotates smoothly toward aim direction. Each tank gets a hat (cosmetic) — chef, top hat, beanie, viking, pirate, etc. — pure fun, no gameplay effect.
- **Projectiles:** glowing trails with motion blur. Each weapon class has a distinct trail color (missiles = white, plasma = cyan, napalm = orange, nukes = green, lasers = magenta line).
- **Explosions:** layered particles — flash kernel, fireball, smoke ring, ember rain, screen shake (intensity proportional to damage radius). For nukes: brief screen-white, slow mushroom cloud rises and dissipates over 4 seconds.
- **Death:** tank spins into the air with smoke trail, lands as a smoldering wreck. Wreck stays on the terrain as cover until round end.
- **Wind:** subtle leaves/dust particles blowing horizontally at top of screen. Strong wind = visible streaks.

### 9.2 Palette per terrain type

| Type | Primary | Secondary | Sky |
|---|---|---|---|
| Mountains | #607D8B | #ECEFF1 | dawn gradient |
| Hills | #6B8E23 | #8FBC8F | clear blue |
| Valleys | #4E342E | #6D4C41 | overcast |
| Cliffs | #455A64 | #90A4AE | steel sky |
| Crater | #3E2723 | #BF360C | red sunset |
| Sky High | #B0BEC5 | #FFFFFF | high-altitude pastel |
| Plateau | #8D6E63 | #D7CCC8 | desert |
| Flat | #A1887F | #BCAAA4 | clear blue |

### 9.3 Audio

- **Music:** procedurally selectable lobby/match/victory tracks. Synthwave-orchestral hybrid (think OutRun meets Hans Zimmer, with a wink at the original PC speaker beeps for the menu).
- **SFX:**
  - Cannon fire: deep thump with weapon-specific timbre (Baby Missile = pop, Nuke = bass boom + sub).
  - Whistle in flight (pitch lowers with descent).
  - Explosions: layered booms with high-end crackle.
  - Tank death: comedic horn (preserves the original game's sense of humor — the original death sound was deliberately silly).
  - Shield impact: musical "ting" pitched by shield type.
  - Wind ambient loop, volume scales with magnitude.
- **Voice (optional):** the original had a "MOMMY!" sample on death. We preserve this, with multiple voice line variants ("Mommy!", "Not again!", "I'll be back!"), togglable.

### 9.4 UI

- **HUD:** clean glass-morphism panel at top — wind indicator (animated arrow), turn timer, current player name + color, tank HP bars for all players (sortable).
- **Aim controls:** bottom-left panel with angle dial, power slider, weapon select carousel, fire button.
- **Player list:** right side — color swatch, name, HP, cash.
- **Shop screen** (between rounds): grid of weapons/items with prices, current cash, "Continue" CTA. Cards reveal damage/radius stats on hover.
- **Spectator UI:** minimal — just the field, no controls.
- **Mobile:** controls collapse to thumb-friendly bottom sheet. Angle/power via virtual joystick. Weapon select via swipe carousel.

### 9.5 Accessibility

- Colorblind-safe palette toggle (deuteranopia / protanopia / tritanopia modes — adjusts tank colors and weapon trails).
- All audio cues mirrored visually.
- Keyboard navigable menus.
- Reduced motion mode (disables screen shake, reduces particle counts).

---

## 10. UX Flows

### 10.1 New player

1. Land on homepage → "Play" or "Create Room" or "Join Room"
2. "Play" → quickmatch into a public room with humans + AI fill.
3. "Create" → configure match settings → get room code → share.
4. "Join" → enter code → land in lobby.

### 10.2 Returning player (no account)

- Local browser storage retains: nickname, preferred color, preferred hat, last-used controls (keyboard vs mouse vs touch).
- No login required for v1.

### 10.3 Match flow

```
Lobby → (host: Start) → Tank placement reveal → Round 1
→ Turn 1 (P1 aim → P2 aim → … → all fire in random order → physics resolve)
→ Turn 2 → … → Round end (last tank standing)
→ Shop screen (30s timer)
→ Round 2 → … → Match end → Final scoreboard → "Rematch?" / "New room"
```

---

## 11. Technical Architecture

### 11.1 Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **TypeScript + Vite + PixiJS v8** | PixiJS is mature, fast 2D WebGL/WebGPU renderer with great particle support. |
| Frontend state | **Zustand** | Minimal store for UI; game state mirrored from server. |
| Networking | **WebSocket (native)** | Binary frames (msgpack) for state deltas; JSON for control messages. |
| Backend runtime | **Node.js 22 + ws library** | Lean, well-known. Bun is an alternative if benchmarks favor it. |
| Backend lang | **TypeScript** | Share types (intents, snapshots) with frontend via a `shared/` package. |
| Game loop | Custom fixed-timestep simulation, 60Hz | Deterministic for replay. |
| Persistence | **SQLite (better-sqlite3)** | Match history, optional. No PII. |
| Session store | **In-memory Map** (v1) | Single-process. Add Redis pub/sub if we scale horizontally. |
| Hosting | **Fly.io / Railway / Render** | Persistent WebSocket connections; multi-region future. |
| Static assets | **Cloudflare R2 / CDN** | Sprites, audio. |
| Build | **Turborepo** monorepo: `apps/web`, `apps/server`, `packages/shared`, `packages/game` | Game logic (physics, weapons, terrain) lives in `packages/game` and runs on both client (for prediction/preview) and server (authoritative). |

### 11.2 Repo layout

```
scorched-earth/
├── apps/
│   ├── web/                  # PixiJS client
│   │   ├── src/
│   │   │   ├── scenes/       # Lobby, Match, Shop, Scoreboard
│   │   │   ├── render/       # Terrain renderer, particles, tanks
│   │   │   ├── input/        # Keyboard, mouse, touch handlers
│   │   │   ├── net/          # WebSocket client, reconnection
│   │   │   └── ui/           # HUD, panels, menus
│   │   └── public/assets/
│   └── server/
│       ├── src/
│       │   ├── rooms/        # Room lifecycle, matchmaking
│       │   ├── sim/          # Authoritative simulation tick
│       │   ├── ai/           # Bot logic per difficulty
│       │   ├── net/          # WebSocket gateway, codec
│       │   └── persistence/  # SQLite adapters
├── packages/
│   ├── game/                 # PURE game logic (physics, weapons, terrain, damage, RNG)
│   ├── shared/               # Types: Intent, Snapshot, RoomConfig, etc.
│   └── ui-kit/               # Shared React/Pixi components (if any)
└── tooling/                  # Scripts, codegen
```

### 11.3 Determinism

- Game uses a **seeded PRNG** (e.g. `xoshiro128**`). Terrain seed, turn order RNG, AI decisions all derive from `match.seed`.
- Physics uses **integer math** where feasible (fixed-point Q16.16 for positions/velocities), to ensure cross-platform deterministic replay.
- Server records every intent + tick boundary → match replays are tiny (~10KB per match) and bit-exact replayable.

### 11.4 Performance budgets

- **Frame budget:** 16.6ms (60fps). Render: ≤ 8ms. Logic: ≤ 4ms. Net: ≤ 1ms. Slack: 3.6ms.
- **Server tick budget:** 16.6ms. Handles 100 concurrent matches per instance target.
- **Particle cap:** 2000 per scene; degrade gracefully on low-end devices.
- **Initial bundle:** ≤ 500 KB gzipped (lazy-load weapon sprites/sfx on first use).

### 11.5 Anti-cheat baseline

- Server is authoritative — clients can't change trajectories or damage.
- Rate-limit intents (max 30/sec per client).
- Validate intent timing (no firing during another player's turn in Classic mode).
- Reject impossible aim values (angle outside 0–180, power outside 0–1000).

---

## 12. Data Models (shared types)

```ts
// packages/shared/src/types.ts

export type PlayerId = string;  // UUID v4
export type RoomCode = string;  // 6-char [A-Z0-9]

export interface RoomConfig {
  terrain: TerrainType;
  wall: WallMode;
  gravity: 'low' | 'normal' | 'high';
  wind: 'calm' | 'normal' | 'tornado';
  rounds: number;            // 1–20
  mode: 'classic' | 'blitz' | 'sudden-death';
  turnTimerSec: number;      // 0 = no timer
  startingCash: number;      // default 10_000
  maxPlayers: number;        // 2–10
}

export interface Player {
  id: PlayerId;
  nickname: string;
  color: ColorName;
  hat: HatName;
  isAI: boolean;
  aiDifficulty?: AIDifficulty;
}

export interface TankState {
  playerId: PlayerId;
  x: number;
  y: number;
  hp: number;
  fuel: number;
  cash: number;
  inventory: Record<WeaponId, number>;
  defenses: Record<DefenseId, number>;
  activeShield: { type: DefenseId; hp: number } | null;
  parachuteEquipped: boolean;
  alive: boolean;
  angle: number;             // current aim
  power: number;             // current power
  selectedWeapon: WeaponId;
}

export interface ProjectileState {
  id: string;
  weaponId: WeaponId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: PlayerId;
  bouncesRemaining: number;
  windImmune: boolean;
  age: number;
}

export interface Snapshot {
  tick: number;
  wind: number;
  terrain: { version: number; heights: Int16Array | null };  // delta-encoded
  tanks: TankState[];
  projectiles: ProjectileState[];
  currentTurn?: { playerId: PlayerId; deadlineTs: number };
  phase: 'lobby' | 'placing' | 'aiming' | 'resolving' | 'shop' | 'scoreboard';
}

export type Intent =
  | { type: 'AIM'; angle: number; power: number; weaponId: WeaponId }
  | { type: 'FIRE' }
  | { type: 'MOVE'; dx: number }
  | { type: 'TOGGLE_SHIELD'; defenseId: DefenseId | null }
  | { type: 'BUY'; itemId: string; qty: number }
  | { type: 'READY' }
  | { type: 'CHAT'; text: string };
```

---

## 13. Network Protocol

### 13.1 Transport

- WebSocket. Binary frames for snapshots (msgpack-encoded), JSON for control messages.
- Heartbeat: client → server ping every 5s, server disconnects after 15s silence.

### 13.2 Message envelopes

```
S → C: { kind: 'snapshot', data: <msgpack(Snapshot)> }
S → C: { kind: 'event', name: 'TANK_DEAD' | 'PROJECTILE_HIT' | 'ROUND_END' | …, payload }
S → C: { kind: 'chat', from, text, ts }
S → C: { kind: 'error', code, message }

C → S: { kind: 'intent', intent: <Intent> }
C → S: { kind: 'join', code, nickname, color, hat }
C → S: { kind: 'host', config: RoomConfig }    // host-only
C → S: { kind: 'chat', text }
C → S: { kind: 'ping', ts }
```

### 13.3 Snapshot frequency

- **Aiming phase:** 1 snapshot/sec (just keepalive — state isn't changing).
- **Resolving phase:** 30 snapshots/sec (projectiles in flight).
- **Terrain:** sent as delta-encoded carve operations (`{ at: [x, y], shape: 'circle', r: 30 }`) not full heightmap dumps.

---

## 14. Build Plan / Milestones

Each milestone ships a playable build. No silent foundations.

### M0 — Walking skeleton (week 1)

- Repo bootstrap, Vite + Pixi client renders one terrain.
- WebSocket server, 1 room, 2 hardcoded tanks.
- Aim with mouse, fire Baby Missile, server simulates, client renders explosion + terrain carve.
- **Done when:** two browser tabs can shoot at each other.

### M1 — Real multiplayer skeleton (week 2)

- Room codes, lobby screen, player join/leave.
- Color/nickname picker.
- Turn order, turn timer, win detection.
- **Done when:** strangers can play a full Classic round.

### M2 — Weapons phase 1 (week 3)

- Implement weapons 1–10 (Baby Missile → Leapfrog).
- Weapon select UI, inventory, free Baby Missile infinite ammo.
- **Done when:** all 10 fire correctly and look distinct.

### M3 — Economy & shop (week 4)

- Shop screen, prices, cash, between-round economy.
- Damage scoring, kill credits.
- **Done when:** a full 3-round match runs end-to-end.

### M4 — Weapons phase 2 (week 5)

- Remaining 20 weapons.
- All defenses (shields, parachute, batteries).
- Patriot defense logic.

### M5 — Terrain types & walls (week 6)

- All 9 terrain generators.
- All 4 wall modes.
- Falling tank damage.

### M6 — Polish: art & audio (weeks 7–8)

- Final tank sprites, hats, animations.
- Particle system tuning per weapon.
- Soundtrack + SFX library integrated.
- Parallax skies + time-of-day variants.

### M7 — AI opponents (week 9)

- Five difficulty levels.
- Fill empty slots in lobby.

### M8 — Mobile + accessibility (week 10)

- Touch controls.
- Colorblind palettes, reduced motion, keyboard-only navigation.

### M9 — Stability & launch (weeks 11–12)

- Reconnect handling, ghost AI takeover.
- Spectator mode.
- Match replays (record + playback).
- Server load testing (target: 100 concurrent matches on one instance).
- Deploy, monitoring, error reporting.

**Total estimate: 12 weeks for one engineer, or 6 weeks for two.**

---

## 15. Stretch Goals (Post-v1)

- **Map editor** — share terrains by code.
- **Custom weapons** — JSON-defined; community-submitted.
- **Ranked mode** — ELO, accounts.
- **Tournaments** — bracket UI, scheduled matches.
- **Cosmetics shop** — hats, tank skins, trail effects (purely cosmetic).
- **Twitch overlay** — score ticker for streamers.
- **Replay sharing** — short MP4 export of match highlights.
- **More terrain types** — Underwater, Lava, Ice (with sliding).
- **Daily challenge** — fixed seed, weapon loadout, leaderboard.

---

## 16. Open Questions

1. **Monetization model.** v1 is free, ad-free. Cosmetics-only paid items in v2? Patreon? Decide before launch.
2. **Hosting region.** Latency budget for global play is generous (turn-based), but resolution phase wants <100ms RTT. Start US-East; expand if traffic warrants.
3. **Account system.** v1: no accounts. v2: optional accounts for stats/cosmetics? Discord OAuth probably easiest.
4. **Voice chat.** Not in scope. Players use Discord. Reconsider in v3 if community asks.
5. **Mod support.** A `packages/game` swap could allow custom rulesets. Don't promise this in v1.

---

## 17. References

- Wendell Hicken's 1991 Scorched Earth (DOS). Distributed as shareware; manual is the canonical source for weapon prices, damage values, terrain types, AI names.
- Original screenshots: archive.org has scans of the manual and disk images.
- *Worms* series (Team17, 1995–): closest commercial descendant; useful for animation references but DO NOT copy its style (we're a Scorched Earth tribute, not a Worms clone).
- *Pocket Tanks* (Blitwise, 2001): another descendant; reference for clean modern UI.

---

## 18. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Physics determinism drift across clients | Med | High | Fixed-point math; server-authoritative for damage. Client prediction is visual only. |
| Network jitter ruins projectile feel | Med | Med | Interpolate between server snapshots; render projectile trail one frame behind for smoothness. |
| 10-player matches lag on low-end devices | Med | Med | Particle LOD; halve projectile resolution updates for spectators. |
| Scope creep on weapons | High | Med | Implement weapons in two phases (M2, M4). Cut from list rather than slip. |
| Original game's "feel" hard to replicate from numbers alone | High | High | Build M2 with placeholder values, iterate against playtester feedback from veteran players. |
| WebSocket scaling beyond one instance | Low (v1) | Med | Rooms are sticky to instance. For v2: Redis pub/sub + room routing layer. |

---

**End of spec.** Edits welcome — this is a living document until M1 ships.
