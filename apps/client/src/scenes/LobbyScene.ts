import { COLORS, HATS } from "@se/shared";
import { createMatch, joinMatch } from "../net/colyseusClient";
import { MatchScene } from "./MatchScene";

const urlMatch = location.pathname.match(/^\/([A-Z0-9]{6})$/i);
const codeFromUrl = urlMatch ? urlMatch[1].toUpperCase() : null;

export class LobbyScene {
  private root: HTMLDivElement;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "interactive";
    this.root.style.cssText =
      "position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,0.4);";
    this.root.innerHTML = `
      <div style="background:#fff;color:#222;padding:24px;border-radius:12px;min-width:360px;font:14px system-ui;">
        <h1 style="margin:0 0 16px;">Scorched Earth</h1>
        <label>Nickname<br><input id="nick" maxlength="24" value="Player" style="width:100%;padding:6px;"/></label>
        <div style="margin-top:12px;">Color
          <select id="color">${COLORS.map((c) => `<option>${c}</option>`).join("")}</select>
          Hat
          <select id="hat">${HATS.map((h) => `<option>${h}</option>`).join("")}</select>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
          <button id="create">Create match</button>
          <input id="code" placeholder="ABC123" maxlength="6" style="text-transform:uppercase;width:80px;"/>
          <button id="join">Join</button>
        </div>
        <div id="status" style="margin-top:12px;color:#666;"></div>
        <div id="invite" style="display:none;margin-top:12px;padding:10px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
          <div style="font-size:12px;color:#64748b;margin-bottom:6px;">Share this link to invite players:</div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span id="invite-url" style="font:12px 'Courier New',monospace;color:#0f172a;word-break:break-all;flex:1;"></span>
            <button id="copy-link" style="white-space:nowrap;padding:4px 10px;font-size:12px;">📋 Copy link</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById("ui")!.appendChild(this.root);

    this.root.querySelector<HTMLButtonElement>("#create")!.onclick = () => this.onCreate();
    this.root.querySelector<HTMLButtonElement>("#join")!.onclick = () => this.onJoin();
    this.root.querySelector<HTMLButtonElement>("#copy-link")!.onclick = () => this.onCopyLink();

    if (codeFromUrl) {
      this.root.querySelector<HTMLInputElement>("#code")!.value = codeFromUrl;
      setTimeout(() => this.onJoin(), 100);
    }
  }

  private get meta() {
    return {
      nickname: this.root.querySelector<HTMLInputElement>("#nick")!.value || "Player",
      color: this.root.querySelector<HTMLSelectElement>("#color")!.value,
      hat: this.root.querySelector<HTMLSelectElement>("#hat")!.value,
    };
  }

  private setStatus(text: string) {
    this.root.querySelector<HTMLDivElement>("#status")!.textContent = text;
  }

  private showInvite(code: string) {
    const url = `${location.origin}/${code}`;
    this.root.querySelector<HTMLSpanElement>("#invite-url")!.textContent = url;
    this.root.querySelector<HTMLDivElement>("#invite")!.style.display = "block";
  }

  private onCopyLink() {
    const url = this.root.querySelector<HTMLSpanElement>("#invite-url")!.textContent ?? "";
    navigator.clipboard.writeText(url).then(() => {
      const btn = this.root.querySelector<HTMLButtonElement>("#copy-link")!;
      btn.textContent = "✓ Copied!";
      setTimeout(() => { btn.textContent = "📋 Copy link"; }, 2000);
    });
  }

  private async onCreate() {
    this.setStatus("Creating room...");
    try {
      const { room, code } = await createMatch(this.meta);
      history.pushState({}, "", "/" + code);
      this.setStatus(`Room ${code} — share this code`);
      this.showInvite(code);
      this.dispose();
      new MatchScene(room, code);
    } catch (e: unknown) {
      this.setStatus("Failed: " + (e as Error).message);
    }
  }

  private async onJoin() {
    const code = this.root.querySelector<HTMLInputElement>("#code")!.value.toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) { this.setStatus("Enter a 6-char code"); return; }
    this.setStatus("Joining...");
    try {
      const room = await joinMatch(code, this.meta);
      this.dispose();
      new MatchScene(room, code);
    } catch (e: unknown) {
      this.setStatus("Failed: " + (e as Error).message);
    }
  }

  dispose() { this.root.remove(); }
}
