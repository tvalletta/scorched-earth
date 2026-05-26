import { Graphics } from "pixi.js";

const BAR_W = 32;
const BAR_H = 5;
const BAR_OFFSET_Y = -26; // px above tank pivot

export class HpBar extends Graphics {
  redraw(hp: number, maxHp = 100): void {
    this.clear();
    const pct = Math.max(0, Math.min(1, hp / maxHp));
    const color = hp > 50 ? 0x22c55e : hp > 25 ? 0xf59e0b : 0xef4444;
    this.rect(-BAR_W / 2, 0, BAR_W, BAR_H).fill({ color: 0x000000, alpha: 0.5 });
    if (pct > 0) {
      this.rect(-BAR_W / 2, 0, Math.round(BAR_W * pct), BAR_H).fill({ color, alpha: 1 });
    }
    this.position.set(0, BAR_OFFSET_Y);
  }
}
