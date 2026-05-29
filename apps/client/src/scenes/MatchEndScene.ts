export interface StandingEntry {
  sessionId: string;
  nickname: string;
  roundsWon: number;
  totalCash: number;
  totalDamage: number;
  totalKills: number;
}

export interface MatchEndPayload {
  winnerId: string;
  standings: StandingEntry[];
}

export class MatchEndScene {
  private el: HTMLDivElement;

  constructor(payload: MatchEndPayload, maxRounds: number, onRematch: () => void, onLeave: () => void) {
    const winner = payload.standings.find((s) => s.sessionId === payload.winnerId);

    const rows = payload.standings.map((s, i) => {
      const rank = i + 1;
      const pips = Array.from({ length: maxRounds }, (_, j) =>
        j < s.roundsWon
          ? `<span style="color:#ff8c00;">●</span>`
          : `<span style="color:#333;">○</span>`
      ).join("");
      const isWinner = s.sessionId === payload.winnerId;
      return `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.08);${!isWinner ? "opacity:0.75;" : ""}">
          <td style="padding:6px 8px;color:${isWinner ? "#ff8c00" : "#94a3b8"};font-weight:${isWinner ? "bold" : "normal"};">${rank}</td>
          <td style="padding:6px 8px;color:${isWinner ? "#ff8c00" : "#e2e8f0"};font-weight:${isWinner ? "bold" : "normal"};">
            ${isWinner ? "👑 " : ""}${escHtml(s.nickname)}
          </td>
          <td style="padding:6px 8px;text-align:center;">
            <span style="font-weight:bold;font-size:13px;color:${isWinner ? "#ff8c00" : "#94a3b8"};">${s.roundsWon}</span>
            <span style="margin-left:4px;font-size:10px;">${pips}</span>
          </td>
          <td style="padding:6px 8px;text-align:right;color:#e2e8f0;">${s.totalDamage}</td>
          <td style="padding:6px 8px;text-align:right;color:#e2e8f0;">${s.totalKills}</td>
          <td style="padding:6px 8px;text-align:right;color:${isWinner ? "#fbbf24" : "#94a3b8"};font-weight:${isWinner ? "bold" : "normal"};">$${s.totalCash.toLocaleString()}</td>
        </tr>`;
    }).join("");

    const hasTie = payload.standings.length > 1 &&
      payload.standings[0]!.roundsWon === payload.standings[1]!.roundsWon;

    this.el = document.createElement("div");
    this.el.className = "interactive";
    this.el.style.cssText = [
      "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;",
      "background:rgba(8,6,24,0.88);z-index:200;",
    ].join("");

    this.el.innerHTML = `
      <div style="background:#0a0820;border:2px solid rgba(255,140,0,0.4);border-radius:12px;padding:20px;min-width:520px;max-width:700px;color:#e2e8f0;font-family:monospace;font-size:11px;">

        <!-- Winner banner -->
        <div style="background:linear-gradient(135deg,#1a0e00,#2e1a00);border:2px solid rgba(255,140,0,0.5);border-radius:8px;padding:12px 16px;text-align:center;margin-bottom:14px;">
          <div style="color:#94a3b8;font-size:9px;text-transform:uppercase;letter-spacing:2px;margin-bottom:4px;">Match Winner</div>
          <div style="font:900 22px 'Impact',fantasy;color:#ff8c00;letter-spacing:2px;text-shadow:0 0 12px rgba(255,140,0,0.3);">👑 ${escHtml(winner?.nickname ?? "Unknown")}</div>
          <div style="color:#94a3b8;font-size:9px;margin-top:4px;">
            Won ${winner?.roundsWon ?? 0} of ${maxRounds} rounds · <span style="color:#fbbf24;">$${(winner?.totalCash ?? 0).toLocaleString()}</span> earned
          </div>
        </div>

        <!-- Standings table -->
        <table style="width:100%;border-collapse:collapse;">
          <tr style="color:#94a3b8;border-bottom:1px solid rgba(255,255,255,0.08);font-size:8px;text-transform:uppercase;letter-spacing:1px;">
            <td style="padding:4px 8px;">#</td>
            <td style="padding:4px 8px;">Player</td>
            <td style="padding:4px 8px;text-align:center;">Rounds Won</td>
            <td style="padding:4px 8px;text-align:right;">Total Dmg</td>
            <td style="padding:4px 8px;text-align:right;">Kills</td>
            <td style="padding:4px 8px;text-align:right;">Final $</td>
          </tr>
          ${rows}
        </table>

        ${hasTie ? `<div style="color:#94a3b8;font-size:8px;margin-top:4px;text-align:right;">Tiebreaker: most cash</div>` : ""}

        <!-- Action buttons -->
        <div style="display:flex;gap:8px;margin-top:16px;">
          <div id="me-rematch" style="flex:1;background:rgba(255,255,255,0.06);border:2px solid rgba(255,255,255,0.15);border-radius:8px;padding:10px;text-align:center;cursor:pointer;color:#94a3b8;font-size:10px;">
            🔄 Rematch
          </div>
          <div id="me-leave" style="flex:2;background:linear-gradient(180deg,#ff8c00,#cc5500);border:3px solid #7f2d00;border-radius:8px;box-shadow:0 4px 0 #7f2d00;padding:10px;text-align:center;cursor:pointer;font:bold 13px system-ui;color:#fff;">
            🚪 Leave
          </div>
        </div>
      </div>
    `;

    this.el.querySelector("#me-rematch")!.addEventListener("click", onRematch);
    this.el.querySelector("#me-leave")!.addEventListener("click", onLeave);

    document.getElementById("ui")!.appendChild(this.el);
  }

  dispose(): void {
    this.el.remove();
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
