import { Container, Graphics } from "pixi.js";
import type { TrajectorySample } from "@se/game";

const DOT_RADIUS = 2.5;
const DOT_INTERVAL = 8; // every N samples
const DOT_COLOR = 0xfbbf24; // amber

export class TrajectoryOverlay extends Container {
  private g: Graphics;
  private smokeZones: Array<{ x: number; width: number }> = [];

  constructor() {
    super();
    this.g = new Graphics();
    this.addChild(this.g);
  }

  setSmokeZones(zones: Array<{ x: number; width: number }>): void {
    this.smokeZones = zones;
  }

  private isInSmoke(tankX: number): boolean {
    return this.smokeZones.some(z => Math.abs(tankX - z.x) <= z.width / 2);
  }

  draw(samples: TrajectorySample[], tankX?: number): void {
    this.g.clear();
    if (tankX !== undefined && this.isInSmoke(tankX)) {
      // Tank is inside a smoke zone — suppress trajectory preview
      return;
    }
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
