import { Container, Graphics } from "pixi.js";
import { TERRAIN_WIDTH, TERRAIN_HEIGHT } from "@se/shared";
import type { TerrainType } from "@se/shared";
import { generateTerrain, carveInPlace } from "@se/game";
import { DirtParticles } from "./DirtParticles";

export class TerrainRenderer extends Container {
  private heightmap: Int16Array;
  private graphics: Graphics;
  private zoneOverlay: Graphics;

  constructor(seed: string, type: TerrainType = "random") {
    super();
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

    // Solid green fill (avoid gradient API uncertainty in PixiJS v8).
    g.moveTo(0, this.heightmap[0] ?? 0);
    for (let x = 1; x < TERRAIN_WIDTH; x++) g.lineTo(x, this.heightmap[x] ?? 0);
    g.lineTo(TERRAIN_WIDTH, TERRAIN_HEIGHT);
    g.lineTo(0, TERRAIN_HEIGHT);
    g.closePath();
    g.fill(0x6b8e23);
    g.stroke({ color: 0x2d4a1f, width: 2.5 });
  }
}
