import { Container, Graphics } from "pixi.js";

const DURATION_MS = 700;
const GRAVITY = 300; // px/s²
const DT_S = 1 / 60;

// Earth tones for the dirt chunks
const DIRT_COLORS = [0x8b6914, 0x7a5c12, 0x9a7a28, 0x6b4f0e, 0x5c4a3c];

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
}

export class DirtParticles extends Container {
  private particles: Particle[] = [];
  private elapsed = 0;

  constructor(
    changedCols: Array<{ x: number; oldY: number; newY: number }>,
  ) {
    super();

    // Sample at most ~24 columns so we don't spawn hundreds of objects.
    const step = Math.max(1, Math.ceil(changedCols.length / 24));

    for (let i = 0; i < changedCols.length; i += step) {
      const col = changedCols[i]!;
      const drop = col.newY - col.oldY;

      // Spawn 1–3 chunks per sampled column based on how much terrain changed.
      const count = drop > 30 ? 3 : drop > 10 ? 2 : 1;

      for (let j = 0; j < count; j++) {
        const g = new Graphics();
        const size = 2 + Math.random() * 3;
        const color = DIRT_COLORS[Math.floor(Math.random() * DIRT_COLORS.length)]!;
        g.rect(-size / 2, -size / 2, size, size).fill(color);

        // Start anywhere within the carved column band
        g.x = col.x + (Math.random() - 0.5) * 4;
        g.y = col.oldY + Math.random() * drop * 0.4;

        this.addChild(g);
        this.particles.push({
          g,
          vx: (Math.random() - 0.5) * 40,
          vy: -15 - Math.random() * 25, // small upward kick from blast
        });
      }
    }
  }

  tick(): boolean {
    this.elapsed += 1000 / 60;
    const t = Math.min(this.elapsed / DURATION_MS, 1);

    for (const p of this.particles) {
      p.vy += GRAVITY * DT_S;
      p.g.x += p.vx * DT_S;
      p.g.y += p.vy * DT_S;
      p.g.alpha = 1 - t;
    }

    return t >= 1;
  }
}
