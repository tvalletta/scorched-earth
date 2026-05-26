import type { Room } from "colyseus.js";
import type { MatchState } from "@se/shared";
import { clampAngle, clampPower } from "@se/shared";

export class AimControls {
  private el: HTMLDivElement;
  private angleCvs!: HTMLCanvasElement;
  private powerFill!: HTMLDivElement;
  private powerLbl!: HTMLSpanElement;
  private phaseEl!: HTMLDivElement;
  private fireBtn!: HTMLButtonElement;
  private startBtn!: HTMLButtonElement;
  private angleSlider!: HTMLInputElement;
  private powerSlider!: HTMLInputElement;
  private loadoutSection!: HTMLDivElement;
  private loadoutBtns: HTMLButtonElement[] = [];
  private loadoutDisplay!: HTMLDivElement;
  private maxRoundsSection!: HTMLDivElement;
  private maxRoundsInput!: HTMLInputElement;
  private inviteSection!: HTMLDivElement;

  private angle = 90;
  private power = 500;
  private localTank: { setAngle(deg: number): void } | null = null;

  constructor(private room: Room<MatchState>) {
    this.el = document.createElement("div");
    this.el.className = "interactive";
    this.buildDOM();
    document.getElementById("ui")!.appendChild(this.el);
    window.addEventListener("keydown", this.onKey);
    setInterval(() => this.refreshChrome(), 200);
    this.redrawAngle();
    this.redrawPower();
  }

  setLocalTank(view: { setAngle(deg: number): void } | null): void {
    this.localTank = view;
  }

  private buildDOM() {
    this.el.style.cssText = [
      "position:fixed;bottom:58px;left:0;right:0;",
      "display:flex;justify-content:center;align-items:flex-end;gap:20px;",
      "padding:10px 24px 14px;",
      "background:linear-gradient(to top,rgba(2,6,20,0.95) 0%,rgba(2,6,20,0.65) 75%,transparent 100%);",
      "pointer-events:none;",
    ].join("");

    // ── Angle section ──────────────────────────────────────────────────────
    const angleSection = mkDiv(
      "pointer-events:auto;display:flex;flex-direction:column;align-items:center;gap:3px;",
    );
    this.angleCvs = document.createElement("canvas");
    this.angleCvs.width = 160;
    this.angleCvs.height = 100;
    this.angleCvs.style.cssText = "display:block;";
    this.angleSlider = mkRange("ar", 0, 180, 90);
    this.angleSlider.oninput = (e) =>
      this.setAngle(Number((e.target as HTMLInputElement).value));
    angleSection.append(
      this.angleCvs,
      mkLabel("← →  ·  SHIFT × 5°"),
      this.angleSlider,
    );

    // ── Power section ──────────────────────────────────────────────────────
    const powerSection = mkDiv(
      "pointer-events:auto;display:flex;flex-direction:column;align-items:center;gap:4px;",
    );
    // Trapezoid track — wide at top (high power), narrow at bottom (low power)
    const powerTrack = mkDiv(
      "width:48px;height:112px;position:relative;overflow:hidden;" +
        "border:1px solid rgba(255,255,255,0.12);border-radius:3px;" +
        "clip-path:polygon(14px 0%,calc(100% - 14px) 0%,100% 100%,0% 100%);",
    );
    // Dark bg
    powerTrack.style.background = "rgba(15,23,42,0.9)";
    this.powerFill = mkDiv(
      "position:absolute;bottom:0;left:0;right:0;height:50%;" +
        "background:linear-gradient(to top,#16a34a,#ca8a04,#dc2626);" +
        "transition:height 0.08s linear;",
    );
    const ticks = mkDiv(
      "position:absolute;inset:0;pointer-events:none;" +
        "background:repeating-linear-gradient(to bottom,transparent,transparent 21px," +
        "rgba(0,0,0,0.45) 21px,rgba(0,0,0,0.45) 22px);",
    );
    powerTrack.append(this.powerFill, ticks);

    this.powerLbl = document.createElement("span");
    this.powerLbl.style.cssText =
      "color:#94a3b8;font:bold 11px 'Courier New',monospace;letter-spacing:1px;";
    this.powerLbl.textContent = "500";
    this.powerSlider = mkRange("pr", 0, 1000, 500);
    this.powerSlider.oninput = (e) =>
      this.setPower(Number((e.target as HTMLInputElement).value));
    powerSection.append(
      powerTrack,
      this.powerLbl,
      mkLabel("↑ ↓  ·  SHIFT × 10"),
      this.powerSlider,
    );

    // ── Action section ─────────────────────────────────────────────────────
    const actionSection = mkDiv(
      "pointer-events:auto;display:flex;flex-direction:column;align-items:center;gap:10px;",
    );
    this.phaseEl = mkDiv(
      "color:#f0c040;font:bold 10px 'Courier New',monospace;letter-spacing:1.5px;" +
        "text-transform:uppercase;text-align:center;min-height:14px;",
    );

    this.startBtn = document.createElement("button");
    applyStyle(this.startBtn, {
      display: "none",
      padding: "10px 20px",
      background: "linear-gradient(135deg,#1e40af,#2563eb)",
      color: "#fff",
      border: "none",
      borderRadius: "6px",
      cursor: "pointer",
      font: "bold 13px 'Courier New',monospace",
      letterSpacing: "2px",
      boxShadow: "0 0 18px rgba(37,99,235,0.65)",
    });
    this.startBtn.textContent = "▶ START";
    this.startBtn.onclick = () => this.room.send("ready", {});

    this.fireBtn = document.createElement("button");
    applyStyle(this.fireBtn, {
      width: "96px",
      height: "80px",
      background: "linear-gradient(180deg,#dc2626,#7f1d1d)",
      color: "#fff",
      border: "2px solid #f87171",
      borderRadius: "8px",
      cursor: "pointer",
      font: "bold 17px 'Courier New',monospace",
      letterSpacing: "2px",
      boxShadow: "0 0 28px rgba(220,38,38,0.75),inset 0 2px 0 rgba(255,255,255,0.12)",
      lineHeight: "1.2",
      transition: "box-shadow 0.08s,transform 0.06s",
    });
    this.fireBtn.innerHTML =
      "🔥<br>FIRE<br><small style='font-size:9px;opacity:0.55;letter-spacing:1px'>[SPACE]</small>";
    this.fireBtn.onclick = () => this.fire();
    this.fireBtn.addEventListener("mousedown", () => {
      this.fireBtn.style.transform = "scale(0.95)";
      this.fireBtn.style.boxShadow =
        "0 0 10px rgba(220,38,38,0.4),inset 0 -2px 0 rgba(0,0,0,0.4)";
    });
    this.fireBtn.addEventListener("mouseup", () => {
      this.fireBtn.style.transform = "";
      this.fireBtn.style.boxShadow =
        "0 0 28px rgba(220,38,38,0.75),inset 0 2px 0 rgba(255,255,255,0.12)";
    });

    actionSection.append(this.phaseEl, this.startBtn, this.fireBtn);

    // Loadout section (host only, lobby phase)
    this.loadoutSection = mkDiv(
      "pointer-events:auto;display:none;flex-direction:column;align-items:center;gap:4px;",
    );
    const loadoutTitle = mkLabel("LOADOUT");
    const loadoutLabels = ["STARTER", "STANDARD", "BONANZA"] as const;
    this.loadoutBtns = (["starter", "standard", "bonanza"] as const).map((id, i) => {
      const btn = document.createElement("button");
      btn.textContent = loadoutLabels[i] ?? "";
      btn.style.cssText =
        "padding:3px 8px;font:bold 9px 'Courier New',monospace;border-radius:4px;" +
        "border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.3);" +
        "color:#94a3b8;cursor:pointer;";
      btn.dataset.loadoutId = id;
      btn.onclick = () => {
        this.room.send("configure", { loadoutId: id });
        this.refreshLoadoutBtns(id);
      };
      return btn;
    });
    this.loadoutSection.append(loadoutTitle, ...this.loadoutBtns);

    // ── Max rounds section (host-only lobby) ──────────────────────────────
    this.maxRoundsSection = mkDiv("pointer-events:auto;display:flex;flex-direction:column;align-items:center;gap:4px;");
    this.maxRoundsInput = document.createElement("input");
    this.maxRoundsInput.type = "number";
    this.maxRoundsInput.min = "1";
    this.maxRoundsInput.max = "20";
    this.maxRoundsInput.value = "5";
    this.maxRoundsInput.style.cssText =
      "width:52px;text-align:center;padding:4px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);" +
      "background:rgba(15,23,42,0.9);color:#e0e0e0;font:bold 13px 'Courier New',monospace;";
    this.maxRoundsInput.onchange = () => {
      const v = Math.max(1, Math.min(20, parseInt(this.maxRoundsInput.value, 10) || 5));
      this.maxRoundsInput.value = String(v);
      this.room.send("configure", { maxRounds: v });
    };
    this.maxRoundsSection.append(
      mkLabel("ROUNDS"),
      this.maxRoundsInput,
    );

    // Loadout display (non-host, lobby phase)
    this.loadoutDisplay = mkDiv(
      "color:#94a3b8;font:9px 'Courier New',monospace;text-align:center;display:none;",
    );

    // Invite link (host only, lobby phase)
    this.inviteSection = mkDiv("pointer-events:auto;display:none;flex-direction:column;align-items:center;gap:4px;");
    const codeMatch = location.pathname.match(/^\/([A-Z0-9]{6})$/i);
    const roomCode = codeMatch ? codeMatch[1].toUpperCase() : "";
    const inviteUrl = `${location.origin}/${roomCode}`;
    const inviteUrlEl = mkDiv("color:#93c5fd;font:10px 'Courier New',monospace;letter-spacing:1px;text-align:center;");
    inviteUrlEl.textContent = inviteUrl;
    const copyBtn = document.createElement("button");
    copyBtn.textContent = "📋 Copy link";
    copyBtn.style.cssText =
      "padding:3px 10px;font:bold 9px 'Courier New',monospace;border-radius:4px;" +
      "border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.3);" +
      "color:#94a3b8;cursor:pointer;";
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(inviteUrl).then(() => {
        copyBtn.textContent = "✓ Copied!";
        copyBtn.style.color = "#4ade80";
        setTimeout(() => { copyBtn.textContent = "📋 Copy link"; copyBtn.style.color = "#94a3b8"; }, 2000);
      });
    };
    this.inviteSection.append(mkLabel("INVITE"), inviteUrlEl, copyBtn);

    this.el.append(angleSection, powerSection, actionSection, this.loadoutSection, this.maxRoundsSection, this.inviteSection, this.loadoutDisplay);
  }

  private refreshChrome() {
    const state = this.room.state;
    const isHost = state.hostId === this.room.sessionId;
    const inLobby = state.phase === "lobby";
    const isMyTurn =
      state.phase === "playing" && state.currentTurnPlayerId === this.room.sessionId;

    this.startBtn.style.display = inLobby && isHost ? "block" : "none";
    this.fireBtn.style.display = inLobby ? "none" : "block";
    this.fireBtn.style.opacity = isMyTurn ? "1" : "0.38";
    (this.fireBtn as HTMLButtonElement).disabled = !isMyTurn;

    if (inLobby) {
      this.phaseEl.textContent = isHost ? "WAITING FOR PLAYERS" : "WAITING FOR HOST";
      this.loadoutSection.style.display = isHost ? "flex" : "none";
      this.maxRoundsSection.style.display = isHost ? "flex" : "none";
      this.inviteSection.style.display = isHost ? "flex" : "none";
      this.loadoutDisplay.style.display = !isHost ? "block" : "none";
      if (isHost) this.refreshLoadoutBtns(this.room.state.loadoutId);
      if (!isHost) {
        const labels: Record<string, string> = { starter: "STARTER", standard: "STANDARD", bonanza: "BONANZA" };
        this.loadoutDisplay.textContent = "LOADOUT: " + (labels[this.room.state.loadoutId] ?? this.room.state.loadoutId.toUpperCase());
      }
    } else {
      this.loadoutSection.style.display = "none";
      this.maxRoundsSection.style.display = "none";
      this.inviteSection.style.display = "none";
      this.loadoutDisplay.style.display = "none";
      if (state.phase === "playing") {
        const nick = state.tanks.get(state.currentTurnPlayerId)?.nickname?.toUpperCase() ?? "?";
        this.phaseEl.textContent = isMyTurn ? "YOUR TURN" : `WAITING — ${nick}`;
      } else {
        this.phaseEl.textContent = state.phase.toUpperCase();
      }
    }
  }

  private refreshLoadoutBtns(activeId: string): void {
    for (const btn of this.loadoutBtns) {
      const active = (btn.dataset.loadoutId ?? "") === activeId;
      btn.style.background = active ? "rgba(37,99,235,0.6)" : "rgba(0,0,0,0.3)";
      btn.style.color = active ? "#93c5fd" : "#94a3b8";
      btn.style.borderColor = active ? "#3b82f6" : "rgba(255,255,255,0.2)";
    }
  }

  private setAngle(v: number) {
    this.angle = clampAngle(v);
    this.angleSlider.value = String(this.angle);
    this.localTank?.setAngle(this.angle);
    this.redrawAngle();
  }

  private setPower(v: number) {
    this.power = clampPower(v);
    this.powerSlider.value = String(this.power);
    this.redrawPower();
  }

  // Canvas: 160 × 100. Pivot at (80, 94). Arc radius 82.
  // Angle convention: 0 = left (π), 90 = up (3π/2), 180 = right (2π/0).
  // Canvas angle for game degree d: Math.PI + (d * Math.PI / 180).
  private redrawAngle() {
    const ctx = this.angleCvs.getContext("2d")!;
    const W = 160, H = 100;
    const cx = W / 2, cy = H - 6;
    const R = 82;

    ctx.clearRect(0, 0, W, H);

    // Arc groove (left to right through top, CW in canvas screen space)
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI, 0, false);
    ctx.strokeStyle = "rgba(71,85,105,0.75)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Swept fill from 0° (left) to current angle
    const sweepEnd = Math.PI + (this.angle * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R - 2, Math.PI, sweepEnd, false);
    ctx.closePath();
    ctx.fillStyle = "rgba(234,179,8,0.09)";
    ctx.fill();

    // Tick marks at 0, 45, 90, 135, 180
    for (const g of [0, 45, 90, 135, 180]) {
      const ca = Math.PI + (g * Math.PI) / 180;
      const big = g % 90 === 0;
      const innerR = big ? R - 13 : R - 7;
      ctx.beginPath();
      ctx.moveTo(cx + innerR * Math.cos(ca), cy + innerR * Math.sin(ca));
      ctx.lineTo(cx + R * Math.cos(ca), cy + R * Math.sin(ca));
      ctx.strokeStyle = big ? "rgba(203,213,225,0.8)" : "rgba(100,116,139,0.55)";
      ctx.lineWidth = big ? 2 : 1;
      ctx.stroke();
    }

    // Needle glow
    const na = Math.PI + (this.angle * Math.PI) / 180;
    const ntx = cx + (R - 7) * Math.cos(na);
    const nty = cy + (R - 7) * Math.sin(na);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ntx, nty);
    ctx.strokeStyle = "rgba(251,191,36,0.3)";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.stroke();
    // Needle
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ntx, nty);
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Pivot ring
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#fbbf24";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "#0f172a";
    ctx.fill();

    // Mini tank body at pivot (drawn after pivot so tank sits on it)
    ctx.fillStyle = "#475569";
    ctx.beginPath();
    ctx.roundRect(cx - 11, cy - 7, 22, 7, 2);
    ctx.fill();
    ctx.fillStyle = "#334155";
    ctx.beginPath();
    ctx.roundRect(cx - 7, cy - 13, 14, 6, 2);
    ctx.fill();

    // Angle readout
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 14px 'Courier New',monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${this.angle}°`, cx, cy - 34);
  }

  private redrawPower() {
    const pct = this.power / 1000;
    this.powerFill.style.height = `${pct * 100}%`;
    this.powerLbl.textContent = String(this.power);
  }

  private onKey = (e: KeyboardEvent) => {
    // Blur any focused range input so browser defaults don't interfere with Shift+Arrow.
    if (
      document.activeElement instanceof HTMLInputElement &&
      document.activeElement.type === "range"
    ) {
      document.activeElement.blur();
    }

    const big = e.shiftKey;
    if (e.code === "ArrowLeft") {
      e.preventDefault();
      this.setAngle(this.angle - (big ? 5 : 1));
    } else if (e.code === "ArrowRight") {
      e.preventDefault();
      this.setAngle(this.angle + (big ? 5 : 1));
    } else if (e.code === "ArrowUp") {
      e.preventDefault();
      this.setPower(this.power + (big ? 10 : 1));
    } else if (e.code === "ArrowDown") {
      e.preventDefault();
      this.setPower(this.power - (big ? 10 : 1));
    } else if (e.code === "Space") {
      e.preventDefault();
      this.fire();
    }
  };

  private fire() {
    if (this.room.state.currentTurnPlayerId !== this.room.sessionId) return;
    this.room.send("fire", { angle: this.angle, power: this.power });
  }

  hide() {
    this.el.remove();
  }

  destroy() {
    window.removeEventListener("keydown", this.onKey);
    this.el.remove();
  }
}

function mkDiv(style: string): HTMLDivElement {
  const d = document.createElement("div");
  d.style.cssText = style;
  return d;
}

function mkLabel(text: string): HTMLDivElement {
  const d = mkDiv(
    "color:#475569;font:9px 'Courier New',monospace;text-align:center;letter-spacing:0.3px;",
  );
  d.textContent = text;
  return d;
}

function mkRange(id: string, min: number, max: number, val: number): HTMLInputElement {
  const i = document.createElement("input");
  i.id = id;
  i.type = "range";
  i.min = String(min);
  i.max = String(max);
  i.value = String(val);
  i.tabIndex = -1; // keyboard focus stays on the game, not the slider
  i.style.cssText =
    "width:100%;height:3px;opacity:0.28;margin-top:3px;cursor:pointer;";
  return i;
}

function applyStyle(el: HTMLElement, styles: Record<string, string>) {
  Object.assign(el.style, styles);
}
