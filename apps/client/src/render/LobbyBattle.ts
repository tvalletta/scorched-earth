import { Application, Container } from "pixi.js";
import { TERRAIN_WIDTH, TERRAIN_HEIGHT, ALL_TERRAIN_TYPES, COLORS, HATS } from "@se/shared";
import { TerrainRenderer } from "./Terrain";
import { createTankView, type TankView } from "./Tank";
import { ProjectileRenderer } from "./Projectile";
import { Explosion } from "./Explosion";
import { computeFit } from "./Camera";
import { stepProjectile, aimAt, shouldReset, type SimProjectile } from "./lobbyBattleSim";

const BATTLE_GRAVITY = 300;
const BATTLE_MAX_MS = 25_000;
const TURN_MIN_MS = 1_400;
const TURN_MAX_MS = 2_400;
const TANK_COUNT = 4;
const BLAST_RADIUS = 70;
const FADE_MS = 600;

interface BattleTank {
  view: Container & TankView;
  x: number;
  y: number;
  color: string;
  hp: number;
  alive: boolean;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/**
 * Cosmetic, fully client-side background battle: 4 tanks lob shells on
 * procedural terrain behind the lobby panel. No networking. Robust to a
 * down/slow server — it never blocks the lobby.
 */
export class LobbyBattle {
  private container: Container;
  private world: Container;
  private terrain!: TerrainRenderer;
  private projectiles!: ProjectileRenderer;
  private tanks: BattleTank[] = [];
  private explosions: Explosion[] = [];

  private shot: (SimProjectile & { id: string }) | null = null;
  private wind = 0;
  private nextTurnAt = 0;
  private battleStart = 0;
  private elapsed = 0;
  private fading: "in" | "out" | null = null;
  private fadeElapsed = 0;
  private paused = false;
  private tickFn = (ticker: { deltaMS: number }) => this.onTick(ticker.deltaMS);
  private onVisibility = () => { this.paused = document.hidden; };

  constructor(private app: Application) {
    this.container = new Container();
    this.world = new Container();
    this.container.addChild(this.world);
    this.app.stage.addChildAt(this.container, 0);
  }

  start(): void {
    this.build();
    document.addEventListener("visibilitychange", this.onVisibility);
    this.app.ticker.add(this.tickFn);
  }

  private build(): void {
    // Fresh world
    this.world.removeChildren();
    for (const t of this.tanks) t.view.destroy();
    this.tanks = [];
    this.explosions = [];
    this.shot = null;

    const seed = "lobby-" + Math.floor(Math.random() * 1e9).toString(36);
    this.terrain = new TerrainRenderer(seed, pick(ALL_TERRAIN_TYPES));
    this.world.addChild(this.terrain);
    this.projectiles = new ProjectileRenderer(this.world);

    const usedColors = new Set<string>();
    for (let i = 0; i < TANK_COUNT; i++) {
      const x = (TERRAIN_WIDTH * (i + 1)) / (TANK_COUNT + 1) + rand(-60, 60);
      const y = this.terrain.heightAt(x);
      let color = pick(COLORS);
      while (usedColors.has(color)) color = pick(COLORS);
      usedColors.add(color);
      const view = createTankView({ color, hat: pick(HATS) });
      view.setPos(x, y);
      this.world.addChild(view);
      this.tanks.push({ view, x, y, color, hp: 100, alive: true });
    }

    // Static framing of the whole battlefield.
    const fit = computeFit(
      [{ x: 0, y: 0 }, { x: TERRAIN_WIDTH, y: TERRAIN_HEIGHT }],
      { width: this.app.screen.width, height: this.app.screen.height },
    );
    this.world.scale.set(fit.scale);
    this.world.position.set(fit.x, fit.y);

    this.wind = rand(-40, 40);
    this.battleStart = performance.now();
    this.elapsed = 0;
    this.nextTurnAt = performance.now() + rand(400, 1000);
    this.container.alpha = 0;
    this.fading = "in";
    this.fadeElapsed = 0;
  }

  private onTick(deltaMS: number): void {
    if (this.paused) return;
    const dt = Math.min(deltaMS, 32) / 1000;
    const now = performance.now();

    // Fades
    if (this.fading === "in") {
      this.fadeElapsed += deltaMS;
      this.container.alpha = Math.min(1, this.fadeElapsed / FADE_MS);
      if (this.container.alpha >= 1) this.fading = null;
    } else if (this.fading === "out") {
      this.fadeElapsed += deltaMS;
      this.container.alpha = Math.max(0, 1 - this.fadeElapsed / FADE_MS);
      if (this.container.alpha <= 0) { this.build(); return; }
    }

    // Advance explosions
    this.explosions = this.explosions.filter((ex) => {
      const done = ex.tick();
      if (done) this.world.removeChild(ex);
      return !done;
    });

    // Active shot
    if (this.shot) {
      const next = stepProjectile(this.shot, { gravity: BATTLE_GRAVITY, wind: this.wind, dt });
      this.shot = { ...next, id: this.shot.id };
      this.projectiles.onTick([{ id: this.shot.id, x: this.shot.x, y: this.shot.y, weaponId: "baby-missile" }]);
      if (this.hasImpact(this.shot)) this.resolveImpact(this.shot);
    } else if (this.fading === null && now >= this.nextTurnAt) {
      this.fireTurn();
    }

    // Reset / age
    this.elapsed = now - this.battleStart;
    const aliveCount = this.tanks.filter((t) => t.alive).length;
    if (this.fading === null && shouldReset({ aliveCount, elapsedMs: this.elapsed, maxMs: BATTLE_MAX_MS })) {
      this.fading = "out";
      this.fadeElapsed = 0;
    }
  }

  private fireTurn(): void {
    const alive = this.tanks.filter((t) => t.alive);
    if (alive.length < 2) return;
    const shooter = pick(alive);
    let target = pick(alive);
    while (target === shooter) target = pick(alive);
    const aim = aimAt({ x: shooter.x, y: shooter.y }, { x: target.x, y: target.y }, Math.random());
    // Point the barrel roughly along the shot.
    const angleDeg = (Math.atan2(-aim.vy, aim.vx) * 180) / Math.PI;
    shooter.view.setAngle(angleDeg);
    this.shot = { id: "s" + Math.floor(Math.random() * 1e9).toString(36), x: shooter.x, y: shooter.y - 22, vx: aim.vx, vy: aim.vy };
  }

  private hasImpact(p: SimProjectile): boolean {
    if (p.x < 0 || p.x > TERRAIN_WIDTH || p.y > TERRAIN_HEIGHT) return true;
    if (p.y >= this.terrain.heightAt(p.x)) return true;
    for (const t of this.tanks) {
      if (!t.alive) continue;
      if (Math.hypot(t.x - p.x, t.y - p.y) < 24) return true;
    }
    return false;
  }

  private resolveImpact(p: SimProjectile): void {
    const ix = Math.max(0, Math.min(TERRAIN_WIDTH, p.x));
    const iy = Math.min(p.y, this.terrain.heightAt(ix));
    this.projectiles.clear();
    this.shot = null;

    const ex = new Explosion(ix, iy, 45);
    this.world.addChild(ex);
    this.explosions.push(ex);
    this.terrain.carve({ x: ix, y: iy, radius: 45, tick: 0 });

    for (const t of this.tanks) {
      if (!t.alive) continue;
      const dist = Math.hypot(t.x - ix, t.y - iy);
      if (dist < BLAST_RADIUS) {
        t.hp -= Math.round(40 * (1 - dist / BLAST_RADIUS));
        t.view.setHp(Math.max(0, t.hp));
        if (t.hp <= 0) {
          t.alive = false;
          t.view.setAlive(false);
        }
      }
      // Re-seat survivors on the (now carved) terrain.
      if (t.alive) {
        t.y = this.terrain.heightAt(t.x);
        t.view.setPos(t.x, t.y);
      }
    }

    this.nextTurnAt = performance.now() + rand(TURN_MIN_MS, TURN_MAX_MS);
  }

  dispose(): void {
    this.app.ticker.remove(this.tickFn);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.container.destroy({ children: true });
  }
}
