import { Container, Graphics } from "pixi.js";
import { TERRAIN_WIDTH, TERRAIN_HEIGHT } from "@se/shared";

export class SkyRenderer extends Container {
  constructor() {
    super();
    // Light blue → near-white gradient (cartoon style).
    // PixiJS v8 FillGradient API can vary; we use a stack of stripes for portability.
    const bg = new Graphics();
    const stripes = 20;
    for (let i = 0; i < stripes; i++) {
      const t = i / (stripes - 1);
      const r = Math.round(0xa6 + (0xf2 - 0xa6) * t);
      const g = Math.round(0xe1 + (0xfa - 0xe1) * t);
      const b = Math.round(0xfa + (0xff - 0xfa) * t);
      const color = (r << 16) | (g << 8) | b;
      const y = (i / stripes) * TERRAIN_HEIGHT;
      const h = TERRAIN_HEIGHT / stripes + 1;
      bg.rect(0, y, TERRAIN_WIDTH, h).fill(color);
    }
    this.addChild(bg);
    this.addClouds();
  }

  private addClouds() {
    const positions = [
      { x: 200, y: 120 },
      { x: 800, y: 80 },
      { x: 1300, y: 140 },
    ];
    for (const p of positions) {
      const cloud = new Graphics();
      cloud.ellipse(0, 0, 80, 24).fill(0xffffff);
      cloud.ellipse(40, -6, 50, 18).fill(0xffffff);
      cloud.ellipse(-40, -4, 60, 20).fill(0xffffff);
      cloud.position.set(p.x, p.y);
      cloud.alpha = 0.9;
      this.addChild(cloud);
    }
  }
}
