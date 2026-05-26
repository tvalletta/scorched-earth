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
    if (!state?.tanks) return;
    const lines: string[] = [];
    for (const t of state.tanks.values()) {
      const dot = `<span style="display:inline-block;width:10px;height:10px;background:${t.color};border-radius:50%;margin-right:6px;"></span>`;
      const dead = t.alive ? "" : `style="text-decoration:line-through;opacity:0.5;"`;
      const hpColor = t.hp > 50 ? "#22c55e" : t.hp > 25 ? "#f59e0b" : "#ef4444";
      const hpPct = Math.max(0, Math.min(100, t.hp));
      const bar = `<div style="width:100%;height:4px;background:rgba(255,255,255,0.15);border-radius:2px;margin:2px 0 3px;"><div style="width:${hpPct}%;height:100%;background:${hpColor};border-radius:2px;transition:width 0.15s;"></div></div>`;
      lines.push(`<div ${dead}>${dot}${t.nickname}<br>${bar}<span style="font-size:10px;color:#aaa;">${t.hp} HP</span></div>`);
    }
    this.el.innerHTML = lines.join("");
  }
  destroy() { this.el.remove(); }
}
