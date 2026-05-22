import { COLORS, HATS } from "@se/shared";
import { createMatch, joinMatch } from "../net/colyseusClient";
import { MatchScene } from "./MatchScene";

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
      </div>
    `;
    document.getElementById("ui")!.appendChild(this.root);

    this.root.querySelector<HTMLButtonElement>("#create")!.onclick = () => this.onCreate();
    this.root.querySelector<HTMLButtonElement>("#join")!.onclick = () => this.onJoin();
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

  private async onCreate() {
    this.setStatus("Creating room...");
    try {
      const { room, code } = await createMatch(this.meta);
      this.setStatus(`Room ${code} — share this code`);
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
