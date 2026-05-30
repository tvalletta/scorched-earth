import { Container, Graphics } from "pixi.js";
import { TERRAIN_WIDTH } from "@se/shared";

/**
 * Energy-cage boundary shown only for the `reflect` (bounce) and `absorb`
 * wall modes — the modes where the left/right edges actually do something.
 * Cyan = reflect (springy), violet = absorb (dampening). Self-animating gentle
 * shimmer via the shared Pixi ticker.
 */
export class CageRenderer extends Container {
  private g = new Graphics();
  private topY = -150;
  private bottomY = 900;
  private mode = "none";
  private elapsed = 0;
  private tickFn = (t: { deltaMS: number }) => {
    this.elapsed += t.deltaMS;
    if (this.visible) this.g.alpha = 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(this.elapsed / 360));
  };

  constructor() {
    super();
    this.addChild(this.g);
    this.visible = false;
    (window as { pixiApp?: { ticker: { add: (f: (t: { deltaMS: number }) => void) => void } } }).pixiApp?.ticker.add(this.tickFn);
  }

  /** Set the wall mode and the vertical span the cage should frame. */
  update(mode: string, topY = this.topY, bottomY = this.bottomY): void {
    this.mode = mode;
    this.topY = topY;
    this.bottomY = bottomY;
    this.redraw();
  }

  private redraw(): void {
    const g = this.g;
    g.clear();
    if (this.mode !== "reflect" && this.mode !== "absorb") {
      this.visible = false;
      return;
    }
    this.visible = true;
    const reflect = this.mode === "reflect";
    const main = reflect ? 0x38bdf8 : 0xa855f7; // cyan vs violet
    const glow = reflect ? 0x7dd3fc : 0xd8b4fe;
    const W = TERRAIN_WIDTH;
    const top = this.topY;
    const h = this.bottomY - this.topY;
    const t = 12; // wall thickness

    for (const edge of [0, 1]) {
      const xOuter = edge === 0 ? 0 : W - t;
      const xInner = edge === 0 ? t : W - t;
      const capX = edge === 0 ? t / 2 : W - t / 2;

      // Translucent field
      g.rect(xOuter, top, t, h).fill({ color: main, alpha: 0.14 });
      // Bright inner edge (the actual boundary line)
      g.rect(xInner - 1.5, top, 3, h).fill({ color: glow, alpha: 0.9 });
      // Horizontal energy bands
      for (let y = top; y < this.bottomY; y += 26) {
        g.rect(xOuter, y, t, 2).fill({ color: glow, alpha: 0.45 });
      }
      // Absorb mode: inward chevrons suggesting "pulling in"; reflect: outward ticks
      for (let y = top + 14; y < this.bottomY; y += 52) {
        const dir = edge === 0 ? 1 : -1;
        const cx = xInner + dir * 6;
        g.moveTo(cx, y - 5).lineTo(cx + dir * (reflect ? -5 : 6), y).lineTo(cx, y + 5)
          .stroke({ color: glow, width: 1.5, alpha: 0.6 });
      }
      // Glowing pylon caps
      g.circle(capX, top, 9).fill({ color: glow, alpha: 0.95 });
      g.circle(capX, top, 14).stroke({ color: main, width: 2, alpha: 0.5 });
      g.circle(capX, this.bottomY, 9).fill({ color: glow, alpha: 0.95 });
    }

    // Faint dashed top rail — arena framing only (top doesn't reflect physics).
    for (let x = 18; x < W - 18; x += 34) {
      g.rect(x, top - 1, 18, 2).fill({ color: glow, alpha: 0.22 });
    }
  }
}
