import type { Room } from "colyseus.js";
import type { MatchState } from "@se/shared";
import { clampAngle, clampPower } from "@se/shared";

export class AimControls {
  private el: HTMLDivElement;
  private angle = 90;
  private power = 500;

  constructor(private room: Room<MatchState>) {
    this.el = document.createElement("div");
    this.el.className = "interactive";
    this.el.style.cssText =
      "position:fixed;bottom:12px;left:12px;background:rgba(0,0,0,0.6);color:#fff;padding:10px;border-radius:8px;font:13px system-ui;min-width:240px;";
    this.el.innerHTML = `
      <div id="phase" style="margin-bottom:6px;color:#aaa"></div>
      <div>Angle: <span id="a">90</span>° (← → ; Shift = 5)</div>
      <input id="ar" type="range" min="0" max="180" value="90" style="width:200px;">
      <div>Power: <span id="p">500</span> (↑ ↓ ; Shift = 10)</div>
      <input id="pr" type="range" min="0" max="1000" value="500" style="width:200px;">
      <button id="start" style="margin-top:8px;width:200px;padding:8px;background:#588157;color:#fff;border:none;border-radius:4px;cursor:pointer;display:none;">Start match</button>
      <button id="fire" style="margin-top:8px;width:200px;padding:8px;background:#e63946;color:#fff;border:none;border-radius:4px;cursor:pointer;">FIRE (Space)</button>
    `;
    document.getElementById("ui")!.appendChild(this.el);

    this.el.querySelector<HTMLInputElement>("#ar")!.oninput = (e) => {
      this.setAngle(Number((e.target as HTMLInputElement).value));
    };
    this.el.querySelector<HTMLInputElement>("#pr")!.oninput = (e) => {
      this.setPower(Number((e.target as HTMLInputElement).value));
    };
    this.el.querySelector<HTMLButtonElement>("#fire")!.onclick = () => this.fire();
    this.el.querySelector<HTMLButtonElement>("#start")!.onclick = () => {
      this.room.send("ready", {});
    };

    window.addEventListener("keydown", this.onKey);

    // Show/hide Start button based on lobby phase + host check
    setInterval(() => this.refreshChrome(), 200);
  }

  private refreshChrome() {
    const state = this.room.state;
    const isHost = state.hostId === this.room.sessionId;
    const inLobby = state.phase === "lobby";
    const isMyTurn = state.phase === "playing" && state.currentTurnPlayerId === this.room.sessionId;
    const startBtn = this.el.querySelector<HTMLButtonElement>("#start")!;
    const fireBtn = this.el.querySelector<HTMLButtonElement>("#fire")!;
    const phaseEl = this.el.querySelector<HTMLDivElement>("#phase")!;
    startBtn.style.display = inLobby && isHost ? "block" : "none";
    fireBtn.style.opacity = isMyTurn ? "1" : "0.5";
    fireBtn.disabled = !isMyTurn;
    phaseEl.textContent = state.phase === "playing"
      ? (isMyTurn ? "Your turn" : `Waiting on ${state.tanks.get(state.currentTurnPlayerId)?.nickname ?? "?"}`)
      : state.phase;
  }

  private setAngle(v: number) {
    this.angle = clampAngle(v);
    this.el.querySelector<HTMLInputElement>("#ar")!.value = String(this.angle);
    this.el.querySelector<HTMLSpanElement>("#a")!.textContent = String(this.angle);
  }
  private setPower(v: number) {
    this.power = clampPower(v);
    this.el.querySelector<HTMLInputElement>("#pr")!.value = String(this.power);
    this.el.querySelector<HTMLSpanElement>("#p")!.textContent = String(this.power);
  }

  private onKey = (e: KeyboardEvent) => {
    const big = e.shiftKey;
    if (e.code === "ArrowLeft") { this.setAngle(this.angle - (big ? 5 : 1)); e.preventDefault(); }
    else if (e.code === "ArrowRight") { this.setAngle(this.angle + (big ? 5 : 1)); e.preventDefault(); }
    else if (e.code === "ArrowUp") { this.setPower(this.power + (big ? 10 : 1)); e.preventDefault(); }
    else if (e.code === "ArrowDown") { this.setPower(this.power - (big ? 10 : 1)); e.preventDefault(); }
    else if (e.code === "Space") { this.fire(); e.preventDefault(); }
  };

  private fire() {
    if (this.room.state.currentTurnPlayerId !== this.room.sessionId) return;
    this.room.send("fire", { angle: this.angle, power: this.power });
  }

  destroy() {
    window.removeEventListener("keydown", this.onKey);
    this.el.remove();
  }
}
