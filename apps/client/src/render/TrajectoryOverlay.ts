import { Container, Graphics } from "pixi.js";
import type { TrajectorySample } from "@se/game";

const DOT_RADIUS = 2.5;
const DOT_INTERVAL = 8; // every N samples
const DOT_COLOR = 0xfbbf24; // amber

export class TrajectoryOverlay extends Container {
  private g: Graphics;

  constructor() {
    super();
    this.g = new Graphics();
    this.addChild(this.g);
  }

  draw(samples: TrajectorySample[]): void {
    this.g.clear();
    for (let i = 0; i < samples.length; i += DOT_INTERVAL) {
      const s = samples[i]!;
      const alpha = 1 - (i / samples.length) * 0.7;
      this.g
        .circle(s.x, s.y, DOT_RADIUS)
        .fill({ color: DOT_COLOR, alpha });
    }
  }

  clear(): void {
    this.g.clear();
  }
}
