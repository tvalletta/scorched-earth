import type { Application } from "pixi.js";
import type { Room } from "colyseus.js";
import type { MatchState } from "@se/shared";
import { LobbyBattle } from "../render/LobbyBattle";
import { LobbyScene } from "./LobbyScene";
import { MatchScene } from "./MatchScene";
import { createMatch, joinMatch, RoomNotFoundError } from "../net/colyseusClient";
import { loadIdentity } from "../lib/identity";
import { parseRoomCode } from "../lib/lobby";

/**
 * Owns the lobby experience: the cosmetic background battle, a dim overlay,
 * and the waiting-room panel. Holds the connected Room and hands it to
 * MatchScene when the match starts (phase -> playing).
 */
export class LobbyController {
  private battle: LobbyBattle;
  private dim: HTMLDivElement;
  private lobby: LobbyScene | null = null;

  constructor(app: Application) {
    this.battle = new LobbyBattle(app);
    this.dim = document.createElement("div");
    this.dim.style.cssText =
      "position:fixed;inset:0;background:rgba(4,2,16,0.30);z-index:200;pointer-events:none;";
  }

  async enter(): Promise<void> {
    // Battle + dim render immediately so the screen is never blank, even if
    // the network is slow or down.
    this.battle.start();
    document.getElementById("ui")!.appendChild(this.dim);

    const id = loadIdentity();
    const meta = { nickname: id.name, color: id.color, hat: id.hat };

    let code = parseRoomCode(location.pathname);
    let room: Room<MatchState>;

    if (code) {
      try {
        room = await joinMatch(code, meta);
      } catch (e) {
        if (e instanceof RoomNotFoundError) {
          this.toast(`Room ${code} not found — starting a new game.`);
          history.replaceState({}, "", "/");
          code = null;
          ({ room, code } = await createMatch(meta));
          history.replaceState({}, "", "/" + code);
        } else {
          this.toast("Could not reach the server. Retrying…");
          throw e;
        }
      }
    } else {
      ({ room, code } = await createMatch(meta));
      history.replaceState({}, "", "/" + code);
    }

    this.lobby = new LobbyScene(room, code, () => this.toMatch(room, code!));
  }

  private toMatch(room: Room<MatchState>, code: string): void {
    this.battle.dispose();
    this.dim.remove();
    this.lobby?.dispose();
    this.lobby = null;
    new MatchScene(room, code);
  }

  private toast(message: string): void {
    const el = document.createElement("div");
    el.textContent = message;
    el.className = "interactive";
    el.style.cssText = [
      "position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:400;",
      "background:rgba(10,8,26,0.96);border:1px solid rgba(255,140,0,0.5);border-radius:8px;",
      "padding:10px 18px;color:#fff;font:bold 13px system-ui;box-shadow:0 8px 24px rgba(0,0,0,0.5);",
    ].join("");
    document.getElementById("ui")!.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }
}
