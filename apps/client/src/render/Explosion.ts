import { Container, Graphics } from "pixi.js";

const DURATION = 480;

export class Explosion extends Container {
  private g: Graphics;
  private elapsed = 0;

  constructor(x: number, y: number, private radius = 20) {
    super();
    this.position.set(x, y);
    this.g = new Graphics();
    this.addChild(this.g);
  }

  tick(): boolean {
    this.elapsed += 1000 / 60;
    const t = Math.min(this.elapsed / DURATION, 1);
    this.draw(t);
    return t >= 1;
  }

  private draw(t: number) {
    this.g.clear();
    if (t >= 1) return;

    // Expand quickly (0→0.25) then hold; fade out over (0.25→1).
    const expand = Math.min(t / 0.25, 1);
    const r = this.radius * expand;
    const fade = t < 0.25 ? 1 : 1 - (t - 0.25) / 0.75;

    // Soft outer glow — matches the carve radius boundary
    this.g.circle(0, 0, r * 1.6).fill({ color: 0xf97316, alpha: fade * 0.18 });
    // Main blast disc — same radius as the terrain carve
    this.g.circle(0, 0, r).fill({ color: 0xfb923c, alpha: fade * 0.85 });
    // Bright core flash
    const coreAlpha = t < 0.25 ? fade : fade * 0.25;
    this.g.circle(0, 0, r * 0.45).fill({ color: 0xffffff, alpha: coreAlpha });
    // Crisp edge ring at exact carve boundary
    this.g.circle(0, 0, r).stroke({ color: 0xfed7aa, width: 1.5, alpha: fade * 0.7 });
  }
}
