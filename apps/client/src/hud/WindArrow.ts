import type { MatchState } from "@se/shared";

export class WindArrow {
  el: HTMLDivElement;
  constructor() {
    this.el = document.createElement("div");
    this.el.className = "interactive";
    this.el.style.cssText =
      "position:fixed;top:12px;left:50%;transform:translateX(-50%);color:#fff;font:14px system-ui;text-shadow:0 1px 2px #000;";
    document.getElementById("ui")!.appendChild(this.el);
  }
  update(state: MatchState) {
    const w = state.wind;
    const dir = w === 0 ? "" : w > 0 ? "→" : "←";
    const label = Math.abs(w) <= 1 ? "Calm" : `Wind ${dir} ${Math.abs(w)}`;
    this.el.textContent = label;
  }
  destroy() { this.el.remove(); }
}
