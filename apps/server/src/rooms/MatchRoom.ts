import { Room, type Client } from "colyseus";
import {
  MatchState, Tank,
  DEFAULT_TURN_TIMER_MS, MAX_PLAYERS,
  TERRAIN_WIDTH, TERRAIN_HEIGHT,
  RECONNECT_GRACE_SEC,
  LOADOUT_MAP, DEFAULT_LOADOUT_ID,
  DEFAULT_STARTING_CASH, SHOP_DURATION_MS,
  ROUND_SUMMARY_DURATION_MS,
  type TankColor, type TankHat,
} from "@se/shared";
import { generateTerrain, createPrng, validatePurchase, WEAPON_REGISTRY } from "@se/game";
import { handleFire, type ResolveContext } from "./resolveTurn";

interface JoinOptions {
  code: string;
  nickname: string;
  color: TankColor;
  hat?: TankHat;
}

export class MatchRoom extends Room<MatchState> {
  override maxClients = MAX_PLAYERS;
  private terrain: Int16Array = new Int16Array(0);
  private timeoutHandle: { clear: () => void } | null = null;
  private shopTimerHandle: ReturnType<typeof this.clock.setTimeout> | null = null;
  private matchSeed = "";
  private observers = new Set<string>();

  onCreate(options: { code?: string }): void {
    const state = new MatchState();
    state.roomCode = options.code ?? "";
    state.turnTimerMs = DEFAULT_TURN_TIMER_MS;
    state.gravity = 250;
    this.setState(state);

    this.onMessage("configure", (client, msg: { turnTimerMs?: number; loadoutId?: string; maxRounds?: number }) => {
      if (client.sessionId !== this.state.hostId) return;
      if (this.state.phase !== "lobby") return;
      if (typeof msg?.turnTimerMs === "number") {
        const v = Number(msg.turnTimerMs);
        if (Number.isFinite(v) && v >= 0 && v <= 5 * 60_000) {
          this.state.turnTimerMs = v;
        }
      }
      if (typeof msg?.loadoutId === "string" && LOADOUT_MAP.has(msg.loadoutId)) {
        this.state.loadoutId = msg.loadoutId;
      }
      if (typeof msg?.maxRounds === "number") {
        const v = Math.round(msg.maxRounds);
        if (v >= 1 && v <= 20) {
          this.state.maxRounds = v;
        }
      }
    });

    this.onMessage("ready", (client) => {
      if (client.sessionId !== this.state.hostId) return;
      if (this.state.phase !== "lobby") return;
      this.startMatch();
    });

    this.onMessage("fire", (client, msg: { angle: number; power: number }) => {
      const wasPlaying = this.state.phase === "playing";
      handleFire(this.resolveCtx(), client.sessionId, msg.angle, msg.power);
      if (wasPlaying && this.state.phase === "resolving" && this.timeoutHandle) {
        this.timeoutHandle.clear();
        this.timeoutHandle = null;
      }
    });

    this.onMessage("select-weapon", (client, msg: { weaponId?: string }) => {
      if (this.state.phase !== "playing") return;
      const tank = this.state.tanks.get(client.sessionId);
      if (!tank) return;
      const weaponId = String(msg?.weaponId ?? "");
      const count = tank.inventory.get(weaponId) ?? null;
      if (count === null || count === 0) return;
      tank.weaponId = weaponId;
    });

    this.onMessage("buy", (client, msg: { weaponId?: string }) => {
      if (this.state.phase !== "shopping") return;
      const tank = this.state.tanks.get(client.sessionId);
      if (!tank || !tank.alive) return;

      const weaponId = String(msg?.weaponId ?? "");
      const registry = Array.from(WEAPON_REGISTRY.values()).map((w) => ({
        id: w.id,
        price: w.price,
        packSize: w.packSize,
      }));

      const result = validatePurchase(
        weaponId,
        tank.cash,
        new Map(tank.inventory.entries()),
        registry,
      );
      if (!result.ok) return;

      tank.cash = result.newCash;
      for (const [id, count] of result.newInventory.entries()) {
        tank.inventory.set(id, count);
      }
    });

    this.onMessage("ready-for-shop", (client) => {
      if (this.state.phase !== "shopping") return;
      const tank = this.state.tanks.get(client.sessionId);
      if (!tank || !tank.alive) return;
      tank.readyForShop = true;

      const livingPlayers = Array.from(this.state.tanks.values()).filter((t) => t.alive);
      const allReady = livingPlayers.every((t) => t.readyForShop);
      if (allReady) {
        this.advanceAfterShop();
      }
    });
  }

  private resolveCtx(): ResolveContext {
    return {
      state: this.state,
      broadcast: (ev, payload) => this.broadcast(ev, payload),
      schedule: (delayMs, fn) => { this.clock.setTimeout(fn, delayMs); },
      terrain: this.terrain,
      onTurnReady: () => this.armTurnTimer(),
      onRoundEnd: () => this.handleRoundEnd(),
    };
  }

  private armTurnTimer(): void {
    if (this.timeoutHandle) {
      this.timeoutHandle.clear();
      this.timeoutHandle = null;
    }
    if (this.state.turnTimerMs <= 0) return;
    if (this.state.phase !== "playing") return;
    this.timeoutHandle = this.clock.setTimeout(() => {
      this.timeoutHandle = null;
      if (this.state.phase !== "playing") return;
      const currentId = this.state.currentTurnPlayerId;
      const tank = this.state.tanks.get(currentId);
      if (!tank || !tank.alive) return;
      handleFire(this.resolveCtx(), currentId, tank.angle, tank.power);
    }, this.state.turnTimerMs);
  }

  onJoin(client: Client, options: JoinOptions): void {
    // If game is already in progress or room is at tank capacity, treat as observer
    if (this.state.phase !== "lobby" || this.state.tanks.size >= this.maxClients) {
      this.observers.add(client.sessionId);
      return;
    }

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

  async onLeave(client: Client, consented: boolean): Promise<void> {
    if (this.observers.has(client.sessionId)) {
      this.observers.delete(client.sessionId);
      return;
    }

    const tank = this.state.tanks.get(client.sessionId);
    if (!tank) return;
    tank.connected = false;

    // Demote host immediately so live host actions don't depend on a missing client.
    if (this.state.hostId === client.sessionId) {
      for (const otherId of this.state.tanks.keys()) {
        if (otherId !== client.sessionId) {
          this.state.hostId = otherId;
          break;
        }
      }
      if (this.state.hostId === client.sessionId) this.state.hostId = "";
    }

    if (consented) {
      this.state.tanks.delete(client.sessionId);
      return;
    }

    try {
      await this.allowReconnection(client, RECONNECT_GRACE_SEC);
      tank.connected = true;
    } catch {
      this.state.tanks.delete(client.sessionId);
    }
  }

  private seedInventory(): void {
    const loadout =
      LOADOUT_MAP.get(this.state.loadoutId) ?? LOADOUT_MAP.get(DEFAULT_LOADOUT_ID)!;
    for (const tank of this.state.tanks.values()) {
      tank.inventory.clear();
      for (const [weaponId, count] of Object.entries(loadout.weapons)) {
        tank.inventory.set(weaponId, count);
      }
      tank.weaponId = "baby-missile";
    }
  }

  private initCash(): void {
    for (const tank of this.state.tanks.values()) {
      tank.cash = DEFAULT_STARTING_CASH;
      tank.damageDealtThisRound = 0;
      tank.killsThisRound = 0;
      tank.readyForShop = false;
    }
  }

  private startMatch(): void {
    this.matchSeed = this.state.roomCode || "match";
    this.state.round = 1;
    this.state.roundsWon.clear();

    this.state.phase = "playing";
    this.state.terrainSeed = this.matchSeed + "_r1";
    const terrain = generateTerrain({
      seed: this.state.terrainSeed,
      type: "random",
      width: TERRAIN_WIDTH,
      height: TERRAIN_HEIGHT,
    });
    this.terrain = terrain;
    this.placeTanksOn(terrain);
    this.seedInventory();
    this.initCash();
    const windPrng = createPrng(this.state.terrainSeed + "_wind");
    this.state.wind = windPrng.nextInt(-10, 10);
    const first = this.state.tanks.keys().next().value;
    this.state.currentTurnPlayerId = first ?? "";
    this.state.turnDeadlineMs = Date.now() + this.state.turnTimerMs;
    this.armTurnTimer();
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

  private handleRoundEnd(): void {
    this.clock.setTimeout(() => {
      if (this.state.round >= this.state.maxRounds) {
        this.endMatch();
      } else {
        this.openShop();
      }
    }, ROUND_SUMMARY_DURATION_MS);
  }

  private openShop(): void {
    const state = this.state;
    state.phase = "shopping";
    state.shopDeadlineMs = Date.now() + SHOP_DURATION_MS;
    for (const tank of state.tanks.values()) {
      tank.readyForShop = false;
    }
    this.shopTimerHandle = this.clock.setTimeout(() => {
      this.shopTimerHandle = null;
      this.advanceAfterShop();
    }, SHOP_DURATION_MS);
  }

  private advanceAfterShop(): void {
    if (this.shopTimerHandle) {
      this.shopTimerHandle.clear();
      this.shopTimerHandle = null;
    }
    if (this.state.round >= this.state.maxRounds) {
      this.endMatch();
    } else {
      this.startNextRound();
    }
  }

  private endMatch(): void {
    const state = this.state;
    state.phase = "ended";

    const standings = Array.from(state.tanks.values())
      .map((t) => ({
        sessionId: t.sessionId,
        nickname: t.nickname,
        roundsWon: state.roundsWon.get(t.sessionId) ?? 0,
        totalCash: t.cash,
        totalDamage: t.totalDamageDealt,
        totalKills: t.totalKills,
      }))
      .sort((a, b) =>
        b.roundsWon !== a.roundsWon
          ? b.roundsWon - a.roundsWon
          : b.totalCash - a.totalCash,
      );

    const winnerId = standings[0]?.sessionId ?? "";
    state.winnerId = winnerId;
    this.broadcast("match-end", { winnerId, standings });
  }

  private startNextRound(): void {
    const state = this.state;
    state.round++;

    state.terrainSeed = this.matchSeed + "_r" + state.round;
    state.terrainOps.clear();
    state.terrainVersion++;

    const terrain = generateTerrain({
      seed: state.terrainSeed,
      type: "random",
      width: TERRAIN_WIDTH,
      height: TERRAIN_HEIGHT,
    });
    this.terrain = terrain;

    const windPrng = createPrng(state.terrainSeed + "_wind");
    state.wind = windPrng.nextInt(-10, 10);

    for (const tank of state.tanks.values()) {
      tank.hp = 100;
      tank.alive = tank.connected;
      tank.damageDealtThisRound = 0;
      tank.killsThisRound = 0;
      tank.readyForShop = false;
      tank.weaponId = "baby-missile";
    }

    this.placeTanksOn(terrain);

    const first = Array.from(state.tanks.values()).find((t) => t.alive)?.sessionId ?? "";
    state.currentTurnPlayerId = first;
    state.phase = "playing";
    state.tick++;
    state.turnDeadlineMs = Date.now() + state.turnTimerMs;
    this.armTurnTimer();
  }
}
