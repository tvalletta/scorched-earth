import { Application, Container, Graphics } from "pixi.js";
import type { Room } from "colyseus.js";
import { getStateCallbacks } from "colyseus.js";
import { MatchState, TERRAIN_WIDTH, TERRAIN_HEIGHT } from "@se/shared";
import type { MatchPhase, TerrainType, WallMode } from "@se/shared";
import { simulateProjectile, WEAPON_REGISTRY } from "@se/game";
import { TrajectoryOverlay } from "../render/TrajectoryOverlay";
import { SkyRenderer, timeOfDayFromSeed } from "../render/Sky";
import { TerrainRenderer } from "../render/Terrain";
import { CageRenderer } from "../render/Cage";
import { createTankView } from "../render/Tank";
import { ProjectileRenderer } from "../render/Projectile";
import { PatriotRenderer } from "../render/Patriot";
import { Explosion } from "../render/Explosion";
import { WindArrow } from "../hud/WindArrow";
import { TurnTimer } from "../hud/TurnTimer";
import { PlayerList } from "../hud/PlayerList";
import { AimControls } from "../input/AimControls";
import { WeaponBar } from "../hud/WeaponBar";
import { RoundInfo } from "../hud/RoundInfo";
import { HudBar } from '../hud/HudBar';
import { PlayerStrip } from '../hud/PlayerStrip';
import { RoundSummaryScene, type RoundSummaryPayload } from "./RoundSummaryScene";
import { ShopScene, type RoundEarningsInfo } from "./ShopScene";
import { MatchEndScene, type MatchEndPayload } from "./MatchEndScene";
import { Camera } from '../render/Camera';
import type { TankPosition } from '../render/Camera';

declare const __SERVER_URL__: string;

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
  private projectileRenderer!: ProjectileRenderer;
  private patriotRenderer!: PatriotRenderer;
  private wind!: WindArrow;
  private timer!: TurnTimer;
  private players!: PlayerList;
  protected aim!: AimControls;
  private weaponBar!: WeaponBar;
  private roundInfo!: RoundInfo;
  private cage!: CageRenderer;
  private trajectoryOverlay!: TrajectoryOverlay;
  private activeZones: Array<{ kind: "burn-zone" | "smoke-zone"; x: number; width: number }> = [];
  private hudBar: HudBar | null = null;
  private playerStrip: PlayerStrip | null = null;
  private roundSummaryScene: RoundSummaryScene | null = null;
  private shopScene: ShopScene | null = null;
  private matchEndScene: MatchEndScene | null = null;
  private camera: Camera | null = null;
  private sky: SkyRenderer | null = null;
  private lastRoundSummaryPayload: unknown = null;
  private lastPhase: MatchPhase = "lobby";

  constructor(public room: Room<MatchState>, public code: string) {
    const app = window.pixiApp;
    if (!app) throw new Error("pixiApp not initialized");
    this.app = app;

    this.world = new Container();
    this.app.stage.addChild(this.world);

    this.camera = new Camera(this.world, this.app);
    window.addEventListener('resize', () => this.fitToLivingTanks());

    window.__room = room;
    window.__sessionId = room.sessionId;

    this.wind = new WindArrow();
    this.timer = new TurnTimer();
    this.players = new PlayerList();
    this.aim = new AimControls(room);
    this.weaponBar = new WeaponBar(room);
    this.hudBar = new HudBar(room);
    this.playerStrip = new PlayerStrip(room.sessionId);

    room.onStateChange.once((state) => this.onFirstState(state));
    room.onMessage("tick", (msg: { tick: number; projectiles: {id:string;x:number;y:number;vx:number;vy:number;weaponId:string}[]; patriots: {id:string;x:number;y:number;vx:number;vy:number}[] }) => {
      this.projectileRenderer.onTick(msg.projectiles);
      this.patriotRenderer.onTick(msg.patriots);
      if (msg.projectiles.length > 0) {
        const p = msg.projectiles[0]!;
        this.camera?.trackProjectile(p.x, p.y);
      }
    });
    room.onMessage("shield-hit", (msg: { targetId: string; type: string }) => {
      this.tanks.get(msg.targetId)?.flashShield();
    });
    room.onMessage("tank-moved", (_msg: unknown) => { /* fuel updated via state listener */ });
    room.onMessage("tank-fell", (msg: { sessionId: string; damage: number; parachuteUsed: boolean }) => {
      if (msg.damage > 0) {
        const tank = this.room.state.tanks.get(msg.sessionId);
        if (tank) {
          const ex = new Explosion(tank.x, tank.y, 20);
          this.world.addChild(ex);
          this.activeAnims.push(ex);
        }
      }
    });
    room.onMessage("damage-applied", (msg) => this.onDamage(msg));
    room.onMessage("burn-zone-start", (msg: { x: number; width: number; turnsLeft: number }) => {
      this.activeZones.push({ kind: "burn-zone", x: msg.x, width: msg.width });
      this.terrain?.updateZones(this.activeZones);
      this.trajectoryOverlay?.setSmokeZones(this.activeZones.filter(z => z.kind === "smoke-zone"));
    });
    room.onMessage("smoke-zone-start", (msg: { x: number; width: number; turnsLeft: number }) => {
      this.activeZones.push({ kind: "smoke-zone", x: msg.x, width: msg.width });
      this.terrain?.updateZones(this.activeZones);
      this.trajectoryOverlay?.setSmokeZones(this.activeZones.filter(z => z.kind === "smoke-zone"));
    });
    room.onMessage("burn-tick", (_msg: { damages: Array<{ sessionId: string; amount: number }> }) => {
      // Sync zones from authoritative server state to pick up any expirations
      this.activeZones = Array.from(this.room.state.pendingEffects.values())
        .map(e => ({ kind: e.kind as "burn-zone" | "smoke-zone", x: e.x, width: e.width }));
      this.terrain?.updateZones(this.activeZones);
      this.trajectoryOverlay?.setSmokeZones(this.activeZones.filter(z => z.kind === "smoke-zone"));
    });
    room.onMessage("laser-beam", (msg: { fromX: number; fromY: number; toX: number; toY: number }) => {
      const g = new Graphics();
      g.moveTo(msg.fromX, msg.fromY)
       .lineTo(msg.toX, msg.toY)
       .stroke({ color: 0xff00ff, width: 4, alpha: 1 });
      this.world.addChild(g);
      let alpha = 1;
      const fade = setInterval(() => {
        alpha -= 0.1;
        g.alpha = alpha;
        if (alpha <= 0) { clearInterval(fade); g.destroy(); }
      }, 30);
    });
    room.onMessage("plasma-wave", (msg: { x: number; y: number }) => {
      const g = new Graphics();
      g.moveTo(msg.x - 400, msg.y).lineTo(msg.x + 400, msg.y)
       .stroke({ color: 0x00ffff, width: 6, alpha: 0.8 });
      this.world.addChild(g);
      let alpha = 0.8;
      const fade = setInterval(() => {
        alpha -= 0.08;
        g.alpha = alpha;
        if (alpha <= 0) { clearInterval(fade); g.destroy(); }
      }, 30);
    });
    room.onMessage("leapfrog-bounce", (msg: { x: number; y: number; bounceNum: number }) => {
      const g = new Graphics();
      const r = 15 + msg.bounceNum * 5;
      g.circle(msg.x, msg.y, r).fill({ color: 0xffff00, alpha: 0.7 });
      this.world.addChild(g);
      setTimeout(() => { g.destroy(); }, 200);
    });
    room.onMessage("terrain-deposited", (msg: { centerX: number; shape: { halfWidth: number; height: number } }) => {
      const g = new Graphics();
      const baseY = this.terrain?.heightAt(msg.centerX) ?? 0;
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8;
        const dist = 20 + Math.random() * 20;
        const px = msg.centerX + Math.cos(angle) * dist;
        const py = baseY + Math.sin(angle) * dist * 0.5;
        g.circle(px, py, 4).fill({ color: 0x8b6914, alpha: 0.7 });
      }
      this.world.addChild(g);
      setTimeout(() => { g.destroy(); }, 300);
    });
    room.onMessage("burrow-complete", (msg: { x: number; tunnelTopY: number }) => {
      const g = new Graphics();
      for (let i = 0; i < 6; i++) {
        const px = msg.x + (Math.random() - 0.5) * 30;
        const py = msg.tunnelTopY - Math.random() * 15;
        g.circle(px, py, 5).fill({ color: 0x8b6914, alpha: 0.6 });
      }
      this.world.addChild(g);
      setTimeout(() => { g.destroy(); }, 400);
    });
    room.onMessage("roller-hit", (msg: { x: number; y: number }) => {
      const g = new Graphics();
      g.circle(msg.x, msg.y, 20).fill({ color: 0xff8800, alpha: 0.8 });
      this.world.addChild(g);
      setTimeout(() => { g.destroy(); }, 150);
    });
    room.onMessage("round-summary", (msg) => {
      this.lastRoundSummaryPayload = msg;
    });
    room.onMessage("match-end", (msg) => {
      this.showMatchEnd(msg);
    });

    this.app.ticker.add((ticker) => {
      const dt = ticker.deltaMS / 1000;
      this.camera?.update(dt);
      this.sky?.update(dt, this.camera?.worldX ?? 0);
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
      this.hudBar?.update(room.state);
      this.hudBar?.updateTimer(room.state.turnDeadlineMs);
      this.playerStrip?.update(room.state);
    });
  }

  private fitToLivingTanks(): void {
    const positions: TankPosition[] = [];
    for (const [id, _view] of this.tanks.entries()) {
      const tank = this.room.state.tanks.get(id);
      if (tank?.alive) positions.push({ x: tank.x, y: tank.y });
    }
    if (positions.length > 0) this.camera?.fitToTanks(positions);
  }

  private onFirstState(state: MatchState) {
    console.log("[match] first state, phase=", state.phase, "tanks=", state.tanks.size);
    const timeOfDay = timeOfDayFromSeed(state.terrainSeed);
    const sky = new SkyRenderer(timeOfDay, window.innerWidth, window.innerHeight);
    this.sky = sky;
    this.app.stage.addChildAt(sky, 0); // behind world (world is at index 1)

    // Terrain seed is set when the match starts (not in lobby). Rebuild terrain
    // whenever the seed arrives so the client renders the same heightmap the
    // server computed physics against.
    const buildTerrain = (seed: string) => {
      if (!seed) return;
      if (this.terrain) this.terrain.removeFromParent();
      const t = new TerrainRenderer(seed, state.terrainType as TerrainType);
      this.world.addChildAt(t, 0); // terrain at back of world (sky is now on stage, not world)
      this.terrain = t;
    };

    this.cage = new CageRenderer();
    this.world.addChild(this.cage);

    this.projectileRenderer = new ProjectileRenderer(this.world);
    this.patriotRenderer = new PatriotRenderer(this.world);

    this.trajectoryOverlay = new TrajectoryOverlay();
    this.world.addChild(this.trajectoryOverlay);

    this.aim.setAimChangeCallback((angle, power) => {
      this.updateTrajectory(angle, power);
    });
    this.hudBar?.setAimChangeCallback((angle, power) => {
      this.updateTrajectory(angle, power);
    });

    const $ = getStateCallbacks(this.room);
    // Created before any listener that references it — colyseus `listen` fires
    // immediately on register, and MatchScene now initializes at phase=playing
    // with terrain fields already populated.
    this.roundInfo = new RoundInfo();
    $(state).listen("terrainSeed", (seed) => buildTerrain(seed), true);
    $(state).listen("terrainType", (type) => {
      buildTerrain(state.terrainSeed);
      this.roundInfo.update(type, state.wallMode);
    });
    $(state).listen("phase", (phase: MatchPhase) => {
      this.onPhaseChange(phase);
    });

    $(state).listen("wallMode", (mode) => {
      this.roundInfo.update(state.terrainType, mode);
      this.cage.update(mode);
    }, true);
    $(state).terrainOps.onAdd((op) => {
      const particles = this.terrain?.carve(op);
      if (particles) {
        this.world.addChild(particles);
        this.activeAnims.push(particles);
      }
    });

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
      $(tank).listen("shieldId", () => {
        this.tanks.get(id)?.setShield(tank.shieldId, tank.shieldHp, tank.shieldMaxHp);
      });
      $(tank).listen("shieldHp", () => {
        this.tanks.get(id)?.setShield(tank.shieldId, tank.shieldHp, tank.shieldMaxHp);
      });
      $(tank).listen("fuel", () => {
        if (id === this.room.sessionId) this.aim.updateFuel(tank.fuel);
      });
      if (id === this.room.sessionId) {
        this.aim.setLocalTank(view);
        this.weaponBar.wire();
      }
    });
    $(state).tanks.onRemove((_t, id) => {
      this.tanks.get(id)?.destroy();
      this.tanks.delete(id);
      if (id === this.room.sessionId) this.aim.setLocalTank(null);
    });
    $(state).listen("currentTurnPlayerId", (turnId: string) => {
      if (turnId === this.room.sessionId) {
        const tank = this.room.state.tanks.get(turnId);
        if (tank) this.aim.setDriveMode(tank.fuel, tank.fuel);
        const { angle, power } = this.aim.getCurrentAim();
        this.updateTrajectory(angle, power);
      } else {
        this.trajectoryOverlay.clear();
      }
    });

    // Observer mode: this client joined but has no tank
    if (!state.tanks.has(this.room.sessionId)) {
      this.aim.hide();
      this.weaponBar.hide();
      if (this.hudBar) this.hudBar.el.style.display = 'none';
      if (this.playerStrip) this.playerStrip.el.style.display = 'none';
      this.showObserverBanner();
    }

    setTimeout(() => this.fitToLivingTanks(), 300);
  }

  private showObserverBanner(): void {
    const banner = document.createElement("div");
    banner.style.cssText =
      "position:fixed;top:12px;left:50%;transform:translateX(-50%);" +
      "background:rgba(0,0,0,0.75);color:#f0c040;font:bold 12px 'Courier New',monospace;" +
      "padding:6px 16px;border-radius:6px;letter-spacing:2px;z-index:200;pointer-events:none;";
    banner.textContent = "SPECTATING";
    document.getElementById("ui")!.appendChild(banner);
  }

  private onDamage(msg: { sessionId?: string; damage?: number; x?: number; y?: number; radius?: number }) {
    const blastRadius = msg.radius ?? 20;
    if (msg.x !== undefined && msg.y !== undefined) {
      const ex = new Explosion(msg.x, msg.y, blastRadius);
      this.world.addChild(ex);
      this.activeAnims.push(ex);
    }
    this.camera?.shake(blastRadius);
  }

  private onPhaseChange(phase: MatchPhase): void {
    if (phase !== "playing") this.trajectoryOverlay?.clear();
    if (phase === "lobby") this.roundInfo?.hide();
    if (phase === "playing") {
      this.camera?.onTurnStart();
      this.fitToLivingTanks();
      // Clear zones at the start of each round
      this.activeZones = [];
      this.terrain?.updateZones([]);
      this.trajectoryOverlay?.setSmokeZones([]);
    }

    // Show/hide HudBar and PlayerStrip based on phase
    const showHud = (phase === 'playing');
    if (this.hudBar) this.hudBar.el.style.display = showHud ? '' : 'none';
    if (this.playerStrip) this.playerStrip.el.style.display = showHud ? '' : 'none';

    // Dispose previous overlay when leaving a phase
    if (this.lastPhase === "round-summary" && phase !== "round-summary") {
      this.roundSummaryScene?.dispose();
      this.roundSummaryScene = null;
    }
    if (this.lastPhase === "shopping" && phase !== "shopping") {
      this.shopScene?.dispose();
      this.shopScene = null;
    }
    this.lastPhase = phase;

    if (phase === "round-summary" && this.lastRoundSummaryPayload) {
      this.roundSummaryScene = new RoundSummaryScene(
        this.lastRoundSummaryPayload as RoundSummaryPayload,
        this.room.state.summaryDeadlineMs,
      );
    }

    if (phase === "shopping") {
      const state = this.room.state;
      const myTank = state.tanks.get(this.room.sessionId);
      if (myTank) {
        const payload = this.lastRoundSummaryPayload as RoundSummaryPayload | null;
        const me = payload?.players?.find((p) => p.sessionId === this.room.sessionId);
        const earnings: RoundEarningsInfo = {
          damageReward: me?.damageReward ?? 0,
          killReward: me?.killReward ?? 0,
          survivalBonus: me?.survivalBonus ?? 0,
          total: me?.earned ?? 0,
          prevCash: Math.max(0, myTank.cash - (me?.earned ?? 0)),
        };
        this.shopScene = new ShopScene(this.room, earnings);
      }
    }
  }

  private updateTrajectory(angle: number, power: number): void {
    const state = this.room.state;
    if (state.phase !== "playing") { this.trajectoryOverlay.clear(); return; }
    if (state.currentTurnPlayerId !== this.room.sessionId) { this.trajectoryOverlay.clear(); return; }
    const tank = state.tanks.get(this.room.sessionId);
    if (!tank || !this.terrain) { this.trajectoryOverlay.clear(); return; }
    const weapon = WEAPON_REGISTRY.get(tank.weaponId);
    if (!weapon) { this.trajectoryOverlay.clear(); return; }

    const result = simulateProjectile({
      weapon,
      origin: { x: tank.x, y: tank.y - 5 },
      angle,
      power,
      wind: state.wind,
      gravity: state.gravity,
      terrain: this.terrain.getHeightmap(),
      terrainWidth: TERRAIN_WIDTH,
      terrainHeight: TERRAIN_HEIGHT,
      wallMode: state.wallMode as WallMode,
      targets: [],
    });

    this.trajectoryOverlay.draw(result.samples, tank.x);
  }

  private showMatchEnd(msg: unknown): void {
    this.matchEndScene?.dispose();
    this.matchEndScene = new MatchEndScene(
      msg as MatchEndPayload,
      this.room.state.maxRounds,
      () => { this.room.leave(); window.location.reload(); },
      () => { this.room.leave(); window.location.reload(); },
      {
        matchId: this.room.roomId,
        serverUrl: __SERVER_URL__,
        onWatch: () => {
          this.matchEndScene?.dispose();
          this.matchEndScene = null;
          const httpUrl = __SERVER_URL__.replace(/^ws/, "http");
          import("./ReplayScene.js").then(({ ReplayScene }) => {
            fetch(`${httpUrl}/replays/${this.room.roomId}`)
              .then((r) => r.json())
              .then((replay) => new ReplayScene(replay))
              .catch(console.error);
          });
        },
      },
    );
  }
}
