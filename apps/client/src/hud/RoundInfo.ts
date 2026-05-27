const TERRAIN_LABELS: Record<string, string> = {
  mountains: "Mountains", hills: "Hills", valleys: "Valleys",
  cliffs: "Cliffs", crater: "Crater", "sky-high": "Sky High",
  plateau: "Plateau", flat: "Flat", random: "Random",
};

const WALL_LABELS: Record<string, string> = {
  none: "No Walls", wrap: "Wrap", reflect: "Reflect", absorb: "Absorb",
};

export class RoundInfo {
  private el: HTMLDivElement;

  constructor() {
    this.el = document.createElement("div");
    this.el.style.cssText =
      "position:fixed;top:12px;left:12px;" +
      "background:rgba(0,0,0,0.72);color:#e6edf3;" +
      "font:11px 'Courier New',monospace;padding:4px 10px;" +
      "border-radius:6px;z-index:100;opacity:0;" +
      "transition:opacity 0.3s;pointer-events:none;" +
      "letter-spacing:1px;";
    document.getElementById("ui")!.appendChild(this.el);
  }

  update(terrainType: string, wallMode: string): void {
    const typeLabel = TERRAIN_LABELS[terrainType] ?? terrainType;
    const modeLabel = WALL_LABELS[wallMode] ?? wallMode;
    this.el.textContent = `${typeLabel}  ·  ${modeLabel}`;
    this.el.style.opacity = "1";
  }

  hide(): void {
    this.el.style.opacity = "0";
  }

  dispose(): void {
    this.el.remove();
  }
}
