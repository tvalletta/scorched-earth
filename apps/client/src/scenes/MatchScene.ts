import { Application, Container } from "pixi.js";
import type { Room } from "colyseus.js";
import { getStateCallbacks } from "colyseus.js";
import { MatchState, TERRAIN_WIDTH, TERRAIN_HEIGHT } from "@se/shared";
import { SkyRenderer } from "../render/Sky";
import { TerrainRenderer } from "../render/Terrain";
import { createTankView } from "../render/Tank";
import { ProjectileAnim } from "../render/Projectile";
import { Explosion } from "../render/Explosion";
import { WindArrow } from "../hud/WindArrow";
import { TurnTimer } from "../hud/TurnTimer";
import { PlayerList } from "../hud/PlayerList";
import { AimControls } from "../input/AimControls";

declare global {
  interface Window {
    __room?: Room<MatchState>;
    __sessionId?: string;
  }
}

export class MatchScene {
  private app: Application;
  private world: Container;
  // Held for future readers (heightAt, etc.).
  protected terrain?: TerrainRenderer;
  private tanks = new Map<string, ReturnType<typeof createTankView>>();
  private activeAnims: Array<{ tick(): boolean; removeFromParent(): void }> = [];
  private wind!: WindArrow;
  private timer!: TurnTimer;
  private players!: PlayerList;
  protected aim!: AimControls;

  constructor(public room: Room<MatchState>, public code: string) {
    const app = window.pixiApp;
    if (!app) throw new Error("pixiApp not initialized");
    this.app = app;

    this.world = new Container();
    this.app.stage.addChild(this.world);

    this.fit();
    window.addEventListener("resize", () => this.fit());

    window.__room = room;
    window.__sessionId = room.sessionId;

    this.wind = new WindArrow();
    this.timer = new TurnTimer();
    this.players = new PlayerList();
    this.aim = new AimControls(room);

    room.onStateChange.once((state) => this.onFirstState(state));
    room.onMessage("trajectory-resolved", (msg) => this.onTrajectory(msg));
    room.onMessage("damage-applied", (msg) => this.onDamage(msg));
    room.onMessage("match-end", (msg) => this.onMatchEnd(msg));

    this.app.ticker.add(() => {
      this.activeAnims = this.activeAnims.filter((a) => {
        if (a.tick()) {
          a.removeFromParent();
          return false;
        }
        return true;
      });
      this.wind.update(room.state);
      this.timer.update(room.state);
      this.players.update(room.state);
    });
  }

  private fit() {
    const sx = window.innerWidth / TERRAIN_WIDTH;
    const sy = window.innerHeight / TERRAIN_HEIGHT;
    const s = Math.min(sx, sy);
    this.world.scale.set(s);
    this.world.position.set(
      (window.innerWidth - TERRAIN_WIDTH * s) / 2,
      (window.innerHeight - TERRAIN_HEIGHT * s) / 2,
    );
  }

  private onFirstState(state: MatchState) {
    console.log("[match] first state, phase=", state.phase, "tanks=", state.tanks.size);
    this.world.addChild(new SkyRenderer());

    // Terrain seed is set when the match starts (not in lobby). Rebuild terrain
    // whenever the seed arrives so the client renders the same heightmap the
    // server computed physics against.
    const buildTerrain = (seed: string) => {
      if (!seed) return;
      if (this.terrain) this.terrain.removeFromParent();
      const t = new TerrainRenderer(seed);
      this.world.addChildAt(t, 1); // index 1 = behind tanks, in front of sky
      this.terrain = t;
    };

    const $ = getStateCallbacks(this.room);
    $(state).listen("terrainSeed", (seed) => buildTerrain(seed), true);
    $(state).terrainOps.onAdd((op) => this.terrain?.carve(op));

    $(state).tanks.onAdd((tank, id) => {
      const view = createTankView({ color: tank.color, hat: tank.hat });
      this.world.addChild(view);
      this.tanks.set(id, view);
      const sync = () => {
        view.setPos(tank.x, tank.y);
        view.setAngle(tank.angle);
        view.setAlive(tank.alive);
        view.setHp(tank.hp);
      };
      sync();
      $(tank).onChange(sync);
      if (id === this.room.sessionId) this.aim.setLocalTank(view);
    });
    $(state).tanks.onRemove((_t, id) => {
      this.tanks.get(id)?.destroy();
      this.tanks.delete(id);
      if (id === this.room.sessionId) this.aim.setLocalTank(null);
    });
  }

  private onTrajectory(msg: {
    samples: { x: number; y: number; t: number }[];
    impact: { x: number; y: number } | null;
  }) {
    const proj = new ProjectileAnim(msg.samples);
    this.world.addChild(proj);
    this.activeAnims.push(proj);
    if (msg.impact) {
      const lastT = msg.samples[msg.samples.length - 1]?.t ?? 0;
      const impact = msg.impact;
      setTimeout(() => {
        const ex = new Explosion(impact.x, impact.y);
        this.world.addChild(ex);
        this.activeAnims.push(ex);
      }, lastT);
    }
  }
  private onDamage(_msg: unknown) { /* later */ }
  private onMatchEnd(_msg: unknown) { /* later */ }
}
