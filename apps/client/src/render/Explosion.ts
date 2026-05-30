import { Container, Graphics, Text } from 'pixi.js';

const TOTAL_DURATION = 1200; // ms

export type ExplosionStyle = 'standard' | 'nuke' | 'plasma' | 'fire' | 'skull' | 'dirt';

const STYLE_BY_WEAPON: Record<string, ExplosionStyle> = {
  nuke: 'nuke', 'baby-nuke': 'nuke', 'funky-nuke': 'nuke',
  'plasma-ball': 'plasma', 'plasma-blast': 'plasma', 'plasma-wave': 'plasma',
  napalm: 'fire', 'hot-napalm': 'fire', fireball: 'fire',
  'deaths-head': 'skull', 'deaths-knell': 'skull',
  'dirt-clod': 'dirt', 'dirt-ball': 'dirt', 'liquid-dirt': 'dirt', sandhog: 'dirt', tunneler: 'dirt',
};

export function explosionStyleFor(weaponId: string): ExplosionStyle {
  return STYLE_BY_WEAPON[weaponId] ?? 'standard';
}

export class Explosion extends Container {
  private g: Graphics;
  private elapsed = 0;
  private r: number;
  private style: ExplosionStyle;
  // Per-instance random offsets so each blast looks unique but stable.
  private seeds: number[] = [];
  private skullText: Text | null = null;

  constructor(x: number, y: number, blastRadius = 20, style: ExplosionStyle = 'standard') {
    super();
    this.position.set(x, y);
    this.r = blastRadius;
    this.style = style;
    this.g = new Graphics();
    this.addChild(this.g);
    for (let i = 0; i < 8; i++) this.seeds.push(Math.random());
    if (style === 'skull') {
      this.skullText = new Text({ text: '💀', style: { fontSize: Math.max(22, blastRadius * 0.9) } });
      this.skullText.anchor.set(0.5);
      this.addChild(this.skullText);
    }
  }

  tick(): boolean {
    this.elapsed += 1000 / 60;
    const t = Math.min(this.elapsed / TOTAL_DURATION, 1);
    this.draw(t);
    return t >= 1;
  }

  private draw(t: number): void {
    this.g.clear();
    if (t >= 1) { if (this.skullText) this.skullText.visible = false; return; }
    switch (this.style) {
      case 'nuke': this.drawNuke(t); break;
      case 'plasma': this.drawPlasma(t); break;
      case 'fire': this.drawFire(t); break;
      case 'skull': this.drawSkull(t); break;
      case 'dirt': this.drawDirt(t); break;
      default: this.drawStandard(t); break;
    }
  }

  // ── Standard: dirt + orange fireball + smoke (the original) ───────────────
  private drawStandard(t: number): void {
    const r = this.r;
    const expandT = Math.min(t / 0.15, 1);
    const fade = t < 0.15 ? 1 : Math.max(0, 1 - (t - 0.15) / 0.5);
    if (r > 80) {
      const ringScale = 1 + Math.min(t / 0.167, 1) * 0.5;
      this.g.circle(0, 0, r * ringScale).stroke({ color: 0xfed7aa, width: 2, alpha: Math.max(0, 0.5 - t) });
    }
    this.g.ellipse(0, 0, r * 0.5 * expandT, r * 0.45 * expandT).fill({ color: 0xff8c00, alpha: fade * 0.85 });
    this.g.ellipse(0, 0, r * 0.3 * expandT, r * 0.28 * expandT).fill({ color: 0xfbbf24, alpha: fade * 0.9 });
    if (this.elapsed < 80) {
      const coreAlpha = 1 - this.elapsed / 80;
      this.g.circle(0, 0, r * 0.15 * expandT).fill({ color: 0xffffff, alpha: coreAlpha * 0.85 });
    }
    if (t > 0.1) {
      const smokeT = Math.min((t - 0.1) / 0.667, 1);
      this.g.ellipse(0, -30 * smokeT, r * 0.4, r * 0.18).fill({ color: 0x888888, alpha: Math.max(0, 0.4 - smokeT * 0.4) });
    }
    this.drawDebris(t, 0x6b4a25);
  }

  // ── Nuke: white flash + big shockwave + rising mushroom cloud ─────────────
  private drawNuke(t: number): void {
    const r = this.r;
    // Multiple expanding shockwave rings.
    for (let i = 0; i < 2; i++) {
      const rt = Math.min((t - i * 0.08) / 0.5, 1);
      if (rt > 0) this.g.circle(0, 0, r * (0.4 + rt * 1.3)).stroke({ color: 0xffe08a, width: 3, alpha: Math.max(0, 0.6 - rt * 0.6) });
    }
    // Early blinding white flash.
    if (t < 0.12) this.g.circle(0, 0, r * (0.6 + t * 2)).fill({ color: 0xffffff, alpha: 1 - t / 0.12 });
    // Mushroom: rising stem + bulbous cap.
    const rise = Math.min(t / 0.7, 1);
    const stemH = r * 1.3 * rise;
    const capY = -stemH;
    const fade = Math.max(0, 1 - t);
    this.g.rect(-r * 0.18, capY, r * 0.36, stemH).fill({ color: 0xff8c00, alpha: fade * 0.8 });
    this.g.ellipse(0, capY, r * 0.7 * rise, r * 0.5 * rise).fill({ color: 0xff8c00, alpha: fade * 0.9 });
    this.g.ellipse(0, capY, r * 0.5 * rise, r * 0.36 * rise).fill({ color: 0xfbbf24, alpha: fade });
    // Ground fireball.
    this.g.ellipse(0, 0, r * 0.7 * Math.min(t / 0.15, 1), r * 0.5 * Math.min(t / 0.15, 1)).fill({ color: 0xff6600, alpha: fade * 0.85 });
    this.drawDebris(t, 0x6b4a25);
  }

  // ── Plasma: purple glow + jagged arcs + white core, no dirt ───────────────
  private drawPlasma(t: number): void {
    const r = this.r;
    const fade = Math.max(0, 1 - t / 0.8);
    this.g.circle(0, 0, r * (0.4 + Math.min(t / 0.2, 1) * 0.8)).fill({ color: 0xa855f7, alpha: fade * 0.45 });
    this.g.circle(0, 0, r * 0.3 * Math.min(t / 0.15, 1)).fill({ color: 0xe9d5ff, alpha: fade * 0.9 });
    if (this.elapsed < 90) this.g.circle(0, 0, r * 0.18).fill({ color: 0xffffff, alpha: 1 - this.elapsed / 90 });
    // Jagged discharge arcs.
    const arcs = 5;
    for (let i = 0; i < arcs; i++) {
      const ang = (i / arcs) * Math.PI * 2 + this.seeds[i]! * 0.6;
      const len = r * (1 + this.seeds[i]! * 0.6) * Math.min(t / 0.3, 1);
      let px = 0, py = 0;
      this.g.moveTo(0, 0);
      const segs = 4;
      for (let s = 1; s <= segs; s++) {
        const fr = s / segs;
        const jitter = (this.seeds[(i + s) % 8]! - 0.5) * r * 0.4;
        px = Math.cos(ang) * len * fr + Math.cos(ang + Math.PI / 2) * jitter;
        py = Math.sin(ang) * len * fr + Math.sin(ang + Math.PI / 2) * jitter;
        this.g.lineTo(px, py);
      }
      this.g.stroke({ color: 0xd8b4fe, width: 2, alpha: fade * 0.8 });
    }
  }

  // ── Fire: flickering flame tongues, no dirt ───────────────────────────────
  private drawFire(t: number): void {
    const r = this.r;
    const fade = Math.max(0, 1 - t);
    const tongues = 6;
    for (let i = 0; i < tongues; i++) {
      const flick = 0.6 + 0.4 * Math.sin(this.elapsed / 60 + i);
      const tx = (i / (tongues - 1) - 0.5) * r * 1.4;
      const th = r * (0.7 + this.seeds[i]! * 0.6) * flick;
      const ty = -th * 0.5;
      this.g.ellipse(tx, ty, r * 0.22, th * 0.5).fill({ color: 0xff4500, alpha: fade * 0.8 });
      this.g.ellipse(tx, ty + th * 0.15, r * 0.13, th * 0.35).fill({ color: 0xffb000, alpha: fade * 0.9 });
    }
    this.g.ellipse(0, 0, r * 0.6 * Math.min(t / 0.15, 1), r * 0.4).fill({ color: 0xff6600, alpha: fade * 0.7 });
  }

  // ── Skull: dark shockwave + popping skull glyph ───────────────────────────
  private drawSkull(t: number): void {
    const r = this.r;
    const fade = Math.max(0, 1 - t);
    this.g.circle(0, 0, r * (0.5 + Math.min(t / 0.2, 1) * 1.1)).stroke({ color: 0x9b59b6, width: 3, alpha: Math.max(0, 0.6 - t * 0.6) });
    this.g.ellipse(0, 0, r * 0.6 * Math.min(t / 0.15, 1), r * 0.5 * Math.min(t / 0.15, 1)).fill({ color: 0x6b2d8c, alpha: fade * 0.7 });
    if (this.skullText) {
      const pop = Math.min(t / 0.2, 1);
      this.skullText.scale.set(pop * 1.2);
      this.skullText.alpha = fade;
      this.skullText.y = -t * r * 0.6; // rises
    }
    this.drawDebris(t, 0x3a2a45);
  }

  // ── Dirt: brown particle fan upward, no fireball ──────────────────────────
  private drawDirt(t: number): void {
    const r = this.r;
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (this.seeds[i % 8]! - 0.5) * 2.2;
      const speed = r * (1.2 + this.seeds[(i + 3) % 8]!);
      const dx = Math.cos(ang) * speed * t;
      const dy = Math.sin(ang) * speed * t + r * 2.2 * t * t; // gravity arc
      this.g.circle(dx, dy, 3 + this.seeds[i % 8]! * 3).fill({ color: 0x6b4a25, alpha: Math.max(0, 0.9 - t) });
    }
  }

  private drawDebris(t: number, color: number): void {
    if (t >= 0.4 || this.r <= 15) return;
    const debrisT = t / 0.4;
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + 0.3;
      const dist = this.r * 0.6 * debrisT;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist + 40 * debrisT * debrisT;
      this.g.circle(dx, dy, 2).fill({ color, alpha: Math.max(0, 0.8 - debrisT) });
    }
  }
}
