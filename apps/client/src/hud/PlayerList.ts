import type { MatchState } from "@se/shared";

export class PlayerList {
  el: HTMLDivElement;
  constructor() {
    this.el = document.createElement("div");
    this.el.style.cssText =
      "position:fixed;top:60px;right:12px;background:rgba(0,0,0,0.5);color:#fff;padding:8px;border-radius:6px;font:13px system-ui;min-width:180px;";
    document.getElementById("ui")!.appendChild(this.el);
  }
  update(state: MatchState) {
    const lines: string[] = [];
    for (const t of state.tanks.values()) {
      const dot = `<span style="display:inline-block;width:10px;height:10px;background:${t.color};border-radius:50%;margin-right:6px;"></span>`;
      const dead = t.alive ? "" : `style="text-decoration:line-through;opacity:0.5;"`;
      lines.push(`<div ${dead}>${dot}${t.nickname} — HP ${t.hp}</div>`);
    }
    this.el.innerHTML = lines.join("");
  }
  destroy() { this.el.remove(); }
}
