import { Container } from "pixi.js";
import { TerrainRenderer } from "../render/Terrain.js";
import { createTankView } from "../render/Tank.js";
import { SkyRenderer } from "../render/Sky.js";
import { TERRAIN_WIDTH, TERRAIN_HEIGHT } from "@se/shared";
import type { TerrainType, TankColor, TankHat } from "@se/shared";

// Types mirrored from apps/server/src/rooms/replayStore.ts
// Client must not import from server source directly
export interface ReplayFile {
  version: 1;
  matchId: string;
  recordedAt: number;
  rounds: RoundRecord[];
}
export interface RoundRecord {
  roundNumber: number;
  snapshot: Record<string, unknown>;
  intents: IntentRecord[];
  carveOps: SerializedCarveOp[];
}
export interface IntentRecord { ts: number; playerId: string; kind: string; payload: unknown; }
export interface SerializedCarveOp { x: number; y: number; radius: number; tick: number; layer?: string; }

type TankSnapshot = {
  x: number; y: number; hp: number; alive: boolean;
  nickname: string; color: string; hat: string;
};

export class ReplayScene {
  private world: Container;
  private terrain?: TerrainRenderer;
  private tankViews = new Map<string, ReturnType<typeof createTankView>>();
  private currentRoundIdx = 0;
  private controlEl!: HTMLDivElement;
  private _keyHandler!: (e: KeyboardEvent) => void;

  constructor(private readonly replay: ReplayFile) {
    const app = window.pixiApp;
    if (!app) throw new Error("pixiApp not initialized");

    this.world = new Container();
    app.stage.addChild(this.world);

    this.fit();
    window.addEventListener("resize", () => this.fit());

    this.buildControls();
    this.renderRound(0);

    // Keyboard nav: [ = prev round, ] = next round
    this._keyHandler = (e: KeyboardEvent) => {
      if (e.key === "[") {
        if (this.currentRoundIdx > 0) this.renderRound(this.currentRoundIdx - 1);
      } else if (e.key === "]") {
        if (this.currentRoundIdx < this.replay.rounds.length - 1) {
          this.renderRound(this.currentRoundIdx + 1);
        }
      }
    };
    window.addEventListener("keydown", this._keyHandler);
  }

  private fit(): void {
    const sx = window.innerWidth / TERRAIN_WIDTH;
    const sy = window.innerHeight / TERRAIN_HEIGHT;
    const s = Math.min(sx, sy);
    this.world.scale.set(s);
    this.world.position.set(
      (window.innerWidth - TERRAIN_WIDTH * s) / 2,
      (window.innerHeight - TERRAIN_HEIGHT * s) / 2,
    );
  }

  private renderRound(idx: number): void {
    const round = this.replay.rounds[idx];
    if (!round) return;
    this.currentRoundIdx = idx;

    this.world.removeChildren();
    this.tankViews.clear();

    this.world.addChild(new SkyRenderer());

    const snap = round.snapshot as {
      terrainSeed: string;
      terrainType: string;
      hasCeiling?: boolean;
      ceilingSeed?: string;
      wind: number;
      tanks: Record<string, TankSnapshot>;
    };

    const t = new TerrainRenderer(snap.terrainSeed, snap.terrainType as TerrainType);
    if (snap.hasCeiling && snap.ceilingSeed) t.setCeiling(snap.ceilingSeed);
    this.world.addChildAt(t, 1);
    this.terrain = t;

    // Apply carve ops silently (discard returned particle containers)
    for (const op of round.carveOps) {
      this.terrain.carve({ x: op.x, y: op.y, radius: op.radius, tick: op.tick, layer: op.layer });
    }

    // Render tanks at snapshot positions
    for (const [id, tankData] of Object.entries(snap.tanks)) {
      const view = createTankView({ color: tankData.color as TankColor, hat: tankData.hat as TankHat });
      view.setPos(tankData.x, tankData.y);
      view.setAlive(tankData.alive);
      view.setHp(tankData.hp);
      this.world.addChild(view);
      this.tankViews.set(id, view);
    }

    const label = this.controlEl?.querySelector<HTMLElement>("#replay-round-label");
    if (label) label.textContent = `Round ${round.roundNumber} / ${this.replay.rounds.length}`;
  }

  private buildControls(): void {
    this.controlEl = document.createElement("div");
    this.controlEl.style.cssText = [
      "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);",
      "background:rgba(0,0,0,0.8);border-radius:8px;padding:10px 16px;",
      "display:flex;align-items:center;gap:12px;z-index:300;",
      "font-family:monospace;font-size:11px;color:#e0e0e0;",
    ].join("");

    this.controlEl.innerHTML = `
      <button id="replay-prev" style="background:#2a2a3e;border:1px solid #444;border-radius:4px;padding:4px 10px;color:#aaa;cursor:pointer;">◀ Prev</button>
      <span id="replay-round-label">Round 1 / ${this.replay.rounds.length}</span>
      <button id="replay-next" style="background:#2a2a3e;border:1px solid #444;border-radius:4px;padding:4px 10px;color:#aaa;cursor:pointer;">Next ▶</button>
      <button id="replay-close" style="background:#c0392b;border:none;border-radius:4px;padding:4px 10px;color:#fff;cursor:pointer;margin-left:8px;">✕ Close</button>
    `;

    this.controlEl.querySelector("#replay-prev")?.addEventListener("click", () => {
      if (this.currentRoundIdx > 0) this.renderRound(this.currentRoundIdx - 1);
    });
    this.controlEl.querySelector("#replay-next")?.addEventListener("click", () => {
      if (this.currentRoundIdx < this.replay.rounds.length - 1) {
        this.renderRound(this.currentRoundIdx + 1);
      }
    });
    this.controlEl.querySelector("#replay-close")?.addEventListener("click", () => this.dispose());

    document.getElementById("ui")!.appendChild(this.controlEl);
  }

  dispose(): void {
    window.removeEventListener("keydown", this._keyHandler);
    this.world.destroy({ children: true });
    this.controlEl.remove();
    window.location.reload();
  }
}
