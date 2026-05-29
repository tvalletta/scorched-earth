import { Container, Graphics } from 'pixi.js';

const TOTAL_DURATION = 1200; // ms

export class Explosion extends Container {
  private g: Graphics;
  private elapsed = 0;
  private r: number;

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
    const expandT = Math.min(t / 0.15, 1);
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

    // Dirt debris
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
