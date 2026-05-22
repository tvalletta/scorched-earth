import { Container, Graphics } from "pixi.js";
import { TERRAIN_WIDTH, TERRAIN_HEIGHT } from "@se/shared";
import { generateTerrain, carveInPlace } from "@se/game";

export class TerrainRenderer extends Container {
  private heightmap: Int16Array;
  private graphics: Graphics;

  constructor(seed: string) {
    super();
    this.heightmap = generateTerrain({
      seed,
      type: "random",
      width: TERRAIN_WIDTH,
      height: TERRAIN_HEIGHT,
    });
    this.graphics = new Graphics();
    this.addChild(this.graphics);
    this.redraw();
  }

  carve(op: { x: number; y: number; radius: number; tick: number }) {
    carveInPlace(this.heightmap, op, { terrainHeight: TERRAIN_HEIGHT });
    this.redraw();
  }

  heightAt(x: number): number {
    const i = Math.max(0, Math.min(TERRAIN_WIDTH - 1, Math.round(x)));
    return this.heightmap[i] ?? 0;
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
