import type { MatchState } from "@se/shared";

export class TurnTimer {
  el: HTMLDivElement;
  constructor() {
    this.el = document.createElement("div");
    this.el.style.cssText =
      "position:fixed;top:12px;right:12px;background:rgba(0,0,0,0.5);color:#fff;padding:6px 12px;border-radius:6px;font:14px system-ui;";
    document.getElementById("ui")!.appendChild(this.el);
  }
  update(state: MatchState) {
    if (state.phase !== "playing") { this.el.textContent = ""; return; }
    const ms = Math.max(0, state.turnDeadlineMs - Date.now());
    const turner = state.tanks.get(state.currentTurnPlayerId);
    this.el.textContent = `${turner?.nickname ?? "?"} — ${Math.ceil(ms / 1000)}s`;
    this.el.style.color = ms < 5000 ? "#ff6b6b" : "#fff";
  }
  destroy() { this.el.remove(); }
}
