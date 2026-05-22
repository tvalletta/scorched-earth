import { Room, type Client } from "colyseus";
import {
  MatchState, Tank,
  DEFAULT_TURN_TIMER_MS, MAX_PLAYERS,
  TERRAIN_WIDTH, TERRAIN_HEIGHT,
  type TankColor, type TankHat,
} from "@se/shared";
import { generateTerrain } from "@se/game";

interface JoinOptions {
  code: string;
  nickname: string;
  color: TankColor;
  hat?: TankHat;
}

export class MatchRoom extends Room<MatchState> {
  override maxClients = MAX_PLAYERS;

  onCreate(options: { code?: string }): void {
    const state = new MatchState();
    state.roomCode = options.code ?? "";
    state.turnTimerMs = DEFAULT_TURN_TIMER_MS;
    state.gravity = 250;
    this.setState(state);

    this.onMessage("configure", (client, msg: { turnTimerMs: number }) => {
      if (client.sessionId !== this.state.hostId) return;
      if (this.state.phase !== "lobby") return;
      const v = Number(msg?.turnTimerMs);
      if (!Number.isFinite(v) || v < 0 || v > 5 * 60_000) return;
      this.state.turnTimerMs = v;
    });

    this.onMessage("ready", (client) => {
      if (client.sessionId !== this.state.hostId) return;
      if (this.state.phase !== "lobby") return;
      this.startMatch();
    });
  }

  onJoin(client: Client, options: JoinOptions): void {
    const tank = new Tank();
    tank.playerId = client.sessionId;
    tank.sessionId = client.sessionId;
    tank.nickname = (options.nickname ?? "Player").slice(0, 24);
    tank.color = options.color ?? "red";
    tank.hat = options.hat ?? "none";
    tank.connected = true;
    tank.alive = true;
    tank.hp = 100;
    this.state.tanks.set(client.sessionId, tank);

    if (this.state.hostId === "") {
      this.state.hostId = client.sessionId;
    }
  }

  onLeave(client: Client): void {
    const tank = this.state.tanks.get(client.sessionId);
    if (!tank) return;
    tank.connected = false;
    this.state.tanks.delete(client.sessionId);
    if (this.state.hostId === client.sessionId) {
      const first = this.state.tanks.keys().next().value;
      this.state.hostId = first ?? "";
    }
  }

  private startMatch(): void {
    this.state.phase = "playing";
    this.state.terrainSeed = (this.state.roomCode || "match") + "-v1";
    const terrain = generateTerrain({
      seed: this.state.terrainSeed,
      type: "random",
      width: TERRAIN_WIDTH,
      height: TERRAIN_HEIGHT,
    });
    this.placeTanksOn(terrain);
    const first = this.state.tanks.keys().next().value;
    this.state.currentTurnPlayerId = first ?? "";
    this.state.turnDeadlineMs = Date.now() + this.state.turnTimerMs;
  }

  private placeTanksOn(terrain: Int16Array): void {
    const tanks = Array.from(this.state.tanks.values());
    if (tanks.length === 0) return;
    const slotWidth = TERRAIN_WIDTH / (tanks.length + 1);
    tanks.forEach((tank, i) => {
      const x = Math.round(slotWidth * (i + 1));
      tank.x = x;
      tank.y = terrain[x] ?? 0;
    });
  }
}
