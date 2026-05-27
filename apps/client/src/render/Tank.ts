import { Container, Graphics } from "pixi.js";
import { HpBar } from "../hud/HpBar";
import { ShieldBubble } from "./Shield";

const COLOR_HEX: Record<string, number> = {
  red: 0xe63946,
  blue: 0x3a86ff,
  green: 0x80b918,
  yellow: 0xfca311,
  cyan: 0x00b4d8,
  magenta: 0xb5179e,
  orange: 0xf4a261,
  white: 0xf1f1f1,
  pink: 0xf48fb1,
  lime: 0xa6d96a,
};

// HP bar sits at y=-26, height=5px. Fuel bar goes 4px below: y = -26 + 5 + 4 = -17.
const FUEL_BAR_Y = -17;
const FUEL_BAR_W = 40;
const FUEL_BAR_H = 4;

export interface TankView {
  setPos(x: number, y: number): void;
  setAngle(angleDeg: number): void;
  setAlive(alive: boolean): void;
  setHp(hp: number): void;
  setShield(shieldId: string, shieldHp: number, shieldMaxHp: number): void;
  flashShield(): void;
  setFuel(fuel: number, maxFuel: number): void;
  destroy(): void;
}

export function createTankView(opts: { color: string; hat: string }): Container & TankView {
  const fill = COLOR_HEX[opts.color] ?? 0xe63946;
  const root = new Container() as Container & TankView;

  const body = new Graphics();
  body.roundRect(-14, 0, 28, 9, 2).fill(fill).stroke({ color: 0x2c3e50, width: 2 });
  body.roundRect(-10, -7, 20, 7, 2).fill(fill).stroke({ color: 0x2c3e50, width: 2 });
  root.addChild(body);

  const turret = new Graphics();
  turret.moveTo(0, -3).lineTo(14, -13).stroke({ color: 0x2c3e50, width: 3, cap: "round" });
  root.addChild(turret);

  const hat = new Graphics();
  drawHat(hat, opts.hat);
  hat.position.set(0, -12);
  root.addChild(hat);

  const hpBar = new HpBar();
  hpBar.redraw(100);
  root.addChild(hpBar);

  const shieldBubble = new ShieldBubble();
  root.addChild(shieldBubble);

  const fuelBar = new Graphics();
  fuelBar.position.set(-FUEL_BAR_W / 2, FUEL_BAR_Y);
  root.addChild(fuelBar);

  root.setPos = (x: number, y: number) => {
    root.position.set(x, y);
  };
  root.setAngle = (deg: number) => {
    // Turret stroke is drawn from (0,-3) to (14,-13), direction (14,-10).
    // Convention: deg=0 → fire left, deg=90 → fire up, deg=180 → fire right.
    // Desired screen direction = (-cos(a), -sin(a)); natural angle = atan2(-10,14).
    turret.rotation = Math.PI + (deg * Math.PI) / 180 - Math.atan2(-10, 14);
  };
  root.setAlive = (alive) => {
    root.alpha = alive ? 1 : 0.3;
    hpBar.visible = alive;
  };
  root.setHp = (hp) => hpBar.redraw(hp);
  root.setShield = (shieldId: string, shieldHp: number, shieldMaxHp: number) => {
    shieldBubble.update(shieldId, shieldHp, shieldMaxHp);
  };
  root.flashShield = () => shieldBubble.flash();
  root.setFuel = (fuel: number, maxFuel: number) => {
    fuelBar.clear();
    // Background track
    fuelBar.rect(0, 0, FUEL_BAR_W, FUEL_BAR_H).fill({ color: 0x000000, alpha: 0.5 });
    const fraction = maxFuel > 0 ? Math.max(0, Math.min(1, fuel / maxFuel)) : 0;
    if (fraction > 0) {
      fuelBar.rect(0, 0, Math.round(FUEL_BAR_W * fraction), FUEL_BAR_H).fill({ color: 0x4ecdc4, alpha: 1 });
    }
  };
  root.destroy = () => root.removeFromParent();
  root.setAngle(90);
  return root;
}

function drawHat(g: Graphics, type: string) {
  if (type === "chef") {
    g.ellipse(0, 0, 8, 3).fill(0xffffff).stroke({ color: 0x2c3e50, width: 1 });
    g.poly(
      [-7, 0, -8, -10, 0, -12, 8, -10, 7, 0],
      true,
    )
      .fill(0xffffff)
      .stroke({ color: 0x2c3e50, width: 1 });
  } else if (type === "top-hat") {
    g.rect(-6, -6, 12, 9).fill(0x1b1b1b).stroke({ color: 0x000000, width: 1 });
    g.rect(-8, 2, 16, 2).fill(0x1b1b1b);
  } else if (type === "beanie") {
    g.roundRect(-7, -8, 14, 8, 4).fill(0xb5179e).stroke({ color: 0x2c3e50, width: 1 });
    g.circle(0, -8, 2).fill(0xffffff);
  }
}
