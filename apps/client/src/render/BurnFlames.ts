import { Container, Graphics } from "pixi.js";

const TONGUES_PER_100PX = 7;
const BASE_HEIGHT_MIN = 20;
const BASE_HEIGHT_MAX = 50;
const FLICKER_SPEED = 70;

interface Tongue {
  x: number;
  baseH: number;
  offset: number;
  width: number;
}

export class BurnFlames extends Container {
  private g: Graphics;
  private tongues: Tongue[] = [];
  private elapsed = 0;
  private getHeight: (x: number) => number;

  constructor(
    zoneX: number,
    zoneWidth: number,
    getTerrainHeight: (x: number) => number,
  ) {
    super();
    this.getHeight = getTerrainHeight;
    this.g = new Graphics();
    this.addChild(this.g);

    const count = Math.max(3, Math.round((zoneWidth / 100) * TONGUES_PER_100PX));
    for (let i = 0; i < count; i++) {
      const x = (zoneX - zoneWidth / 2) + Math.random() * zoneWidth;
      this.tongues.push({
        x,
        baseH: BASE_HEIGHT_MIN + Math.random() * (BASE_HEIGHT_MAX - BASE_HEIGHT_MIN),
        offset: Math.random() * Math.PI * 2,
        width: 6 + Math.random() * 8,
      });
    }
  }

  tick(): boolean {
    this.elapsed += 1000 / 60;
    this.g.clear();

    for (const t of this.tongues) {
      const flicker = 0.6 + 0.4 * Math.sin(this.elapsed / FLICKER_SPEED + t.offset);
      const h = t.baseH * flicker;
      const surfaceY = this.getHeight(t.x);
      const ty = surfaceY - h * 0.5;

      this.g.ellipse(t.x, ty, t.width * 0.5, h * 0.5)
        .fill({ color: 0xff4500, alpha: 0.75 });
      this.g.ellipse(t.x, ty + h * 0.1, t.width * 0.28, h * 0.32)
        .fill({ color: 0xffb000, alpha: 0.85 });
    }

    return false; // never self-terminates — caller must explicitly destroy
  }
}
