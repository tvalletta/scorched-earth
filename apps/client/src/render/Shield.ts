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
    const alpha = Math.min(1, (0.25 + hpFraction * 0.55) + this.flashAlpha);

    // Depletion tint: interpolate color toward red when low
    const drawColor = hpFraction < 0.33
      ? this.lerpColor(color, 0xef4444, (0.33 - hpFraction) / 0.33)
      : color;

    if (hpFraction < 0.33) {
      // Low: dashed ring (8 short arcs)
      const dashCount = 8;
      for (let i = 0; i < dashCount; i++) {
        const a = (i / dashCount) * Math.PI * 2;
        const ax = Math.cos(a) * radius;
        const ay = Math.sin(a) * radius;
        const bx = Math.cos(a + 0.25) * radius;
        const by = Math.sin(a + 0.25) * radius;
        this.ring.moveTo(ax, ay).lineTo(bx, by).stroke({ color: drawColor, width: 2, alpha });
      }
    } else if (style === "bend") {
      this.ring.rotation += 0.02;
      const dashCount = 8;
      for (let i = 0; i < dashCount; i++) {
        const a = (i / dashCount) * Math.PI * 2;
        const ax = Math.cos(a) * radius;
        const ay = Math.sin(a) * radius;
        const bx = Math.cos(a + 0.2) * radius;
        const by = Math.sin(a + 0.2) * radius;
        this.ring.moveTo(ax, ay).lineTo(bx, by).stroke({ color: drawColor, width: 2, alpha });
      }
    } else if (style === "deflect") {
      this.ring.circle(0, 0, radius).stroke({ color: drawColor, width: 2, alpha });
      if (this.flashAlpha > 0) {
        this.ring.circle(0, 0, radius + 6).stroke({ color: drawColor, width: 3, alpha: this.flashAlpha * 0.9 });
      }
    } else if (style === "explode") {
      this.ring.circle(0, 0, radius).stroke({ color: drawColor, width: 1, alpha: alpha * 0.6 });
      if (this.flashAlpha > 0) {
        this.ring.circle(0, 0, radius).fill({ color: drawColor, alpha: this.flashAlpha * 0.5 });
      }
    } else {
      // absorb: solid ring, dimmed at mid HP
      const strokeWidth = hpFraction < 0.66 ? 1.5 : 2;
      this.ring.circle(0, 0, radius).stroke({ color: drawColor, width: strokeWidth, alpha });
    }

    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - 0.05);
  }

  private lerpColor(a: number, b: number, t: number): number {
    const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
    const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bv = Math.round(ab + (bb - ab) * t);
    return (r << 16) | (g << 8) | bv;
  }

  flash(): void {
    this.flashAlpha = 0.8;
  }

  private styleFor(shieldId: string): ShieldStyle {
    return STYLE_BY_ID[shieldId] ?? "absorb";
  }
}
