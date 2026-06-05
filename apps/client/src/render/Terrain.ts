import { Container, Graphics } from "pixi.js";
import { TERRAIN_WIDTH, TERRAIN_HEIGHT } from "@se/shared";
import type { TerrainType } from "@se/shared";
import { generateTerrain, generateUnderside, generateCeiling, carveInPlace, carveCeilingInPlace, settleInPlace } from "@se/game";
import type { DepositShape } from "@se/game";
import { DirtParticles } from "./DirtParticles";

export class TerrainRenderer extends Container {
  private heightmap: Int16Array;
  private ceilingMap: Int16Array | null = null;
  private graphics: Graphics;
  private zoneOverlay: Graphics;
  private seed: string;

  constructor(seed: string, type: TerrainType = "random") {
    super();
    this.seed = seed;
    this.heightmap = generateTerrain({
      seed,
      type,
      width: TERRAIN_WIDTH,
      height: TERRAIN_HEIGHT,
    });
    this.graphics = new Graphics();
    this.addChild(this.graphics);
    this.zoneOverlay = new Graphics();
    this.addChild(this.zoneOverlay); // renders on top of terrain
    this.redraw();
  }

  /** Enable a cave ceiling (absorb mode), regenerated deterministically from seed. */
  setCeiling(seed: string): void {
    this.ceilingMap = generateCeiling(
      { seed, type: "random", width: TERRAIN_WIDTH, height: TERRAIN_HEIGHT },
      this.heightmap,
    );
    this.redraw();
  }

  clearCeiling(): void {
    if (this.ceilingMap) { this.ceilingMap = null; this.redraw(); }
  }

  carve(op: { x: number; y: number; radius: number; tick: number; layer?: string }): DirtParticles | null {
    const { x: cx, radius } = op;
    const xMin = Math.max(0, Math.floor(cx - radius));
    const xMax = Math.min(TERRAIN_WIDTH - 1, Math.ceil(cx + radius));
    const map = op.layer === "ceiling" && this.ceilingMap ? this.ceilingMap : this.heightmap;

    // Snapshot pre-carve heights for blast zone.
    const before = new Int16Array(xMax - xMin + 1);
    for (let i = xMin; i <= xMax; i++) before[i - xMin] = map[i]!;

    if (op.layer === "ceiling" && this.ceilingMap) {
      carveCeilingInPlace(this.ceilingMap, op);
    } else {
      carveInPlace(this.heightmap, op, { terrainHeight: TERRAIN_HEIGHT });
    }

    // Apply gravity settling on floor carves only.
    // settleBefore captures terrain[lo..hi] AFTER carve but BEFORE settling.
    let settleBefore: Int16Array | null = null;
    let lo = xMin;
    let hi = xMax;
    if (!(op.layer === "ceiling" && this.ceilingMap)) {
      lo = Math.max(0, xMin - 5);
      hi = Math.min(TERRAIN_WIDTH - 1, xMax + 5);
      settleBefore = settleInPlace(this.heightmap, xMin, xMax);
    }

    this.redraw();

    // Build changed-column list (carve + settle) for DirtParticles.
    const changed: Array<{ x: number; oldY: number; newY: number }> = [];

    // Blast zone: compare against pre-carve snapshot
    for (let i = xMin; i <= xMax; i++) {
      const oldY = before[i - xMin]!;
      const newY = map[i]!;
      if (newY !== oldY) changed.push({ x: i, oldY, newY: Math.max(oldY, newY) });
    }

    // Outer settling columns (outside blast zone)
    if (settleBefore) {
      for (let i = lo; i < xMin; i++) {
        const oldY = settleBefore[i - lo]!;
        const newY = this.heightmap[i]!;
        if (newY !== oldY) changed.push({ x: i, oldY, newY });
      }
      for (let i = xMax + 1; i <= hi; i++) {
        const oldY = settleBefore[i - lo]!;
        const newY = this.heightmap[i]!;
        if (newY !== oldY) changed.push({ x: i, oldY, newY });
      }
    }

    return changed.length > 0 ? new DirtParticles(changed) : null;
  }

  deposit(centerX: number, shape: DepositShape): DirtParticles | null {
    const half = shape.halfWidth;
    const xMin = Math.max(0, Math.round(centerX - half));
    const xMax = Math.min(TERRAIN_WIDTH - 1, Math.round(centerX + half));

    // Snapshot pre-deposit heights
    const before = new Int16Array(xMax - xMin + 1);
    for (let i = xMin; i <= xMax; i++) before[i - xMin] = this.heightmap[i]!;

    // Raise terrain (mirrors tickLoop: lower y = higher on screen)
    for (let col = xMin; col <= xMax; col++) {
      const fraction = shape.spray
        ? Math.max(0, 1 - Math.abs(col - centerX) / half)
        : 1;
      const raise = Math.round(shape.height * fraction);
      this.heightmap[col] = Math.max(0, (this.heightmap[col] ?? 0) - raise);
    }

    this.redraw();

    const changed: Array<{ x: number; oldY: number; newY: number }> = [];
    for (let i = xMin; i <= xMax; i++) {
      const oldY = before[i - xMin]!;
      const newY = this.heightmap[i]!;
      if (newY !== oldY) changed.push({ x: i, oldY, newY });
    }

    return changed.length > 0 ? new DirtParticles(changed) : null;
  }

  heightAt(x: number): number {
    const i = Math.max(0, Math.min(TERRAIN_WIDTH - 1, Math.round(x)));
    return this.heightmap[i] ?? 0;
  }

  ceilingAt(x: number): number {
    if (!this.ceilingMap) return Number.NEGATIVE_INFINITY;
    const i = Math.max(0, Math.min(TERRAIN_WIDTH - 1, Math.round(x)));
    return this.ceilingMap[i] ?? Number.NEGATIVE_INFINITY;
  }

  getHeightmap(): Int16Array {
    return this.heightmap;
  }

  updateZones(zones: Array<{ kind: "burn-zone" | "smoke-zone"; x: number; width: number }>): void {
    this.zoneOverlay.clear();
    for (const zone of zones) {
      const left = zone.x - zone.width / 2;
      if (zone.kind === "burn-zone") {
        // Orange flame overlay
        this.zoneOverlay
          .rect(left, 0, zone.width, TERRAIN_HEIGHT)
          .fill({ color: 0xff6600, alpha: 0.4 });
      } else {
        // Gray smoke overlay
        this.zoneOverlay
          .rect(left, 0, zone.width, TERRAIN_HEIGHT)
          .fill({ color: 0x888888, alpha: 0.35 });
      }
    }
  }

  private redraw() {
    const g = this.graphics;
    g.clear();
    const h = this.heightmap;

    // Layer 1 — Floating-island underside (replaces a flat-bottomed block):
    // a tapering rocky mass with stalactites, so the world reads as an
    // Avatar-style floating island rather than a slab hanging in space.
    this.drawUnderside(g, h);

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

    // Layer 7 — Cave ceiling rock mass (absorb mode), above the air gap.
    if (this.ceilingMap) this.drawCeiling(g, this.ceilingMap);
  }

  /**
   * Draw the cave roof: a solid rock mass from high above down to ceiling[x],
   * with stalactites hanging from the ceiling edge and a faint violet rim
   * (absorb accent). Mirrors the island-underside styling for consistency.
   */
  private drawCeiling(g: Graphics, ceil: Int16Array): void {
    const W = TERRAIN_WIDTH;
    const floor = this.heightmap;
    let minC = Infinity;
    for (let x = 0; x < W; x++) if (ceil[x]! < minC) minC = ceil[x]!;
    const top = minC - 380; // generous rock above the highest ceiling point

    // Cave-interior atmosphere — darken the air between ceiling and floor so it
    // reads as an enclosed cavern rather than open sky.
    g.moveTo(0, ceil[0]!);
    for (let x = 1; x < W; x++) g.lineTo(x, ceil[x]!);
    for (let x = W - 1; x >= 0; x--) g.lineTo(x, floor[x]!);
    g.closePath();
    g.fill({ color: 0x0a0a16, alpha: 0.38 });

    // Body — rock from the top down to the ceiling contour.
    g.moveTo(0, top);
    g.lineTo(W, top);
    for (let x = W - 1; x >= 0; x--) g.lineTo(x, ceil[x]!);
    g.closePath();
    g.fill(0x3a2614);

    // Shadow toward the ceiling edge for depth.
    g.moveTo(0, ceil[0]! - 130);
    for (let x = 1; x < W; x++) g.lineTo(x, ceil[x]! - 130);
    for (let x = W - 1; x >= 0; x--) g.lineTo(x, ceil[x]!);
    g.closePath();
    g.fill({ color: 0x1c1208, alpha: 0.6 });

    // Violet rim (absorb accent) along the ceiling silhouette.
    g.moveTo(0, ceil[0]!);
    for (let x = 1; x < W; x += 4) g.lineTo(x, ceil[x]!);
    g.stroke({ color: 0xa855f7, width: 2, alpha: 0.35 });
  }

  /**
   * Draw the floating-island underside: a smooth rocky mass that hangs below
   * the surface (deeper toward the middle), darkening toward the bottom, with
   * stalactite spikes and a faint rim light. Purely cosmetic — physics only
   * ever consults the top surface heightmap.
   */
  private drawUnderside(g: Graphics, h: Int16Array): void {
    const W = TERRAIN_WIDTH;

    // Average surface height → a smooth reference so the underside doesn't
    // copy every surface bump.
    let sum = 0;
    for (let x = 0; x < W; x++) sum += h[x] ?? 0;
    const avgSurface = sum / W;

    // Seeded phase so each map's underside silhouette differs.
    let s = 0;
    for (let i = 0; i < this.seed.length; i++) s = (Math.imul(31, s) + this.seed.charCodeAt(i)) >>> 0;
    const phase = (s % 1000) / 1000 * Math.PI * 2;

    // Small safety floor so the underside never poke through the surface in deep
    // valleys; kept low so the convex belly curve (deepest in the middle, thin at
    // the edges) shapes the silhouette rather than a uniform-thickness slab.
    const MIN_THICKNESS = 60;
    void phase;

    // Organically-generated underside (octave noise + plunging edges), guarded
    // so the island always has a minimum thickness even under deep valleys.
    const gen = generateUnderside(this.seed, W, avgSurface);
    const bottom = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      bottom[x] = Math.max((h[x] ?? 0) + MIN_THICKNESS, gen[x]!);
    }

    // Body — medium rock from the surface down to the underside contour.
    g.moveTo(0, h[0] ?? 0);
    for (let x = 1; x < W; x++) g.lineTo(x, h[x] ?? 0);
    for (let x = W - 1; x >= 0; x--) g.lineTo(x, bottom[x]!);
    g.closePath();
    g.fill(0x3a2614);

    // Shadow — darker mass hugging the lower portion of the island for depth.
    g.moveTo(0, bottom[0]! - 150);
    for (let x = 1; x < W; x++) g.lineTo(x, bottom[x]! - 150);
    for (let x = W - 1; x >= 0; x--) g.lineTo(x, bottom[x]!);
    g.closePath();
    g.fill({ color: 0x1c1208, alpha: 0.6 });


    // Rim light along the underside silhouette.
    g.moveTo(0, bottom[0]!);
    for (let x = 1; x < W; x += 4) g.lineTo(x, bottom[x]!);
    g.stroke({ color: 0x6b4a25, width: 2, alpha: 0.4 });
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
}
