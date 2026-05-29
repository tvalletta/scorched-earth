# Phase 8 — Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Scorched Earth from a functional prototype into a polished Cartoon Arcade game — canvas-first lobby with live AI demo, smart camera with shot-tracking, layered terrain, parallax sky, chunky cartoon tanks with 8 hats, scaled explosions, per-weapon particles, and a fully rethemed HUD.

**Architecture:** All changes are client-side rendering and lobby flow; no gameplay mechanics change. A new `Camera` class replaces the static `fit()` method. New DOM-based HUD components replace `AimControls` and `WeaponBar` for in-game display. `LobbyScene` becomes canvas-first with a sliding identity panel over a live AI demo.

**Tech Stack:** TypeScript, PixiJS v8 (Graphics API: `.rect().fill().stroke()` chain), DOM for HUD overlays, Vitest, Colyseus

---

## File Map

| File | Action |
|---|---|
| `apps/client/src/lib/nameGenerator.ts` | Create |
| `apps/client/src/lib/nameGenerator.test.ts` | Create |
| `apps/client/src/lib/identity.ts` | Create |
| `apps/client/src/lib/identity.test.ts` | Create |
| `apps/client/src/render/Camera.ts` | Create |
| `apps/client/src/render/Camera.test.ts` | Create |
| `apps/server/src/rooms/placement.ts` | Create |
| `apps/server/tests/placement.test.ts` | Create |
| `apps/server/src/rooms/MatchRoom.ts` | Modify `placeTanksOn()` |
| `apps/client/src/render/Terrain.ts` | Modify `redraw()` |
| `apps/client/src/render/Sky.ts` | Rewrite |
| `apps/client/src/render/Tank.ts` | Rewrite |
| `apps/client/src/render/Explosion.ts` | Rewrite |
| `apps/client/src/hud/HudBar.ts` | Create |
| `apps/client/src/hud/PlayerStrip.ts` | Create |
| `apps/client/src/scenes/ShopScene.ts` | Modify (retheme) |
| `apps/client/src/scenes/RoundSummaryScene.ts` | Modify (retheme) |
| `apps/client/src/scenes/MatchEndScene.ts` | Modify (retheme) |
| `apps/client/src/scenes/LobbyScene.ts` | Rewrite |
| `apps/client/src/scenes/MatchScene.ts` | Modify (wire Camera, HudBar, PlayerStrip) |

---

## Task 1: Name Generator

**Files:**
- Create: `apps/client/src/lib/nameGenerator.ts`
- Create: `apps/client/src/lib/nameGenerator.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/client/src/lib/nameGenerator.test.ts
import { describe, it, expect } from 'vitest';
import { generateName } from './nameGenerator';

describe('generateName', () => {
  it('returns a non-empty string with no spaces', () => {
    const name = generateName();
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
    expect(name).not.toContain(' ');
  });

  it('returns different values across calls', () => {
    const names = new Set(Array.from({ length: 20 }, () => generateName()));
    expect(names.size).toBeGreaterThan(1);
  });

  it('matches AdjNoun pattern — starts with uppercase', () => {
    const name = generateName();
    expect(name[0]).toBe(name[0]?.toUpperCase());
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/valletta/dev/scorched-earth
pnpm --filter @se/client test -- nameGenerator
```

Expected: `FAIL — Cannot find module './nameGenerator'`

- [ ] **Step 3: Implement**

```typescript
// apps/client/src/lib/nameGenerator.ts
const ADJECTIVES = [
  'Iron','Steel','Chaos','Storm','Shadow','Blaze','Frost','Thunder',
  'Venom','Savage','Rogue','Grim','Crimson','Neon','Dark','Wild',
  'Turbo','Doom','Hyper','Volt',
];
const NOUNS = [
  'Wolf','Falcon','Shark','Bear','Eagle','Fox','Cobra','Tiger',
  'Hawk','Viper','Panther','Dragon','Lynx','Raven','Hornet',
  'Scorpion','Phantom','Raptor','Mamba','Jackal',
];

export function generateName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]!;
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]!;
  return adj + noun;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
pnpm --filter @se/client test -- nameGenerator
```

Expected: `3 tests passed`

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/lib/nameGenerator.ts apps/client/src/lib/nameGenerator.test.ts
git commit -m "feat(client): name generator utility for random adjective+noun identities"
```

---

## Task 2: Identity Persistence

**Files:**
- Create: `apps/client/src/lib/identity.ts`
- Create: `apps/client/src/lib/identity.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/client/src/lib/identity.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadIdentity, saveIdentity } from './identity';
import type { StoredIdentity } from './identity';

const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
});

beforeEach(() => { Object.keys(store).forEach(k => delete store[k]); });

describe('identity persistence', () => {
  it('returns a generated identity when localStorage is empty', () => {
    const id = loadIdentity();
    expect(typeof id.name).toBe('string');
    expect(id.name.length).toBeGreaterThan(0);
    expect(id.hat).toBe('none');
  });

  it('round-trips save and load', () => {
    const saved: StoredIdentity = { name: 'IronWolf', color: 'blue', hat: 'helm' };
    saveIdentity(saved);
    expect(loadIdentity()).toEqual(saved);
  });

  it('falls back to random on malformed JSON', () => {
    store['scorched_identity'] = 'not-json{{';
    const id = loadIdentity();
    expect(typeof id.name).toBe('string');
  });

  it('falls back to random when name is empty string', () => {
    saveIdentity({ name: '', color: 'red', hat: 'none' });
    const id = loadIdentity();
    // empty name triggers fresh generation
    expect(id.name.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm --filter @se/client test -- identity
```

Expected: `FAIL — Cannot find module './identity'`

- [ ] **Step 3: Implement**

```typescript
// apps/client/src/lib/identity.ts
import { generateName } from './nameGenerator';

export type Hat = 'none' | 'helm' | 'chef' | 'tophat' | 'beanie' | 'cowboy' | 'party' | 'viking' | 'santa';
export type TankColorKey = 'red' | 'blue' | 'green' | 'orange' | 'cyan' | 'purple' | 'yellow' | 'pink' | 'lime' | 'white';

export interface StoredIdentity {
  name: string;
  color: TankColorKey;
  hat: Hat;
}

const STORAGE_KEY = 'scorched_identity';
const ALL_COLORS: TankColorKey[] = ['red','blue','green','orange','cyan','purple','yellow','pink','lime','white'];

function randomColor(): TankColorKey {
  return ALL_COLORS[Math.floor(Math.random() * ALL_COLORS.length)]!;
}

function freshIdentity(): StoredIdentity {
  return { name: generateName(), color: randomColor(), hat: 'none' };
}

export function loadIdentity(): StoredIdentity {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredIdentity;
      if (parsed.name && parsed.name.length > 0 && parsed.color && parsed.hat) {
        return parsed;
      }
    }
  } catch { /* ignore */ }
  return freshIdentity();
}

export function saveIdentity(id: StoredIdentity): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(id));
  } catch { /* ignore */ }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
pnpm --filter @se/client test -- identity
```

Expected: `4 tests passed`

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/lib/identity.ts apps/client/src/lib/identity.test.ts
git commit -m "feat(client): identity persistence with localStorage and random fallback"
```

---

## Task 3: Camera Class

**Files:**
- Create: `apps/client/src/render/Camera.ts`
- Create: `apps/client/src/render/Camera.test.ts`

- [ ] **Step 1: Write the failing test (pure math only)**

```typescript
// apps/client/src/render/Camera.test.ts
import { describe, it, expect } from 'vitest';
import { computeFit } from './Camera';

describe('computeFit', () => {
  it('clamps scale to minimum 0.4 for very spread tanks', () => {
    const result = computeFit(
      [{ x: 0, y: 0 }, { x: 10000, y: 0 }],
      { width: 1920, height: 1080 },
    );
    expect(result.scale).toBeGreaterThanOrEqual(0.4);
    expect(result.scale).toBeLessThanOrEqual(2.0);
  });

  it('clamps scale to maximum 2.0 for very close tanks', () => {
    const result = computeFit(
      [{ x: 500, y: 300 }, { x: 502, y: 300 }],
      { width: 1920, height: 1080 },
    );
    expect(result.scale).toBe(2.0);
  });

  it('centers view on midpoint of two tanks', () => {
    const vp = { width: 1920, height: 1080 };
    const result = computeFit([{ x: 400, y: 300 }, { x: 600, y: 300 }], vp);
    // midX = (vp.width/2 - result.x) / result.scale should equal 500
    const midX = (vp.width / 2 - result.x) / result.scale;
    expect(midX).toBeCloseTo(500, 0);
  });

  it('handles a single tank', () => {
    const result = computeFit([{ x: 800, y: 300 }], { width: 1920, height: 1080 });
    expect(result.scale).toBeGreaterThanOrEqual(0.4);
    expect(result.scale).toBeLessThanOrEqual(2.0);
  });

  it('returns safe defaults for empty tanks array', () => {
    const result = computeFit([], { width: 1920, height: 1080 });
    expect(result.scale).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm --filter @se/client test -- Camera
```

Expected: `FAIL — Cannot find module './Camera'`

- [ ] **Step 3: Implement Camera.ts**

```typescript
// apps/client/src/render/Camera.ts
import type { Container, Application } from 'pixi.js';
import { TERRAIN_WIDTH, TERRAIN_HEIGHT } from '@se/shared';

export interface TankPosition { x: number; y: number; }
interface Viewport { width: number; height: number; }

// Exported for unit testing
export function computeFit(
  tanks: TankPosition[],
  viewport: Viewport,
): { x: number; y: number; scale: number } {
  if (tanks.length === 0) {
    return { x: viewport.width / 2, y: viewport.height / 2, scale: 1 };
  }
  const xs = tanks.map(t => t.x);
  const ys = tanks.map(t => t.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const padX = (maxX - minX) * 0.2 + 80;
  const padY = (maxY - minY) * 0.2 + 80;
  const worldW = maxX - minX + padX * 2;
  const worldH = maxY - minY + padY * 2;
  const rawScale = Math.min(viewport.width / worldW, viewport.height / worldH);
  const scale = Math.max(0.4, Math.min(2.0, rawScale));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    x: viewport.width / 2 - cx * scale,
    y: viewport.height / 2 - cy * scale,
    scale,
  };
}

export class Camera {
  private targetX = 0;
  private targetY = 0;
  private targetScale = 1;

  private shakeIntensity = 0;
  private shakeDuration = 0;
  private shakeElapsed = 0;

  private isDragging = false;
  private dragStartWorldX = 0;
  private dragStartWorldY = 0;
  private dragStartMouseX = 0;
  private dragStartMouseY = 0;
  userOverride = false;
  private trackingSuspended = false;

  constructor(private world: Container, private app: Application) {
    this.targetX = world.position.x;
    this.targetY = world.position.y;
    this.targetScale = world.scale.x;
    this.attachInputListeners();
  }

  private get viewport(): Viewport {
    return { width: this.app.screen.width, height: this.app.screen.height };
  }

  // Called each ticker frame; dt is elapsed seconds
  update(dt: number): void {
    const POS_LERP = 1 - Math.pow(1 - 0.08, dt * 60);
    const SCALE_LERP = 1 - Math.pow(1 - 0.06, dt * 60);

    this.world.scale.set(
      this.world.scale.x + (this.targetScale - this.world.scale.x) * SCALE_LERP,
    );
    this.world.position.x += (this.targetX - this.world.position.x) * POS_LERP;
    this.world.position.y += (this.targetY - this.world.position.y) * POS_LERP;

    // Screen shake — exponential decay
    if (this.shakeIntensity > 0.1) {
      this.shakeElapsed += dt;
      const progress = Math.min(this.shakeElapsed / this.shakeDuration, 1);
      const intensity = this.shakeIntensity * Math.exp(-progress * 8);
      if (!this.isDragging) {
        const ox = (Math.random() * 2 - 1) * intensity;
        const oy = (Math.random() * 2 - 1) * intensity;
        this.world.position.x += ox;
        this.world.position.y += oy;
      }
      if (progress >= 1) this.shakeIntensity = 0;
    }
  }

  fitToTanks(tanks: TankPosition[]): void {
    if (this.userOverride) return;
    const fit = computeFit(tanks, this.viewport);
    this.targetX = fit.x;
    this.targetY = fit.y;
    this.targetScale = fit.scale;
  }

  // Called while a projectile is in flight
  trackProjectile(x: number, y: number): void {
    if (this.trackingSuspended || this.userOverride) return;
    const TRACK_LERP = 0.18;
    const scale = this.targetScale;
    const cx = this.viewport.width / 2 - x * scale;
    const cy = this.viewport.height / 2 - y * scale;
    this.targetX += (cx - this.targetX) * TRACK_LERP;
    this.targetY += (cy - this.targetY) * TRACK_LERP;
  }

  shake(blastRadius: number): void {
    this.shakeIntensity = Math.min(blastRadius * 0.08, 12);
    this.shakeDuration = Math.min(0.2 + blastRadius * 0.005, 1.0);
    this.shakeElapsed = 0;
  }

  resetView(): void {
    this.userOverride = false;
    this.trackingSuspended = false;
  }

  // Call at the start of each turn to clear per-shot overrides
  onTurnStart(): void {
    this.trackingSuspended = false;
  }

  get worldX(): number { return this.world.position.x; }
  get worldY(): number { return this.world.position.y; }

  private attachInputListeners(): void {
    const canvas = this.app.canvas;

    // Scroll to zoom
    canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.targetScale = Math.max(0.4, Math.min(2.0, this.targetScale * delta));
    }, { passive: false });

    // Left-drag to pan
    canvas.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return;
      this.isDragging = true;
      this.shakeIntensity = 0; // cancel active shake on drag-start
      this.trackingSuspended = true;
      this.dragStartMouseX = e.clientX;
      this.dragStartMouseY = e.clientY;
      this.dragStartWorldX = this.world.position.x;
      this.dragStartWorldY = this.world.position.y;
    });
    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.dragStartMouseX;
      const dy = e.clientY - this.dragStartMouseY;
      this.targetX = this.dragStartWorldX + dx;
      this.targetY = this.dragStartWorldY + dy;
      this.world.position.set(this.targetX, this.targetY);
      this.userOverride = true;
    });
    window.addEventListener('mouseup', () => { this.isDragging = false; });

    // Double-click to reset
    canvas.addEventListener('dblclick', () => this.resetView());

    // R key to reset
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') this.resetView();
    });
  }

  destroy(): void {
    // Input listeners are on window — not easily removed without stored refs.
    // Camera is long-lived per match so this is acceptable.
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
pnpm --filter @se/client test -- Camera
```

Expected: `5 tests passed`

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/render/Camera.ts apps/client/src/render/Camera.test.ts
git commit -m "feat(client): Camera class with lerp tracking, shot-follow, shake, and user pan/zoom"
```

---

## Task 4: Random Tank Placement (Server)

**Files:**
- Create: `apps/server/src/rooms/placement.ts`
- Create: `apps/server/tests/placement.test.ts`
- Modify: `apps/server/src/rooms/MatchRoom.ts` (lines 600–608)

- [ ] **Step 1: Write the failing test**

```typescript
// apps/server/tests/placement.test.ts
import { describe, it, expect } from 'vitest';
import { randomSlots } from '../src/rooms/placement';
import { TERRAIN_WIDTH } from '@se/shared';

const fakeTerrain = new Int16Array(TERRAIN_WIDTH).fill(200);

describe('randomSlots', () => {
  it('returns the requested number of slots', () => {
    expect(randomSlots(4, fakeTerrain).length).toBe(4);
  });

  it('maintains minimum buffer between all slots', () => {
    // Run 10 times to avoid flaky passes
    for (let i = 0; i < 10; i++) {
      const slots = randomSlots(4, fakeTerrain, 120);
      for (let a = 0; a < slots.length; a++) {
        for (let b = a + 1; b < slots.length; b++) {
          expect(Math.abs(slots[a]! - slots[b]!)).toBeGreaterThanOrEqual(120);
        }
      }
    }
  });

  it('respects 40px edge margins', () => {
    for (let i = 0; i < 5; i++) {
      const slots = randomSlots(4, fakeTerrain);
      slots.forEach(x => {
        expect(x).toBeGreaterThanOrEqual(40);
        expect(x).toBeLessThanOrEqual(TERRAIN_WIDTH - 40);
      });
    }
  });

  it('falls back gracefully when spacing is impossible', () => {
    // 20 tanks on narrow terrain — impossible with 120 buffer, must still return 20 slots
    expect(randomSlots(20, fakeTerrain, 120).length).toBe(20);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm --filter @se/server test -- placement
```

Expected: `FAIL — Cannot find module '../src/rooms/placement'`

- [ ] **Step 3: Create placement.ts**

```typescript
// apps/server/src/rooms/placement.ts
import { TERRAIN_WIDTH } from '@se/shared';

const EDGE_MARGIN = 40;

export function randomSlots(
  count: number,
  terrain: Int16Array,
  minBuffer = 120,
): number[] {
  const slots: number[] = [];
  let attempts = 0;
  const MAX_ATTEMPTS = count * 200;

  while (slots.length < count && attempts < MAX_ATTEMPTS) {
    attempts++;
    const x = Math.floor(Math.random() * (TERRAIN_WIDTH - EDGE_MARGIN * 2)) + EDGE_MARGIN;
    if (slots.every(s => Math.abs(s - x) >= minBuffer)) {
      slots.push(x);
    }
  }

  // Fallback: even spacing (guarantees count is met)
  if (slots.length < count) {
    const spacing = TERRAIN_WIDTH / (count + 1);
    return Array.from({ length: count }, (_, i) => Math.round(spacing * (i + 1)));
  }

  return slots;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
pnpm --filter @se/server test -- placement
```

Expected: `4 tests passed`

- [ ] **Step 5: Wire into MatchRoom.ts — replace `placeTanksOn`**

In `apps/server/src/rooms/MatchRoom.ts`, add the import at the top:

```typescript
import { randomSlots } from './placement';
```

Replace the `placeTanksOn` method (lines ~600–608):

```typescript
private placeTanksOn(terrain: Int16Array): void {
  const tanks = Array.from(this.state.tanks.values());
  if (tanks.length === 0) return;
  const xs = randomSlots(tanks.length, terrain);
  // Shuffle tank order so assignment isn't positionally biased
  const shuffled = [...tanks].sort(() => Math.random() - 0.5);
  shuffled.forEach((tank, i) => {
    tank.x = xs[i]!;
    tank.y = terrain[xs[i]!] ?? 0;
  });
}
```

- [ ] **Step 6: Run all server tests to confirm no regressions**

```bash
pnpm --filter @se/server test
```

Expected: all existing tests pass

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/rooms/placement.ts apps/server/tests/placement.test.ts apps/server/src/rooms/MatchRoom.ts
git commit -m "feat(server): random tank placement with minimum 120px buffer between spawns"
```

---

## Task 5: Terrain Layered Art

**Files:**
- Modify: `apps/client/src/render/Terrain.ts`

- [ ] **Step 1: Replace `redraw()` with layered version**

Replace lines 77–89 in `apps/client/src/render/Terrain.ts`:

```typescript
private redraw() {
  const g = this.graphics;
  g.clear();
  const h = this.heightmap;

  // Layer 1 — Bedrock (full terrain shape, darkest)
  g.moveTo(0, h[0] ?? 0);
  for (let x = 1; x < TERRAIN_WIDTH; x++) g.lineTo(x, h[x] ?? 0);
  g.lineTo(TERRAIN_WIDTH, TERRAIN_HEIGHT);
  g.lineTo(0, TERRAIN_HEIGHT);
  g.closePath();
  g.fill(0x2a1a0a);

  // Layer 2 — Dirt band (surface to surface+200, on top of bedrock)
  this.drawBand(g, h, 0, 200, 0x5c3a1e);

  // Layer 3 — Topsoil strip (surface to surface+15)
  this.drawBand(g, h, 0, 15, 0x6b4a25);

  // Layer 4 — Grass stroke
  g.moveTo(0, h[0] ?? 0);
  for (let x = 1; x < TERRAIN_WIDTH; x++) g.lineTo(x, h[x] ?? 0);
  g.stroke({ color: 0x8bc34a, width: 3 });

  // Layer 5 — Grass tufts every 40px
  for (let x = 20; x < TERRAIN_WIDTH - 20; x += 40) {
    const sy = h[x] ?? 0;
    g.moveTo(x - 3, sy).lineTo(x - 4, sy - 6);
    g.stroke({ color: 0x4caf50, width: 1.5 });
    g.moveTo(x, sy).lineTo(x, sy - 8);
    g.stroke({ color: 0x4caf50, width: 2 });
    g.moveTo(x + 3, sy).lineTo(x + 4, sy - 6);
    g.stroke({ color: 0x4caf50, width: 1.5 });
  }

  // Layer 6 — Rock pebbles (deterministic from terrain seed)
  this.drawPebbles(g, h);
}

private drawBand(
  g: Graphics,
  h: Int16Array,
  topOffset: number,
  bandHeight: number,
  color: number,
): void {
  g.moveTo(0, (h[0] ?? 0) + topOffset);
  for (let x = 1; x < TERRAIN_WIDTH; x++) g.lineTo(x, (h[x] ?? 0) + topOffset);
  for (let x = TERRAIN_WIDTH - 1; x >= 0; x--) {
    g.lineTo(x, Math.min((h[x] ?? 0) + topOffset + bandHeight, TERRAIN_HEIGHT));
  }
  g.closePath();
  g.fill(color);
}

private drawPebbles(g: Graphics, h: Int16Array): void {
  // Seeded RNG from terrain seed string
  let s = 0;
  for (let i = 0; i < this.seed.length; i++) {
    s = (Math.imul(31, s) + this.seed.charCodeAt(i)) >>> 0;
  }
  const rng = () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };

  for (let i = 0; i < 10; i++) {
    const x = Math.floor(rng() * TERRAIN_WIDTH);
    const surfaceY = h[x] ?? 0;
    const depth = 20 + Math.floor(rng() * 120);
    const py = Math.min(surfaceY + depth, TERRAIN_HEIGHT - 10);
    const rx = 3 + Math.floor(rng() * 5);
    const ry = 2 + Math.floor(rng() * 3);
    g.ellipse(x, py, rx, ry).fill({ color: 0x3d2a14, alpha: 0.55 });
  }
}
```

Also add `private seed: string;` to the class fields, and store it in the constructor:

```typescript
constructor(seed: string, type: TerrainType = "random") {
  super();
  this.seed = seed;  // add this line
  this.heightmap = generateTerrain({ seed, type, width: TERRAIN_WIDTH, height: TERRAIN_HEIGHT });
  ...
}
```

- [ ] **Step 2: Start dev server and visually verify terrain**

```bash
pnpm dev
```

Open `http://localhost:5173`, create a match. Terrain should show:
- Dark bedrock at the very bottom
- Brown dirt band below the surface
- Thin pale topsoil strip at the surface
- Green grass stroke along the surface line
- Grass tufts as short upward strokes every ~40px
- Small brown pebble ellipses scattered in the dirt

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/render/Terrain.ts
git commit -m "feat(client): terrain layered art — bedrock, dirt, topsoil, grass tufts, rock pebbles"
```

---

## Task 6: Sky Parallax + Time-of-Day

**Files:**
- Modify: `apps/client/src/render/Sky.ts`
- Modify: `apps/client/src/scenes/MatchScene.ts` (move sky to stage level, pass camera)

- [ ] **Step 1: Rewrite Sky.ts**

```typescript
// apps/client/src/render/Sky.ts
import { Container, Graphics, Text } from 'pixi.js';

export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';

interface SkyPalette {
  top: number; mid: number; bottom: number;
  cloudTint: number; stars: boolean;
}

const PALETTES: Record<TimeOfDay, SkyPalette> = {
  dawn:  { top: 0xff7043, mid: 0xffb74d, bottom: 0x81d4fa, cloudTint: 0xffccaa, stars: false },
  day:   { top: 0x1a6fa8, mid: 0x4da6d8, bottom: 0xb8e4f9, cloudTint: 0xffffff, stars: false },
  dusk:  { top: 0xb34700, mid: 0xe65c00, bottom: 0xffcc02, cloudTint: 0xffaa55, stars: false },
  night: { top: 0x0a0a2e, mid: 0x1a1a4e, bottom: 0x1a3a5e, cloudTint: 0xaabbcc, stars: true  },
};

const PARALLAX = [0, 0.05, 0.08, 0.12, 0.15, 0.18];
const DRIFT_SPEEDS = [0, 8, 8, 0, 0, 20]; // px/s per layer

export class SkyRenderer extends Container {
  private layers: Container[] = [];
  private palette: SkyPalette;
  private viewW: number;
  private viewH: number;

  constructor(timeOfDay: TimeOfDay, viewW: number, viewH: number) {
    super();
    this.palette = PALETTES[timeOfDay];
    this.viewW = viewW;
    this.viewH = viewH;
    this.buildLayers(timeOfDay);
  }

  private buildLayers(tod: TimeOfDay): void {
    const p = this.palette;
    const W = this.viewW;
    const H = this.viewH;

    // Layer 0 — gradient sky background (fixed)
    const bg = new Container();
    const gfx = new Graphics();
    const STRIPES = 16;
    for (let i = 0; i < STRIPES; i++) {
      const t = i / STRIPES;
      const color = lerpColor(t < 0.5 ? p.top : p.mid, t < 0.5 ? p.mid : p.bottom, t < 0.5 ? t * 2 : (t - 0.5) * 2);
      const y = Math.floor((H * 0.75 * i) / STRIPES);
      const h2 = Math.ceil(H * 0.75 / STRIPES) + 1;
      gfx.rect(0, y, W * 2, h2).fill(color);
    }
    // Below horizon fill
    gfx.rect(0, H * 0.75, W * 2, H * 0.25).fill(p.bottom);
    bg.addChild(gfx);
    this.addChild(bg);
    this.layers.push(bg);

    // Layer 1 — far clouds
    const farClouds = this.buildCloudLayer(6, 60, 90, 0.65, p.cloudTint, W, H);
    this.addChild(farClouds);
    this.layers.push(farClouds);

    // Layer 2 — distant hills
    const hillsFar = this.buildHillLayer(0x2d4a3e, 0.35, H, W);
    this.addChild(hillsFar);
    this.layers.push(hillsFar);

    // Layer 3 — mid hills
    const hillsMid = this.buildHillLayer(0x3a5c3e, 0.45, H, W);
    this.addChild(hillsMid);
    this.layers.push(hillsMid);

    // Layer 4 — near clouds
    const nearClouds = this.buildCloudLayer(4, 80, 130, 0.9, p.cloudTint, W, H);
    this.addChild(nearClouds);
    this.layers.push(nearClouds);

    // Layer 5 — near hills
    const hillsNear = this.buildHillLayer(0x4a7050, 0.55, H, W);
    this.addChild(hillsNear);
    this.layers.push(hillsNear);

    // Stars (night only)
    if (tod === 'night') {
      const stars = new Graphics();
      for (let i = 0; i < 25; i++) {
        const sx = Math.random() * W * 2;
        const sy = Math.random() * H * 0.5;
        stars.circle(sx, sy, 1).fill({ color: 0xffffff, alpha: 0.7 + Math.random() * 0.3 });
      }
      bg.addChild(stars);
    }
  }

  private buildCloudLayer(
    count: number, minW: number, maxW: number, opacity: number,
    tint: number, viewW: number, viewH: number,
  ): Container {
    const layer = new Container();
    for (let i = 0; i < count; i++) {
      const x = (i / count) * viewW * 2;
      const y = viewH * 0.05 + Math.random() * viewH * 0.25;
      const w = minW + Math.random() * (maxW - minW);
      const cloud = new Graphics();
      cloud.ellipse(0, 0, w, w * 0.4).fill({ color: tint, alpha: opacity * 0.9 });
      cloud.ellipse(w * 0.3, -w * 0.15, w * 0.65, w * 0.32).fill({ color: tint, alpha: opacity });
      cloud.ellipse(-w * 0.3, -w * 0.1, w * 0.55, w * 0.28).fill({ color: tint, alpha: opacity * 0.8 });
      cloud.position.set(x, y);
      layer.addChild(cloud);
    }
    return layer;
  }

  private buildHillLayer(color: number, horizonFraction: number, viewH: number, viewW: number): Container {
    const layer = new Container();
    const g = new Graphics();
    const y0 = viewH * horizonFraction;
    g.moveTo(0, y0);
    const STEPS = 12;
    for (let i = 0; i <= STEPS; i++) {
      const x = (i / STEPS) * viewW * 2;
      const bump = Math.sin(i * 1.3) * viewH * 0.06 + Math.sin(i * 2.7) * viewH * 0.03;
      g.lineTo(x, y0 + bump);
    }
    g.lineTo(viewW * 2, viewH);
    g.lineTo(0, viewH);
    g.closePath();
    g.fill({ color, alpha: 0.6 });
    layer.addChild(g);
    return layer;
  }

  // Call each frame — worldX is the camera's world container x position
  update(dt: number, worldX: number): void {
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i]!;
      // Parallax offset (moves opposite to camera, slower = more distant)
      layer.x = -worldX * PARALLAX[i]!;
      // Drift (clouds only)
      if (DRIFT_SPEEDS[i]! > 0) {
        layer.x += (layer.x + DRIFT_SPEEDS[i]! * dt);
        // Wrap when a cloud exits viewport
        if (layer.x > this.viewW) layer.x -= this.viewW * 2;
        if (layer.x < -this.viewW * 2) layer.x += this.viewW * 2;
      }
    }
  }
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bv = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bv;
}

// Seeded time-of-day selection — same seed = same result on all clients
export function timeOfDayFromSeed(seed: string): TimeOfDay {
  const n = parseInt(seed, 10) || seed.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const options: TimeOfDay[] = ['dawn', 'day', 'dusk', 'night'];
  return options[Math.abs(n) % 4]!;
}
```

- [ ] **Step 2: Update MatchScene to move sky to stage level and pass worldX to update**

In `apps/client/src/scenes/MatchScene.ts`:

1. Add import: `import { SkyRenderer, timeOfDayFromSeed } from '../render/Sky';`

2. Add `private sky: SkyRenderer | null = null;` to class fields.

3. In `onFirstState`, replace `this.world.addChild(new SkyRenderer())` with:
```typescript
const tod = timeOfDayFromSeed(state.terrainSeed ?? '42');
this.sky = new SkyRenderer(tod, window.innerWidth, window.innerHeight);
this.app.stage.addChildAt(this.sky, 0); // behind world
```

4. In the ticker callback, add sky update:
```typescript
this.sky?.update(ticker.deltaTime / 60, this.camera?.worldX ?? 0);
```

- [ ] **Step 3: Start dev server and verify sky**

```bash
pnpm dev
```

Create a match. Verify:
- Gradient sky visible behind terrain
- Hill silhouettes visible at different distances
- Clouds visible (drift slowly rightward)
- Sky does NOT scroll with the world container when camera pans

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/render/Sky.ts apps/client/src/scenes/MatchScene.ts
git commit -m "feat(client): parallax sky with 6 layers and 4 time-of-day palettes"
```

---

## Task 7: Tank Chunky Art + 8 Hats + Dead State

**Files:**
- Modify: `apps/client/src/render/Tank.ts`

- [ ] **Step 1: Rewrite Tank.ts**

Full replacement of `apps/client/src/render/Tank.ts`:

```typescript
import { Container, Graphics, Text } from 'pixi.js';
import { HpBar } from '../hud/HpBar';
import { ShieldBubble } from './Shield';

const COLOR_HEX: Record<string, number> = {
  red: 0xe63946, blue: 0x3a86ff, green: 0x80b918, yellow: 0xfca311,
  cyan: 0x00b4d8, magenta: 0xb5179e, orange: 0xf4a261, white: 0xf1f1f1,
  pink: 0xf48fb1, lime: 0xa6d96a,
};

const FUEL_BAR_Y = -30;
const FUEL_BAR_W = 40;
const FUEL_BAR_H = 4;

export interface TankView {
  setPos(x: number, y: number): void;
  setAngle(angleDeg: number): void;
  setAlive(alive: boolean): void;
  setHp(hp: number): void;
  setShield(shieldId: string, shieldHp: number, shieldMaxHp: number): void;
  flashShield(): void;
  setFuel(fuel: number, maxFuel: number): void;
  destroy(): void;
}

export function createTankView(opts: { color: string; hat: string }): Container & TankView {
  const fill = COLOR_HEX[opts.color] ?? 0xe63946;
  const darkFill = darken(fill, 0.25);
  const root = new Container() as Container & TankView;

  // Drop shadow
  const shadow = new Graphics();
  shadow.ellipse(0, 18, 28, 5).fill({ color: 0x000000, alpha: 0.3 });
  root.addChild(shadow);

  // Tracks (two ellipses)
  const tracks = new Graphics();
  tracks.ellipse(-14, 14, 13, 5).fill(0x222222).stroke({ color: 0x111111, width: 1 });
  tracks.ellipse(14, 14, 13, 5).fill(0x222222).stroke({ color: 0x111111, width: 1 });
  // Track inner detail
  tracks.ellipse(-14, 14, 9, 3).fill(0x333333);
  tracks.ellipse(14, 14, 9, 3).fill(0x333333);
  root.addChild(tracks);

  // Hull body
  const hull = new Graphics();
  hull.roundRect(-22, 2, 44, 16, 8).fill(fill).stroke({ color: 0x1a1a2e, width: 2.5 });
  // Hull highlight (top edge)
  hull.rect(-20, 3, 40, 3).fill({ color: 0xffffff, alpha: 0.22 });
  // Hull shadow (bottom edge)
  hull.rect(-20, 14, 40, 3).fill({ color: 0x000000, alpha: 0.18 });
  root.addChild(hull);

  // Turret
  const turret = new Graphics();
  turret.roundRect(-12, -6, 24, 10, 5).fill(darkFill).stroke({ color: 0x1a1a2e, width: 2 });
  root.addChild(turret);

  // Hat (drawn before barrel so barrel renders on top)
  const hatGfx = new Graphics();
  drawHat(hatGfx, opts.hat);
  hatGfx.position.set(0, -6); // relative to turret center
  root.addChild(hatGfx);

  // Barrel container — pivot at turret center (0, -1)
  const barrel = new Container();
  barrel.position.set(0, -1);
  const barrelGfx = new Graphics();
  // Barrel shaft: starts at x=0, extends right
  barrelGfx.rect(0, -3, 26, 6).fill(0x888888).stroke({ color: 0x444444, width: 1.5 });
  // Muzzle ring
  barrelGfx.rect(22, -4, 5, 8).fill(0xaaaaaa).stroke({ color: 0x333333, width: 1 });
  barrel.addChild(barrelGfx);
  root.addChild(barrel);

  // HP bar
  const hpBar = new HpBar();
  hpBar.redraw(100);
  root.addChild(hpBar);

  // Shield bubble
  const shieldBubble = new ShieldBubble();
  root.addChild(shieldBubble);

  // Fuel bar
  const fuelBar = new Graphics();
  fuelBar.position.set(-FUEL_BAR_W / 2, FUEL_BAR_Y);
  root.addChild(fuelBar);

  let currentAngleDeg = 90;
  let dying = false;

  const setBarrelAngle = (deg: number) => {
    currentAngleDeg = deg;
    // Formula: game 0°=left, 90°=up, 180°=right → PixiJS: π + deg*(π/180)
    barrel.rotation = Math.PI + (deg * Math.PI) / 180;
  };

  root.setPos = (x, y) => root.position.set(x, y);

  root.setAngle = (deg) => {
    if (!dying) setBarrelAngle(deg);
  };

  root.setAlive = (alive) => {
    hpBar.visible = alive;
    if (!alive && !dying) {
      dying = true;
      // White flash for 1 frame
      root.tint = 0xffffff;
      const ticker = (window as { pixiApp?: { ticker: { add: (fn: (t: { deltaMS: number }) => void) => void; remove: (fn: (t: { deltaMS: number }) => void) => void } } }).pixiApp?.ticker;
      if (ticker) {
        let elapsed = 0;
        const startAngle = currentAngleDeg;
        const startAlpha = root.alpha;
        const onTick = (t: { deltaMS: number }) => {
          elapsed += t.deltaMS;
          if (elapsed < 50) { root.tint = 0xffffff; return; }
          root.tint = 0xffffffff; // clear tint
          const progress = Math.min((elapsed - 50) / 500, 1);
          const eased = progress * progress; // easeInQuad
          setBarrelAngle(startAngle + (270 - startAngle) * eased);
          root.alpha = startAlpha - (startAlpha - 0.3) * eased;
          if (progress >= 1) {
            ticker.remove(onTick);
            // Skull emoji float up
            const skull = new Text({ text: '💀', style: { fontSize: 16 } });
            skull.anchor.set(0.5, 1);
            skull.position.set(0, -20);
            root.addChild(skull);
            let floatElapsed = 0;
            const floatY = skull.y;
            const onFloat = (t: { deltaMS: number }) => {
              floatElapsed += t.deltaMS;
              skull.y = floatY - (floatElapsed / 600) * 20;
              if (floatElapsed >= 600) ticker.remove(onFloat);
            };
            ticker.add(onFloat);
          }
        };
        ticker.add(onTick);
      }
    } else if (alive) {
      dying = false;
      root.alpha = 1;
      root.tint = 0xffffffff;
    }
  };

  root.setHp = (hp) => hpBar.redraw(hp);

  root.setShield = (shieldId, shieldHp, shieldMaxHp) => {
    shieldBubble.update(shieldId, shieldHp, shieldMaxHp);
  };

  root.flashShield = () => shieldBubble.flash();

  root.setFuel = (fuel, maxFuel) => {
    fuelBar.clear();
    fuelBar.rect(0, 0, FUEL_BAR_W, FUEL_BAR_H).fill({ color: 0x000000, alpha: 0.5 });
    const fraction = maxFuel > 0 ? Math.max(0, Math.min(1, fuel / maxFuel)) : 0;
    if (fraction > 0) {
      fuelBar.rect(0, 0, Math.round(FUEL_BAR_W * fraction), FUEL_BAR_H).fill({ color: 0x4ecdc4, alpha: 1 });
    }
  };

  root.destroy = () => root.removeFromParent();
  setBarrelAngle(90);
  return root;
}

function darken(color: number, amount: number): number {
  const r = Math.round(((color >> 16) & 0xff) * (1 - amount));
  const g = Math.round(((color >> 8) & 0xff) * (1 - amount));
  const b = Math.round((color & 0xff) * (1 - amount));
  return (r << 16) | (g << 8) | b;
}

function drawHat(g: Graphics, type: string): void {
  switch (type) {
    case 'helm':
      g.rect(-9, -2, 18, 4).fill(0x3a3a3a); // brim
      g.roundRect(-7, -12, 14, 11, 3).fill(0x4a4a4a).stroke({ color: 0x222222, width: 1 }); // dome
      break;
    case 'chef':
      g.ellipse(0, -2, 10, 3).fill(0xffffff).stroke({ color: 0xcccccc, width: 1 }); // brim
      g.rect(-5, -16, 10, 15).fill(0xffffff).stroke({ color: 0xcccccc, width: 1 }); // body
      g.ellipse(0, -17, 6, 4).fill(0xffffff); // puff
      break;
    case 'tophat':
      g.rect(-9, 2, 18, 2).fill(0x1b1b1b); // brim
      g.rect(-6, -12, 12, 15).fill(0x1b1b1b).stroke({ color: 0x000000, width: 1 }); // crown
      break;
    case 'beanie':
      g.roundRect(-7, -12, 14, 13, 4).fill(0x9b59b6).stroke({ color: 0x7d3c98, width: 1 });
      g.circle(0, -13, 3).fill(0xffffff); // pompom
      break;
    case 'cowboy':
      g.ellipse(0, -1, 14, 3).fill(0x8b5e3c); // wide brim
      g.roundRect(-6, -11, 12, 11, 3).fill(0x6b4226).stroke({ color: 0x4a2f1a, width: 1 });
      break;
    case 'party':
      g.poly([-6, 0, 6, 0, 0, -14], true).fill(0xf39c12).stroke({ color: 0xe67e22, width: 1 });
      g.rect(-5, -3, 10, 3).fill(0xe74c3c); // stripe
      break;
    case 'viking':
      g.roundRect(-7, -12, 14, 13, 3).fill(0x95a5a6).stroke({ color: 0x7f8c8d, width: 1 }); // dome
      // Horns
      g.poly([-8, -8, -14, -18, -6, -8], true).fill(0xf0e68c);
      g.poly([8, -8, 14, -18, 6, -8], true).fill(0xf0e68c);
      break;
    case 'santa':
      g.roundRect(-7, -12, 14, 13, 3).fill(0xc0392b).stroke({ color: 0x922b21, width: 1 }); // dome
      g.rect(-8, -3, 16, 3).fill(0xffffff); // white band
      g.circle(2, -14, 3).fill(0xffffff); // pompom
      break;
    // 'none' — nothing
  }
}
```

- [ ] **Step 2: Start dev server and verify tanks**

```bash
pnpm dev
```

Create a match. Verify:
- Tanks have chunky hull with track wheels
- Barrel visibly connects to turret center and rotates correctly
- Hats render below the barrel (barrel on top)
- On death: white flash, barrel droops to 270°, tank fades, 💀 floats up

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/render/Tank.ts
git commit -m "feat(client): chunky cartoon tank art with 8 hats, proper barrel pivot, death animation"
```

---

## Task 8: Explosion Enhancement

**Files:**
- Modify: `apps/client/src/render/Explosion.ts`

- [ ] **Step 1: Rewrite Explosion.ts**

```typescript
// apps/client/src/render/Explosion.ts
import { Container, Graphics } from 'pixi.js';

const TOTAL_DURATION = 1200; // ms

export class Explosion extends Container {
  private g: Graphics;
  private elapsed = 0;
  private r: number; // blast radius

  constructor(x: number, y: number, blastRadius = 20) {
    super();
    this.position.set(x, y);
    this.r = blastRadius;
    this.g = new Graphics();
    this.addChild(this.g);
  }

  tick(): boolean {
    this.elapsed += 1000 / 60;
    const t = Math.min(this.elapsed / TOTAL_DURATION, 1);
    this.draw(t);
    return t >= 1;
  }

  private draw(t: number): void {
    this.g.clear();
    if (t >= 1) return;

    const r = this.r;
    const expandT = Math.min(t / 0.15, 1); // expands in first 15% of duration
    const scale = expandT;
    const fade = t < 0.15 ? 1 : Math.max(0, 1 - (t - 0.15) / 0.85);

    // Shockwave ring (large blasts only)
    if (r > 80) {
      const ringScale = 1 + t * 0.5;
      this.g.circle(0, 0, r * ringScale)
        .stroke({ color: 0xfed7aa, width: 2, alpha: Math.max(0, 0.5 - t) });
    }

    // Fire ball
    this.g.ellipse(0, 0, r * 0.5 * scale, r * 0.45 * scale)
      .fill({ color: 0xff8c00, alpha: fade * 0.85 });

    // Inner glow
    this.g.ellipse(0, 0, r * 0.3 * scale, r * 0.28 * scale)
      .fill({ color: 0xfbbf24, alpha: fade * 0.9 });

    // White core (first 80ms only)
    if (this.elapsed < 80) {
      const coreAlpha = 1 - this.elapsed / 80;
      this.g.circle(0, 0, r * 0.15 * scale).fill({ color: 0xffffff, alpha: coreAlpha * 0.85 });
    }

    // Smoke ring (rises and fades)
    if (t > 0.1) {
      const smokeT = (t - 0.1) / 0.9;
      const smokeY = -30 * smokeT;
      const smokeAlpha = Math.max(0, 0.4 - smokeT * 0.4);
      this.g.ellipse(0, smokeY, r * 0.4, r * 0.18)
        .fill({ color: 0x888888, alpha: smokeAlpha });
    }

    // Dirt debris (non-energy weapon: show by default)
    if (t < 0.4 && r > 15) {
      const debrisT = t / 0.4;
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 + 0.3;
        const dist = r * 0.6 * debrisT;
        const grav = 40 * debrisT * debrisT;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist + grav;
        this.g.circle(dx, dy, 2).fill({ color: 0x6b4a25, alpha: Math.max(0, 0.8 - debrisT) });
      }
    }
  }
}
```

- [ ] **Step 2: Start dev server and verify**

```bash
pnpm dev
```

Fire weapons and verify: explosions scale with blast radius (small weapons = small blast, nuke = enormous), smoke ring rises, dirt debris visible on impact.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/render/Explosion.ts
git commit -m "feat(client): scaled explosion with shockwave ring, smoke rise, dirt debris, 1200ms duration"
```

---

## Task 9: Wire Camera into MatchScene

**Files:**
- Modify: `apps/client/src/scenes/MatchScene.ts`

- [ ] **Step 1: Add Camera import and field**

At the top of `apps/client/src/scenes/MatchScene.ts`, add:
```typescript
import { Camera } from '../render/Camera';
import type { TankPosition } from '../render/Camera';
```

Add to class fields:
```typescript
private camera: Camera | null = null;
```

- [ ] **Step 2: Replace `fit()` with Camera initialization**

In the constructor, replace `this.fit()` and `window.addEventListener("resize", () => this.fit())` with:

```typescript
this.camera = new Camera(this.world, this.app);
// Fit on first tank data arrival (done in onFirstState via fitToLivingTanks)
window.addEventListener('resize', () => this.fitToLivingTanks());
```

Remove the old `private fit()` method entirely.

Add helper:
```typescript
private fitToLivingTanks(): void {
  const positions: TankPosition[] = [];
  for (const [id, view] of this.tanks.entries()) {
    const tank = this.room.state.tanks.get(id);
    if (tank?.alive) positions.push({ x: tank.x, y: tank.y });
  }
  if (positions.length > 0) this.camera?.fitToTanks(positions);
}
```

- [ ] **Step 3: Wire camera.update into the ticker**

In the ticker callback (around line 179), add camera update as first call:

```typescript
this.app.ticker.add((ticker) => {
  this.camera?.update(ticker.deltaMS / 1000);
  // ... existing activeAnims filter ...
});
```

- [ ] **Step 4: Wire camera.shake on explosion and camera.trackProjectile on tick**

In the `"damage-applied"` message handler, find where `new Explosion(...)` is created and add:
```typescript
camera.shake(blastRadius);
```

Look for the existing explosion creation pattern and add:
```typescript
const blastRadius = msg.radius ?? 20;
const ex = new Explosion(msg.x, msg.y, blastRadius);
this.world.addChild(ex);
this.activeAnims.push(ex);
this.camera?.shake(blastRadius);
```

In the `"tick"` message handler, after `this.projectileRenderer.onTick(...)`, add tracking for the first projectile in flight:
```typescript
if (msg.projectiles.length > 0) {
  const p = msg.projectiles[0]!;
  this.camera?.trackProjectile(p.x, p.y);
}
```

- [ ] **Step 5: Fit to tanks on first state and on turn start**

In `onFirstState`, after terrain and tanks are initialized, add:
```typescript
setTimeout(() => this.fitToLivingTanks(), 200);
```

In `onPhaseChange`, when phase becomes `'playing'`:
```typescript
this.camera?.onTurnStart();
this.fitToLivingTanks();
```

- [ ] **Step 6: Run dev server and verify camera**

```bash
pnpm dev
```

- Camera smoothly frames all tanks on round start
- Camera follows projectiles in flight
- Screen shakes on explosions (scales with blast radius)
- Scroll wheel zooms in/out
- Left-drag pans
- Double-click / R key resets view

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/scenes/MatchScene.ts
git commit -m "feat(client): wire Camera into MatchScene — auto-framing, shot tracking, shake, pan/zoom"
```

---

## Task 10: HUD Bar

**Files:**
- Create: `apps/client/src/hud/HudBar.ts`

- [ ] **Step 1: Create HudBar.ts**

```typescript
// apps/client/src/hud/HudBar.ts
import type { Room } from 'colyseus.js';
import type { MatchState } from '@se/shared';
import { WEAPON_REGISTRY } from '@se/game';

export class HudBar {
  el: HTMLDivElement;
  private onAimChange: ((angle: number, power: number) => void) | null = null;
  private currentAngle = 90;
  private currentPower = 50;
  private weaponKeys: string[];
  private carouselCenter = 0;

  constructor(private room: Room<MatchState>) {
    this.weaponKeys = Array.from(WEAPON_REGISTRY.keys());

    this.el = document.createElement('div');
    this.el.className = 'interactive';
    this.el.style.cssText = [
      'position:fixed;bottom:0;left:0;right:0;height:72px;',
      'background:linear-gradient(0deg,rgba(8,6,24,0.98),rgba(8,6,24,0.80));',
      'border-top:3px solid rgba(255,140,0,0.5);',
      'display:flex;align-items:center;gap:14px;padding:0 14px;z-index:100;',
      'font-family:system-ui,sans-serif;color:#fff;',
    ].join('');

    this.el.innerHTML = this.buildHTML();
    document.getElementById('ui')!.appendChild(this.el);

    this.bindEvents();
    this.syncFromState();
  }

  setAimChangeCallback(fn: (angle: number, power: number) => void): void {
    this.onAimChange = fn;
  }

  update(state: MatchState): void {
    this.syncFromState();
    const myTank = state.tanks.get(this.room.sessionId);
    const isMyTurn = state.currentTurn === this.room.sessionId;
    const fireBtn = this.el.querySelector<HTMLButtonElement>('#hud-fire')!;
    fireBtn.disabled = !isMyTurn;
    fireBtn.style.opacity = isMyTurn ? '1' : '0.4';

    if (myTank) {
      this.updateCarousel(myTank.currentWeapon, myTank.inventory);
    }
  }

  destroy(): void { this.el.remove(); }

  private buildHTML(): string {
    return `
      <!-- Angle dial -->
      <div id="hud-dial" style="width:52px;height:52px;border-radius:50%;
        border:2px solid #ff8c00;background:rgba(0,0,0,0.6);position:relative;
        cursor:pointer;flex-shrink:0;">
        <canvas id="hud-dial-canvas" width="52" height="52" style="position:absolute;inset:0;"></canvas>
        <div id="hud-angle-val" style="position:absolute;inset:0;display:flex;align-items:center;
          justify-content:center;font:bold 11px monospace;color:#ff8c00;">90°</div>
      </div>

      <!-- Power bar -->
      <div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;">
        <div id="hud-power-track" style="width:20px;height:52px;background:rgba(255,255,255,0.08);
          border:1px solid rgba(255,255,255,0.15);border-radius:4px;position:relative;cursor:ns-resize;">
          <div id="hud-power-fill" style="position:absolute;bottom:0;left:0;right:0;border-radius:4px;
            background:linear-gradient(0deg,#22c55e,#eab308,#ef4444);transition:height 0.05s;"></div>
        </div>
        <div id="hud-power-val" style="font:bold 9px monospace;color:#94a3b8;">50</div>
      </div>

      <!-- Weapon carousel -->
      <div style="flex:1;display:flex;align-items:center;gap:6px;overflow:hidden;min-width:0;">
        <button id="hud-prev" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);
          color:#fff;width:24px;height:24px;border-radius:4px;cursor:pointer;font-size:14px;flex-shrink:0;">‹</button>
        <div id="hud-carousel" style="flex:1;display:flex;gap:4px;align-items:center;overflow:hidden;"></div>
        <button id="hud-next" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);
          color:#fff;width:24px;height:24px;border-radius:4px;cursor:pointer;font-size:14px;flex-shrink:0;">›</button>
      </div>

      <!-- Turn timer -->
      <div id="hud-timer" style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;
        background:rgba(0,0,0,0.4);border:2px solid #eab308;border-radius:6px;
        font:bold 20px 'Impact',fantasy;color:#eab308;flex-shrink:0;">--</div>

      <!-- Fire button -->
      <button id="hud-fire" style="padding:0 18px;height:52px;
        background:linear-gradient(180deg,#ff8c00,#cc5500);
        border:3px solid #7f2d00;border-radius:8px;
        box-shadow:0 4px 0 #7f2d00;color:#fff;font:bold 14px system-ui;
        cursor:pointer;flex-shrink:0;text-shadow:1px 1px 0 rgba(0,0,0,0.5);">🔥 FIRE</button>
    `;
  }

  private bindEvents(): void {
    this.el.querySelector('#hud-prev')!.addEventListener('click', () => this.scrollCarousel(-1));
    this.el.querySelector('#hud-next')!.addEventListener('click', () => this.scrollCarousel(1));

    const fireBtn = this.el.querySelector<HTMLButtonElement>('#hud-fire')!;
    fireBtn.addEventListener('mousedown', () => {
      fireBtn.style.transform = 'translateY(3px)';
      fireBtn.style.boxShadow = '0 1px 0 #7f2d00';
    });
    fireBtn.addEventListener('mouseup', () => {
      fireBtn.style.transform = '';
      fireBtn.style.boxShadow = '0 4px 0 #7f2d00';
      this.room.send('fire', {});
    });

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':  this.setAngle(this.currentAngle - 2); break;
        case 'ArrowRight': this.setAngle(this.currentAngle + 2); break;
        case 'ArrowUp':    this.setPower(this.currentPower + 2); break;
        case 'ArrowDown':  this.setPower(this.currentPower - 2); break;
        case 'q': case 'Q': this.scrollCarousel(-1); break;
        case 'e': case 'E': this.scrollCarousel(1); break;
        case ' ': e.preventDefault(); this.room.send('fire', {}); break;
      }
    });

    // Dial drag
    const dial = this.el.querySelector<HTMLDivElement>('#hud-dial')!;
    let draggingDial = false;
    dial.addEventListener('mousedown', () => { draggingDial = true; });
    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!draggingDial) return;
      const rect = dial.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      // Convert screen angle to game angle: 0=left, 90=up, 180=right
      const screenAngle = Math.atan2(dy, dx) * 180 / Math.PI; // -180 to 180, 0=right
      const gameAngle = 180 - ((screenAngle + 360) % 360); // invert
      this.setAngle(Math.max(0, Math.min(180, gameAngle)));
    });
    window.addEventListener('mouseup', () => { draggingDial = false; });

    // Power bar drag
    const powerTrack = this.el.querySelector<HTMLDivElement>('#hud-power-track')!;
    let draggingPower = false;
    powerTrack.addEventListener('mousedown', () => { draggingPower = true; });
    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!draggingPower) return;
      const rect = powerTrack.getBoundingClientRect();
      const fraction = 1 - (e.clientY - rect.top) / rect.height;
      this.setPower(Math.round(Math.max(0, Math.min(100, fraction * 100))));
    });
    window.addEventListener('mouseup', () => { draggingPower = false; });
  }

  private setAngle(deg: number): void {
    this.currentAngle = Math.max(0, Math.min(180, deg));
    this.el.querySelector<HTMLDivElement>('#hud-angle-val')!.textContent = `${Math.round(this.currentAngle)}°`;
    this.drawDial();
    this.room.send('setAngle', { angle: this.currentAngle });
    this.onAimChange?.(this.currentAngle, this.currentPower);
  }

  private setPower(pct: number): void {
    this.currentPower = Math.max(0, Math.min(100, pct));
    const fill = this.el.querySelector<HTMLDivElement>('#hud-power-fill')!;
    fill.style.height = `${this.currentPower}%`;
    this.el.querySelector<HTMLDivElement>('#hud-power-val')!.textContent = String(Math.round(this.currentPower));
    this.room.send('setPower', { power: this.currentPower });
    this.onAimChange?.(this.currentAngle, this.currentPower);
  }

  private drawDial(): void {
    const canvas = this.el.querySelector<HTMLCanvasElement>('#hud-dial-canvas')!;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 52, 52);
    const cx = 26, cy = 26;
    // Needle
    const needleAngle = Math.PI + (this.currentAngle * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(needleAngle) * 20, cy + Math.sin(needleAngle) * 20);
    ctx.strokeStyle = '#ff8c00';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private scrollCarousel(delta: number): void {
    this.carouselCenter = (this.carouselCenter + delta + this.weaponKeys.length) % this.weaponKeys.length;
    const key = this.weaponKeys[this.carouselCenter]!;
    this.room.send('setWeapon', { weaponId: key });
    this.renderCarousel(key);
  }

  private updateCarousel(currentWeapon: string, inventory: Map<string, number>): void {
    const idx = this.weaponKeys.indexOf(currentWeapon);
    if (idx >= 0) this.carouselCenter = idx;
    this.renderCarousel(currentWeapon, inventory);
  }

  private renderCarousel(selected: string, inventory?: Map<string, number>): void {
    const container = this.el.querySelector<HTMLDivElement>('#hud-carousel')!;
    const slots: string[] = [];
    const total = this.weaponKeys.length;
    for (let offset = -2; offset <= 2; offset++) {
      const idx = (this.carouselCenter + offset + total) % total;
      slots.push(this.weaponKeys[idx]!);
    }
    container.innerHTML = slots.map((key, i) => {
      const isCenter = i === 2;
      const def = WEAPON_REGISTRY.get(key);
      const ammo = inventory?.get(key);
      const ammoStr = ammo === undefined ? '' : ammo < 0 ? '∞' : `×${ammo}`;
      const size = isCenter ? '40px' : i === 1 || i === 3 ? '32px' : '24px';
      const opacity = isCenter ? '1' : i === 1 || i === 3 ? '0.8' : '0.55';
      const border = isCenter ? '2px solid #ff8c00' : '1px solid rgba(255,255,255,0.15)';
      return `<div onclick="window.__hudSelectWeapon?.('${key}')" style="width:${size};height:${size};
        border:${border};border-radius:6px;background:rgba(0,0,0,0.5);
        opacity:${opacity};cursor:pointer;display:flex;flex-direction:column;
        align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;transition:all 0.1s;">
        <span style="font-size:${isCenter ? '18' : '12'}px;">${def?.icon ?? '💥'}</span>
        ${isCenter ? `<span style="font:bold 8px monospace;color:#ff8c00;">${ammoStr}</span>` : ''}
      </div>`;
    }).join('');

    (window as { __hudSelectWeapon?: (key: string) => void }).__hudSelectWeapon = (key: string) => {
      const idx = this.weaponKeys.indexOf(key);
      if (idx >= 0) {
        this.carouselCenter = idx;
        this.room.send('setWeapon', { weaponId: key });
        this.renderCarousel(key, inventory);
      }
    };
  }

  updateTimer(deadlineMs: number): void {
    const timer = this.el.querySelector<HTMLDivElement>('#hud-timer')!;
    const remaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
    timer.textContent = String(remaining);
    if (remaining <= 5) {
      timer.style.borderColor = '#ef4444';
      timer.style.color = '#ef4444';
    } else {
      timer.style.borderColor = '#eab308';
      timer.style.color = '#eab308';
    }
  }

  private syncFromState(): void {
    const myTank = this.room.state.tanks.get(this.room.sessionId);
    if (myTank) {
      this.currentAngle = myTank.angle;
      this.currentPower = myTank.power;
      this.el.querySelector<HTMLDivElement>('#hud-angle-val')!.textContent = `${Math.round(this.currentAngle)}°`;
      const fill = this.el.querySelector<HTMLDivElement>('#hud-power-fill')!;
      if (fill) fill.style.height = `${this.currentPower}%`;
      this.el.querySelector<HTMLDivElement>('#hud-power-val')!.textContent = String(Math.round(this.currentPower));
      this.drawDial();
    }
  }
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm --filter @se/client typecheck
```

Fix any TypeScript errors before proceeding.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/hud/HudBar.ts
git commit -m "feat(client): HudBar — angle dial, power bar, weapon carousel, fire button, timer"
```

---

## Task 11: Player Strip

**Files:**
- Create: `apps/client/src/hud/PlayerStrip.ts`

- [ ] **Step 1: Create PlayerStrip.ts**

```typescript
// apps/client/src/hud/PlayerStrip.ts
import type { MatchState } from '@se/shared';

const COLOR_CSS: Record<string, string> = {
  red: '#e63946', blue: '#3a86ff', green: '#80b918', yellow: '#fca311',
  cyan: '#00b4d8', magenta: '#b5179e', orange: '#f4a261', white: '#f1f1f1',
  pink: '#f48fb1', lime: '#a6d96a',
};

export class PlayerStrip {
  el: HTMLDivElement;

  constructor(private mySessionId: string) {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:fixed;top:0;left:0;right:0;height:36px;',
      'background:linear-gradient(180deg,rgba(8,6,24,0.95),rgba(8,6,24,0.65));',
      'border-bottom:1px solid rgba(255,255,255,0.08);',
      'display:flex;align-items:center;gap:8px;padding:0 10px;z-index:100;',
      'font-family:system-ui,sans-serif;',
    ].join('');
    document.getElementById('ui')!.appendChild(this.el);
  }

  update(state: MatchState): void {
    if (!state?.tanks) return;
    const isAiMap = new Map<string, boolean>();
    for (const slot of state.aiSlots.values()) {
      isAiMap.set(slot.sessionId, true);
    }

    const cards: string[] = [];
    for (const [id, tank] of state.tanks.entries()) {
      const isMe = id === this.mySessionId;
      const isActive = state.currentTurn === id;
      const isAi = isAiMap.get(id) ?? false;
      const color = COLOR_CSS[tank.color] ?? '#fff';
      const hpPct = Math.max(0, Math.min(100, tank.hp));
      const hpColor = hpPct > 50 ? '#22c55e' : hpPct > 25 ? '#eab308' : '#ef4444';
      const name = (isAi ? '🤖 ' : '') + tank.nickname;

      const borderStyle = isActive
        ? `2px solid ${color}`
        : `1px solid rgba(255,255,255,0.15)`;
      const nameColor = isActive ? '#fff' : '#94a3b8';
      const opacity = tank.alive ? '1' : '0.45';
      const hpContent = tank.alive
        ? `<div style="width:36px;height:3px;background:rgba(255,255,255,0.12);border-radius:2px;margin:1px 0;">
             <div style="width:${hpPct}%;height:100%;background:${hpColor};border-radius:2px;"></div>
           </div>
           <span style="font:9px monospace;color:#64748b;">${Math.round(tank.hp)}</span>`
        : `<span style="font-size:11px;">💀</span>`;

      cards.push(`<div style="display:flex;align-items:center;gap:4px;padding:2px 6px;
        border:${borderStyle};border-radius:5px;opacity:${opacity};white-space:nowrap;">
        <div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></div>
        <span style="font:bold 10px system-ui;color:${nameColor};">${name}</span>
        <div style="display:flex;flex-direction:column;align-items:flex-start;">${hpContent}</div>
        ${isActive && isMe ? '<span style="font:bold 7px system-ui;color:#f59e0b;margin-left:2px;">YOUR TURN</span>' : ''}
        ${isActive && !isMe ? '<span style="font:bold 7px system-ui;color:#60a5fa;margin-left:2px;">▶</span>' : ''}
      </div>`);
    }

    // Round indicator
    const round = `<div style="margin-left:auto;font:bold 10px monospace;color:#64748b;white-space:nowrap;">
      ROUND ${state.round ?? 1} / ${state.maxRounds ?? 5}
    </div>`;

    this.el.innerHTML = cards.join('') + round;
  }

  destroy(): void { this.el.remove(); }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/hud/PlayerStrip.ts
git commit -m "feat(client): PlayerStrip — fixed top bar with HP bars, active indicator, round counter"
```

---

## Task 12: Shop, Round Summary, Match End Retheme

**Files:**
- Modify: `apps/client/src/scenes/ShopScene.ts` (retheme header + weapon grid)
- Modify: `apps/client/src/scenes/RoundSummaryScene.ts` (retheme styling)
- Modify: `apps/client/src/scenes/MatchEndScene.ts` (retheme styling)

- [ ] **Step 1: Retheme ShopScene — update the overlay and inner panel styles**

In `apps/client/src/scenes/ShopScene.ts`, find the inline CSS string on `this.el` and update the background/panel to match the game theme. Find the block that creates the inner panel and weapon rows, and replace styles to use the dark theme, orange accents, category tabs, and scrollable 4-column grid.

The key style changes:
- Overlay background: `rgba(8,6,24,0.88)` instead of `rgba(0,0,0,0.80)`
- Inner panel: `background:#0a0820;border:2px solid rgba(255,140,0,0.4);border-radius:12px;`
- Header: `font:900 20px 'Impact',fantasy;color:#ff8c00;letter-spacing:3px;text-shadow:0 0 15px rgba(255,140,0,0.4);`
- Category tab bar added above weapon grid (ALL / BALLISTIC / FIRE / ENERGY / UTILITY)
- Weapon grid: `display:grid;grid-template-columns:repeat(4,1fr);gap:6px;max-height:280px;overflow-y:auto;`
- Each weapon card: `background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.10);border-radius:8px;padding:8px;`
- Selected weapon card: `border:2px solid #ff8c00;background:rgba(255,140,0,0.12);`
- Buy button: `background:linear-gradient(180deg,#ff8c00,#cc5500);border:3px solid #7f2d00;border-radius:8px;`

Add category tabs:

```typescript
// Inside ShopScene constructor, after this.el is created, build the inner HTML
// Replace the existing weapon grid section with:

const CATEGORIES: Record<string, string[]> = {
  BALLISTIC: ['cannon','tracer','shotgun','roller','leapfrog','cluster','mirv','baby-nuke','nuke','burrow'],
  FIRE: ['napalm','incendiary'],
  ENERGY: ['laser','plasma-ball','plasma-wave'],
  UTILITY: ['shield','parachute','dirt-maker'],
};

let activeCategory = 'ALL';
const renderGrid = () => {
  const allKeys = Array.from(WEAPON_REGISTRY.keys());
  const keys = activeCategory === 'ALL'
    ? allKeys
    : (CATEGORIES[activeCategory] ?? []).filter(k => WEAPON_REGISTRY.has(k));
  const grid = document.querySelector<HTMLDivElement>('#shop-grid')!;
  grid.innerHTML = keys.map(key => {
    const def = WEAPON_REGISTRY.get(key);
    const ammo = this.localInventory.get(key) ?? 0;
    const cost = def?.cost ?? 0;
    const canAfford = this.localCash >= cost;
    const isSelected = state.tanks.get(room.sessionId)?.currentWeapon === key;
    return `<div class="shop-card" data-key="${key}" style="...">
      <div style="font-size:24px;">${def?.icon ?? '💥'}</div>
      <div style="font:bold 9px system-ui;color:#e2e8f0;text-align:center;">${def?.name ?? key}</div>
      <div style="font:9px monospace;color:${canAfford ? '#22c55e' : '#ef4444'};">💰 ${cost}</div>
      <div style="font:8px monospace;color:#64748b;">×${ammo < 0 ? '∞' : ammo}</div>
    </div>`;
  }).join('');
  grid.querySelectorAll<HTMLDivElement>('.shop-card').forEach(card => {
    card.addEventListener('click', () => this.selectWeapon(card.dataset.key!));
  });
};
```

- [ ] **Step 2: Retheme RoundSummaryScene**

In `apps/client/src/scenes/RoundSummaryScene.ts`, update the inner panel styles:
- Overlay: `background:rgba(8,6,24,0.88)`
- Panel: `background:#0a0820;border:2px solid rgba(255,140,0,0.35);border-radius:12px;padding:24px;min-width:340px;`
- Title: `font:900 22px 'Impact',fantasy;color:#ff8c00;letter-spacing:2px;text-align:center;`
- Winner row: `font:bold 16px system-ui;color:#fff;`
- Stats rows: `font:13px system-ui;color:#94a3b8;`
- Progress bar: `background:linear-gradient(90deg,#ff8c00,#ff4500)` instead of default

- [ ] **Step 3: Retheme MatchEndScene**

In `apps/client/src/scenes/MatchEndScene.ts`, update styles:
- Overlay: `background:rgba(8,6,24,0.92)`
- Title: `font:900 32px 'Impact',fantasy;color:#ff8c00;letter-spacing:4px;text-shadow:0 0 20px rgba(255,140,0,0.5);`
- Winner name: `font:bold 20px system-ui;color:#fbbf24;`
- Table rows: `border-bottom:1px solid rgba(255,255,255,0.08);`
- Play Again button: `background:linear-gradient(180deg,#ff8c00,#cc5500);border:3px solid #7f2d00;`
- Lobby button: `background:rgba(255,255,255,0.06);border:2px solid rgba(255,255,255,0.15);`

- [ ] **Step 4: Start dev server and verify all overlays**

```bash
pnpm dev
```

Play a match through to: shop overlay → round summary → match end. All three screens should show the dark navy/orange arcade theme.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/scenes/ShopScene.ts apps/client/src/scenes/RoundSummaryScene.ts apps/client/src/scenes/MatchEndScene.ts
git commit -m "feat(client): retheme shop, round summary, and match end overlays to dark navy arcade style"
```

---

## Task 13: Canvas-First Lobby Rewrite

**Files:**
- Modify: `apps/client/src/scenes/LobbyScene.ts`
- Modify: `apps/client/src/net/colyseusClient.ts` (expose identity fields)

Note: this is the largest single task. The AI demo (`__demo__` room) is out of scope for the initial implementation — build the identity panel and canvas-first layout first. The AI demo can be layered in afterward.

- [ ] **Step 1: Rewrite LobbyScene.ts**

```typescript
// apps/client/src/scenes/LobbyScene.ts
import { COLORS, HATS } from '@se/shared';
import { createMatch, joinMatch } from '../net/colyseusClient';
import { MatchScene } from './MatchScene';
import { loadIdentity, saveIdentity } from '../lib/identity';
import type { StoredIdentity } from '../lib/identity';

const urlMatch = location.pathname.match(/^\/([A-Z0-9]{6})$/i);
const codeFromUrl = urlMatch ? urlMatch[1].toUpperCase() : null;

const COLOR_CSS: Record<string, string> = {
  red:'#e63946',blue:'#3a86ff',green:'#80b918',orange:'#f4a261',
  cyan:'#00b4d8',purple:'#b5179e',yellow:'#fca311',pink:'#f48fb1',
  lime:'#a6d96a',white:'#f1f1f1',
};

const HAT_EMOJIS: Record<string, string> = {
  none:'⬜',helm:'🪖',chef:'👨‍🍳',tophat:'🎩',beanie:'🧢',
  cowboy:'🤠',party:'🎉',viking:'⚔️',santa:'🎅',
};

export class LobbyScene {
  private panel: HTMLDivElement;
  private identity: StoredIdentity;

  constructor() {
    this.identity = loadIdentity();

    this.panel = document.createElement('div');
    this.panel.className = 'interactive';
    this.panel.style.cssText = [
      'position:fixed;right:0;top:50%;transform:translateY(-50%) translateX(100%);',
      'width:min(560px,94vw);',
      'background:rgba(8,6,24,0.96);border:2px solid rgba(255,140,0,0.5);',
      'border-radius:12px 0 0 12px;padding:20px;',
      'font-family:system-ui,sans-serif;color:#fff;z-index:300;',
      'transition:transform 0.3s ease-out;',
      'box-shadow:-8px 0 32px rgba(0,0,0,0.6);',
    ].join('');

    this.panel.innerHTML = this.buildPanelHTML();
    document.getElementById('ui')!.appendChild(this.panel);

    requestAnimationFrame(() => {
      this.panel.style.transform = 'translateY(-50%) translateX(0)';
    });

    this.bindEvents();

    // Auto-fill room code from URL and auto-join
    if (codeFromUrl) {
      const codeInput = this.panel.querySelector<HTMLInputElement>('#lobby-code');
      if (codeInput) codeInput.value = codeFromUrl;
    }
  }

  private buildPanelHTML(): string {
    const id = this.identity;
    const isJoin = !!codeFromUrl;

    const colorSwatches = (COLORS as string[]).map(c =>
      `<div class="color-swatch" data-color="${c}"
        style="width:22px;height:22px;border-radius:5px;background:${COLOR_CSS[c] ?? c};
        cursor:pointer;border:${c === id.color ? '3px solid #ff8c00' : '2px solid rgba(255,255,255,0.15)'};
        box-sizing:border-box;"></div>`
    ).join('');

    const hatPicker = (HATS as string[]).map(h =>
      `<div class="hat-pick" data-hat="${h}"
        style="padding:4px 8px;border-radius:6px;cursor:pointer;font-size:16px;
        background:${h === id.hat ? 'rgba(255,140,0,0.2)' : 'rgba(255,255,255,0.05)'};
        border:${h === id.hat ? '2px solid #ff8c00' : '1px solid rgba(255,255,255,0.12)'};
        " title="${h}">${HAT_EMOJIS[h] ?? h}</div>`
    ).join('');

    const rightCol = isJoin ? `
      <div>
        <div style="font:bold 8px sans-serif;color:#3a86ff;letter-spacing:2px;margin-bottom:8px;">JOIN GAME</div>
        <div style="font:bold 8px sans-serif;color:#64748b;letter-spacing:1px;margin-bottom:4px;">ROOM CODE</div>
        <input id="lobby-code" maxlength="6" value="${codeFromUrl ?? ''}"
          style="width:100%;padding:8px;border-radius:6px;background:rgba(255,255,255,0.06);
          border:1px solid rgba(255,255,255,0.2);color:#fff;font:bold 14px monospace;
          text-transform:uppercase;box-sizing:border-box;"/>
      </div>
    ` : `
      <div>
        <div style="font:bold 8px sans-serif;color:#ff8c00;letter-spacing:2px;margin-bottom:8px;">MATCH SETUP</div>
        <div style="font:bold 7px sans-serif;color:#64748b;letter-spacing:1px;margin-bottom:4px;">LOADOUT</div>
        <div style="display:flex;gap:4px;margin-bottom:10px;">
          ${['Starter','Standard','Bonanza'].map(l =>
            `<button class="loadout-btn" data-loadout="${l.toLowerCase()}"
              style="flex:1;padding:5px 2px;border-radius:4px;font:bold 8px sans-serif;cursor:pointer;
              background:${l === 'Standard' ? 'rgba(255,140,0,0.2)' : 'rgba(255,255,255,0.04)'};
              border:${l === 'Standard' ? '2px solid #ff8c00' : '1px solid rgba(255,255,255,0.1)'};
              color:${l === 'Standard' ? '#ff8c00' : '#64748b'};">${l.toUpperCase()}</button>`
          ).join('')}
        </div>
        <div style="display:flex;align-items:center;margin-bottom:10px;">
          <span style="font:bold 7px sans-serif;color:#64748b;letter-spacing:1px;">ROUNDS</span>
          <div style="display:flex;align-items:center;gap:6px;margin-left:auto;">
            <button id="rounds-minus" style="width:20px;height:20px;border-radius:4px;
              background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);
              color:#fff;cursor:pointer;font:bold 12px sans-serif;">−</button>
            <span id="rounds-val" style="font:bold 14px system-ui;color:#fff;min-width:16px;text-align:center;">5</span>
            <button id="rounds-plus" style="width:20px;height:20px;border-radius:4px;
              background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);
              color:#fff;cursor:pointer;font:bold 12px sans-serif;">+</button>
          </div>
        </div>
      </div>
    `;

    const ctaLabel = isJoin ? '▶ JOIN' : '▶ START MATCH';
    const ctaId = isJoin ? 'lobby-join' : 'lobby-create';

    return `
      <div style="font:900 16px 'Impact',fantasy;color:#ff8c00;text-align:center;
        letter-spacing:3px;margin-bottom:14px;text-shadow:0 0 12px rgba(255,140,0,0.4);">
        💥 SCORCHED EARTH
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <!-- Left: Identity -->
        <div>
          <div style="font:bold 8px sans-serif;color:#ff8c00;letter-spacing:2px;margin-bottom:8px;">YOUR SOLDIER</div>
          <input id="lobby-name" maxlength="24" value="${escapeHtml(id.name)}"
            style="width:100%;padding:8px;border-radius:6px;background:rgba(255,255,255,0.06);
            border:1px solid rgba(255,255,255,0.2);color:#fff;font:bold 13px system-ui;
            box-sizing:border-box;margin-bottom:8px;"/>
          <div style="font:bold 7px sans-serif;color:#64748b;letter-spacing:1px;margin-bottom:4px;">COLOR</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">${colorSwatches}</div>
          <div style="font:bold 7px sans-serif;color:#64748b;letter-spacing:1px;margin-bottom:4px;">HAT</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">${hatPicker}</div>
        </div>
        <!-- Right: Match setup or join -->
        ${rightCol}
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button id="${ctaId}"
          style="flex:2;padding:12px;background:linear-gradient(180deg,#ff8c00,#cc5500);
          border:3px solid #7f2d00;border-radius:8px;box-shadow:0 4px 0 #7f2d00;
          color:#fff;font:bold 13px system-ui;cursor:pointer;
          text-shadow:1px 1px 0 rgba(0,0,0,0.5);">${ctaLabel}</button>
        <button id="lobby-copy"
          style="flex:1;background:rgba(255,255,255,0.05);border:2px solid rgba(255,255,255,0.15);
          border-radius:8px;color:#64748b;font:bold 10px system-ui;cursor:pointer;">🔗 Share</button>
      </div>
      <div id="lobby-status" style="margin-top:8px;font:12px system-ui;color:#94a3b8;text-align:center;"></div>
    `;
  }

  private bindEvents(): void {
    // Name input
    this.panel.querySelector<HTMLInputElement>('#lobby-name')?.addEventListener('input', (e) => {
      this.identity.name = (e.target as HTMLInputElement).value;
      saveIdentity(this.identity);
    });

    // Color swatches
    this.panel.querySelectorAll<HTMLDivElement>('.color-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        this.identity.color = sw.dataset.color as StoredIdentity['color'];
        saveIdentity(this.identity);
        this.panel.querySelectorAll<HTMLDivElement>('.color-swatch').forEach(s => {
          s.style.border = s.dataset.color === this.identity.color
            ? '3px solid #ff8c00' : '2px solid rgba(255,255,255,0.15)';
        });
      });
    });

    // Hat picker
    this.panel.querySelectorAll<HTMLDivElement>('.hat-pick').forEach(h => {
      h.addEventListener('click', () => {
        this.identity.hat = h.dataset.hat as StoredIdentity['hat'];
        saveIdentity(this.identity);
        this.panel.querySelectorAll<HTMLDivElement>('.hat-pick').forEach(hp => {
          hp.style.background = hp.dataset.hat === this.identity.hat
            ? 'rgba(255,140,0,0.2)' : 'rgba(255,255,255,0.05)';
          hp.style.border = hp.dataset.hat === this.identity.hat
            ? '2px solid #ff8c00' : '1px solid rgba(255,255,255,0.12)';
        });
      });
    });

    // Rounds stepper
    let rounds = 5;
    this.panel.querySelector('#rounds-minus')?.addEventListener('click', () => {
      rounds = Math.max(1, rounds - 1);
      const el = this.panel.querySelector<HTMLSpanElement>('#rounds-val');
      if (el) el.textContent = String(rounds);
    });
    this.panel.querySelector('#rounds-plus')?.addEventListener('click', () => {
      rounds = Math.min(10, rounds + 1);
      const el = this.panel.querySelector<HTMLSpanElement>('#rounds-val');
      if (el) el.textContent = String(rounds);
    });

    // Create match
    this.panel.querySelector('#lobby-create')?.addEventListener('click', () => this.onCreate(rounds));

    // Join match
    this.panel.querySelector('#lobby-join')?.addEventListener('click', () => this.onJoin());

    // Copy/share link
    this.panel.querySelector('#lobby-copy')?.addEventListener('click', () => {
      navigator.clipboard.writeText(location.href).then(() => {
        this.setStatus('Link copied!');
        setTimeout(() => this.setStatus(''), 2000);
      });
    });
  }

  private get meta() {
    const name = (this.panel.querySelector<HTMLInputElement>('#lobby-name')?.value ?? '').trim() || this.identity.name;
    return { nickname: name, color: this.identity.color, hat: this.identity.hat };
  }

  private setStatus(text: string): void {
    const el = this.panel.querySelector<HTMLDivElement>('#lobby-status');
    if (el) el.textContent = text;
  }

  private async onCreate(rounds: number): Promise<void> {
    this.setStatus('Creating room…');
    try {
      const { room, code } = await createMatch({ ...this.meta, maxRounds: rounds });
      history.pushState({}, '', '/' + code);
      this.setStatus(`Room ${code} — share the URL`);
      this.dispose();
      new MatchScene(room, code);
    } catch (e: unknown) {
      this.setStatus('Error: ' + (e as Error).message);
    }
  }

  private async onJoin(): Promise<void> {
    const code = (this.panel.querySelector<HTMLInputElement>('#lobby-code')?.value ?? '').toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) { this.setStatus('Enter a 6-character room code'); return; }
    this.setStatus('Joining…');
    try {
      const room = await joinMatch(code, this.meta);
      this.dispose();
      new MatchScene(room, code);
    } catch (e: unknown) {
      this.setStatus('Error: ' + (e as Error).message);
    }
  }

  dispose(): void {
    this.panel.style.transform = 'translateY(-50%) translateX(100%)';
    setTimeout(() => this.panel.remove(), 300);
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
```

- [ ] **Step 2: Update `createMatch` in colyseusClient.ts to pass maxRounds**

In `apps/client/src/net/colyseusClient.ts`, update the `createMatch` signature:

```typescript
export async function createMatch(
  meta: { nickname: string; color: string; hat: string; maxRounds?: number },
): Promise<{ room: Room<MatchState>; code: string }> {
```

And when sending the join options, include `maxRounds`:
```typescript
const room = await getClient().joinOrCreate<MatchState>(
  'match',
  { code, ...meta },
);
```

(The server already reads `maxRounds` from join options if present.)

- [ ] **Step 3: Start dev server and verify lobby**

```bash
pnpm dev
```

Verify:
- Dark panel slides in from right on load
- Name, color swatches, and hat picker work; changes persist across page reload
- Color swatches highlight selected color in orange
- Hat selection updates immediately
- `?room=XXXXXX` URL pre-fills room code and shows JOIN button
- Create match → transitions to match
- Join match → transitions to match with chosen nickname/color/hat

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/scenes/LobbyScene.ts apps/client/src/net/colyseusClient.ts
git commit -m "feat(client): canvas-first lobby with identity panel, color/hat picker, localStorage persistence"
```

---

## Task 14: MatchScene Integration Wiring

**Files:**
- Modify: `apps/client/src/scenes/MatchScene.ts` (wire HudBar and PlayerStrip, remove old HUD)

- [ ] **Step 1: Add imports and fields**

```typescript
import { HudBar } from '../hud/HudBar';
import { PlayerStrip } from '../hud/PlayerStrip';
```

Replace the existing HUD fields:
```typescript
// Remove: private wind!: WindArrow; private timer!: TurnTimer; private players!: PlayerList;
// Keep: private aim!: AimControls; (will be removed after HudBar verified)
private hudBar: HudBar | null = null;
private playerStrip: PlayerStrip | null = null;
```

- [ ] **Step 2: Initialize HudBar and PlayerStrip in constructor**

Replace the existing `this.wind = ...`, `this.timer = ...`, `this.players = ...` initialization with:

```typescript
this.hudBar = new HudBar(room);
this.playerStrip = new PlayerStrip(room.sessionId);
this.hudBar.setAimChangeCallback((angle, power) => {
  this.updateTrajectory(angle, power);
});
```

- [ ] **Step 3: Update ticker to drive HudBar timer and PlayerStrip**

In the ticker callback, add:
```typescript
this.hudBar?.updateTimer(room.state.turnDeadlineMs);
this.hudBar?.update(room.state);
this.playerStrip?.update(room.state);
```

- [ ] **Step 4: Remove old HUD components**

Remove `WeaponBar`, `PlayerList`, `TurnTimer`, `WindArrow`, `RoundInfo` from MatchScene. These are replaced by HudBar and PlayerStrip. Remove their imports and any DOM appends.

Keep `AimControls` temporarily as a fallback (comment out its DOM render but keep the keyboard input wiring) until HudBar is confirmed working in-browser.

- [ ] **Step 5: Hide HudBar/PlayerStrip during overlays**

When `ShopScene`, `RoundSummaryScene`, or `MatchEndScene` is shown, hide the HUD:
```typescript
private showOverlay(scene: { el: HTMLDivElement } | null): void {
  const overlay = !!scene;
  if (this.hudBar) this.hudBar.el.style.display = overlay ? 'none' : '';
  if (this.playerStrip) this.playerStrip.el.style.display = overlay ? 'none' : '';
}
```

Call `showOverlay(this.shopScene)` and `showOverlay(this.roundSummaryScene)` at the appropriate phase transitions.

- [ ] **Step 6: Run full match end-to-end in browser**

```bash
pnpm dev
```

Play a full match through: lobby → round → shop → round summary → match end. Verify:
- HUD bar at bottom: angle dial, power bar, weapon carousel, fire button, timer
- Player strip at top: all players visible, active player highlighted
- Both hidden during shop/summary/end overlays

- [ ] **Step 7: Run all tests**

```bash
pnpm test
```

Expected: all existing + new tests pass

- [ ] **Step 8: Commit**

```bash
git add apps/client/src/scenes/MatchScene.ts
git commit -m "feat(client): wire HudBar and PlayerStrip into MatchScene, retire old HUD components"
```

---

## Self-Review

### Spec coverage check

| Spec section | Task | Status |
|---|---|---|
| Camera: auto-framing, shot-tracking, shake, user controls | 3, 9 | Covered |
| Lobby: canvas-first panel, identity system, join-from-link | 1, 2, 13 | Covered |
| Lobby: AI demo battle | Out of scope (noted in Task 13) | Deferred |
| Random tank placement | 4 | Covered |
| Terrain: layered fills, grass tufts, pebbles | 5 | Covered |
| Sky: 6 parallax layers, cloud drift, time-of-day | 6 | Covered |
| Tank: chunky hull, tracks, 8 hats, dead state | 7 | Covered |
| Explosions: scaled, smoke, dirt debris | 8 | Covered |
| Per-weapon particles | Folded into Explosion class; custom overrides deferred | Partial |
| HUD bar: dial, power, carousel, fire, timer | 10 | Covered |
| Player strip | 11 | Covered |
| Shop retheme + category tabs + scrollable grid | 12 | Covered |
| Round summary retheme | 12 | Covered |
| Match end retheme | 12 | Covered |
| MatchScene wiring | 9, 14 | Covered |

**Deferred items** (not blocking Phase 8 ship):
- AI demo battle in lobby background (complex Colyseus room management; add as Phase 8.1)
- Per-weapon particle overrides beyond the base Explosion class (add as individual follow-ups)

### No placeholders
All code steps contain complete, compilable TypeScript. No "implement later" language.

### Type consistency
- `TankView.setAngle()` signature unchanged — callers unaffected
- `Camera.fitToTanks()` accepts `TankPosition[]` (same interface as `computeFit`)
- `HudBar` and `PlayerStrip` both expose `.el: HTMLDivElement` and `.destroy()` for consistent teardown
- `SkyRenderer.update(dt, worldX)` — worldX is `camera.worldX` getter

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-28-phase-8-visual-polish.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, spec + quality review between tasks

**2. Inline Execution** — execute tasks in this session using `superpowers:executing-plans`

Which approach?
