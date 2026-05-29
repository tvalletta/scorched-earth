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

  constructor(
    payload: MatchEndPayload,
    maxRounds: number,
    onRematch: () => void,
    onLeave: () => void,
    replayOptions?: { matchId: string; serverUrl: string; onWatch: () => void },
  ) {
    const winner = payload.standings.find((s) => s.sessionId === payload.winnerId);

    const rows = payload.standings.map((s, i) => {
      const rank = i + 1;
      const pips = Array.from({ length: maxRounds }, (_, j) =>
        j < s.roundsWon
          ? `<span style="color:#f4c842;">●</span>`
          : `<span style="color:#333;">○</span>`
      ).join("");
      const isWinner = s.sessionId === payload.winnerId;
      return `
        <tr style="border-bottom:1px solid #2a2a3e;${!isWinner ? "color:#aaa;" : ""}">
          <td style="padding:6px 8px;color:${isWinner ? "#f4c842" : "#aaa"};font-weight:${isWinner ? "bold" : "normal"};">${rank}</td>
          <td style="padding:6px 8px;color:${isWinner ? "#f4c842" : "#e0e0e0"};font-weight:${isWinner ? "bold" : "normal"};">
            ${isWinner ? "👑 " : ""}${escHtml(s.nickname)}
          </td>
          <td style="padding:6px 8px;text-align:center;">
            <span style="font-weight:bold;font-size:13px;color:${isWinner ? "#f4c842" : "#aaa"};">${s.roundsWon}</span>
            <span style="margin-left:4px;font-size:10px;">${pips}</span>
          </td>
          <td style="padding:6px 8px;text-align:right;">${s.totalDamage}</td>
          <td style="padding:6px 8px;text-align:right;">${s.totalKills}</td>
          <td style="padding:6px 8px;text-align:right;color:${isWinner ? "#f4c842" : "#aaa"};font-weight:${isWinner ? "bold" : "normal"};">$${s.totalCash.toLocaleString()}</td>
        </tr>`;
    }).join("");

    const hasTie = payload.standings.length > 1 &&
      payload.standings[0]!.roundsWon === payload.standings[1]!.roundsWon;

    this.el = document.createElement("div");
    this.el.className = "interactive";
    this.el.style.cssText = [
      "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;",
      "background:rgba(0,0,0,0.80);z-index:200;",
    ].join("");

    this.el.innerHTML = `
      <div style="background:#12121e;border-radius:10px;padding:20px;min-width:520px;max-width:700px;color:#e0e0e0;font-family:monospace;font-size:11px;">

        <!-- Winner banner -->
        <div style="background:linear-gradient(135deg,#2a1f00,#4a3800);border:1px solid #f4c842;border-radius:6px;padding:12px 16px;text-align:center;margin-bottom:14px;">
          <div style="color:#888;font-size:9px;text-transform:uppercase;letter-spacing:2px;margin-bottom:4px;">Match Winner</div>
          <div style="font-size:20px;font-weight:bold;color:#f4c842;">👑 ${escHtml(winner?.nickname ?? "Unknown")}</div>
          <div style="color:#888;font-size:9px;margin-top:4px;">
            Won ${winner?.roundsWon ?? 0} of ${maxRounds} rounds · $${(winner?.totalCash ?? 0).toLocaleString()} earned
          </div>
        </div>

        <!-- Standings table -->
        <table style="width:100%;border-collapse:collapse;">
          <tr style="color:#666;border-bottom:1px solid #2a2a3e;font-size:8px;text-transform:uppercase;letter-spacing:1px;">
            <td style="padding:4px 8px;">#</td>
            <td style="padding:4px 8px;">Player</td>
            <td style="padding:4px 8px;text-align:center;">Rounds Won</td>
            <td style="padding:4px 8px;text-align:right;">Total Dmg</td>
            <td style="padding:4px 8px;text-align:right;">Kills</td>
            <td style="padding:4px 8px;text-align:right;">Final $</td>
          </tr>
          ${rows}
        </table>

        ${hasTie ? `<div style="color:#555;font-size:8px;margin-top:4px;text-align:right;">Tiebreaker: most cash</div>` : ""}

        <!-- Action buttons -->
        <div style="display:flex;gap:8px;margin-top:16px;">
          <div id="me-rematch" style="flex:1;background:#1e1e30;border:1px solid #3a3a4e;border-radius:6px;padding:10px;text-align:center;cursor:pointer;color:#aaa;font-size:10px;">
            🔄 Rematch
          </div>
          ${replayOptions ? `
          <div id="me-download-replay" style="flex:1;background:#1e1e30;border:1px solid #3a3a4e;border-radius:6px;padding:10px;text-align:center;cursor:pointer;color:#aaa;font-size:10px;">
            ⬇ Download Replay
          </div>
          <div id="me-watch-replay" style="flex:1;background:#1e3a2e;border:1px solid #2d6a4f;border-radius:6px;padding:10px;text-align:center;cursor:pointer;color:#74c69d;font-size:10px;">
            ▶ Watch Replay
          </div>
          ` : ""}
          <div id="me-leave" style="flex:2;background:#c0392b;border-radius:6px;padding:10px;text-align:center;cursor:pointer;font-size:10px;font-weight:bold;">
            🚪 Leave
          </div>
        </div>
      </div>
    `;

    this.el.querySelector("#me-rematch")!.addEventListener("click", onRematch);
    this.el.querySelector("#me-leave")!.addEventListener("click", onLeave);

    if (replayOptions) {
      this.el.querySelector("#me-download-replay")?.addEventListener("click", () => {
        const { matchId, serverUrl } = replayOptions;
        const httpUrl = serverUrl.replace(/^ws/, "http");
        fetch(`${httpUrl}/replays/${matchId}`)
          .then((r) => r.blob())
          .then((blob) => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `replay-${matchId}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
          })
          .catch(console.error);
      });
      this.el.querySelector("#me-watch-replay")?.addEventListener("click", replayOptions.onWatch);
    }

    document.getElementById("ui")!.appendChild(this.el);
  }

  dispose(): void {
    this.el.remove();
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
