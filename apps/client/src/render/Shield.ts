import { Container, Graphics } from "pixi.js";

type ShieldStyle = "absorb" | "deflect" | "bend" | "explode";

const SHIELD_COLORS: Record<string, number> = {
  "force-field":      0x4ecdc4,
  "deflector-shield": 0xffd93d,
  "magnetic-shield":  0xc77dff,
  "reactive-armor":   0xff6b6b,
  "auto-shield":      0x80ed99,
};

const SHIELD_RADII: Record<string, number> = {
  "force-field":      60,
  "deflector-shield": 70,
  "magnetic-shield":  100,
  "reactive-armor":   50,
  "auto-shield":      60,
};

const STYLE_BY_ID: Record<string, ShieldStyle> = {
  "force-field":      "absorb",
  "auto-shield":      "absorb",
  "deflector-shield": "deflect",
  "magnetic-shield":  "bend",
  "reactive-armor":   "explode",
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
    const color = SHIELD_COLORS[shieldId] ?? 0x4ecdc4;
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
    } else if (style === "deflect") {
      // Solid ring like absorb; on flash shows a bright outer ring spark
      this.ring.circle(0, 0, radius).stroke({ color, width: 2, alpha });
      if (this.flashAlpha > 0) {
        const sparkAlpha = this.flashAlpha * 0.9;
        this.ring.circle(0, 0, radius + 6).stroke({ color, width: 3, alpha: sparkAlpha });
      }
    } else if (style === "explode") {
      // Thin low-opacity bubble; on flash shows a burst fill
      this.ring.circle(0, 0, radius).stroke({ color, width: 1, alpha: alpha * 0.6 });
      if (this.flashAlpha > 0) {
        const burstAlpha = this.flashAlpha * 0.5;
        this.ring.circle(0, 0, radius).fill({ color, alpha: burstAlpha });
      }
    } else {
      // absorb: standard solid ring
      this.ring.circle(0, 0, radius).stroke({ color, width: 2, alpha });
    }

    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - 0.05);
  }

  flash(): void {
    this.flashAlpha = 0.8;
  }

  private styleFor(shieldId: string): ShieldStyle {
    return STYLE_BY_ID[shieldId] ?? "absorb";
  }
}
