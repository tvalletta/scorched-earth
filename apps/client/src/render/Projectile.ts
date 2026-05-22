import { Container, Graphics } from "pixi.js";

interface Sample {
  x: number;
  y: number;
  t: number;
}

export class ProjectileAnim extends Container {
  private head: Graphics;
  private trail: Graphics;
  private startMs = performance.now();

  constructor(private samples: Sample[]) {
    super();
    this.trail = new Graphics();
    this.head = new Graphics();
    this.head.circle(0, 0, 5).fill(0x2c3e50);
    this.addChild(this.trail, this.head);
  }

  tick(): boolean {
    const t = performance.now() - this.startMs;
    if (this.samples.length === 0) return true;
    const last = this.samples[this.samples.length - 1]!;
    if (t >= last.t) {
      this.head.position.set(last.x, last.y);
      return true;
    }
    let i = 0;
    while (i < this.samples.length - 1 && this.samples[i + 1]!.t < t) i++;
    const a = this.samples[i]!;
    const b = this.samples[Math.min(i + 1, this.samples.length - 1)]!;
    const u = (t - a.t) / Math.max(1, b.t - a.t);
    const x = a.x + (b.x - a.x) * u;
    const y = a.y + (b.y - a.y) * u;
    this.head.position.set(x, y);

    this.trail.clear();
    this.trail.moveTo(this.samples[0]!.x, this.samples[0]!.y);
    for (let j = 1; j <= i; j++) this.trail.lineTo(this.samples[j]!.x, this.samples[j]!.y);
    this.trail.lineTo(x, y);
    this.trail.stroke({ color: 0x2c3e50, width: 2, alpha: 0.7 });
    return false;
  }
}
