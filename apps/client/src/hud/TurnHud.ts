import type { MatchState } from "@se/shared";

const COLOR_CSS: Record<string, string> = {
  red: "#e63946", blue: "#3a86ff", green: "#80b918", yellow: "#fca311",
  cyan: "#00b4d8", magenta: "#b5179e", orange: "#f4a261", white: "#f1f1f1",
  pink: "#f48fb1", lime: "#a6d96a",
};
const R = 42;
const C = 2 * Math.PI * R; // ≈ 263.9

function hpColor(hp: number): string {
  return hp > 50 ? "#22c55e" : hp > 25 ? "#eab308" : "#ef4444";
}

/** Collect AI session ids from `aiSlots`, which is an ArraySchema<AiSlot> in
 * production (each slot has `.sessionId`). Tolerates plain arrays and Maps too. */
function aiSessionIds(aiSlots: unknown): Set<string> {
  const ids = new Set<string>();
  const slots = aiSlots as { forEach?: (cb: (v: any) => void) => void } | undefined;
  slots?.forEach?.((v: any) => {
    const id = v?.sessionId ?? (typeof v === "string" ? v : undefined);
    if (id) ids.add(id);
  });
  return ids;
}

export class TurnHud {
  el: HTMLDivElement;
  private sig = "";

  constructor(private localSessionId: string) {
    this.el = document.createElement("div");
    this.el.className = "turnhud";
    this.el.style.cssText =
      "position:fixed;top:0;left:0;right:0;height:0;pointer-events:none;z-index:90;" +
      "font-family:system-ui,sans-serif;";
    this.el.innerHTML = `
      <div id="turnhud-ring" style="position:fixed;top:14px;left:14px;width:96px;height:96px;">
        <svg width="96" height="96" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r="${R}" fill="rgba(8,6,24,0.55)" stroke="rgba(255,255,255,0.12)" stroke-width="6"/>
          <circle id="turnhud-arc" cx="48" cy="48" r="${R}" fill="none" stroke="#ffd24a" stroke-width="6"
            stroke-linecap="round" transform="rotate(-90 48 48)"
            stroke-dasharray="${C}" stroke-dashoffset="0"/>
        </svg>
        <div id="turnhud-num" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
          font:900 40px Impact,fantasy;color:#ffd24a;text-shadow:0 2px 8px rgba(0,0,0,0.6);">--</div>
      </div>
      <div id="turnhud-roster" style="position:fixed;top:14px;right:14px;display:flex;flex-direction:column;gap:5px;
        max-height:60vh;overflow:hidden;"></div>`;
    document.getElementById("ui")!.appendChild(this.el);
  }

  update(state: MatchState): void {
    if (state.phase !== "playing") { this.el.style.display = "none"; return; }
    this.el.style.display = "block";

    // Ring
    const remaining = Math.max(0, state.turnDeadlineMs - Date.now());
    const denom = state.turnTimerMs || 30000;
    const frac = Math.max(0, Math.min(1, remaining / denom));
    const urgent = remaining <= 5000;
    const arc = this.el.querySelector<SVGCircleElement>("#turnhud-arc")!;
    const num = this.el.querySelector<HTMLDivElement>("#turnhud-num")!;
    arc.style.strokeDashoffset = String(C * (1 - frac));
    arc.style.stroke = urgent ? "#ef4444" : "#ffd24a";
    num.style.color = urgent ? "#ef4444" : "#ffd24a";
    num.textContent = String(Math.ceil(remaining / 1000));
    this.el.querySelector<HTMLDivElement>("#turnhud-ring")!.style.transform =
      urgent ? `scale(${1 + 0.06 * Math.sin(Date.now() / 120)})` : "none";

    // Roster — structural rebuild only on signature change; else update in place.
    const tanks = Array.from(state.tanks.values());
    const aiIds = aiSessionIds(state.aiSlots);
    const sig = tanks.map((t) => `${t.sessionId}:${t.alive ? 1 : 0}`).join("|");
    const roster = this.el.querySelector<HTMLDivElement>("#turnhud-roster")!;
    if (sig !== this.sig) {
      this.sig = sig;
      roster.innerHTML = tanks.map((t) => {
        const isAi = aiIds.has(t.sessionId);
        const you = t.sessionId === this.localSessionId;
        const name = `${isAi ? "🤖 " : ""}${you ? "You" : t.nickname}${t.alive ? "" : " 💀"}`;
        const shieldBar = t.shieldId && t.shieldHp > 0 ? (() => {
          const frac = t.shieldMaxHp > 0 ? t.shieldHp / t.shieldMaxHp : 0;
          const segColor = frac > 0.66 ? '#22c55e' : frac > 0.33 ? '#eab308' : '#ef4444';
          const segs = Array.from({ length: 5 }, (_, i) => {
            const filled = (i + 1) / 5 <= frac;
            return `<div style="flex:1;height:4px;border-radius:2px;background:${filled ? segColor : 'rgba(255,255,255,0.1)'};"></div>`;
          }).join('');
          return `<div class="thp-shield" style="display:flex;align-items:center;gap:3px;width:100%;padding:2px 0 0;">
              <span style="font-size:8px;">🛡</span>
              <div style="display:flex;gap:2px;flex:1;">${segs}</div>
              <span style="font:bold 7px monospace;color:#4ecdc4;">${Math.round(frac * 100)}%</span>
            </div>`;
        })() : '';
        return `<div data-session="${t.sessionId}" class="thp-row" style="display:flex;flex-direction:column;gap:0;
          background:rgba(8,6,24,0.75);border:1px solid rgba(255,255,255,0.12);border-radius:8px;
          padding:5px 9px;min-width:160px;opacity:${t.alive ? 1 : 0.4};">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="width:10px;height:10px;border-radius:50%;flex-shrink:0;background:${COLOR_CSS[t.color] ?? "#fff"};"></span>
            <span class="thp-name" style="flex:1;font:bold 11px system-ui;color:#fff;white-space:nowrap;">${name}</span>
            <span class="thp-bar" style="width:64px;height:5px;border-radius:3px;background:rgba(255,255,255,0.16);overflow:hidden;">
              <span class="thp-fill" style="display:block;height:100%;width:${t.hp}%;background:${hpColor(t.hp)};"></span>
            </span>
            <span class="thp-num" style="font:bold 10px monospace;color:#cbd5e1;width:22px;text-align:right;">${t.alive ? t.hp : "—"}</span>
          </div>
          ${shieldBar}
        </div>`;
      }).join("");
    } else {
      for (const t of tanks) {
        const row = roster.querySelector<HTMLDivElement>(`[data-session="${t.sessionId}"]`);
        if (!row) continue;
        const fill = row.querySelector<HTMLSpanElement>(".thp-fill")!;
        fill.style.width = `${t.hp}%`;
        fill.style.background = hpColor(t.hp);
        row.querySelector<HTMLSpanElement>(".thp-num")!.textContent = t.alive ? String(t.hp) : "—";
        // Update shield bar if present
        const shieldRow = row.querySelector<HTMLDivElement>('.thp-shield');
        if (t.shieldId && t.shieldHp > 0) {
          if (!shieldRow) {
            this.sig = ''; // force rebuild
          } else {
            const frac = t.shieldMaxHp > 0 ? t.shieldHp / t.shieldMaxHp : 0;
            const segColor = frac > 0.66 ? '#22c55e' : frac > 0.33 ? '#eab308' : '#ef4444';
            const segs = shieldRow.querySelectorAll<HTMLDivElement>('div > div');
            segs.forEach((seg, i) => {
              seg.style.background = (i + 1) / 5 <= frac ? segColor : 'rgba(255,255,255,0.1)';
            });
            const pct = shieldRow.querySelector<HTMLSpanElement>('span:last-child');
            if (pct) pct.textContent = `${Math.round(frac * 100)}%`;
          }
        } else if (shieldRow) {
          this.sig = ''; // force rebuild to remove
        }
      }
    }
    // active highlight (every frame, cheap)
    roster.querySelectorAll<HTMLDivElement>(".thp-row").forEach((row) => {
      const active = row.getAttribute("data-session") === state.currentTurnPlayerId;
      row.classList.toggle("active", active);
      row.style.border = active ? "2px solid #ffd24a" : "1px solid rgba(255,255,255,0.12)";
      row.style.boxShadow = active ? "0 0 14px rgba(255,210,74,0.55)" : "none";
    });
  }

  destroy(): void { this.el.remove(); }
}
