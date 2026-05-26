import type { Room } from "colyseus.js";
import type { MatchState } from "@se/shared";
import { WEAPON_REGISTRY } from "@se/game";
import { getStateCallbacks } from "colyseus.js";

const LABELS: Record<string, string> = {
  "baby-missile": "BABY MSL",
  "missile": "MISSILE",
  "baby-nuke": "B.NUKE",
  "nuke": "NUKE",
  "funky-bomb": "FUNKY",
  "mirv": "MIRV",
};

const ICONS: Record<string, string> = {
  "baby-missile": `<svg viewBox="0 0 20 20" width="20" height="20"><line x1="5" y1="15" x2="15" y2="5" stroke="#60a5fa" stroke-width="2" stroke-linecap="round"/><polygon points="15,5 11,6 14,9" fill="#93c5fd"/><circle cx="5.5" cy="14.5" r="2" fill="#3b82f6" opacity="0.7"/></svg>`,
  "missile": `<svg viewBox="0 0 20 20" width="20" height="20"><line x1="4" y1="16" x2="16" y2="4" stroke="#9ca3af" stroke-width="2.5" stroke-linecap="round"/><polygon points="16,4 11,6 14,11" fill="#d1d5db"/><line x1="5" y1="14" x2="3" y2="17" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round"/><line x1="7" y1="16" x2="5" y2="18" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  "baby-nuke": `<svg viewBox="0 0 20 20" width="20" height="20"><ellipse cx="10" cy="14" rx="5" ry="2.5" fill="#6b7280" opacity="0.6"/><rect x="9" y="9" width="2" height="5" fill="#9ca3af"/><ellipse cx="10" cy="8" rx="4" ry="3.5" fill="#9ca3af"/><ellipse cx="10" cy="6" rx="5.5" ry="2.5" fill="#d1d5db"/></svg>`,
  "nuke": `<svg viewBox="0 0 20 20" width="20" height="20"><ellipse cx="10" cy="15" rx="6" ry="2.5" fill="#92400e" opacity="0.6"/><rect x="9" y="9" width="2" height="6" fill="#d97706"/><ellipse cx="10" cy="8" rx="5" ry="4" fill="#d97706"/><ellipse cx="10" cy="5.5" rx="6.5" ry="2.8" fill="#fbbf24"/></svg>`,
  "funky-bomb": `<svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="9" r="3" fill="#a855f7" stroke="#d8b4fe" stroke-width="0.5"/><circle cx="10" cy="4" r="1.2" fill="#f472b6"/><circle cx="14" cy="5.5" r="1.2" fill="#fb923c"/><circle cx="15.5" cy="9.5" r="1.2" fill="#facc15"/><circle cx="14" cy="14" r="1.2" fill="#4ade80"/><circle cx="10" cy="16" r="1.2" fill="#22d3ee"/><circle cx="6" cy="14" r="1.2" fill="#60a5fa"/><circle cx="4.5" cy="9.5" r="1.2" fill="#e879f9"/><circle cx="6" cy="5.5" r="1.2" fill="#f87171"/></svg>`,
  "mirv": `<svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="4" r="3" fill="#6b7280" stroke="#9ca3af" stroke-width="0.8"/><line x1="10" y1="7" x2="5" y2="15" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="7" x2="7.5" y2="16" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="7" x2="10" y2="17" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="7" x2="12.5" y2="16" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="7" x2="15" y2="15" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round"/></svg>`,
};

export class WeaponBar {
  private el: HTMLDivElement;
  private strip: HTMLDivElement;
  private leftArrow: HTMLDivElement;
  private rightArrow: HTMLDivElement;
  private scrollOffset = 0;
  private weaponOrder: string[] = Array.from(WEAPON_REGISTRY.keys());

  constructor(private room: Room<MatchState>) {
    this.el = document.createElement("div");
    this.el.className = "interactive";
    this.el.style.cssText =
      "position:fixed;bottom:0;left:0;right:0;height:58px;" +
      "background:rgba(0,0,0,0.88);border-top:1px solid rgba(255,255,255,0.12);" +
      "display:flex;align-items:stretch;z-index:100;";

    this.leftArrow = this.mkArrow("‹");
    this.leftArrow.onclick = () => this.scroll(-1);

    this.strip = document.createElement("div");
    this.strip.style.cssText = "flex:1;display:flex;overflow:hidden;";

    this.rightArrow = this.mkArrow("›");
    this.rightArrow.onclick = () => this.scroll(1);

    this.el.append(this.leftArrow, this.strip, this.rightArrow);
    document.getElementById("ui")!.appendChild(this.el);
    window.addEventListener("keydown", this.onKey);
  }

  wire(): void {
    const $ = getStateCallbacks(this.room);
    const localTank = this.room.state.tanks.get(this.room.sessionId);
    if (!localTank) return;
    const refresh = () => this.render(localTank.weaponId, localTank.inventory);
    $(localTank).listen("weaponId", refresh);
    $(localTank).inventory.onAdd(refresh);
    $(localTank).inventory.onChange(refresh);
    refresh();
  }

  private render(activeId: string, inventory: ReadonlyMap<string, number>): void {
    this.strip.innerHTML = "";
    const visible = this.weaponOrder.filter((id) => inventory.has(id));
    const showArrows = visible.length > 6;
    this.leftArrow.style.visibility = showArrows ? "visible" : "hidden";
    this.rightArrow.style.visibility = showArrows ? "visible" : "hidden";

    const windowSlots = visible.slice(this.scrollOffset, this.scrollOffset + 6);
    windowSlots.forEach((id, i) => {
      const count = inventory.get(id) ?? 0;
      this.strip.appendChild(this.mkSlot(id, count, id === activeId, i + 1));
    });
  }

  private mkSlot(weaponId: string, count: number, active: boolean, keyNum: number): HTMLDivElement {
    const depleted = count === 0;
    const slot = document.createElement("div");
    slot.style.cssText = [
      "flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;",
      "padding:4px 2px;cursor:pointer;border-right:1px solid rgba(255,255,255,0.06);position:relative;",
      active ? "background:#1e3a6e;" : "",
      depleted ? "opacity:0.4;cursor:not-allowed;" : "",
    ].join("");

    if (active) {
      const line = document.createElement("div");
      line.style.cssText = "position:absolute;bottom:0;left:0;right:0;height:2px;background:#3b82f6;";
      slot.appendChild(line);
    }

    const key = document.createElement("div");
    key.style.cssText = "font:bold 8px 'Courier New',monospace;color:#4b5563;margin-bottom:1px;";
    key.textContent = String(keyNum);
    slot.appendChild(key);

    const icon = document.createElement("div");
    icon.innerHTML = ICONS[weaponId] ?? `<svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="6" fill="#6b7280"/></svg>`;
    slot.appendChild(icon);

    const name = document.createElement("div");
    name.style.cssText = `font:bold 7px 'Courier New',monospace;color:${active ? "#93c5fd" : "#9ca3af"};overflow:hidden;white-space:nowrap;max-width:100%;text-align:center;`;
    name.textContent = LABELS[weaponId] ?? weaponId.toUpperCase().slice(0, 8);
    slot.appendChild(name);

    const ammo = document.createElement("div");
    ammo.style.cssText = `font:9px 'Courier New',monospace;color:${active ? "#bfdbfe" : "#6b7280"};`;
    ammo.textContent = count === -1 ? "∞" : String(count);
    slot.appendChild(ammo);

    if (!depleted) {
      slot.onclick = () => this.room.send("select-weapon", { weaponId });
    }
    return slot;
  }

  private scroll(delta: number): void {
    const inv = this.room.state.tanks.get(this.room.sessionId)?.inventory;
    if (!inv) return;
    const visible = this.weaponOrder.filter((id) => inv.has(id));
    const max = Math.max(0, visible.length - 6);
    this.scrollOffset = Math.max(0, Math.min(max, this.scrollOffset + delta));
    const tank = this.room.state.tanks.get(this.room.sessionId);
    if (tank) this.render(tank.weaponId, tank.inventory);
  }

  private onKey = (e: KeyboardEvent): void => {
    const slot = parseInt(e.key, 10);
    if (isNaN(slot) || slot < 1 || slot > 6) return;
    const inv = this.room.state.tanks.get(this.room.sessionId)?.inventory;
    if (!inv) return;
    const visible = this.weaponOrder.filter((id) => inv.has(id));
    const id = visible[this.scrollOffset + slot - 1];
    if (!id) return;
    const count = inv.get(id) ?? 0;
    if (count !== 0) this.room.send("select-weapon", { weaponId: id });
  };

  private mkArrow(char: string): HTMLDivElement {
    const d = document.createElement("div");
    d.style.cssText =
      "width:22px;display:flex;align-items:center;justify-content:center;" +
      "color:#9ca3af;font-size:1.1rem;cursor:pointer;" +
      "border-right:1px solid rgba(255,255,255,0.08);visibility:hidden;";
    d.textContent = char;
    return d;
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKey);
    this.el.remove();
  }
}
