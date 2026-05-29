# Phase 8 — Visual Polish Design

## Overview

Phase 8 transforms Scorched Earth from a functional prototype into a polished Cartoon Arcade game. Every visual system is upgraded: the entry lobby becomes a canvas-first experience with a live AI demo, the camera gains smart framing and shot-tracking, terrain gets layered fills with grass tufts, the sky gains parallax depth and time-of-day variants, tanks become chunky cartoon machines with track wheels and hats, every weapon gets its own particle signature, the HUD is completely rethemed, and explosions scale visually with damage.

**Aesthetic target:** Cartoon Arcade — bold outlines, saturated colors, chunky shapes, exaggerated physics. Heavy on it.

**No gameplay changes.** All mechanics, damage values, and server state remain identical. This phase is purely client-side rendering and the lobby flow.

---

## 1. Camera System

### 1.1 Camera Class

A new `Camera` class lives in `apps/client/src/render/Camera.ts`. It wraps the existing `world` PIXI.Container (which has `scale` and `position` properties) with lerp-smoothed target tracking, user input handling, and screen shake.

```typescript
export class Camera {
  private world: PIXI.Container;
  private app: PIXI.Application;

  // Smooth targets (what we're moving toward)
  private targetX = 0;
  private targetY = 0;
  private targetScale = 1;

  // Shake state
  private shakeIntensity = 0;
  private shakeDuration = 0;
  private shakeElapsed = 0;

  // User interaction state
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private userOverride = false;  // user manually panned this shot
  private trackingSuspended = false;

  constructor(world: PIXI.Container, app: PIXI.Application) { ... }

  // Called every ticker frame with delta in seconds
  update(dt: number): void { ... }

  // Frame all living tanks with 20% padding
  fitToTanks(tanks: TankPosition[]): void { ... }

  // Track a moving projectile; suspends if user is dragging
  trackProjectile(x: number, y: number): void { ... }

  // Trigger a shake event
  shake(blastRadius: number): void {
    this.shakeIntensity = Math.min(blastRadius * 0.08, 12);
    this.shakeDuration = Math.min(0.2 + blastRadius * 0.005, 1.0);
    this.shakeElapsed = 0;
  }

  // Reset to auto-framing (bound to 'R' key + double-click)
  resetView(): void {
    this.userOverride = false;
    // fitToTanks is called next update()
  }
}
```

### 1.2 Lerp Constants

| Property | Lerp factor per second |
|---|---|
| Position (auto-framing) | 0.08 (slow, cinematic) |
| Position (shot-tracking) | 0.18 (medium, responsive) |
| Scale | 0.06 |
| Shake decay | Exponential: `shakeIntensity *= Math.exp(-dt * 8)` |

### 1.3 Auto-framing

On round start and after each explosion settles (1.5s delay):

1. Collect world-space positions of all living tanks.
2. Compute bounding box.
3. Add 20% padding on all sides.
4. Compute scale needed to fit that box into the viewport.
5. Clamp scale to [0.4, 2.0].
6. Set `targetScale` and `targetX/Y` to center the box.

```typescript
function computeFit(tanks: TankPosition[], viewport: Size): { x: number; y: number; scale: number } {
  const xs = tanks.map(t => t.x);
  const ys = tanks.map(t => t.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const padX = (maxX - minX) * 0.2 + 80; // minimum 80px padding
  const padY = (maxY - minY) * 0.2 + 80;
  const worldW = maxX - minX + padX * 2;
  const worldH = maxY - minY + padY * 2;
  const scale = Math.min(viewport.width / worldW, viewport.height / worldH, 2.0);
  const scale2 = Math.max(scale, 0.4);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { x: viewport.width / 2 - cx * scale2, y: viewport.height / 2 - cy * scale2, scale: scale2 };
}
```

### 1.4 Shot Tracking

While a projectile is in flight:

- Every frame, set `targetX/Y` to keep the projectile centered (same lerp as auto-framing).
- Try to keep both the firing tank and the target tank in frame if the zoom allows; otherwise just follow the projectile.
- If the user starts dragging during flight: set `trackingSuspended = true`, `userOverride = true`. Do not resume tracking for this shot.
- On next turn start: clear `userOverride`, `trackingSuspended`.

### 1.5 User Controls

| Input | Action |
|---|---|
| Scroll wheel | Zoom in/out; adjusts `targetScale` by ±10% per tick |
| Pinch (trackpad) | Same as scroll |
| Left-click + drag | Pan (sets `userOverride = true`) |
| Middle-click + drag | Pan (does not set `userOverride` — won't suppress tracking) |
| Right-click + drag | Pan during your own turn (left-click reserved for UI) |
| Double-click | Reset view (`resetView()`) |
| R key | Reset view |

Scale range: [0.4, 2.0]. When user sets `userOverride = true`, auto-framing is suspended until `resetView()` is called or the next round starts.

### 1.6 Integration in MatchScene

`MatchScene.ts` creates a single `Camera` instance on scene init. The existing `fit()` method is replaced by `camera.fitToTanks()`. Every ticker frame calls `camera.update(dt)`. Projectile positions are fed to `camera.trackProjectile()` when a projectile is active. On explosion, `camera.shake(blastRadius)` is called.

---

## 2. Lobby & Identity

### 2.1 Entry Flow

**Path A — Direct visit:**
1. Page loads → game canvas fills the browser window.
2. 4 AI tanks (2 Shooter, 2 Moron difficulty) spawn immediately and start a real match using the existing AI system.
3. After 500ms (canvas ready), the identity panel slides in from the right (transform: translateX animation, 300ms ease-out).
4. Panel pre-fills: name from localStorage or random adjective+noun, color randomly chosen from unused slots, hat = none.
5. Right column shows **MATCH SETUP** (loadout, rounds, AI slots, invite link).
6. Host clicks **▶ START MATCH** → creates a Colyseus room, panel transitions to host lobby (settings remain visible, player list appears below).
7. When ready, host clicks **▶ START** → AI demo is torn down, real match initializes on the same canvas.

**Path B — Join via invite link (`?room=XXXXXX`):**
1. Page loads → game canvas, AI demo runs.
2. Panel slides in: name pre-filled, color random, room code pre-populated from URL.
3. Right column shows **JOIN GAME** button (not match settings).
4. Player edits name/color/hat if desired → clicks **JOIN**.
5. Panel slides out, player joins the real room. No more auto "Player" nickname.

### 2.2 Identity System

```typescript
// localStorage key: "scorched_identity"
interface StoredIdentity {
  name: string;
  color: TankColorKey;  // e.g. "blue", "red", "green"
  hat: Hat;
}

type Hat = 'none' | 'helm' | 'chef' | 'tophat' | 'beanie' | 'cowboy' | 'party' | 'viking' | 'santa';

type TankColorKey = 'red' | 'blue' | 'green' | 'orange' | 'cyan' | 'purple' |
                    'yellow' | 'pink' | 'lime' | 'white';
```

**Name generation:** Two wordlists concatenated — 400 combinations:

```typescript
const ADJECTIVES = ['Iron','Steel','Chaos','Storm','Shadow','Blaze','Frost','Thunder',
                    'Venom','Savage','Rogue','Grim','Crimson','Neon','Dark','Wild',
                    'Turbo','Doom','Hyper','Volt'];
const NOUNS      = ['Wolf','Falcon','Shark','Bear','Eagle','Fox','Cobra','Tiger',
                    'Hawk','Viper','Panther','Dragon','Lynx','Raven','Hornet',
                    'Scorpion','Phantom','Raptor','Mamba','Jackal'];
// Pick random index for each, concatenate: "SteelWolf", "IronFalcon"
```

**Color conflict resolution:** Client sends preferred color in join message. Server checks if color is taken. If taken, assigns the next available color in the palette order and sends it back in the join-ack. Client updates the UI to reflect the server-assigned color.

**Persistence:** Write to localStorage whenever the player changes name, color, or hat. Read on page load. If localStorage is empty or name is blank, generate a fresh random identity.

### 2.3 AI Demo Battle

- Uses the existing `MatchRoom` server-side with a fixed room ID (`"__demo__"`).
- 4 AI slots: `[{ difficulty: 'Shooter' }, { difficulty: 'Shooter' }, { difficulty: 'Moron' }, { difficulty: 'Moron' }]`.
- Demo runs a real match (real terrain, real physics, real AI think loop).
- When host clicks Start Match: demo room is left, the real room is created/joined, a new terrain seed is generated server-side, `MatchScene` re-initializes on the same canvas.

### 2.4 Panel Layout

Two-column panel, max-width 560px, centered vertically, slides in from right:

- **Left column:** YOUR SOLDIER — name input, color swatches (10), hat picker (9 options: none + 8 hats)
- **Right column (host):** MATCH SETUP — loadout selector (Starter / Standard / Bonanza), rounds stepper (1–10), AI opponent slots (+Add / remove), invite link
- **Right column (join):** pre-filled room code, JOIN GAME button
- **Footer:** ▶ START MATCH (host) or ▶ JOIN (guest), Share link button

### 2.5 Host Sees Joiners

Once the host creates a room, the panel transitions to "lobby mode":
- RIGHT column reveals a live player list (name + color swatch) that updates as players connect via WebSocket.
- ▶ START button is enabled when at least 1 human player has joined (the host counts as 1). AI opponents do not count toward this minimum — the host alone is sufficient to start a match with AI opponents.

### 2.6 Match Start — Terrain & Placement

On `host → START`:
1. Server generates a new terrain seed (random uint32).
2. `placeTanksOn()` is replaced with random placement:
   ```typescript
   function placeTanksRandomly(players: Player[], terrain: Terrain, minBuffer = 120): void {
     const slots = generateRandomSlots(players.length, terrain, minBuffer);
     const shuffled = shuffle([...players]);
     shuffled.forEach((player, i) => {
       player.x = slots[i].x;
       player.y = terrain.heightAt(slots[i].x) - TANK_HEIGHT;
     });
   }
   // generateRandomSlots: picks X positions uniformly with minimum gap of minBuffer
   // rejects positions within 40px of world edges
   ```
3. Tank order is randomized — no prescripted left-to-right assignment.

---

## 3. Art Direction — Terrain

### 3.1 Layer Fills (bottom to top)

Single PixiJS Graphics draw over the existing heightmap. The heightmap polygon is drawn three times with different clip rectangles (or `moveTo`/`lineTo` fills) to create the layered look:

| Layer | Color | Extent |
|---|---|---|
| Bedrock | `#2a1a0a` | Full terrain height |
| Dirt | `#5c3a1e` | From surface down to ~60% depth |
| Topsoil | `#6b4a25` | From surface down 15px |
| Grass stroke | `#8bc34a` | 3px polyline along the surface |
| Grass tufts | `#4caf50` | Short lines every ~40px along surface |

**Implementation:** `Terrain.ts` `draw()` method calls:
1. `gfx.beginFill(0x2a1a0a)` → draw full terrain polygon
2. Translate up 60% of average terrain depth → draw dirt polygon
3. Translate up to near-surface → draw topsoil (thin strip)
4. `gfx.lineStyle(3, 0x8bc34a)` → trace the surface polyline
5. For every `i * 40` pixels along the surface: draw 2–3 upward line strokes for tufts

**Carving:** When terrain is carved, the re-draw uses the same layer stack. The freshly carved area reveals dirt colors naturally since all layers are redrawn together.

### 3.2 Rock pebbles

Scatter 8–12 small `ellipse(cx, cy, rx, ry, 0x3d2a14, 0.5)` calls randomly within the dirt layer (y position between surface and 80% depth, x random). These are fixed per terrain seed using the seeded RNG. Pebbles that fall within a crater are removed on redraw.

---

## 4. Art Direction — Sky & Parallax

### 4.1 Sky Component (`Sky.ts`)

Sky renders 6 layers as children of a `PIXI.Container` that sits behind the world:

| Layer | Content | Parallax factor |
|---|---|---|
| 0 | Gradient rectangle (full viewport) | 0 — fixed |
| 1 | Far cloud strip | 0.05 (barely moves with camera) |
| 2 | Near cloud strip | 0.15 |
| 3 | Distant hills polygon | 0.08 |
| 4 | Mid hills polygon | 0.12 |
| 5 | Near hills polygon | 0.18 |

**Parallax formula:** `layer.x = -camera.x * parallaxFactor`

Clouds drift rightward on their own: `cloudContainer.x += driftSpeed * dt`. Far clouds: 8px/s, near clouds: 20px/s. When a cloud exits right edge of the viewport, it wraps to the left.

### 4.2 Time-of-Day

Randomly selected per round at match start (seeded from terrain seed so all clients agree):

```typescript
type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';

const SKY_PALETTE: Record<TimeOfDay, SkyPalette> = {
  dawn:  { top: 0xff7043, mid: 0xffb74d, bottom: 0x81d4fa, cloudTint: 0xffccaa, ambientMult: 0.85, stars: false },
  day:   { top: 0x1a6fa8, mid: 0x4da6d8, bottom: 0xb8e4f9, cloudTint: 0xffffff, ambientMult: 1.00, stars: false },
  dusk:  { top: 0xb34700, mid: 0xe65c00, bottom: 0xffcc02, cloudTint: 0xffaa55, ambientMult: 0.80, stars: false },
  night: { top: 0x0a0a2e, mid: 0x1a1a4e, bottom: 0x1a3a5e, cloudTint: 0xaabbcc, ambientMult: 0.60, stars: true  },
};
```

`ambientMult` is multiplied against the terrain tint color to make everything slightly darker at dusk/night. Night renders 20–30 small white dots (stars) in the upper sky layer. No gameplay effect.

### 4.3 Cloud Shapes

Clouds are drawn with PixiJS Graphics (not sprites): 2–3 overlapping ellipses per cloud. Far clouds: 60–90px wide, opacity 0.6–0.7. Near clouds: 80–130px wide, opacity 0.85–0.95. Cloud positions are generated from the terrain seed (deterministic for all clients).

---

## 5. Art Direction — Tank & Turret

### 5.1 Tank Drawing (`Tank.ts`)

All drawing is PixiJS Graphics — no sprite sheets. Drawing order (back to front):

1. **Drop shadow:** `ellipse(0, trackY+4, 28, 5, 0x000000, 0.3)`
2. **Tracks:** Two `ellipse` calls at hull base (left and right), dark inner ring
3. **Hull:** `roundedRect(-22, 2, 44, 16, 8)` filled with tank color, dark stroke 2.5px
4. **Hull highlight:** thin rect at hull top, white at 25% alpha
5. **Hull shadow line:** thin rect at hull bottom, black at 20% alpha
6. **Turret:** `roundedRect(-12, -6, 24, 10, 5)` in darker shade of tank color, dark stroke 2px
7. **Hat:** drawn before barrel — see §5.2
8. **Barrel:** `<g transform="translate(0,-1) rotate(angle)">` — rect from x=0, width=26, height=6, grey fill; tip ring rect at x=22, width=5, height=8
9. **HP bar:** thin rect above tank, color-coded by HP ratio

**Barrel anchor:** The barrel's base is always at the turret center (SVG translate: (0, -1) which is the turret's vertical center). The barrel angle matches `tank.angle` from game state, converted from degrees (0=right, 90=straight up, 180=left in game coords) to SVG rotation.

**Dead tank:** On death, a 500ms tween lerps:
- `barrelAngle` → 270° (straight down — note: game convention is 0°=right, 90°=up, so 270° points downward)
- `container.alpha` → 0.3

A 💀 text object is added above the tank and tweened upward 20px over 600ms.

**Hit flash:** On taking damage, `container.tint = 0xffffff` for 1 frame, then cleared. For shield absorption: `container.tint = 0xaaddff` for 2 frames.

### 5.2 Hat Drawing

Hats are drawn as PixiJS Graphics children of the tank container, inserted into the display list **before** the barrel group. Each hat is a collection of shapes positioned relative to the turret center. Hat specs:

| Hat | Shape description |
|---|---|
| `none` | Nothing drawn |
| `helm` | Dark rounded rect (brim) + rounded rect (dome) |
| `chef` | White ellipse brim + tall white rect + white puff ellipse at top |
| `tophat` | Dark tall rect + wide dark brim rect |
| `beanie` | Colored ellipse brim + rounded rect dome + white pompom ellipse |
| `cowboy` | Wide brown brim ellipse + tan dome rect |
| `party` | Pointed triangle shape (cone) + colored stripe rect |
| `viking` | Grey dome + two small curved horn shapes |
| `santa` | Red dome + white band rect + white pompom |

All hat shapes sit at y ≈ -14 to -35 relative to turret center (above the turret). Hat z-order: always behind barrel.

---

## 6. Effects & Polish

### 6.1 Explosions

Triggered by `ExplosionEvent` from server. Parameters:
```typescript
interface ExplosionEvent {
  x: number;
  y: number;
  blastRadius: number;  // world pixels
  weaponId: WeaponId;
}
```

**Visual layers (all PixiJS Graphics/animated containers):**
1. **Shockwave ring** (large blasts only, `blastRadius > 80`): `circle` starting at radius=blastRadius, alpha=0.5, expands 1.5× over 200ms, fades out
2. **Fire ball:** `ellipse` at impact, radius = `blastRadius * 0.5`, orange (#ff8c00), alpha 0.85, scales from 0 to full over 150ms
3. **Inner glow:** `ellipse`, radius = `blastRadius * 0.3`, yellow (#fbbf24), alpha 0.9
4. **White core:** `ellipse`, radius = `blastRadius * 0.15`, white, alpha 0.85 — appears for 80ms then fades
5. **Smoke ring:** `ellipse`, starts at radius = `blastRadius * 0.4`, rises 30px over 800ms, alpha lerps 0.4 → 0
6. **Dirt debris:** 3–8 `line` segments from impact point, `blastRadius * 0.6` long, brown (#6b4a25), arc with gravity — only for non-energy weapons

**Duration:** Fireball fades over 600ms. All particles cleaned up after 1200ms.

**Screen shake:** Called simultaneously with explosion start:
```typescript
camera.shake(blastRadius);
// intensity = Math.min(blastRadius * 0.08, 12)   pixels
// duration  = Math.min(0.2 + blastRadius * 0.005, 1.0)  seconds
// decay: shakeIntensity *= Math.exp(-dt * 8)  per frame
// applied as random X/Y on world container, additive to camera position
// suspended if user is actively dragging
```

### 6.2 Per-Weapon Particle Signatures

| Weapon category | Particle override |
|---|---|
| Cannon, Tracer, Shotgun, Baby Nuke, MIRV sub-warhead | Standard (dirt + orange fireball) |
| Nuke | Standard + mushroom stem/cap + larger shockwave ring |
| Cluster | Standard × 3–7 staggered 80ms apart, smaller radius each |
| MIRV | Dashed arc trails from split point → each warhead lands as a Cluster sub-blast |
| Roller | On each bounce: small dust puff (brown ellipse, 300ms) instead of full explosion; final stop (velocity < 20px/s or after 8 bounces, whichever comes first): standard explosion |
| Leapfrog | On each bounce: small orange flash; final: standard |
| Napalm, Incendiary | Fire zone: flickering flame tongues (ellipses at 8fps) persist 2000ms after impact; no dirt debris |
| Laser | No fireball. Red beam `line` (1 frame flash), white burn circle at endpoint, 6 spark lines radiate outward |
| Plasma Ball, Plasma Wave | No fireball. Purple arc-discharge lines (3–5 jagged paths), purple glow `circle`, white core; no dirt |
| Dirt Maker | No fireball. Brown particle fan upward with gravity arc, no smoke |
| Burrow | Small dirt puff on entry, no explosion at underground path; standard explosion on surface exit |
| Parachute | No explosion — just landing animation |

### 6.3 Death Animation

Sequence triggered when `tank.hp <= 0`:
1. **Frame 0:** `container.tint = 0xffffff` for 1 frame (white flash)
2. **0–500ms:** Barrel angle tweens from current → 270° (straight down), easing: easeInQuad
3. **0–500ms:** `container.alpha` tweens 1.0 → 0.3
4. **100ms:** 💀 text object added at center of tank, tweens upward 20px over 600ms
5. **500ms:** Tank considered "settled" — HP bar hidden, hat remains visible (faded)

---

## 7. HUD Retheme

### 7.1 HUD Bar (bottom of screen)

Fixed 72px-tall bar at viewport bottom. Background: `linear-gradient(0deg, rgba(8,6,24,0.98), rgba(8,6,24,0.80))`, top border: 3px solid `rgba(255,140,0,0.5)`.

Layout (left to right, flex row, gap 14px, padding 10px 14px):

**Angle dial:**
- 52×52px circular dial, orange border, degree ticks at 0°/45°/90°/135°/180°
- Orange needle rotates to match `tank.angle`
- Angle value text centered in dial
- Adjust: arrow keys or click-drag on dial

**Power bar:**
- 20×52px vertical bar, fill height = `power / 100`
- Gradient: green (bottom) → yellow (middle) → red (top)
- Tick marks at 25%, 50%, 75%
- Power value below bar
- Adjust: up/down arrow keys or click-drag on bar

**Weapon carousel:**
- Shows 5 weapon slots visible at once
- Center slot = selected weapon: larger (40×52px), orange border 2px, fully opaque
- ±1 slots: slightly smaller (32×44px), 80% opacity
- ±2 slots: 28×38px, 60% opacity, shown as shoulder context
- Each slot: emoji icon (large in center), abbreviated name, ammo count (`∞` for unlimited)
- `‹` / `›` arrow buttons scroll the carousel (wraps)
- Click any visible slot to select it (it snaps to center)
- Keyboard: Q/E to scroll left/right; 1–5 select by visible position; hotkeys preserved from Phase 2

**Turn timer:**
- 40×40px box, rounded rect, yellow border
- Countdown number in Impact font
- At ≤5s: border turns red, number pulses (scale 1.0 → 1.2 → 1.0, 0.5s period)
- At 0s: auto-fire with current settings

**FIRE button:**
- `linear-gradient(180deg, #ff8c00, #cc5500)`, border 3px `#7f2d00`, box-shadow `0 4px 0 #7f2d00`
- On mousedown: `box-shadow: 0 1px 0 #7f2d00`, translateY 3px (press-in effect)
- On mouseup: fires, returns to rest state
- Text: "🔥 FIRE"
- Disabled (greyed) when it's not the player's turn

**HUD visibility:** Only shown during an active match. Hidden during lobby, round summary, shop overlay.

### 7.2 Player Strip (top of screen)

Fixed 36px strip at viewport top. Background: `linear-gradient(180deg, rgba(8,6,24,0.95), rgba(8,6,24,0.65))`, bottom border 1px `rgba(255,255,255,0.08)`.

Flex row with gap 8px, one card per player:

```
[color swatch 10×10] [name] [HP bar 36px wide] [HP number]
```

- **Active player card:** colored border 2px matching tank color, "YOUR TURN" badge (amber), white name text
- **Idle player card:** dim border 1px at 30% opacity, grey name text
- **Dead player card:** 0.45 opacity, 💀 replaces HP bar
- **AI tanks:** 🤖 prefix on name
- HP bar fill color: green (>50%), yellow (25–50%), red (<25%)
- **Round indicator:** right-aligned, "ROUND 2 / 5"

### 7.3 Shop (Armory Overlay)

The shop opens as a dark overlay (game canvas still visible at 60% opacity behind). The overlay container is centered.

**Header:** "ARMORY" in Impact, credit balance "💰 850"

**Category tabs:** ALL | BALLISTIC | FIRE | ENERGY | UTILITY (default: ALL)
- BALLISTIC: Cannon, Tracer, Shotgun, Roller, Leapfrog, Cluster, MIRV, Baby Nuke, Nuke, Burrow
- FIRE: Napalm, Incendiary
- ENERGY: Laser, Plasma Ball, Plasma Wave
- UTILITY: Shield, Parachute, Dirt Maker

**Weapon grid:** 4-column grid, scrollable, max-height 280px (shows ~12 items, scrolls for more)
- Each card (75×90px): emoji icon (24px), name (2-line max), "×N" ammo count, credit cost
- Affordable: normal border `rgba(255,255,255,0.12)`
- Selected: orange border 2px, orange-tinted background
- Unaffordable: 50% opacity, red cost text
- Owned (already in loadout): green checkmark badge

**Footer:** "Buy [Item] — 💰 [cost]" orange button + "Done" grey button. Buy button disabled if item is unaffordable or already at max ammo.

**Edge cases:**
- Buying the last of your credits: credits display updates immediately (optimistic), server confirms
- Buying when turn timer hits 0: shop closes, auto-fire triggers with last selected weapon
- Multiple buys per turn: each purchase adds to loadout, deducts credits

### 7.4 Round Summary

Full-screen dark overlay (not dismissible — auto-advances):

```
ROUND N COMPLETE
[color] [Name] wins! [score e.g. 2-0]

🎯 Most accurate     IronFalcon (2/3 hits)
💥 Most damage dealt IronFalcon (130 dmg)
🔥 Cruelest shot     Nuke on SteelWolf

Next round in [5]s…
```

Auto-advances after 5s. No skip button (prevents host rushing players).

### 7.5 Match End

Full-screen overlay, persists until host clicks Play Again:

```
🏆 VICTORY
[Winner name]
[rounds won] rounds · [damage] dmg

1st [color] [name]   [W]W
2nd [color] [name]   [W]W
3rd [color] [name]   [W]W
...

[▶ Play Again]   [Lobby]
```

Play Again: host re-initializes with same settings, new terrain seed, same players.
Lobby: all players are disconnected, canvas returns to AI demo mode.

---

## 8. Component Map

| Component | File | Status |
|---|---|---|
| Camera | `apps/client/src/render/Camera.ts` | New |
| Terrain rendering | `apps/client/src/render/Terrain.ts` | Modify |
| Sky / Parallax | `apps/client/src/render/Sky.ts` | Modify |
| Tank art | `apps/client/src/render/Tank.ts` | Modify |
| Explosion / particles | `apps/client/src/render/Explosion.ts` | New |
| Lobby panel | `apps/client/src/scenes/LobbyScene.ts` | Major rewrite |
| Identity helpers | `apps/client/src/lib/identity.ts` | New |
| Match scene wiring | `apps/client/src/scenes/MatchScene.ts` | Modify |
| HUD bar | `apps/client/src/ui/HudBar.ts` | New (replaces AimControls) |
| Player strip | `apps/client/src/ui/PlayerStrip.ts` | New |
| Shop overlay | `apps/client/src/ui/ShopOverlay.ts` | Modify |
| Round summary | `apps/client/src/ui/RoundSummary.ts` | New |
| Match end | `apps/client/src/ui/MatchEnd.ts` | New |
| Name generator | `apps/client/src/lib/nameGenerator.ts` | New |
| Server: random placement | `apps/server/src/rooms/MatchRoom.ts` | Modify `placeTanksOn()` |

---

## 9. Edge Cases & Failure Modes

- **Player joins while demo is running:** Demo tanks are AI-only. A real player joining a `"__demo__"` room is not supported — the join link always targets the host's real room code.
- **Demo room crashes:** Catch and restart silently. The lobby canvas shows a static screenshot if the demo fails 3 times.
- **Color conflict on join:** Server assigns next available color; client shows the server-assigned color after the join-ack. The UI never shows an incorrect color for more than one network round-trip.
- **localStorage blocked:** Degrade gracefully — generate a fresh random identity each session. No errors shown.
- **Screen shake during user drag:** New shakes are suppressed while `isDragging = true`. Any in-progress shake that started before the drag began is also cancelled immediately (set `shakeIntensity = 0`) on drag-start, so the view doesn't jerk while the user is trying to pan.
- **Explosion off-screen:** Full shake applies even if explosion is outside the viewport. Fireball is clipped by the world container but shake is global.
- **Dead tank hit by explosion:** Apply physics (tank can be pushed) but no HP change, no hit flash, no death animation re-trigger.
- **Timer expires in shop:** Shop closes immediately, weapon reverts to last confirmed selection (before shop opened), auto-fire triggers.
- **Round summary with all players dead simultaneously:** The "winner" is the last player to have died. Server resolves this by recording death order.
- **Match end with disconnected player:** Show "disconnected" label instead of name. Don't block Play Again on their behalf.
- **AI tank in hat selector:** AI tanks are assigned a random hat at match start (server-side, seeded). They don't appear in the hat picker.

---

## 10. Out of Scope for Phase 8

- Animated sprite sheets or texture atlases
- Sound effects / music (separate phase)
- Mobile touch UI beyond pinch-zoom
- Replay system
- Spectator mode
- Any server-side game logic changes
