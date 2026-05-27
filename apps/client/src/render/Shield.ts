import { Container, Graphics } from "pixi.js";

type ShieldStyle = "absorb" | "deflect" | "bend" | "explode";

const SHIELD_COLORS: Record<ShieldStyle, number> = {
  absorb: 0x4ecdc4,
  deflect: 0xffd93d,
  bend: 0xc77dff,
  explode: 0xff9f1c,
};

const SHIELD_RADII: Record<string, number> = {
  "force-field": 60,
  "auto-shield": 60,
  "deflector-shield": 70,
  "magnetic-shield": 100,
  "reactive-armor": 50,
};

export class ShieldBubble extends Container {
  private ring: Graphics;
  private flashAlpha = 0;

  constructor() {
    super();
    this.ring = new Graphics();
    this.addChild(this.ring);
  }

  update(shieldId: string, shieldHp: number, shieldMaxHp: number): void {
    this.ring.clear();
    if (!shieldId || shieldHp <= 0) return;

    const style = this.styleFor(shieldId);
    const color = SHIELD_COLORS[style];
    const radius = SHIELD_RADII[shieldId] ?? 60;
    const hpFraction = shieldMaxHp > 0 ? shieldHp / shieldMaxHp : 0;
    const baseAlpha = 0.1 + hpFraction * 0.15;
    const alpha = Math.min(1, baseAlpha + this.flashAlpha);

    if (style === "bend") {
      this.ring.rotation += 0.02;
      const dashCount = 8;
      for (let i = 0; i < dashCount; i++) {
        const a = (i / dashCount) * Math.PI * 2;
        const ax = Math.cos(a) * radius;
        const ay = Math.sin(a) * radius;
        const bx = Math.cos(a + 0.2) * radius;
        const by = Math.sin(a + 0.2) * radius;
        this.ring.moveTo(ax, ay).lineTo(bx, by).stroke({ color, width: 2, alpha });
      }
    } else {
      this.ring.circle(0, 0, radius).stroke({ color, width: 2, alpha });
    }

    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - 0.05);
  }

  flash(): void {
    this.flashAlpha = 0.8;
  }

  private styleFor(shieldId: string): ShieldStyle {
    if (shieldId === "deflector-shield") return "deflect";
    if (shieldId === "magnetic-shield") return "bend";
    if (shieldId === "reactive-armor") return "explode";
    return "absorb";
  }
}
