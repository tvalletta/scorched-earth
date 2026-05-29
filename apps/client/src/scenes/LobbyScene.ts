import type { Room } from "colyseus.js";
import { getStateCallbacks } from "colyseus.js";
import type { MatchState, MatchPhase } from "@se/shared";
import { ALL_AI_DIFFICULTIES } from "@se/shared";
import { loadIdentity, saveIdentity } from "../lib/identity";
import type { StoredIdentity, TankColorKey, Hat } from "../lib/identity";
import { inviteLink, buildLobbyView, type CombatantVM } from "../lib/lobby";

const COLOR_CSS: Record<TankColorKey, string> = {
  red: "#e63946", blue: "#3a86ff", green: "#80b918", orange: "#f4a261", cyan: "#00b4d8",
  magenta: "#b5179e", yellow: "#fca311", pink: "#f48fb1", lime: "#a6d96a", white: "#f1f1f1",
};
const HAT_EMOJIS: Record<Hat, string> = {
  none: "⬜", helm: "🪖", chef: "👨‍🍳", tophat: "🎩", beanie: "🧢",
  cowboy: "🤠", party: "🎉", viking: "⚔️", santa: "🎅",
};
const ALL_COLORS = Object.keys(COLOR_CSS) as TankColorKey[];
const ALL_HATS = Object.keys(HAT_EMOJIS) as Hat[];
const LOADOUTS = ["starter", "standard", "bonanza"] as const;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export class LobbyScene {
  private panel: HTMLDivElement;
  private identity: StoredIdentity;
  private nameDebounce?: ReturnType<typeof setTimeout>;
  private transitioned = false;

  constructor(
    private room: Room<MatchState>,
    private code: string,
    private onPlaying: () => void,
  ) {
    this.identity = loadIdentity();

    this.panel = document.createElement("div");
    this.panel.className = "interactive";
    this.panel.style.cssText = [
      "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) scale(0.96);",
      "width:min(600px,94vw);max-height:92vh;overflow:auto;",
      "background:rgba(10,8,26,0.97);border:2px solid rgba(255,140,0,0.5);",
      "border-radius:16px;padding:20px 24px 22px;",
      "font-family:system-ui,sans-serif;color:#fff;z-index:300;",
      "box-shadow:0 18px 55px rgba(0,0,0,0.65);",
      "opacity:0;transition:opacity 0.3s ease-out,transform 0.3s ease-out;",
    ].join("");
    this.panel.innerHTML = this.shellHTML();
    document.getElementById("ui")!.appendChild(this.panel);
    requestAnimationFrame(() => {
      this.panel.style.opacity = "1";
      this.panel.style.transform = "translate(-50%,-50%) scale(1)";
    });

    this.bindStaticEvents();
    this.bindState();
    this.update();
  }

  // ── Shell (built once) ──────────────────────────────────────────────────
  private shellHTML(): string {
    const id = this.identity;
    const url = inviteLink(location.host ? location.protocol + "//" + location.host : location.origin, this.code);

    const colorSwatches = ALL_COLORS.map(c =>
      `<div class="se-sw" data-color="${c}" style="width:24px;height:24px;border-radius:6px;cursor:pointer;
        background:${COLOR_CSS[c]};box-sizing:border-box;
        border:${c === id.color ? "3px solid #ff8c00" : "2px solid rgba(255,255,255,0.15)"};"></div>`).join("");
    const hatPicks = ALL_HATS.map(h =>
      `<div class="se-hat" data-hat="${h}" title="${h}" style="padding:4px 7px;border-radius:7px;cursor:pointer;
        font-size:18px;line-height:1.3;
        background:${h === id.hat ? "rgba(255,140,0,0.2)" : "rgba(255,255,255,0.05)"};
        border:${h === id.hat ? "2px solid #ff8c00" : "1px solid rgba(255,255,255,0.12)"};">${HAT_EMOJIS[h]}</div>`).join("");
    const loadoutOpts = LOADOUTS.map(l => `<option value="${l}">${cap(l)}</option>`).join("");

    const sec = (title: string, body: string, extra = "") =>
      `<div class="se-sec" style="background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.08);
        border-radius:12px;padding:13px 16px;margin-bottom:13px;${extra}">
        <div style="font:bold 10px sans-serif;color:#ff8c00;letter-spacing:2.5px;margin-bottom:11px;
          display:flex;align-items:center;gap:8px;">${title}<span style="flex:1;height:1px;background:rgba(255,140,0,0.18);"></span></div>
        ${body}</div>`;
    const subLabel = (t: string) => `<div style="font:bold 8px sans-serif;color:#64748b;letter-spacing:1px;margin:12px 0 6px;">${t}</div>`;

    return `
      <div style="font:900 22px 'Impact',fantasy;color:#ff8c00;text-align:center;letter-spacing:5px;
        text-shadow:0 0 16px rgba(255,140,0,0.4);margin-bottom:16px;">SCORCHED EARTH</div>

      ${sec("INVITE FRIENDS", `
        <div style="display:flex;align-items:stretch;gap:12px;">
          <div style="display:flex;flex-direction:column;gap:2px;justify-content:center;
            background:rgba(255,207,51,0.07);border:1px solid rgba(255,207,51,0.4);border-radius:9px;padding:6px 16px;">
            <span style="font:bold 8px sans-serif;color:#94a3b8;letter-spacing:1.5px;">ROOM CODE</span>
            <span id="se-code" style="font:bold 22px monospace;color:#ffcf33;letter-spacing:4px;">${esc(this.code)}</span>
          </div>
          <div id="se-url" style="flex:1;display:flex;align-items:center;background:rgba(255,255,255,0.05);
            border:1px solid rgba(255,255,255,0.16);border-radius:9px;padding:0 13px;font:13px monospace;
            color:#cbd5e1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${esc(url)}</div>
          <button id="se-copy" style="flex:0 0 auto;background:linear-gradient(180deg,#3a86ff,#2563eb);
            border:2px solid #1e40af;border-radius:9px;color:#fff;font:bold 12px system-ui;padding:0 18px;
            cursor:pointer;box-shadow:0 3px 0 #1e3a8a;">⧉ Copy Invite</button>
        </div>`)}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:13px;align-items:start;">
        <div id="se-soldier">${sec("YOUR SOLDIER", `
          ${subLabel("NAME")}
          <input id="se-name" maxlength="24" value="${esc(id.name)}" style="width:100%;box-sizing:border-box;
            padding:9px;border-radius:7px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.2);
            color:#fff;font:bold 13px system-ui;">
          ${subLabel("COLOR")}<div style="display:flex;gap:6px;flex-wrap:wrap;">${colorSwatches}</div>
          ${subLabel("HAT")}<div style="display:flex;gap:6px;flex-wrap:wrap;">${hatPicks}</div>
        `, "margin-bottom:0;")}</div>

        ${sec(`<span id="se-cb-head">COMBATANTS</span>`, `
          <div id="se-roster" style="max-height:208px;overflow-y:auto;padding-right:4px;"></div>
          <button id="se-add-ai" style="width:100%;padding:8px;border-radius:8px;background:rgba(255,255,255,0.05);
            border:1px dashed rgba(255,255,255,0.25);color:#94a3b8;font:bold 11px system-ui;cursor:pointer;margin-top:6px;">+ Add AI opponent</button>
          <div id="se-spectators" style="margin-top:9px;"></div>
        `, "margin-bottom:0;")}
      </div>

      ${sec("MATCH SETUP", `
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <span style="font:bold 9px sans-serif;color:#64748b;letter-spacing:1px;">ROUNDS</span>
          <button id="se-rounds-minus" class="se-step" style="width:28px;height:28px;border-radius:6px;
            background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.18);color:#fff;font:bold 16px system-ui;cursor:pointer;">−</button>
          <span id="se-rounds-val" style="font:bold 17px system-ui;min-width:18px;text-align:center;">5</span>
          <button id="se-rounds-plus" class="se-step" style="width:28px;height:28px;border-radius:6px;
            background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.18);color:#fff;font:bold 16px system-ui;cursor:pointer;">+</button>
          <span style="width:1px;height:22px;background:rgba(255,255,255,0.12);margin:0 4px;"></span>
          <span style="font:bold 9px sans-serif;color:#64748b;letter-spacing:1px;">LOADOUT</span>
          <select id="se-loadout" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.18);
            color:#cbd5e1;border-radius:6px;font:12px system-ui;padding:5px 8px;">${loadoutOpts}</select>
        </div>`)}

      <button id="se-start" style="width:100%;padding:14px;background:linear-gradient(180deg,#ff8c00,#cc5500);
        border:3px solid #7f2d00;border-radius:12px;box-shadow:0 5px 0 #7f2d00;color:#fff;font:bold 17px system-ui;
        cursor:pointer;text-shadow:1px 1px 0 rgba(0,0,0,0.5);letter-spacing:1.5px;margin-top:3px;">▶ START MATCH</button>
    `;
  }

  private q<T extends HTMLElement>(sel: string): T | null { return this.panel.querySelector<T>(sel); }

  // ── Static event wiring (elements that persist across updates) ──────────
  private bindStaticEvents(): void {
    const name = this.q<HTMLInputElement>("#se-name");
    name?.addEventListener("input", () => {
      this.identity.name = name.value;
      saveIdentity(this.identity);
      clearTimeout(this.nameDebounce);
      this.nameDebounce = setTimeout(() => this.sendIdentity(), 300);
    });

    this.panel.querySelectorAll<HTMLDivElement>(".se-sw").forEach(sw => {
      sw.addEventListener("click", () => {
        this.identity.color = sw.dataset.color as TankColorKey;
        saveIdentity(this.identity);
        this.panel.querySelectorAll<HTMLDivElement>(".se-sw").forEach(s => {
          s.style.border = s.dataset.color === this.identity.color ? "3px solid #ff8c00" : "2px solid rgba(255,255,255,0.15)";
        });
        this.sendIdentity();
      });
    });
    this.panel.querySelectorAll<HTMLDivElement>(".se-hat").forEach(hp => {
      hp.addEventListener("click", () => {
        this.identity.hat = hp.dataset.hat as Hat;
        saveIdentity(this.identity);
        this.panel.querySelectorAll<HTMLDivElement>(".se-hat").forEach(h => {
          const on = h.dataset.hat === this.identity.hat;
          h.style.background = on ? "rgba(255,140,0,0.2)" : "rgba(255,255,255,0.05)";
          h.style.border = on ? "2px solid #ff8c00" : "1px solid rgba(255,255,255,0.12)";
        });
        this.sendIdentity();
      });
    });

    this.q("#se-copy")?.addEventListener("click", () => this.onCopy());
    this.q("#se-rounds-minus")?.addEventListener("click", () => this.bumpRounds(-1));
    this.q("#se-rounds-plus")?.addEventListener("click", () => this.bumpRounds(1));
    this.q<HTMLSelectElement>("#se-loadout")?.addEventListener("change", (e) => {
      this.room.send("configure", { loadoutId: (e.target as HTMLSelectElement).value });
    });
    this.q("#se-add-ai")?.addEventListener("click", () => this.room.send("add-ai", { difficulty: "shooter" }));
    this.q("#se-start")?.addEventListener("click", () => this.room.send("ready", {}));

    // Delegated roster controls (AI difficulty / remove).
    this.q("#se-roster")?.addEventListener("change", (e) => {
      const t = e.target as HTMLElement;
      if (t.classList.contains("se-ai-diff")) {
        this.room.send("set-ai-difficulty", { sessionId: t.dataset.sid, difficulty: (t as HTMLSelectElement).value });
      }
    });
    this.q("#se-roster")?.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (t.classList.contains("se-ai-remove")) {
        this.room.send("remove-ai", { sessionId: t.dataset.sid });
      }
    });
  }

  private bumpRounds(delta: number): void {
    const next = Math.max(1, Math.min(20, (this.room.state.maxRounds || 5) + delta));
    this.room.send("configure", { maxRounds: next });
    const el = this.q("#se-rounds-val"); if (el) el.textContent = String(next); // optimistic
  }

  private sendIdentity(): void {
    this.room.send("set-identity", {
      nickname: this.identity.name,
      color: this.identity.color,
      hat: this.identity.hat,
    });
  }

  private onCopy(): void {
    const url = inviteLink(location.protocol + "//" + location.host, this.code);
    navigator.clipboard?.writeText(url).catch(() => {});
    const btn = this.q("#se-copy"); if (!btn) return;
    const prev = btn.textContent;
    btn.textContent = "✓ Copied!";
    setTimeout(() => { if (btn) btn.textContent = prev; }, 2000);
  }

  // ── State binding ───────────────────────────────────────────────────────
  private bindState(): void {
    const $ = getStateCallbacks(this.room);
    const state = this.room.state;
    const rerender = () => this.update();

    $(state).tanks.onAdd((t: any) => { $(t).onChange(rerender); rerender(); });
    $(state).tanks.onRemove(rerender);
    $(state).aiSlots.onAdd((s: any) => { $(s).onChange(rerender); rerender(); });
    $(state).aiSlots.onRemove(rerender);
    $(state).observers.onAdd(rerender);
    $(state).observers.onRemove(rerender);
    $(state).listen("hostId", rerender);
    $(state).listen("maxRounds", rerender);
    $(state).listen("loadoutId", rerender);
    // Immediate: if we join a room that has already left the lobby (mid-match),
    // go straight to the match (as a spectator) instead of showing the panel.
    $(state).listen("phase", (phase: MatchPhase) => {
      if (phase !== "lobby" && !this.transitioned) {
        this.transitioned = true;
        this.onPlaying();
      }
    }, true);
  }

  // ── Dynamic update (no full innerHTML rebuild → input focus preserved) ──
  private update(): void {
    const view = buildLobbyView(this.room.state, this.room.sessionId);

    // Combatants header + roster
    const head = this.q("#se-cb-head");
    if (head) head.textContent = `COMBATANTS · ${view.combatantCount} / 10`;

    const roster = this.q<HTMLDivElement>("#se-roster");
    if (roster) {
      const top = roster.scrollTop;
      roster.innerHTML = view.combatants.map(c => this.rosterRow(c, view.isHost)).join("");
      roster.scrollTop = top;
    }

    // Add-AI button
    const addAi = this.q<HTMLButtonElement>("#se-add-ai");
    if (addAi) {
      addAi.style.display = view.isHost && !view.isSpectator ? "" : "none";
      addAi.disabled = view.isFull;
      addAi.textContent = view.isFull ? `Lobby full — ${view.combatantCount} / 10` : "+ Add AI opponent";
      addAi.style.cursor = view.isFull ? "not-allowed" : "pointer";
      addAi.style.color = view.isFull ? "#475569" : "#94a3b8";
    }

    // Spectators strip
    const spec = this.q<HTMLDivElement>("#se-spectators");
    if (spec) {
      if (view.spectators.length === 0) { spec.innerHTML = ""; }
      else {
        const names = view.spectators.slice(0, 3).map(s => esc(s.nickname)).join(", ");
        const more = view.spectators.length > 3 ? ` +${view.spectators.length - 3} more` : "";
        spec.innerHTML = `<div style="padding-top:9px;border-top:1px solid rgba(255,255,255,0.08);
          font:11px system-ui;color:#94a3b8;display:flex;align-items:center;gap:7px;">
          <span style="font:bold 8px sans-serif;color:#64748b;letter-spacing:1px;">👁 SPECTATORS · ${view.spectators.length}</span>
          <span>${names}${more}</span></div>`;
      }
    }

    // Match setup gating
    const interactive = view.isHost && !view.isSpectator;
    this.q("#se-rounds-minus") && ((this.q<HTMLButtonElement>("#se-rounds-minus")!).disabled = !interactive);
    this.q("#se-rounds-plus") && ((this.q<HTMLButtonElement>("#se-rounds-plus")!).disabled = !interactive);
    const loadout = this.q<HTMLSelectElement>("#se-loadout");
    if (loadout) { loadout.disabled = !interactive; if (document.activeElement !== loadout) loadout.value = view.loadoutId; }
    const rounds = this.q("#se-rounds-val"); if (rounds) rounds.textContent = String(view.maxRounds);

    // Soldier vs spectator
    const soldier = this.q<HTMLDivElement>("#se-soldier");
    if (soldier) soldier.style.opacity = view.isSpectator ? "0.5" : "1";

    // Start button
    const start = this.q<HTMLButtonElement>("#se-start");
    if (start) {
      if (view.isSpectator) {
        start.disabled = true;
        start.textContent = "👁 You're spectating";
        start.style.background = "rgba(255,255,255,0.06)";
        start.style.boxShadow = "none"; start.style.borderColor = "rgba(255,255,255,0.15)";
      } else if (view.isHost) {
        start.disabled = false;
        start.textContent = "▶ START MATCH";
        start.style.background = "linear-gradient(180deg,#ff8c00,#cc5500)";
        start.style.boxShadow = "0 5px 0 #7f2d00"; start.style.borderColor = "#7f2d00";
      } else {
        start.disabled = true;
        start.textContent = "Waiting for host to start…";
        start.style.background = "rgba(255,255,255,0.06)";
        start.style.boxShadow = "none"; start.style.borderColor = "rgba(255,255,255,0.15)";
      }
    }
  }

  private rosterRow(c: CombatantVM, isHost: boolean): string {
    const dot = `<span style="width:14px;height:14px;border-radius:5px;flex:0 0 auto;
      background:${COLOR_CSS[c.color as TankColorKey] ?? "#cbd5e1"};"></span>`;
    const name = c.kind === "ai" ? `🤖 ${esc(c.name)}` : esc(c.name);
    let trailing = "";
    if (c.kind === "human") {
      if (c.isHost) trailing += `<span style="font:bold 7px sans-serif;border-radius:4px;padding:2px 5px;letter-spacing:1px;
        background:rgba(255,140,0,0.18);color:#ffcf33;border:1px solid rgba(255,140,0,0.4);">HOST</span>`;
      if (c.isYou) trailing += `<span style="font:bold 7px sans-serif;border-radius:4px;padding:2px 5px;letter-spacing:1px;
        background:rgba(58,134,255,0.18);color:#93c5fd;border:1px solid rgba(58,134,255,0.4);">YOU</span>`;
    } else {
      trailing += `<span style="font:bold 7px sans-serif;border-radius:4px;padding:2px 5px;letter-spacing:1px;
        background:rgba(148,163,184,0.15);color:#cbd5e1;border:1px solid rgba(148,163,184,0.35);">AI</span>`;
      if (isHost) {
        const opts = ALL_AI_DIFFICULTIES.map(d => `<option value="${d}"${d === c.difficulty ? " selected" : ""}>${cap(d)}</option>`).join("");
        trailing += `<select class="se-ai-diff" data-sid="${c.sessionId}" style="background:rgba(255,255,255,0.06);
          border:1px solid rgba(255,255,255,0.18);color:#cbd5e1;border-radius:5px;font:10px system-ui;padding:2px 5px;flex:0 0 auto;">${opts}</select>`;
        trailing += `<span class="se-ai-remove" data-sid="${c.sessionId}" style="color:#64748b;cursor:pointer;padding:0 2px;flex:0 0 auto;">✕</span>`;
      } else {
        trailing += `<span style="font:10px system-ui;color:#64748b;flex:0 0 auto;">${cap(c.difficulty ?? "")}</span>`;
      }
    }
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:7px;
      background:rgba(255,255,255,0.04);margin-bottom:5px;font-size:12px;opacity:${c.connected ? 1 : 0.45};">
      ${dot}<span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</span>${trailing}</div>`;
  }

  dispose(): void {
    clearTimeout(this.nameDebounce);
    this.panel.style.opacity = "0";
    this.panel.style.transform = "translate(-50%,-50%) scale(0.96)";
    setTimeout(() => this.panel.remove(), 300);
  }
}
