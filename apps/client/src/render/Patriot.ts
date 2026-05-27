import { Container, Graphics } from "pixi.js";

interface PatriotPos {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export class PatriotRenderer {
  private container: Container;
  private sprites = new Map<string, Graphics>();

  constructor(parent: Container) {
    this.container = new Container();
    parent.addChild(this.container);
  }

  onTick(patriots: PatriotPos[]): void {
    const incoming = new Set(patriots.map(p => p.id));

    for (const [id, sprite] of this.sprites) {
      if (!incoming.has(id)) {
        this.container.removeChild(sprite);
        this.sprites.delete(id);
      }
    }

    for (const p of patriots) {
      if (!this.sprites.has(p.id)) {
        const g = new Graphics();
        g.circle(0, 0, 4).fill(0xff4444);
        this.container.addChild(g);
        this.sprites.set(p.id, g);
      }
      const sprite = this.sprites.get(p.id)!;
      sprite.position.set(p.x, p.y);
      sprite.rotation = Math.atan2(p.vy, p.vx);
    }
  }

  clear(): void {
    for (const sprite of this.sprites.values()) {
      this.container.removeChild(sprite);
    }
    this.sprites.clear();
  }
}
