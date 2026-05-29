import { ROUND_SUMMARY_DURATION_MS } from "@se/shared";

export interface PlayerSummary {
  sessionId: string;
  nickname: string;
  damageDealt: number;
  kills: number;
  survived: boolean;
  earned: number;
  damageReward: number;
  killReward: number;
  survivalBonus: number;
  totalCash: number;
  roundsWon: number;
  previousRank: number;
  newRank: number;
}

export interface RoundSummaryPayload {
  round: number;
  maxRounds: number;
  roundWinnerId: string;
  players: PlayerSummary[];
}

export class RoundSummaryScene {
  private el: HTMLDivElement;
  private barEl: HTMLDivElement | null = null;
  private deadline = 0;
  private rafId = 0;

  constructor(payload: RoundSummaryPayload, summaryDeadlineMs: number) {
    this.deadline = summaryDeadlineMs;

    this.el = document.createElement("div");
    this.el.className = "interactive";
    this.el.style.cssText = [
      "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;",
      "background:rgba(8,6,24,0.88);z-index:200;",
    ].join("");

    const sorted = [...payload.players].sort((a, b) => a.newRank - b.newRank);

    const rows = sorted.map((p) => {
      const delta = p.previousRank - p.newRank; // positive = moved up
      let trendBadge = `<span style="display:inline-block;margin-left:6px;background:#2a2a2a;color:#666;border-radius:3px;padding:1px 5px;font-size:9px;">—</span>`;
      if (delta > 0) {
        trendBadge = `<span style="display:inline-block;margin-left:6px;background:#1a4a1a;color:#4c4;border-radius:3px;padding:1px 5px;font-size:9px;font-weight:bold;">▲${delta}</span>`;
      } else if (delta < 0) {
        trendBadge = `<span style="display:inline-block;margin-left:6px;background:#3a1a1a;color:#c55;border-radius:3px;padding:1px 5px;font-size:9px;font-weight:bold;">▼${Math.abs(delta)}</span>`;
      }
      const dead = !p.survived ? "opacity:0.55;" : "";
      return `
        <tr style="${dead}border-bottom:1px solid rgba(255,255,255,0.08);">
          <td style="padding:6px 8px;color:${p.newRank === 1 ? "#ff8c00" : "#94a3b8"};">${p.newRank}</td>
          <td style="padding:6px 8px;color:#e2e8f0;">
            ${p.newRank === 1 ? "👑 " : p.survived ? "" : "💀 "}${escHtml(p.nickname)}${trendBadge}
          </td>
          <td style="padding:6px 8px;text-align:right;color:#e2e8f0;">${p.damageDealt}</td>
          <td style="padding:6px 8px;text-align:right;color:#e2e8f0;">${p.kills}</td>
          <td style="padding:6px 8px;text-align:right;color:#fbbf24;">+$${p.earned.toLocaleString()}</td>
          <td style="padding:6px 8px;text-align:right;color:${p.newRank === 1 ? "#ff8c00" : "#e2e8f0"};font-weight:${p.newRank === 1 ? "bold" : "normal"};">$${p.totalCash.toLocaleString()}</td>
        </tr>`;
    }).join("");

    this.el.innerHTML = `
      <div style="background:#0a0820;border:2px solid rgba(255,140,0,0.4);border-radius:12px;padding:20px;min-width:480px;max-width:640px;color:#e2e8f0;font-family:monospace;font-size:11px;">
        <div style="text-align:center;font:900 22px 'Impact',fantasy;color:#ff8c00;letter-spacing:2px;text-shadow:0 0 12px rgba(255,140,0,0.3);margin-bottom:14px;">
          ⚡ ROUND ${payload.round} OF ${payload.maxRounds} COMPLETE
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <tr style="color:#94a3b8;border-bottom:1px solid rgba(255,255,255,0.08);font-size:9px;text-transform:uppercase;letter-spacing:1px;">
            <td style="padding:4px 8px;">#</td>
            <td style="padding:4px 8px;">Player</td>
            <td style="padding:4px 8px;text-align:right;">Dmg</td>
            <td style="padding:4px 8px;text-align:right;">Kills</td>
            <td style="padding:4px 8px;text-align:right;">Earned</td>
            <td style="padding:4px 8px;text-align:right;">Total $</td>
          </tr>
          ${rows}
        </table>
        <div style="margin-top:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
            <span style="color:#94a3b8;font-size:9px;">Shop opens in…</span>
            <span id="rs-countdown" style="color:#ff8c00;font-weight:bold;font-size:13px;"></span>
          </div>
          <div style="background:#1a1535;border-radius:3px;height:4px;overflow:hidden;">
            <div id="rs-bar" style="background:linear-gradient(90deg,#ff8c00,#ff4500);height:4px;width:100%;border-radius:3px;transition:width 0.1s linear;"></div>
          </div>
        </div>
      </div>
    `;

    this.barEl = this.el.querySelector<HTMLDivElement>("#rs-bar");
    document.getElementById("ui")!.appendChild(this.el);
    this.tick();
  }

  private tick(): void {
    const remaining = Math.max(0, this.deadline - Date.now());
    const pct = (remaining / ROUND_SUMMARY_DURATION_MS) * 100;
    const countdown = this.el.querySelector<HTMLSpanElement>("#rs-countdown");
    if (countdown) countdown.textContent = Math.ceil(remaining / 1000) + "s";
    if (this.barEl) this.barEl.style.width = pct + "%";
    if (remaining > 0) {
      this.rafId = requestAnimationFrame(() => this.tick());
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.el.remove();
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
