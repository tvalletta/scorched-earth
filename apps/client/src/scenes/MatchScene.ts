import { Application, Container } from "pixi.js";
import type { Room } from "colyseus.js";
import { MatchState, TERRAIN_WIDTH, TERRAIN_HEIGHT } from "@se/shared";

declare global {
  interface Window {
    __room?: Room<MatchState>;
    __sessionId?: string;
  }
}

export class MatchScene {
  private app: Application;
  private world: Container;

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
    // Renderers attached in subsequent tasks (Sky, Terrain, Tank, Projectile, etc.)
  }

  private onTrajectory(_msg: unknown) { /* Task 28 */ }
  private onDamage(_msg: unknown) { /* later */ }
  private onMatchEnd(_msg: unknown) { /* later */ }
}
