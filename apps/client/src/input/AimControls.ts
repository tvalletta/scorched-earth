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
  private poolSection!: HTMLDivElement;
  private terrainPoolChecks: Array<{ id: string; el: HTMLInputElement }> = [];
  private wallPoolChecks: Array<{ id: string; el: HTMLInputElement }> = [];

  private aiSection!: HTMLDivElement;
  private aiSlotsContainer!: HTMLDivElement;
  private aiSlotEls: Array<{ row: HTMLDivElement; sessionId: string }> = [];

  private angle = 90;
  private power = 500;
  private localTank: { setAngle(deg: number): void } | null = null;

  private onAimChange?: (angle: number, power: number) => void;

  private inputMode: "drive" | "aim" = "aim";
  private driveHeld: "left" | "right" | null = null;
  private driveInterval: ReturnType<typeof setInterval> | null = null;
  private maxFuel = 0;
  private driveHUD!: HTMLDivElement;
  private fuelBarFill!: HTMLDivElement;
  private fuelLabel!: HTMLSpanElement;

  constructor(private room: Room<MatchState>) {
    this.el = document.createElement("div");
    this.el.className = "interactive";
    this.buildDOM();
    document.getElementById("ui")!.appendChild(this.el);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    setInterval(() => this.refreshChrome(), 200);
    this.redrawAngle();
    this.redrawPower();
  }

  setLocalTank(view: { setAngle(deg: number): void } | null): void {
    this.localTank = view;
  }

  setAimChangeCallback(cb: (angle: number, power: number) => void): void {
    this.onAimChange = cb;
  }

  getCurrentAim(): { angle: number; power: number } {
    return { angle: this.angle, power: this.power };
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

    // ── Pool pickers (host-only, lobby) ───────────────────────────────────
    this.poolSection = mkDiv("pointer-events:auto;display:none;flex-direction:column;align-items:flex-start;gap:6px;");

    const terrainTypes = [
      { id: "mountains", label: "Mountains" }, { id: "hills", label: "Hills" },
      { id: "valleys", label: "Valleys" }, { id: "cliffs", label: "Cliffs" },
      { id: "crater", label: "Crater" }, { id: "sky-high", label: "Sky High" },
      { id: "plateau", label: "Plateau" }, { id: "flat", label: "Flat" },
      { id: "random", label: "Random" },
    ];
    const wallModes = [
      { id: "none", label: "No Walls" }, { id: "wrap", label: "Wrap" },
      { id: "reflect", label: "Reflect" }, { id: "absorb", label: "Absorb" },
    ];

    const terrainGroup = mkDiv("display:flex;flex-direction:column;gap:3px;");
    terrainGroup.appendChild(mkLabel("TERRAIN TYPES"));
    const terrainRow = mkDiv("display:flex;flex-wrap:wrap;gap:4px;");
    for (const tt of terrainTypes) {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.id = "pool-t-" + tt.id;
      cb.style.cssText = "accent-color:#3b82f6;";
      const lbl = document.createElement("label");
      lbl.htmlFor = cb.id;
      lbl.textContent = tt.label;
      lbl.style.cssText = "color:#94a3b8;font:9px 'Courier New',monospace;cursor:pointer;";
      const wrap = mkDiv("display:flex;align-items:center;gap:2px;");
      wrap.append(cb, lbl);
      terrainRow.appendChild(wrap);
      cb.onchange = () => this.sendPoolUpdate();
      this.terrainPoolChecks.push({ id: tt.id, el: cb });
    }
    terrainGroup.appendChild(terrainRow);

    const wallGroup = mkDiv("display:flex;flex-direction:column;gap:3px;");
    wallGroup.appendChild(mkLabel("WALL MODES"));
    const wallRow = mkDiv("display:flex;gap:8px;");
    for (const wm of wallModes) {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.id = "pool-w-" + wm.id;
      cb.style.cssText = "accent-color:#3b82f6;";
      const lbl = document.createElement("label");
      lbl.htmlFor = cb.id;
      lbl.textContent = wm.label;
      lbl.style.cssText = "color:#94a3b8;font:9px 'Courier New',monospace;cursor:pointer;";
      const wrap = mkDiv("display:flex;align-items:center;gap:2px;");
      wrap.append(cb, lbl);
      wallRow.appendChild(wrap);
      cb.onchange = () => this.sendPoolUpdate();
      this.wallPoolChecks.push({ id: wm.id, el: cb });
    }
    wallGroup.appendChild(wallRow);

    this.poolSection.append(terrainGroup, wallGroup);

    // ── AI opponents section (host-only, lobby) ───────────────────────────
    this.aiSection = mkDiv("pointer-events:auto;display:none;flex-direction:column;gap:6px;");
    const aiTitle = mkLabel("AI OPPONENTS");
    const addAiRow = mkDiv("display:flex;gap:6px;align-items:center;");
    const diffSelect = document.createElement("select");
    diffSelect.style.cssText = "background:#161b22;color:#e6edf3;border:1px solid #30363d;border-radius:4px;font:11px 'Courier New',monospace;padding:2px 4px;";
    for (const diff of ["moron", "shooter", "pyro", "cyborg", "bouncer"]) {
      const opt = document.createElement("option");
      opt.value = diff;
      opt.textContent = diff.charAt(0).toUpperCase() + diff.slice(1);
      diffSelect.appendChild(opt);
    }
    diffSelect.value = "shooter";
    const addAiBtn = document.createElement("button");
    addAiBtn.textContent = "+ Add AI";
    addAiBtn.style.cssText = "background:rgba(59,130,246,0.2);color:#93c5fd;border:1px solid #3b82f6;border-radius:4px;font:10px 'Courier New',monospace;padding:3px 8px;cursor:pointer;pointer-events:auto;";
    addAiBtn.onclick = () => this.room.send("add-ai", { difficulty: diffSelect.value });
    addAiRow.append(diffSelect, addAiBtn);
    this.aiSlotsContainer = mkDiv("display:flex;flex-direction:column;gap:3px;");
    this.aiSection.append(aiTitle, addAiRow, this.aiSlotsContainer);

    // ── Drive HUD ──────────────────────────────────────────────────────────
    this.driveHUD = mkDiv(
      "pointer-events:auto;display:none;position:fixed;bottom:80px;left:50%;transform:translateX(-50%);" +
        "background:rgba(2,6,20,0.92);border:1px solid #4ecdc4;border-radius:6px;" +
        "padding:8px 14px;display:flex;flex-direction:column;align-items:center;gap:5px;",
    );
    this.driveHUD.style.display = "none"; // hide by default (overrides inline display:flex above)
    const driveTitle = mkLabel("DRIVE MODE  ·  A / D  ·  SPACE to aim");
    this.fuelLabel = document.createElement("span");
    this.fuelLabel.style.cssText =
      "color:#4ecdc4;font:bold 11px 'Courier New',monospace;letter-spacing:1px;";
    this.fuelLabel.textContent = "Fuel: 0 / 0";
    const fuelTrack = mkDiv(
      "width:120px;height:8px;background:rgba(15,23,42,0.9);border:1px solid rgba(78,205,196,0.3);border-radius:3px;overflow:hidden;",
    );
    this.fuelBarFill = mkDiv(
      "height:100%;width:100%;background:#4ecdc4;transition:width 0.1s linear;",
    );
    fuelTrack.append(this.fuelBarFill);
    this.driveHUD.append(driveTitle, this.fuelLabel, fuelTrack);
    document.getElementById("ui")!.appendChild(this.driveHUD);

    this.el.append(angleSection, powerSection, actionSection, this.loadoutSection, this.maxRoundsSection, this.poolSection, this.aiSection, this.inviteSection, this.loadoutDisplay);
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
      if (isHost) {
        for (const c of [...this.terrainPoolChecks, ...this.wallPoolChecks]) {
          c.el.disabled = false;
        }
        this.poolSection.style.display = "flex";
      } else {
        const tPool = this.room.state.terrainTypePool;
        const wPool = this.room.state.wallModePool;
        for (const c of this.terrainPoolChecks) {
          c.el.checked = tPool === "all" || tPool.split(",").includes(c.id);
          c.el.disabled = true;
        }
        for (const c of this.wallPoolChecks) {
          c.el.checked = wPool === "all" || wPool.split(",").includes(c.id);
          c.el.disabled = true;
        }
        this.poolSection.style.display = "flex";
      }
      this.aiSection.style.display = "flex";
      this.refreshAiSlots();
    } else {
      this.loadoutSection.style.display = "none";
      this.maxRoundsSection.style.display = "none";
      this.inviteSection.style.display = "none";
      this.loadoutDisplay.style.display = "none";
      this.poolSection.style.display = "none";
      this.aiSection.style.display = "none";
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

  private refreshAiSlots(): void {
    const state = this.room.state;
    const isHost = state.hostId === this.room.sessionId;
    const slots = Array.from(state.aiSlots);
    // Remove old rows
    while (this.aiSlotsContainer.firstChild) {
      this.aiSlotsContainer.removeChild(this.aiSlotsContainer.firstChild);
    }
    this.aiSlotEls = [];
    for (const slot of slots) {
      const row = mkDiv("display:flex;align-items:center;gap:4px;");
      const label = mkDiv("color:#f59e0b;font:10px 'Courier New',monospace;flex:1;");
      label.textContent = "🤖 " + slot.sessionId + " — " + slot.difficulty;
      row.appendChild(label);
      if (isHost) {
        const sel = document.createElement("select");
        sel.style.cssText = "background:#161b22;color:#e6edf3;border:1px solid #30363d;border-radius:3px;font:9px 'Courier New',monospace;padding:1px 3px;";
        for (const diff of ["moron", "shooter", "pyro", "cyborg", "bouncer"]) {
          const opt = document.createElement("option");
          opt.value = diff;
          opt.textContent = diff;
          sel.appendChild(opt);
        }
        sel.value = slot.difficulty;
        sel.onchange = () => this.room.send("set-ai-difficulty", { sessionId: slot.sessionId, difficulty: sel.value });
        const removeBtn = document.createElement("button");
        removeBtn.textContent = "✕";
        removeBtn.style.cssText = "background:rgba(239,68,68,0.2);color:#ef4444;border:1px solid #ef4444;border-radius:3px;font:9px monospace;padding:1px 5px;cursor:pointer;pointer-events:auto;";
        removeBtn.onclick = () => this.room.send("remove-ai", { sessionId: slot.sessionId });
        row.append(sel, removeBtn);
      }
      this.aiSlotsContainer.appendChild(row);
      this.aiSlotEls.push({ row, sessionId: slot.sessionId });
    }
  }

  private sendPoolUpdate(): void {
    const terrainTypePool = this.terrainPoolChecks
      .filter((c) => c.el.checked)
      .map((c) => c.id)
      .join(",") || "all";
    const wallModePool = this.wallPoolChecks
      .filter((c) => c.el.checked)
      .map((c) => c.id)
      .join(",") || "all";
    this.room.send("configure", { terrainTypePool, wallModePool });
  }

  private setAngle(v: number) {
    this.angle = clampAngle(v);
    this.angleSlider.value = String(this.angle);
    this.localTank?.setAngle(this.angle);
    this.redrawAngle();
    this.onAimChange?.(this.angle, this.power);
  }

  private setPower(v: number) {
    this.power = clampPower(v);
    this.powerSlider.value = String(this.power);
    this.redrawPower();
    this.onAimChange?.(this.angle, this.power);
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

    if (this.inputMode === "drive") {
      if (e.key === "a" || e.key === "ArrowLeft") { e.preventDefault(); this.startDrive("left"); return; }
      if (e.key === "d" || e.key === "ArrowRight") { e.preventDefault(); this.startDrive("right"); return; }
      if (e.key === " " || e.key === "Tab") {
        e.preventDefault();
        this.inputMode = "aim";
        this.stopDrive();
        this.renderDriveHUD(0, 0);
        return;
      }
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

  setDriveMode(fuel: number, maxFuel: number): void {
    this.maxFuel = maxFuel;
    this.inputMode = fuel > 0 ? "drive" : "aim";
    this.renderDriveHUD(fuel, maxFuel);
  }

  updateFuel(fuel: number): void {
    this.renderDriveHUD(fuel, this.maxFuel);
  }

  private renderDriveHUD(fuel: number, maxFuel: number): void {
    const show = this.inputMode === "drive";
    this.driveHUD.style.display = show ? "flex" : "none";
    if (show) {
      this.fuelLabel.textContent = `Fuel: ${Math.round(fuel)} / ${maxFuel} px`;
      const fraction = maxFuel > 0 ? Math.max(0, Math.min(1, fuel / maxFuel)) : 0;
      this.fuelBarFill.style.width = `${Math.round(fraction * 100)}%`;
    }
  }

  private startDrive(direction: "left" | "right"): void {
    if (this.driveHeld === direction) return;
    this.stopDrive();
    this.driveHeld = direction;
    this.driveInterval = setInterval(() => {
      this.room.send("move", { direction, pixels: 10 });
    }, 100);
  }

  private stopDrive(): void {
    if (this.driveInterval !== null) { clearInterval(this.driveInterval); this.driveInterval = null; }
    this.driveHeld = null;
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === "a" || e.key === "ArrowLeft" || e.key === "d" || e.key === "ArrowRight") {
      this.stopDrive();
    }
  };

  hide() {
    this.el.remove();
  }

  destroy() {
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
    this.stopDrive();
    this.driveHUD.remove();
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
