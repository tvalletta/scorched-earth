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

export class SkyRenderer extends Container {
  private layers: Container[] = [];
  private viewW: number;
  private viewH: number;

  constructor(timeOfDay: TimeOfDay, viewW: number, viewH: number) {
    super();
    this.viewW = viewW;
    this.viewH = viewH;
    this.buildLayers(timeOfDay);
  }

  private buildLayers(tod: TimeOfDay): void {
    const p = PALETTES[tod];
    const W = this.viewW;
    const H = this.viewH;

    // Layer 0 — gradient sky background (fixed, parallax 0)
    const bg = new Container();
    const gfx = new Graphics();
    const STRIPES = 16;
    for (let i = 0; i < STRIPES; i++) {
      const t = i / STRIPES;
      const color = lerpColor(t < 0.5 ? p.top : p.mid, t < 0.5 ? p.mid : p.bottom, t < 0.5 ? t * 2 : (t - 0.5) * 2);
      const y = Math.floor((H * 0.75 * i) / STRIPES);
      const h2 = Math.ceil(H * 0.75 / STRIPES) + 1;
      gfx.rect(0, y, W * 2, h2).fill(color);
    }
    gfx.rect(0, H * 0.75, W * 2, H * 0.25).fill(p.bottom);
    if (tod === 'night') {
      for (let i = 0; i < 25; i++) {
        const sx = Math.random() * W * 2;
        const sy = Math.random() * H * 0.5;
        gfx.circle(sx, sy, 1).fill({ color: 0xffffff, alpha: 0.7 + Math.random() * 0.3 });
      }
    }
    bg.addChild(gfx);
    this.addChild(bg);
    this.layers.push(bg);

    // Layer 1 — far clouds (drifts slowly)
    const farClouds = this.buildCloudLayer(6, 60, 90, 0.65, p.cloudTint, W, H);
    this.addChild(farClouds);
    this.layers.push(farClouds);

    // Layer 2 — distant hills
    const hillsFar = this.buildHillLayer(0x2d4a3e, 0.35, H, W);
    this.addChild(hillsFar);
    this.layers.push(hillsFar);

    // Layer 3 — mid hills
    const hillsMid = this.buildHillLayer(0x3a5c3e, 0.45, H, W);
    this.addChild(hillsMid);
    this.layers.push(hillsMid);

    // Layer 4 — near clouds (drifts faster)
    const nearClouds = this.buildCloudLayer(4, 80, 130, 0.9, p.cloudTint, W, H);
    this.addChild(nearClouds);
    this.layers.push(nearClouds);

    // Layer 5 — near hills
    const hillsNear = this.buildHillLayer(0x4a7050, 0.55, H, W);
    this.addChild(hillsNear);
    this.layers.push(hillsNear);
  }

  private buildCloudLayer(
    count: number, minW: number, maxW: number, opacity: number,
    tint: number, viewW: number, viewH: number,
  ): Container {
    const layer = new Container();
    for (let i = 0; i < count; i++) {
      const x = (i / count) * viewW * 2;
      const y = viewH * 0.05 + Math.random() * viewH * 0.25;
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

  private buildHillLayer(color: number, horizonFraction: number, viewH: number, viewW: number): Container {
    const layer = new Container();
    const g = new Graphics();
    const y0 = viewH * horizonFraction;
    g.moveTo(0, y0);
    const STEPS = 12;
    for (let i = 0; i <= STEPS; i++) {
      const x = (i / STEPS) * viewW * 2;
      const bump = Math.sin(i * 1.3) * viewH * 0.06 + Math.sin(i * 2.7) * viewH * 0.03;
      g.lineTo(x, y0 + bump);
    }
    g.lineTo(viewW * 2, viewH);
    g.lineTo(0, viewH);
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

      // Parallax: layer moves opposite to camera, but much less
      const baseX = -worldX * parallax;

      if (drift > 0) {
        // Drifting cloud layers: accumulate position over time then wrap
        layer.x += drift * dt;
        // Reset parallax reference by using modular arithmetic
        if (layer.x > this.viewW * 2) layer.x -= this.viewW * 2;
        if (layer.x < -this.viewW * 2) layer.x += this.viewW * 2;
      } else {
        layer.x = baseX;
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
