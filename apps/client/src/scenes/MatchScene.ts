import { Application, Container } from "pixi.js";
import type { Room } from "colyseus.js";
import { getStateCallbacks } from "colyseus.js";
import { MatchState, TERRAIN_WIDTH, TERRAIN_HEIGHT } from "@se/shared";
import { SkyRenderer } from "../render/Sky";
import { TerrainRenderer } from "../render/Terrain";
import { createTankView } from "../render/Tank";

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

    room.onStateChange.once((state) => this.onFirstState(state));
    room.onMessage("trajectory-resolved", (msg) => this.onTrajectory(msg));
    room.onMessage("damage-applied", (msg) => this.onDamage(msg));
    room.onMessage("match-end", (msg) => this.onMatchEnd(msg));
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
    const terrain = new TerrainRenderer(state.terrainSeed);
    this.world.addChild(terrain);
    this.terrain = terrain;
    const $ = getStateCallbacks(this.room);
    $(state).terrainOps.onAdd((op) => terrain.carve(op));
    $(state).tanks.onAdd((tank, id) => {
      const view = createTankView({ color: tank.color, hat: tank.hat });
      this.world.addChild(view);
      this.tanks.set(id, view);
      const sync = () => {
        view.setPos(tank.x, tank.y);
        view.setAngle(tank.angle);
        view.setAlive(tank.alive);
      };
      sync();
      $(tank).onChange(sync);
    });
    $(state).tanks.onRemove((_t, id) => {
      this.tanks.get(id)?.destroy();
      this.tanks.delete(id);
    });
  }

  private onTrajectory(_msg: unknown) { /* Task 28 */ }
  private onDamage(_msg: unknown) { /* later */ }
  private onMatchEnd(_msg: unknown) { /* later */ }
}
