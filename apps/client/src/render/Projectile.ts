import { Container, Graphics } from "pixi.js";

interface LivePos {
  id: string;
  x: number;
  y: number;
  weaponId: string;
}

interface ProjStyle {
  size: number;
  color: number;
  core?: number;
  glow: boolean;
  trailColor: number;
  trailSize: number;
  trailAlpha: number;
}

const DEFAULT_STYLE: ProjStyle = { size: 5, color: 0x2c3e50, glow: false, trailColor: 0x94a3b8, trailSize: 2, trailAlpha: 0.25 };

const STYLES: Record<string, ProjStyle> = {
  fireball:     { size: 7, color: 0xff6600, core: 0xffe08a, glow: true, trailColor: 0xff4500, trailSize: 5, trailAlpha: 0.55 },
  napalm:       { size: 6, color: 0xff6600, core: 0xffd000, glow: true, trailColor: 0xff5500, trailSize: 4, trailAlpha: 0.5 },
  'hot-napalm': { size: 6, color: 0xff4400, core: 0xffd000, glow: true, trailColor: 0xff3300, trailSize: 4, trailAlpha: 0.55 },
  tracer:       { size: 3, color: 0xfff176, core: 0xffffff, glow: true, trailColor: 0xfff176, trailSize: 2.5, trailAlpha: 0.8 },
  'plasma-ball':{ size: 6, color: 0xa855f7, core: 0xe9d5ff, glow: true, trailColor: 0xc084fc, trailSize: 4, trailAlpha: 0.5 },
  'plasma-blast':{ size: 6, color: 0xa855f7, core: 0xe9d5ff, glow: true, trailColor: 0xc084fc, trailSize: 4, trailAlpha: 0.5 },
  nuke:         { size: 7, color: 0x334155, glow: true, trailColor: 0x64748b, trailSize: 3, trailAlpha: 0.35 },
  'baby-nuke':  { size: 6, color: 0x334155, glow: true, trailColor: 0x64748b, trailSize: 3, trailAlpha: 0.35 },
  'funky-nuke': { size: 7, color: 0x7c3aed, glow: true, trailColor: 0xa855f7, trailSize: 3, trailAlpha: 0.4 },
};

const TRAIL_LEN = 12;

export class ProjectileRenderer {
  private container: Container;
  private sprites = new Map<string, Graphics>();
  private trails = new Map<string, Array<{ x: number; y: number }>>();

  constructor(parent: Container) {
    this.container = new Container();
    parent.addChild(this.container);
  }

  onTick(projectiles: LivePos[]): void {
    const incoming = new Set(projectiles.map((p) => p.id));
    for (const [id, sprite] of this.sprites) {
      if (!incoming.has(id)) {
        this.container.removeChild(sprite);
        this.sprites.delete(id);
        this.trails.delete(id);
      }
    }
    for (const p of projectiles) {
      let g = this.sprites.get(p.id);
      if (!g) { g = new Graphics(); this.container.addChild(g); this.sprites.set(p.id, g); }
      const trail = this.trails.get(p.id) ?? [];
      trail.push({ x: p.x, y: p.y });
      if (trail.length > TRAIL_LEN) trail.shift();
      this.trails.set(p.id, trail);
      this.draw(g, p, trail);
    }
  }

  private draw(g: Graphics, p: LivePos, trail: Array<{ x: number; y: number }>): void {
    g.clear();
    const s = STYLES[p.weaponId] ?? DEFAULT_STYLE;
    // Trail (world coords; oldest = faintest/smallest).
    for (let i = 0; i < trail.length - 1; i++) {
      const a = (i + 1) / trail.length;
      const pt = trail[i]!;
      g.circle(pt.x, pt.y, Math.max(0.5, s.trailSize * a)).fill({ color: s.trailColor, alpha: a * s.trailAlpha });
    }
    // Glow + body + core.
    if (s.glow) g.circle(p.x, p.y, s.size * 1.9).fill({ color: s.color, alpha: 0.22 });
    g.circle(p.x, p.y, s.size).fill(s.color);
    if (s.core) g.circle(p.x, p.y, s.size * 0.5).fill({ color: s.core, alpha: 0.95 });
  }

  clear(): void {
    for (const sprite of this.sprites.values()) this.container.removeChild(sprite);
    this.sprites.clear();
    this.trails.clear();
  }
}
