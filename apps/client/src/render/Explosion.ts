import { Container, Graphics } from "pixi.js";

export class Explosion extends Container {
  private particles: Array<{ g: Graphics; vx: number; vy: number }> = [];
  private start = performance.now();
  private duration = 600;

  constructor(x: number, y: number, color = 0xff7043) {
    super();
    this.position.set(x, y);
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 80;
      const g = new Graphics();
      const c = i % 3 === 0 ? 0xffd166 : i % 3 === 1 ? color : 0x8d8d8d;
      g.circle(0, 0, 2 + Math.random() * 3).fill(c);
      this.addChild(g);
      this.particles.push({ g, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed });
    }
  }

  tick(): boolean {
    const dt = 1 / 60;
    const t = performance.now() - this.start;
    const k = Math.min(1, t / this.duration);
    for (const p of this.particles) {
      p.g.position.x += p.vx * dt;
      p.g.position.y += p.vy * dt + 50 * dt;
      p.g.alpha = 1 - k;
    }
    return t >= this.duration;
  }
}
