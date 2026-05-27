import { Container, Graphics } from "pixi.js";

interface LivePos {
  id: string;
  x: number;
  y: number;
  weaponId: string;
}

export class ProjectileRenderer {
  private container: Container;
  private sprites = new Map<string, Graphics>();

  constructor(parent: Container) {
    this.container = new Container();
    parent.addChild(this.container);
  }

  onTick(projectiles: LivePos[]): void {
    const incoming = new Set(projectiles.map(p => p.id));

    // Remove sprites for gone projectiles
    for (const [id, sprite] of this.sprites) {
      if (!incoming.has(id)) {
        this.container.removeChild(sprite);
        this.sprites.delete(id);
      }
    }

    // Upsert sprites for live projectiles
    for (const p of projectiles) {
      if (!this.sprites.has(p.id)) {
        const g = new Graphics();
        g.circle(0, 0, 5).fill(0x2c3e50);
        this.container.addChild(g);
        this.sprites.set(p.id, g);
      }
      const sprite = this.sprites.get(p.id)!;
      sprite.position.set(p.x, p.y);
    }
  }

  clear(): void {
    for (const sprite of this.sprites.values()) {
      this.container.removeChild(sprite);
    }
    this.sprites.clear();
  }
}
