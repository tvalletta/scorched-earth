import { Container, Graphics } from 'pixi.js';

export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';

interface SkyPalette {
  top: number; mid: number; bottom: number;
  cloudTint: number; stars: boolean;
}

const PALETTES: Record<TimeOfDay, SkyPalette> = {
  dawn:  { top: 0xff7043, mid: 0xffb74d, bottom: 0x81d4fa, cloudTint: 0xffccaa, stars: false },
  day:   { top: 0x1a6fa8, mid: 0x4da6d8, bottom: 0xb8e4f9, cloudTint: 0xffffff, stars: false },
  dusk:  { top: 0xb34700, mid: 0xe65c00, bottom: 0xffcc02, cloudTint: 0xffaa55, stars: false },
  night: { top: 0x0a0a2e, mid: 0x1a1a4e, bottom: 0x1a3a5e, cloudTint: 0xaabbcc, stars: true  },
};

const PARALLAX = [0, 0.05, 0.08, 0.12, 0.15, 0.18];
const DRIFT_SPEEDS = [0, 8, 0, 0, 20, 0]; // px/s — layers 1 and 4 are cloud layers
const SPAN_MULT = 6; // span wide enough that max parallax shift never exposes an end

export class SkyRenderer extends Container {
  private layers: Container[] = [];
  private viewW: number;
  private viewH: number;
  private tod: TimeOfDay;
  private span = 0;

  constructor(timeOfDay: TimeOfDay, viewW: number, viewH: number) {
    super();
    this.tod = timeOfDay;
    this.viewW = viewW;
    this.viewH = viewH;
    this.buildLayers();
  }

  /** Rebuild for a new viewport (call on window resize). */
  resize(viewW: number, viewH: number): void {
    this.viewW = viewW;
    this.viewH = viewH;
    for (const l of this.layers) this.removeChild(l);
    this.layers = [];
    this.buildLayers();
  }

  private buildLayers(): void {
    const p = PALETTES[this.tod];
    const H = this.viewH;
    // Wide span centred on x=0 so parallax shifts stay well inside it.
    this.span = Math.max(this.viewW, 1600) * SPAN_MULT;
    const SPAN = this.span;
    const LEFT = -SPAN / 2;
    const TOP = -H * 0.5;       // extend above
    const BOT = H * 1.5;        // extend well below the island base

    // Layer 0 — gradient sky background (fixed, parallax 0)
    const bg = new Container();
    const gfx = new Graphics();
    const STRIPES = 16;
    const gradBottom = H * 0.75;
    for (let i = 0; i < STRIPES; i++) {
      const t = i / STRIPES;
      const color = lerpColor(t < 0.5 ? p.top : p.mid, t < 0.5 ? p.mid : p.bottom, t < 0.5 ? t * 2 : (t - 0.5) * 2);
      const y = TOP + Math.floor(((gradBottom - TOP) * i) / STRIPES);
      const h2 = Math.ceil((gradBottom - TOP) / STRIPES) + 1;
      gfx.rect(LEFT, y, SPAN, h2).fill(color);
    }
    gfx.rect(LEFT, gradBottom, SPAN, BOT - gradBottom).fill(p.bottom);
    if (p.stars) {
      for (let i = 0; i < 90; i++) {
        const sx = LEFT + Math.random() * SPAN;
        const sy = TOP + Math.random() * (H * 0.7);
        gfx.circle(sx, sy, 1).fill({ color: 0xffffff, alpha: 0.7 + Math.random() * 0.3 });
      }
    }
    bg.addChild(gfx);
    this.addChild(bg);
    this.layers.push(bg);

    // Layer 1 — far clouds (drifts slowly)
    const farClouds = this.buildCloudLayer(Math.ceil(6 * SPAN_MULT / 2), 60, 90, 0.65, p.cloudTint);
    this.addChild(farClouds); this.layers.push(farClouds);

    // Layer 2 — distant hills
    const hillsFar = this.buildHillLayer(0x2d4a3e, 0.35);
    this.addChild(hillsFar); this.layers.push(hillsFar);

    // Layer 3 — mid hills
    const hillsMid = this.buildHillLayer(0x3a5c3e, 0.45);
    this.addChild(hillsMid); this.layers.push(hillsMid);

    // Layer 4 — near clouds (drifts faster)
    const nearClouds = this.buildCloudLayer(Math.ceil(4 * SPAN_MULT / 2), 80, 130, 0.9, p.cloudTint);
    this.addChild(nearClouds); this.layers.push(nearClouds);

    // Layer 5 — near hills
    const hillsNear = this.buildHillLayer(0x4a7050, 0.55);
    this.addChild(hillsNear); this.layers.push(hillsNear);
  }

  private buildCloudLayer(count: number, minW: number, maxW: number, opacity: number, tint: number): Container {
    const layer = new Container();
    const SPAN = this.span, LEFT = -SPAN / 2, H = this.viewH;
    for (let i = 0; i < count; i++) {
      const x = LEFT + (i / count) * SPAN;
      const y = H * 0.05 + Math.random() * H * 0.3;
      const w = minW + Math.random() * (maxW - minW);
      const cloud = new Graphics();
      cloud.ellipse(0, 0, w, w * 0.4).fill({ color: tint, alpha: opacity * 0.9 });
      cloud.ellipse(w * 0.3, -w * 0.15, w * 0.65, w * 0.32).fill({ color: tint, alpha: opacity });
      cloud.ellipse(-w * 0.3, -w * 0.1, w * 0.55, w * 0.28).fill({ color: tint, alpha: opacity * 0.8 });
      cloud.position.set(x, y);
      layer.addChild(cloud);
    }
    return layer;
  }

  private buildHillLayer(color: number, horizonFraction: number): Container {
    const layer = new Container();
    const g = new Graphics();
    const SPAN = this.span, LEFT = -SPAN / 2, H = this.viewH;
    const y0 = H * horizonFraction;
    const STEPS = Math.max(24, Math.round(SPAN / 130)); // keep bump density seam-free across the span
    g.moveTo(LEFT, y0);
    for (let i = 0; i <= STEPS; i++) {
      const x = LEFT + (i / STEPS) * SPAN;
      const bump = Math.sin(i * 1.3) * H * 0.06 + Math.sin(i * 2.7) * H * 0.03;
      g.lineTo(x, y0 + bump);
    }
    g.lineTo(LEFT + SPAN, H * 1.5);
    g.lineTo(LEFT, H * 1.5);
    g.closePath();
    g.fill({ color, alpha: 0.6 });
    layer.addChild(g);
    return layer;
  }

  // Call each frame — worldX is camera.worldX
  update(dt: number, worldX: number): void {
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i]!;
      const parallax = PARALLAX[i] ?? 0;
      const drift = DRIFT_SPEEDS[i] ?? 0;
      if (drift > 0) {
        layer.x += drift * dt;
        if (layer.x > this.span) layer.x -= this.span;
        if (layer.x < -this.span) layer.x += this.span;
      } else {
        layer.x = -worldX * parallax;
      }
    }
  }
}

export function timeOfDayFromSeed(seed: string): TimeOfDay {
  const n = parseInt(seed, 10) || seed.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const options: TimeOfDay[] = ['dawn', 'day', 'dusk', 'night'];
  return options[Math.abs(n) % 4]!;
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bv = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bv;
}
