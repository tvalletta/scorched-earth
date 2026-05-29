import { Container, Graphics } from "pixi.js";
import { TERRAIN_WIDTH, TERRAIN_HEIGHT } from "@se/shared";
import type { TerrainType } from "@se/shared";
import { generateTerrain, carveInPlace } from "@se/game";
import { DirtParticles } from "./DirtParticles";

export class TerrainRenderer extends Container {
  private heightmap: Int16Array;
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

  carve(op: { x: number; y: number; radius: number; tick: number }): DirtParticles | null {
    const { x: cx, radius } = op;
    const xMin = Math.max(0, Math.floor(cx - radius));
    const xMax = Math.min(TERRAIN_WIDTH - 1, Math.ceil(cx + radius));

    // Snapshot pre-carve heights for columns in the blast zone.
    const before = new Int16Array(xMax - xMin + 1);
    for (let i = xMin; i <= xMax; i++) before[i - xMin] = this.heightmap[i]!;

    carveInPlace(this.heightmap, op, { terrainHeight: TERRAIN_HEIGHT });
    this.redraw();

    // Build the changed-column list for the particle animation.
    const changed: Array<{ x: number; oldY: number; newY: number }> = [];
    for (let i = xMin; i <= xMax; i++) {
      const oldY = before[i - xMin]!;
      const newY = this.heightmap[i]!;
      if (newY > oldY) changed.push({ x: i, oldY, newY });
    }

    return changed.length > 0 ? new DirtParticles(changed) : null;
  }

  heightAt(x: number): number {
    const i = Math.max(0, Math.min(TERRAIN_WIDTH - 1, Math.round(x)));
    return this.heightmap[i] ?? 0;
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

    const MIN_THICKNESS = 170;
    const EDGE_DEPTH = 240;
    const CENTER_EXTRA = 340;

    const bottom = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const t = x / (W - 1);
      const bell = Math.sin(Math.PI * t); // 0 at edges → 1 at centre
      const noise =
        24 * Math.sin(t * Math.PI * 6 + phase) +
        14 * Math.sin(t * Math.PI * 13 + phase * 1.7) +
        8 * Math.sin(t * Math.PI * 23 + phase * 0.5);
      const smooth = avgSurface + EDGE_DEPTH + CENTER_EXTRA * bell + noise;
      bottom[x] = Math.max((h[x] ?? 0) + MIN_THICKNESS, smooth);
    }

    // Body — medium rock from the surface down to the underside contour.
    g.moveTo(0, h[0] ?? 0);
    for (let x = 1; x < W; x++) g.lineTo(x, h[x] ?? 0);
    for (let x = W - 1; x >= 0; x--) g.lineTo(x, bottom[x]!);
    g.closePath();
    g.fill(0x3a2614);

    // Shadow — darker mass over the lower ~half for depth.
    const shadowTop = avgSurface + EDGE_DEPTH + 110;
    g.moveTo(0, Math.max(shadowTop, (h[0] ?? 0) + MIN_THICKNESS));
    for (let x = 1; x < W; x++) g.lineTo(x, Math.max(shadowTop + 18 * Math.sin((x / (W - 1)) * Math.PI), (h[x] ?? 0) + MIN_THICKNESS));
    for (let x = W - 1; x >= 0; x--) g.lineTo(x, bottom[x]!);
    g.closePath();
    g.fill({ color: 0x1c1208, alpha: 0.6 });

    // Stalactites hanging from the deepest (central) region.
    const rng = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 0x100000000; };
    for (let i = 0; i < 9; i++) {
      const sx = Math.floor((0.12 + rng() * 0.76) * W);
      const by = bottom[sx]!;
      const len = 55 + rng() * 120;
      const wHalf = 10 + rng() * 14;
      g.moveTo(sx - wHalf, by - 6);
      g.lineTo(sx + wHalf, by - 6);
      g.lineTo(sx, by + len);
      g.closePath();
      g.fill(0x1c1208);
    }

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
