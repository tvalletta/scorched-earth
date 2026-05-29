import { Container, Graphics, Text } from 'pixi.js';
import { HpBar } from '../hud/HpBar';
import { ShieldBubble } from './Shield';

const COLOR_HEX: Record<string, number> = {
  red: 0xe63946, blue: 0x3a86ff, green: 0x80b918, yellow: 0xfca311,
  cyan: 0x00b4d8, magenta: 0xb5179e, orange: 0xf4a261, white: 0xf1f1f1,
  pink: 0xf48fb1, lime: 0xa6d96a,
};

const FUEL_BAR_Y = -30;
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
  const darkFill = darken(fill, 0.25);
  const root = new Container() as Container & TankView;

  // Drop shadow
  const shadow = new Graphics();
  shadow.ellipse(0, 18, 28, 5).fill({ color: 0x000000, alpha: 0.3 });
  root.addChild(shadow);

  // Tracks
  const tracks = new Graphics();
  tracks.ellipse(-14, 14, 13, 5).fill(0x222222).stroke({ color: 0x111111, width: 1 });
  tracks.ellipse(14, 14, 13, 5).fill(0x222222).stroke({ color: 0x111111, width: 1 });
  tracks.ellipse(-14, 14, 9, 3).fill(0x333333);
  tracks.ellipse(14, 14, 9, 3).fill(0x333333);
  root.addChild(tracks);

  // Hull body
  const hull = new Graphics();
  hull.roundRect(-22, 2, 44, 16, 8).fill(fill).stroke({ color: 0x1a1a2e, width: 2.5 });
  hull.rect(-20, 3, 40, 3).fill({ color: 0xffffff, alpha: 0.22 });
  hull.rect(-20, 14, 40, 3).fill({ color: 0x000000, alpha: 0.18 });
  root.addChild(hull);

  // Turret
  const turret = new Graphics();
  turret.roundRect(-12, -6, 24, 10, 5).fill(darkFill).stroke({ color: 0x1a1a2e, width: 2 });
  root.addChild(turret);

  // Hat (drawn before barrel so barrel renders on top)
  const hatGfx = new Graphics();
  drawHat(hatGfx, opts.hat);
  hatGfx.position.set(0, -6);
  root.addChild(hatGfx);

  // Barrel container — pivot at turret center (0, -1)
  const barrel = new Container();
  barrel.position.set(0, -1);
  const barrelGfx = new Graphics();
  barrelGfx.rect(0, -3, 26, 6).fill(0x888888).stroke({ color: 0x444444, width: 1.5 });
  barrelGfx.rect(22, -4, 5, 8).fill(0xaaaaaa).stroke({ color: 0x333333, width: 1 });
  barrel.addChild(barrelGfx);
  root.addChild(barrel);

  // HP bar
  const hpBar = new HpBar();
  hpBar.redraw(100);
  root.addChild(hpBar);

  // Shield bubble
  const shieldBubble = new ShieldBubble();
  root.addChild(shieldBubble);

  // Fuel bar
  const fuelBar = new Graphics();
  fuelBar.position.set(-FUEL_BAR_W / 2, FUEL_BAR_Y);
  root.addChild(fuelBar);

  let currentAngleDeg = 90;
  let dying = false;

  const setBarrelAngle = (deg: number) => {
    currentAngleDeg = deg;
    barrel.rotation = Math.PI + (deg * Math.PI) / 180;
  };

  root.setPos = (x, y) => root.position.set(x, y);

  root.setAngle = (deg) => {
    if (!dying) setBarrelAngle(deg);
  };

  root.setAlive = (alive) => {
    hpBar.visible = alive;
    if (!alive && !dying) {
      dying = true;
      root.tint = 0xffffff;
      const ticker = (window as { pixiApp?: { ticker: { add: (fn: (t: { deltaMS: number }) => void) => void; remove: (fn: (t: { deltaMS: number }) => void) => void } } }).pixiApp?.ticker;
      if (ticker) {
        let elapsed = 0;
        const startAngle = currentAngleDeg;
        const startAlpha = root.alpha;
        const onTick = (t: { deltaMS: number }) => {
          elapsed += t.deltaMS;
          if (elapsed < 50) { root.tint = 0xffffff; return; }
          root.tint = 0xffffff;
          const progress = Math.min((elapsed - 50) / 500, 1);
          const eased = progress * progress;
          setBarrelAngle(startAngle + (270 - startAngle) * eased);
          root.alpha = startAlpha - (startAlpha - 0.3) * eased;
          if (progress >= 1) {
            ticker.remove(onTick);
            const skull = new Text({ text: '💀', style: { fontSize: 16 } });
            skull.anchor.set(0.5, 1);
            skull.position.set(0, -20);
            root.addChild(skull);
            let floatElapsed = 0;
            const floatY = skull.y;
            const onFloat = (ft: { deltaMS: number }) => {
              floatElapsed += ft.deltaMS;
              skull.y = floatY - (floatElapsed / 600) * 20;
              if (floatElapsed >= 600) ticker.remove(onFloat);
            };
            ticker.add(onFloat);
          }
        };
        ticker.add(onTick);
      }
    } else if (alive) {
      dying = false;
      root.alpha = 1;
      root.tint = 0xffffff;
    }
  };

  root.setHp = (hp) => hpBar.redraw(hp);

  root.setShield = (shieldId, shieldHp, shieldMaxHp) => {
    shieldBubble.update(shieldId, shieldHp, shieldMaxHp);
  };

  root.flashShield = () => shieldBubble.flash();

  root.setFuel = (fuel, maxFuel) => {
    fuelBar.clear();
    fuelBar.rect(0, 0, FUEL_BAR_W, FUEL_BAR_H).fill({ color: 0x000000, alpha: 0.5 });
    const fraction = maxFuel > 0 ? Math.max(0, Math.min(1, fuel / maxFuel)) : 0;
    if (fraction > 0) {
      fuelBar.rect(0, 0, Math.round(FUEL_BAR_W * fraction), FUEL_BAR_H).fill({ color: 0x4ecdc4, alpha: 1 });
    }
  };

  root.destroy = () => root.removeFromParent();
  setBarrelAngle(90);
  return root;
}

function darken(color: number, amount: number): number {
  const r = Math.round(((color >> 16) & 0xff) * (1 - amount));
  const g = Math.round(((color >> 8) & 0xff) * (1 - amount));
  const b = Math.round((color & 0xff) * (1 - amount));
  return (r << 16) | (g << 8) | b;
}

function drawHat(g: Graphics, type: string): void {
  switch (type) {
    case 'helm':
      g.rect(-9, -2, 18, 4).fill(0x3a3a3a);
      g.roundRect(-7, -12, 14, 11, 3).fill(0x4a4a4a).stroke({ color: 0x222222, width: 1 });
      break;
    case 'chef':
      g.ellipse(0, -2, 10, 3).fill(0xffffff).stroke({ color: 0xcccccc, width: 1 });
      g.rect(-5, -16, 10, 15).fill(0xffffff).stroke({ color: 0xcccccc, width: 1 });
      g.ellipse(0, -17, 6, 4).fill(0xffffff);
      break;
    case 'tophat':
      g.rect(-9, 2, 18, 2).fill(0x1b1b1b);
      g.rect(-6, -12, 12, 15).fill(0x1b1b1b).stroke({ color: 0x000000, width: 1 });
      break;
    case 'beanie':
      g.roundRect(-7, -12, 14, 13, 4).fill(0x9b59b6).stroke({ color: 0x7d3c98, width: 1 });
      g.circle(0, -13, 3).fill(0xffffff);
      break;
    case 'cowboy':
      g.ellipse(0, -1, 14, 3).fill(0x8b5e3c);
      g.roundRect(-6, -11, 12, 11, 3).fill(0x6b4226).stroke({ color: 0x4a2f1a, width: 1 });
      break;
    case 'party':
      g.poly([-6, 0, 6, 0, 0, -14], true).fill(0xf39c12).stroke({ color: 0xe67e22, width: 1 });
      g.rect(-5, -3, 10, 3).fill(0xe74c3c);
      break;
    case 'viking':
      g.roundRect(-7, -12, 14, 13, 3).fill(0x95a5a6).stroke({ color: 0x7f8c8d, width: 1 });
      g.poly([-8, -8, -14, -18, -6, -8], true).fill(0xf0e68c);
      g.poly([8, -8, 14, -18, 6, -8], true).fill(0xf0e68c);
      break;
    case 'santa':
      g.roundRect(-7, -12, 14, 13, 3).fill(0xc0392b).stroke({ color: 0x922b21, width: 1 });
      g.rect(-8, -3, 16, 3).fill(0xffffff);
      g.circle(2, -14, 3).fill(0xffffff);
      break;
    // 'none' and anything else — nothing drawn
  }
}
