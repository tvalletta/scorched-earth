import type { Room } from 'colyseus.js';
import type { MatchState } from '@se/shared';
import { WEAPON_REGISTRY } from '@se/game';

export class HudBar {
  el: HTMLDivElement;
  private onAimChange: ((angle: number, power: number) => void) | null = null;
  private currentAngle = 90;
  private currentPower = 500;
  private weaponKeys: string[];
  private carouselCenter = 0;
  private localInventory: Map<string, number> = new Map();
  private onMouseMoveDial: (e: MouseEvent) => void = () => {};
  private onMouseMovePower: (e: MouseEvent) => void = () => {};
  private onMouseUpDial: () => void = () => {};
  private onMouseUpPower: () => void = () => {};

  constructor(private room: Room<MatchState>) {
    this.weaponKeys = Array.from(WEAPON_REGISTRY.keys());

    this.el = document.createElement('div');
    this.el.className = 'interactive';
    this.el.style.cssText = [
      'position:fixed;bottom:0;left:0;right:0;height:72px;',
      'background:linear-gradient(0deg,rgba(8,6,24,0.98),rgba(8,6,24,0.80));',
      'border-top:3px solid rgba(255,140,0,0.5);',
      'display:flex;align-items:center;gap:14px;padding:0 14px;z-index:100;',
      'font-family:system-ui,sans-serif;color:#fff;',
      'box-sizing:border-box;',
    ].join('');

    this.el.innerHTML = this.buildHTML();
    document.getElementById('ui')!.appendChild(this.el);

    this.bindEvents();
  }

  setAimChangeCallback(fn: (angle: number, power: number) => void): void {
    this.onAimChange = fn;
  }

  update(state: MatchState): void {
    const myTank = state.tanks.get(this.room.sessionId);
    const isMyTurn = state.currentTurnPlayerId === this.room.sessionId;
    const fireBtn = this.el.querySelector<HTMLButtonElement>('#hud-fire');
    if (fireBtn) {
      fireBtn.disabled = !isMyTurn;
      fireBtn.style.opacity = isMyTurn ? '1' : '0.4';
    }

    if (myTank) {
      if (myTank.angle !== this.currentAngle) {
        this.currentAngle = myTank.angle;
        const angleVal = this.el.querySelector<HTMLDivElement>('#hud-angle-val');
        if (angleVal) angleVal.textContent = `${Math.round(this.currentAngle)}°`;
        this.drawDial();
      }
      if (myTank.power !== this.currentPower) {
        this.currentPower = myTank.power;
        const fill = this.el.querySelector<HTMLDivElement>('#hud-power-fill');
        if (fill) fill.style.height = `${(this.currentPower / 1000) * 100}%`;
        const powerVal = this.el.querySelector<HTMLDivElement>('#hud-power-val');
        if (powerVal) powerVal.textContent = String(Math.round(this.currentPower));
      }
      // Update local inventory snapshot
      this.localInventory = new Map(myTank.inventory.entries());
      this.renderCarousel(myTank.weaponId);
    }
  }

  updateTimer(deadlineMs: number): void {
    const timer = this.el.querySelector<HTMLDivElement>('#hud-timer');
    if (!timer) return;
    const remaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
    timer.textContent = String(remaining);
    if (remaining <= 5) {
      timer.style.borderColor = '#ef4444';
      timer.style.color = '#ef4444';
    } else {
      timer.style.borderColor = '#eab308';
      timer.style.color = '#eab308';
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('mousemove', this.onMouseMoveDial);
    window.removeEventListener('mouseup', this.onMouseUpDial);
    window.removeEventListener('mousemove', this.onMouseMovePower);
    window.removeEventListener('mouseup', this.onMouseUpPower);
    this.el.remove();
  }

  private buildHTML(): string {
    return `
      <div id="hud-dial" style="width:52px;height:52px;border-radius:50%;
        border:2px solid #ff8c00;background:rgba(0,0,0,0.6);position:relative;
        cursor:pointer;flex-shrink:0;user-select:none;">
        <canvas id="hud-dial-canvas" width="52" height="52" style="position:absolute;inset:0;border-radius:50%;"></canvas>
        <div id="hud-angle-val" style="position:absolute;inset:0;display:flex;align-items:center;
          justify-content:center;font:bold 11px monospace;color:#ff8c00;pointer-events:none;">90°</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;">
        <div id="hud-power-track" style="width:20px;height:52px;background:rgba(255,255,255,0.08);
          border:1px solid rgba(255,255,255,0.15);border-radius:4px;position:relative;cursor:ns-resize;">
          <div id="hud-power-fill" style="position:absolute;bottom:0;left:0;right:0;height:50%;border-radius:4px;
            background:linear-gradient(0deg,#22c55e,#eab308,#ef4444);"></div>
        </div>
        <div id="hud-power-val" style="font:bold 9px monospace;color:#94a3b8;">500</div>
      </div>
      <div style="flex:1;display:flex;align-items:center;gap:6px;overflow:hidden;min-width:0;">
        <button id="hud-prev" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);
          color:#fff;width:24px;height:24px;border-radius:4px;cursor:pointer;font-size:14px;
          flex-shrink:0;display:flex;align-items:center;justify-content:center;">‹</button>
        <div id="hud-carousel" style="flex:1;display:flex;gap:4px;align-items:center;overflow:hidden;justify-content:center;"></div>
        <button id="hud-next" style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);
          color:#fff;width:24px;height:24px;border-radius:4px;cursor:pointer;font-size:14px;
          flex-shrink:0;display:flex;align-items:center;justify-content:center;">›</button>
      </div>
      <div id="hud-timer" style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;
        background:rgba(0,0,0,0.4);border:2px solid #eab308;border-radius:6px;
        font:bold 20px 'Impact',fantasy;color:#eab308;flex-shrink:0;">--</div>
      <button id="hud-fire" style="padding:0 18px;height:52px;
        background:linear-gradient(180deg,#ff8c00,#cc5500);
        border:3px solid #7f2d00;border-radius:8px;
        box-shadow:0 4px 0 #7f2d00;color:#fff;font:bold 14px system-ui;
        cursor:pointer;flex-shrink:0;text-shadow:1px 1px 0 rgba(0,0,0,0.5);">🔥 FIRE</button>
    `;
  }

  private bindEvents(): void {
    this.el.querySelector('#hud-prev')!.addEventListener('click', () => this.scrollCarousel(-1));
    this.el.querySelector('#hud-next')!.addEventListener('click', () => this.scrollCarousel(1));

    const fireBtn = this.el.querySelector<HTMLButtonElement>('#hud-fire')!;
    fireBtn.addEventListener('mousedown', () => {
      fireBtn.style.transform = 'translateY(3px)';
      fireBtn.style.boxShadow = '0 1px 0 #7f2d00';
    });
    fireBtn.addEventListener('mouseup', () => {
      fireBtn.style.transform = '';
      fireBtn.style.boxShadow = '0 4px 0 #7f2d00';
      if (fireBtn.disabled) return;
      this.room.send('fire', { angle: this.currentAngle, power: this.currentPower });
    });
    fireBtn.addEventListener('mouseleave', () => {
      fireBtn.style.transform = '';
      fireBtn.style.boxShadow = '0 4px 0 #7f2d00';
    });

    window.addEventListener('keydown', this.onKeyDown);

    // Dial drag
    const dial = this.el.querySelector<HTMLDivElement>('#hud-dial')!;
    let draggingDial = false;
    dial.addEventListener('mousedown', (e) => { e.stopPropagation(); draggingDial = true; });
    this.onMouseMoveDial = (e: MouseEvent) => {
      if (!draggingDial) return;
      const rect = dial.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const screenAngle = Math.atan2(dy, dx) * 180 / Math.PI;
      // Map screen angle to game angle: right=0°, left=180°, up=90°
      // screen 0° (right) → game 180°; screen ±180° (left) → game 0°; screen -90° (up) → game 90°
      const gameAngle = 180 - ((screenAngle + 360) % 360);
      this.setAngle(Math.max(0, Math.min(180, gameAngle)));
    };
    this.onMouseUpDial = () => { draggingDial = false; };
    window.addEventListener('mousemove', this.onMouseMoveDial);
    window.addEventListener('mouseup', this.onMouseUpDial);

    // Power bar drag
    const powerTrack = this.el.querySelector<HTMLDivElement>('#hud-power-track')!;
    let draggingPower = false;
    powerTrack.addEventListener('mousedown', (e) => { e.stopPropagation(); draggingPower = true; });
    this.onMouseMovePower = (e: MouseEvent) => {
      if (!draggingPower) return;
      const rect = powerTrack.getBoundingClientRect();
      const fraction = 1 - (e.clientY - rect.top) / rect.height;
      this.setPower(Math.round(Math.max(0, Math.min(1000, fraction * 1000))));
    };
    this.onMouseUpPower = () => { draggingPower = false; };
    window.addEventListener('mousemove', this.onMouseMovePower);
    window.addEventListener('mouseup', this.onMouseUpPower);
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowLeft':  this.setAngle(this.currentAngle - 2); e.preventDefault(); break;
      case 'ArrowRight': this.setAngle(this.currentAngle + 2); e.preventDefault(); break;
      case 'ArrowUp':    this.setPower(this.currentPower + 20); e.preventDefault(); break;
      case 'ArrowDown':  this.setPower(this.currentPower - 20); e.preventDefault(); break;
      case 'q': case 'Q': this.scrollCarousel(-1); break;
      case 'e': case 'E': this.scrollCarousel(1); break;
    }
  };

  private setAngle(deg: number): void {
    this.currentAngle = Math.max(0, Math.min(180, deg));
    const angleVal = this.el.querySelector<HTMLDivElement>('#hud-angle-val');
    if (angleVal) angleVal.textContent = `${Math.round(this.currentAngle)}°`;
    this.drawDial();
    this.onAimChange?.(this.currentAngle, this.currentPower);
  }

  private setPower(pct: number): void {
    this.currentPower = Math.max(0, Math.min(1000, pct));
    const fill = this.el.querySelector<HTMLDivElement>('#hud-power-fill');
    if (fill) fill.style.height = `${(this.currentPower / 1000) * 100}%`;
    const powerVal = this.el.querySelector<HTMLDivElement>('#hud-power-val');
    if (powerVal) powerVal.textContent = String(Math.round(this.currentPower));
    this.onAimChange?.(this.currentAngle, this.currentPower);
  }

  private drawDial(): void {
    const canvas = this.el.querySelector<HTMLCanvasElement>('#hud-dial-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 52, 52);
    const cx = 26, cy = 26;
    // Background arc
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,140,0,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Needle
    const needleAngle = Math.PI + (this.currentAngle * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(needleAngle) * 20, cy + Math.sin(needleAngle) * 20);
    ctx.strokeStyle = '#ff8c00';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  private scrollCarousel(delta: number): void {
    this.carouselCenter = (this.carouselCenter + delta + this.weaponKeys.length) % this.weaponKeys.length;
    const key = this.weaponKeys[this.carouselCenter]!;
    this.room.send('select-weapon', { weaponId: key });
    this.renderCarousel(key);
  }

  private renderCarousel(selectedKey: string): void {
    const idx = this.weaponKeys.indexOf(selectedKey);
    if (idx >= 0) this.carouselCenter = idx;

    const container = this.el.querySelector<HTMLDivElement>('#hud-carousel');
    if (!container) return;

    const total = this.weaponKeys.length;
    const slots: Array<{ key: string; offset: number }> = [];
    for (let offset = -2; offset <= 2; offset++) {
      const i = (this.carouselCenter + offset + total) % total;
      slots.push({ key: this.weaponKeys[i]!, offset });
    }

    container.innerHTML = slots.map(({ key, offset }) => {
      const isCenter = offset === 0;
      const ammo = this.localInventory.get(key);
      const ammoStr = ammo === undefined || ammo < 0 ? '∞' : `×${ammo}`;
      const size = isCenter ? '40px' : Math.abs(offset) === 1 ? '32px' : '24px';
      const opacity = isCenter ? '1' : Math.abs(offset) === 1 ? '0.8' : '0.55';
      const border = isCenter ? '2px solid #ff8c00' : '1px solid rgba(255,255,255,0.15)';
      // Use last segment of weapon key as short label since WeaponDef has no icon field
      const label = key.split('-').map(s => s[0]?.toUpperCase() ?? '').join('');
      return `<div data-weapon-key="${key}" style="width:${size};height:${size};
        border:${border};border-radius:6px;background:rgba(0,0,0,0.5);
        opacity:${opacity};cursor:pointer;display:flex;flex-direction:column;
        align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;
        transition:all 0.1s;padding:2px;box-sizing:border-box;">
        <span style="font-size:${isCenter ? '12' : '8'}px;line-height:1;color:#ff8c00;font-weight:bold;font-family:monospace;">${label}</span>
        ${isCenter ? `<span style="font:bold 7px monospace;color:#ff8c00;white-space:nowrap;">${ammoStr}</span>` : ''}
      </div>`;
    }).join('');

    container.querySelectorAll<HTMLDivElement>('[data-weapon-key]').forEach(card => {
      card.addEventListener('click', () => {
        const key = card.dataset.weaponKey!;
        const i = this.weaponKeys.indexOf(key);
        if (i >= 0) {
          this.carouselCenter = i;
          this.room.send('select-weapon', { weaponId: key });
          this.renderCarousel(key);
        }
      });
    });
  }
}
