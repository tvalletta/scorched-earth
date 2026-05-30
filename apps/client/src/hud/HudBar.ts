import type { Room } from 'colyseus.js';
import type { MatchState } from '@se/shared';
import { WEAPON_REGISTRY } from '@se/game';

const TERRAIN_LABELS: Record<string, string> = {
  mountains: 'Mountains', hills: 'Hills', valleys: 'Valleys', cliffs: 'Cliffs',
  crater: 'Crater', 'sky-high': 'Sky High', plateau: 'Plateau', flat: 'Flat', random: 'Random',
};
const WALL_LABELS: Record<string, string> = {
  none: 'No Walls', wrap: 'Wrap', reflect: 'Reflect', absorb: 'Absorb',
};

function humanize(id: string): string {
  return id.split('-').map((s) => (s ? s[0]!.toUpperCase() + s.slice(1) : s)).join(' ');
}

// Icon per weapon type, shown in every carousel chip.
const WEAPON_ICONS: Record<string, string> = {
  'baby-missile': '🚀', 'missile': '🚀', 'baby-nuke': '☢️', 'nuke': '☢️',
  'funky-bomb': '🎆', 'mirv': '🎇', 'deaths-head': '💀', 'deaths-knell': '☠️',
  'triple-warhead': '🔱', 'pineapple': '🍍', 'funky-nuke': '🌀', 'plasma-ball': '🟣',
  'plasma-blast': '💥', 'leapfrog': '🐸', 'roller': '🎳', 'heavy-roller': '🪨',
  'laser': '⚡', 'plasma-wave': '🌊', 'tracer': '🎯', 'smoke': '💨',
  'dirt-clod': '🟫', 'dirt-ball': '🟤', 'liquid-dirt': '💧', 'sandhog': '⛏️',
  'tunneler': '🕳️', 'napalm': '🔥', 'hot-napalm': '🌶️', 'fireball': '☄️',
};

export class HudBar {
  el: HTMLDivElement;
  private onAimChange: ((angle: number, power: number) => void) | null = null;
  private currentAngle = 90;
  private currentPower = 500;
  private weaponKeys: string[];
  private carouselCenter = 0;
  private selectedKey = 'baby-missile';
  private localInventory: Map<string, number> = new Map();
  private localTank: { setAngle(deg: number): void } | null = null;
  private maxFuel = 0;
  private fuel = 0;
  private driveHeld: 'left' | 'right' | null = null;
  private driveInterval: ReturnType<typeof setInterval> | null = null;
  private onMouseMoveDial: (e: MouseEvent) => void = () => {};
  private onMouseMovePower: (e: MouseEvent) => void = () => {};
  private onMouseUp: () => void = () => {};

  constructor(private room: Room<MatchState>) {
    this.weaponKeys = Array.from(WEAPON_REGISTRY.keys());
    this.el = document.createElement('div');
    this.el.className = 'interactive';
    this.el.style.cssText = [
      'position:fixed;bottom:0;left:0;right:0;height:104px;',
      'background:linear-gradient(0deg,rgba(8,6,24,0.98),rgba(8,6,24,0.82));',
      'border-top:3px solid rgba(255,140,0,0.5);',
      'display:flex;align-items:center;gap:18px;padding:0 20px;z-index:100;',
      'font-family:system-ui,sans-serif;color:#fff;box-sizing:border-box;',
    ].join('');
    this.el.innerHTML = this.buildHTML();
    document.getElementById('ui')!.appendChild(this.el);
    this.carouselCenter = Math.max(0, this.weaponKeys.indexOf('baby-missile'));
    this.bindEvents();
    this.drawDial();
    this.renderCarousel();
  }

  setAimChangeCallback(fn: (angle: number, power: number) => void): void { this.onAimChange = fn; }
  getCurrentAim(): { angle: number; power: number } { return { angle: this.currentAngle, power: this.currentPower }; }
  setLocalTank(view: { setAngle(deg: number): void } | null): void { this.localTank = view; }

  update(state: MatchState): void {
    const myTank = state.tanks.get(this.room.sessionId);
    const isMyTurn = state.currentTurnPlayerId === this.room.sessionId;
    const fireBtn = this.el.querySelector<HTMLButtonElement>('#hud-fire');
    if (fireBtn) { fireBtn.disabled = !isMyTurn; fireBtn.style.opacity = isMyTurn ? '1' : '0.4'; }

    if (myTank) {
      // The local HUD owns angle/power/weapon-selection — do NOT sync them back
      // from server state every frame (that clobbered keyboard input + carousel
      // scrolling). Only refresh ammo counts and re-render the carousel at its
      // current position.
      this.localInventory = new Map(myTank.inventory.entries());
      this.renderCarousel();
    }
  }

  /** Wind + round + terrain/wall — folded in from the old WindArrow/RoundInfo. */
  updateWindRound(state: MatchState): void {
    const w = state.wind;
    const dir = w === 0 ? '' : w > 0 ? '→' : '←';
    const windEl = this.el.querySelector<HTMLDivElement>('#hud-wind');
    if (windEl) windEl.textContent = Math.abs(w) <= 1 ? 'CALM' : `WIND ${dir} ${Math.abs(w)}`;
    const roundEl = this.el.querySelector<HTMLDivElement>('#hud-round');
    if (roundEl) roundEl.textContent = `ROUND ${state.round ?? 1}/${state.maxRounds ?? 5}`;
    const terrEl = this.el.querySelector<HTMLDivElement>('#hud-terrain');
    if (terrEl) {
      const t = TERRAIN_LABELS[state.terrainType] ?? state.terrainType;
      const m = WALL_LABELS[state.wallMode] ?? state.wallMode;
      terrEl.textContent = `${t} · ${m}`;
    }
  }

  updateTimer(deadlineMs: number): void {
    const timer = this.el.querySelector<HTMLDivElement>('#hud-timer');
    if (!timer) return;
    const remaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
    timer.textContent = String(remaining);
    const urgent = remaining <= 5;
    timer.style.borderColor = urgent ? '#ef4444' : '#eab308';
    timer.style.color = urgent ? '#ef4444' : '#eab308';
  }

  // ── Drive (ported from the old AimControls) ─────────────────────────────
  setDriveMode(fuel: number, maxFuel: number): void {
    this.maxFuel = maxFuel; this.fuel = fuel; this.renderFuel();
  }
  updateFuel(fuel: number): void { this.fuel = fuel; this.renderFuel(); }

  private renderFuel(): void {
    const wrap = this.el.querySelector<HTMLDivElement>('#hud-fuel');
    if (!wrap) return;
    const show = this.fuel > 0 && this.maxFuel > 0;
    wrap.style.display = show ? 'flex' : 'none';
    if (show) {
      const frac = Math.max(0, Math.min(1, this.fuel / this.maxFuel));
      const fill = this.el.querySelector<HTMLDivElement>('#hud-fuel-fill');
      const lbl = this.el.querySelector<HTMLSpanElement>('#hud-fuel-val');
      if (fill) fill.style.width = `${Math.round(frac * 100)}%`;
      if (lbl) lbl.textContent = `${Math.round(this.fuel)}`;
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMoveDial);
    window.removeEventListener('mousemove', this.onMouseMovePower);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.stopDrive();
    this.el.remove();
  }

  private buildHTML(): string {
    return `
      <!-- Angle -->
      <div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex-shrink:0;">
        <div id="hud-dial" style="width:76px;height:76px;border-radius:50%;
          border:2px solid #ff8c00;background:rgba(0,0,0,0.55);position:relative;cursor:pointer;user-select:none;">
          <canvas id="hud-dial-canvas" width="76" height="76" style="position:absolute;inset:0;border-radius:50%;"></canvas>
          <div id="hud-angle-val" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
            font:900 18px 'Impact',fantasy;color:#ff8c00;pointer-events:none;text-shadow:0 0 6px rgba(0,0,0,0.6);">90°</div>
        </div>
        <div style="font:bold 8px sans-serif;color:#64748b;letter-spacing:1px;">ANGLE</div>
      </div>

      <!-- Power -->
      <div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex-shrink:0;">
        <div style="display:flex;align-items:flex-end;gap:5px;">
          <div id="hud-power-track" style="width:26px;height:76px;background:rgba(255,255,255,0.08);
            border:1px solid rgba(255,255,255,0.18);border-radius:5px;position:relative;cursor:ns-resize;">
            <div id="hud-power-fill" style="position:absolute;bottom:0;left:0;right:0;height:50%;border-radius:5px;
              background:linear-gradient(0deg,#22c55e,#eab308,#ef4444);"></div>
          </div>
          <div style="display:flex;flex-direction:column;justify-content:space-between;height:76px;font:8px monospace;color:#475569;">
            <span>1000</span><span>500</span><span>0</span>
          </div>
        </div>
        <div id="hud-power-val" style="font:900 14px 'Impact',fantasy;color:#fff;letter-spacing:1px;">500</div>
      </div>

      <!-- Weapon carousel -->
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;width:100%;justify-content:center;">
          <button id="hud-prev" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);
            color:#fff;width:28px;height:28px;border-radius:5px;cursor:pointer;font-size:16px;flex-shrink:0;">‹</button>
          <div id="hud-carousel" style="flex:1;display:flex;gap:6px;align-items:center;justify-content:center;overflow:hidden;"></div>
          <button id="hud-next" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);
            color:#fff;width:28px;height:28px;border-radius:5px;cursor:pointer;font-size:16px;flex-shrink:0;">›</button>
        </div>
        <div id="hud-fuel" style="display:none;align-items:center;gap:6px;">
          <span style="font:bold 8px sans-serif;color:#4ecdc4;letter-spacing:1px;">FUEL ·A/D·</span>
          <div style="width:90px;height:5px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;">
            <div id="hud-fuel-fill" style="height:100%;width:100%;background:#4ecdc4;"></div>
          </div>
          <span id="hud-fuel-val" style="font:bold 9px monospace;color:#4ecdc4;">0</span>
        </div>
      </div>

      <!-- Status -->
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;min-width:96px;">
        <div id="hud-wind" style="font:bold 12px system-ui;color:#cbd5e1;">CALM</div>
        <div id="hud-round" style="font:bold 10px monospace;color:#94a3b8;">ROUND 1/5</div>
        <div id="hud-terrain" style="font:9px monospace;color:#64748b;letter-spacing:0.5px;">—</div>
      </div>

      <!-- Timer -->
      <div id="hud-timer" style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;
        background:rgba(0,0,0,0.4);border:2px solid #eab308;border-radius:8px;
        font:900 24px 'Impact',fantasy;color:#eab308;flex-shrink:0;">--</div>

      <!-- Fire -->
      <button id="hud-fire" style="padding:0 24px;height:64px;background:linear-gradient(180deg,#ff8c00,#cc5500);
        border:3px solid #7f2d00;border-radius:10px;box-shadow:0 5px 0 #7f2d00;color:#fff;
        font:900 18px 'Impact',fantasy;letter-spacing:2px;cursor:pointer;flex-shrink:0;
        text-shadow:1px 1px 0 rgba(0,0,0,0.5);">🔥 FIRE</button>
    `;
  }

  private bindEvents(): void {
    this.el.querySelector('#hud-prev')!.addEventListener('click', () => this.scrollCarousel(-1));
    this.el.querySelector('#hud-next')!.addEventListener('click', () => this.scrollCarousel(1));

    const fireBtn = this.el.querySelector<HTMLButtonElement>('#hud-fire')!;
    fireBtn.addEventListener('mousedown', () => { fireBtn.style.transform = 'translateY(3px)'; fireBtn.style.boxShadow = '0 2px 0 #7f2d00'; });
    fireBtn.addEventListener('mouseup', () => {
      fireBtn.style.transform = ''; fireBtn.style.boxShadow = '0 5px 0 #7f2d00';
      if (!fireBtn.disabled) this.fire();
    });
    fireBtn.addEventListener('mouseleave', () => { fireBtn.style.transform = ''; fireBtn.style.boxShadow = '0 5px 0 #7f2d00'; });

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    const dial = this.el.querySelector<HTMLDivElement>('#hud-dial')!;
    let draggingDial = false;
    dial.addEventListener('mousedown', (e) => { e.stopPropagation(); draggingDial = true; });
    this.onMouseMoveDial = (e: MouseEvent) => {
      if (!draggingDial) return;
      const rect = dial.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      const screenAngle = Math.atan2(dy, dx) * 180 / Math.PI;
      const gameAngle = 180 - ((screenAngle + 360) % 360);
      this.setAngle(Math.max(0, Math.min(180, gameAngle)));
    };
    window.addEventListener('mousemove', this.onMouseMoveDial);

    const powerTrack = this.el.querySelector<HTMLDivElement>('#hud-power-track')!;
    let draggingPower = false;
    powerTrack.addEventListener('mousedown', (e) => { e.stopPropagation(); draggingPower = true; });
    this.onMouseMovePower = (e: MouseEvent) => {
      if (!draggingPower) return;
      const rect = powerTrack.getBoundingClientRect();
      const fraction = 1 - (e.clientY - rect.top) / rect.height;
      this.setPower(Math.round(Math.max(0, Math.min(1000, fraction * 1000))));
    };
    window.addEventListener('mousemove', this.onMouseMovePower);

    this.onMouseUp = () => { draggingDial = false; draggingPower = false; };
    window.addEventListener('mouseup', this.onMouseUp);
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowLeft':  this.setAngle(this.currentAngle - (e.shiftKey ? 10 : 2)); e.preventDefault(); break;
      case 'ArrowRight': this.setAngle(this.currentAngle + (e.shiftKey ? 10 : 2)); e.preventDefault(); break;
      case 'ArrowUp':    this.setPower(this.currentPower + (e.shiftKey ? 100 : 20)); e.preventDefault(); break;
      case 'ArrowDown':  this.setPower(this.currentPower - (e.shiftKey ? 100 : 20)); e.preventDefault(); break;
      case 'q': case 'Q': this.scrollCarousel(-1); break;
      case 'e': case 'E': this.scrollCarousel(1); break;
      case ' ': if (!this.el.querySelector<HTMLButtonElement>('#hud-fire')!.disabled) { this.fire(); e.preventDefault(); } break;
    }
    if (e.key === 'a' || e.key === 'A') { this.startDrive('left'); e.preventDefault(); }
    if (e.key === 'd' || e.key === 'D') { this.startDrive('right'); e.preventDefault(); }
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'a' || e.key === 'A' || e.key === 'd' || e.key === 'D') this.stopDrive();
  };

  private startDrive(direction: 'left' | 'right'): void {
    if (this.driveHeld === direction) return;
    this.stopDrive();
    this.driveHeld = direction;
    this.driveInterval = setInterval(() => { this.room.send('move', { direction, pixels: 10 }); }, 100);
  }
  private stopDrive(): void {
    if (this.driveInterval !== null) { clearInterval(this.driveInterval); this.driveInterval = null; }
    this.driveHeld = null;
  }

  private fire(): void {
    if (this.room.state.currentTurnPlayerId !== this.room.sessionId) return;
    this.room.send('fire', { angle: this.currentAngle, power: this.currentPower });
  }

  private setAngleReadout(): void {
    const el = this.el.querySelector<HTMLDivElement>('#hud-angle-val');
    if (el) el.textContent = `${Math.round(this.currentAngle)}°`;
  }
  private setPowerReadout(): void {
    const fill = this.el.querySelector<HTMLDivElement>('#hud-power-fill');
    if (fill) fill.style.height = `${(this.currentPower / 1000) * 100}%`;
    const val = this.el.querySelector<HTMLDivElement>('#hud-power-val');
    if (val) val.textContent = String(Math.round(this.currentPower));
  }

  private setAngle(deg: number): void {
    this.currentAngle = Math.max(0, Math.min(180, deg));
    this.setAngleReadout();
    this.drawDial();
    this.localTank?.setAngle(this.currentAngle);
    this.onAimChange?.(this.currentAngle, this.currentPower);
  }
  private setPower(pct: number): void {
    this.currentPower = Math.max(0, Math.min(1000, pct));
    this.setPowerReadout();
    this.onAimChange?.(this.currentAngle, this.currentPower);
  }

  private drawDial(): void {
    const canvas = this.el.querySelector<HTMLCanvasElement>('#hud-dial-canvas');
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const S = 76, cx = S / 2, cy = S / 2, R = 30;
    ctx.clearRect(0, 0, S, S);
    // Reference ticks at 0/45/90/135/180 (game angle; 0=left,90=up,180=right)
    for (const g of [0, 45, 90, 135, 180]) {
      const a = Math.PI + (g * Math.PI) / 180;
      const big = g % 90 === 0;
      const r0 = big ? R - 8 : R - 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.strokeStyle = big ? 'rgba(255,140,0,0.6)' : 'rgba(255,140,0,0.25)';
      ctx.lineWidth = big ? 2 : 1;
      ctx.stroke();
    }
    // Needle
    const na = Math.PI + (this.currentAngle * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(na) * (R - 4), cy + Math.sin(na) * (R - 4));
    ctx.strokeStyle = '#ff8c00';
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.stroke();
  }

  private scrollCarousel(delta: number): void {
    const n = this.weaponKeys.length;
    this.carouselCenter = (this.carouselCenter + delta + n) % n; // wraps forever
    this.selectedKey = this.weaponKeys[this.carouselCenter]!;
    this.room.send('select-weapon', { weaponId: this.selectedKey });
    this.renderCarousel();
  }

  private selectWeaponAt(index: number): void {
    const n = this.weaponKeys.length;
    this.carouselCenter = ((index % n) + n) % n;
    this.selectedKey = this.weaponKeys[this.carouselCenter]!;
    this.room.send('select-weapon', { weaponId: this.selectedKey });
    this.renderCarousel();
  }

  // Windowed, infinitely-wrapping carousel that fills the width between the
  // arrows; every chip shows its weapon icon + ammo so you can see what's next.
  private renderCarousel(): void {
    const container = this.el.querySelector<HTMLDivElement>('#hud-carousel');
    if (!container) return;
    const total = this.weaponKeys.length;
    const HALF = 4; // 9 chips across the bar
    let html = '';
    for (let offset = -HALF; offset <= HALF; offset++) {
      const key = this.weaponKeys[(this.carouselCenter + offset + total) % total]!;
      const isCenter = offset === 0;
      const dist = Math.abs(offset);
      const ammo = this.localInventory.get(key);
      const ammoStr = ammo === undefined || ammo < 0 ? '∞' : String(ammo);
      const icon = WEAPON_ICONS[key] ?? '💣';
      const iconSize = isCenter ? 28 : dist === 1 ? 23 : 20;
      const opacity = isCenter ? '1' : dist === 1 ? '0.8' : dist === 2 ? '0.6' : '0.42';
      const border = isCenter ? '2px solid #ff8c00' : '1px solid rgba(255,255,255,0.12)';
      const bg = isCenter ? 'rgba(255,140,0,0.14)' : 'rgba(0,0,0,0.4)';
      const ammoColor = ammo === 0 ? '#64748b' : '#ff8c00';
      html += `<div data-weapon-key="${key}" title="${humanize(key)}" style="flex:1 1 0;min-width:0;max-width:120px;height:62px;
        border:${border};border-radius:8px;background:${bg};opacity:${opacity};cursor:pointer;
        display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;
        padding:2px;box-sizing:border-box;transition:all 0.1s;overflow:hidden;">
        <span style="font-size:${iconSize}px;line-height:1;">${icon}</span>
        ${isCenter ? `<span style="font:bold 8px system-ui;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">${humanize(key)}</span>` : ''}
        <span style="font:bold ${isCenter ? 10 : 8}px monospace;color:${ammoColor};">${ammoStr}</span>
      </div>`;
    }
    container.innerHTML = html;
    container.querySelectorAll<HTMLDivElement>('[data-weapon-key]').forEach((card) => {
      card.addEventListener('click', () => {
        const i = this.weaponKeys.indexOf(card.dataset.weaponKey!);
        if (i >= 0) this.selectWeaponAt(i);
      });
    });
  }
}
