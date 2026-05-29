import { createMatch, joinMatch } from '../net/colyseusClient';
import { MatchScene } from './MatchScene';
import { loadIdentity, saveIdentity } from '../lib/identity';
import type { StoredIdentity, TankColorKey, Hat } from '../lib/identity';

const urlMatch = location.pathname.match(/^\/([A-Z0-9]{6})$/i);
const codeFromUrl = urlMatch?.[1]?.toUpperCase() ?? null;

const COLOR_CSS: Record<TankColorKey, string> = {
  red:    '#e63946',
  blue:   '#3a86ff',
  green:  '#80b918',
  orange: '#f4a261',
  cyan:   '#00b4d8',
  magenta: '#b5179e',
  yellow: '#fca311',
  pink:   '#f48fb1',
  lime:   '#a6d96a',
  white:  '#f1f1f1',
};

const HAT_EMOJIS: Record<Hat, string> = {
  none:   '⬜',
  helm:   '🪖',
  chef:   '👨‍🍳',
  tophat: '🎩',
  beanie: '🧢',
  cowboy: '🤠',
  party:  '🎉',
  viking: '⚔️',
  santa:  '🎅',
};

const ALL_COLORS: TankColorKey[] = ['red','blue','green','orange','cyan','magenta','yellow','pink','lime','white'];
const ALL_HATS: Hat[] = ['none','helm','chef','tophat','beanie','cowboy','party','viking','santa'];

export class LobbyScene {
  private panel: HTMLDivElement;
  private identity: StoredIdentity;
  private rounds = 5;

  constructor() {
    this.identity = loadIdentity();

    this.panel = document.createElement('div');
    this.panel.className = 'interactive';
    this.panel.style.cssText = [
      'position:fixed;right:0;top:50%;transform:translateY(-50%) translateX(100%);',
      'width:min(560px,94vw);',
      'background:rgba(8,6,24,0.96);border:2px solid rgba(255,140,0,0.5);',
      'border-radius:12px 0 0 12px;padding:20px;',
      'font-family:system-ui,sans-serif;color:#fff;z-index:300;',
      'transition:transform 0.3s ease-out;',
      'box-shadow:-8px 0 32px rgba(0,0,0,0.6);',
    ].join('');

    this.panel.innerHTML = this.buildPanelHTML();
    document.getElementById('ui')!.appendChild(this.panel);

    // Slide in
    requestAnimationFrame(() => {
      this.panel.style.transform = 'translateY(-50%) translateX(0)';
    });

    this.bindEvents();

    if (codeFromUrl) {
      const codeInput = this.panel.querySelector<HTMLInputElement>('#lobby-code');
      if (codeInput) codeInput.value = codeFromUrl;
    }
  }

  private buildPanelHTML(): string {
    const id = this.identity;
    const isJoin = !!codeFromUrl;

    const colorSwatches = ALL_COLORS.map(c =>
      `<div class="color-swatch" data-color="${c}"
        style="width:22px;height:22px;border-radius:5px;background:${COLOR_CSS[c]};
        cursor:pointer;box-sizing:border-box;
        border:${c === id.color ? '3px solid #ff8c00' : '2px solid rgba(255,255,255,0.15)'};"></div>`
    ).join('');

    const hatPicker = ALL_HATS.map(h =>
      `<div class="hat-pick" data-hat="${h}"
        title="${h}"
        style="padding:4px 8px;border-radius:6px;cursor:pointer;font-size:16px;
        background:${h === id.hat ? 'rgba(255,140,0,0.2)' : 'rgba(255,255,255,0.05)'};
        border:${h === id.hat ? '2px solid #ff8c00' : '1px solid rgba(255,255,255,0.12)'};
        line-height:1.4;">
        ${HAT_EMOJIS[h]}</div>`
    ).join('');

    const rightCol = isJoin ? `
      <div>
        <div style="font:bold 8px sans-serif;color:#3a86ff;letter-spacing:2px;margin-bottom:8px;">JOIN GAME</div>
        <div style="font:bold 8px sans-serif;color:#64748b;letter-spacing:1px;margin-bottom:4px;">ROOM CODE</div>
        <input id="lobby-code" maxlength="6" placeholder="ABC123"
          style="width:100%;padding:8px;border-radius:6px;background:rgba(255,255,255,0.06);
          border:1px solid rgba(255,255,255,0.2);color:#fff;font:bold 14px monospace;
          text-transform:uppercase;box-sizing:border-box;"/>
      </div>
    ` : `
      <div>
        <div style="font:bold 8px sans-serif;color:#ff8c00;letter-spacing:2px;margin-bottom:8px;">MATCH SETUP</div>
        <div style="font:bold 7px sans-serif;color:#64748b;letter-spacing:1px;margin-bottom:4px;">ROUNDS</div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <button id="rounds-minus"
            style="width:24px;height:24px;border-radius:4px;
            background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);
            color:#fff;cursor:pointer;font:bold 14px sans-serif;
            display:flex;align-items:center;justify-content:center;">−</button>
          <span id="rounds-val"
            style="font:bold 16px system-ui;color:#fff;min-width:20px;text-align:center;">5</span>
          <button id="rounds-plus"
            style="width:24px;height:24px;border-radius:4px;
            background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);
            color:#fff;cursor:pointer;font:bold 14px sans-serif;
            display:flex;align-items:center;justify-content:center;">+</button>
        </div>
      </div>
    `;

    const ctaLabel = isJoin ? '&#9654; JOIN' : '&#9654; START MATCH';
    const ctaId = isJoin ? 'lobby-join' : 'lobby-create';

    const escapedName = id.name
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');

    return `
      <div style="font:900 16px 'Impact',fantasy;color:#ff8c00;text-align:center;
        letter-spacing:3px;margin-bottom:14px;text-shadow:0 0 12px rgba(255,140,0,0.4);">
        SCORCHED EARTH
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div>
          <div style="font:bold 8px sans-serif;color:#ff8c00;letter-spacing:2px;margin-bottom:8px;">YOUR SOLDIER</div>
          <input id="lobby-name" maxlength="24" value="${escapedName}"
            style="width:100%;padding:8px;border-radius:6px;background:rgba(255,255,255,0.06);
            border:1px solid rgba(255,255,255,0.2);color:#fff;font:bold 13px system-ui;
            box-sizing:border-box;margin-bottom:8px;"/>
          <div style="font:bold 7px sans-serif;color:#64748b;letter-spacing:1px;margin-bottom:4px;">COLOR</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">${colorSwatches}</div>
          <div style="font:bold 7px sans-serif;color:#64748b;letter-spacing:1px;margin-bottom:4px;">HAT</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">${hatPicker}</div>
        </div>
        ${rightCol}
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button id="${ctaId}"
          style="flex:2;padding:12px;background:linear-gradient(180deg,#ff8c00,#cc5500);
          border:3px solid #7f2d00;border-radius:8px;box-shadow:0 4px 0 #7f2d00;
          color:#fff;font:bold 13px system-ui;cursor:pointer;
          text-shadow:1px 1px 0 rgba(0,0,0,0.5);">${ctaLabel}</button>
        <button id="lobby-copy"
          style="flex:1;background:rgba(255,255,255,0.05);border:2px solid rgba(255,255,255,0.15);
          border-radius:8px;color:#64748b;font:bold 10px system-ui;cursor:pointer;">Share Link</button>
      </div>
      <div id="lobby-status"
        style="margin-top:8px;font:12px system-ui;color:#94a3b8;text-align:center;min-height:18px;"></div>
    `;
  }

  private bindEvents(): void {
    const nameInput = this.panel.querySelector<HTMLInputElement>('#lobby-name');
    nameInput?.addEventListener('input', () => {
      this.identity.name = nameInput.value;
      saveIdentity(this.identity);
    });

    this.panel.querySelectorAll<HTMLDivElement>('.color-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        this.identity.color = sw.dataset.color as TankColorKey;
        saveIdentity(this.identity);
        this.panel.querySelectorAll<HTMLDivElement>('.color-swatch').forEach(s => {
          s.style.border = s.dataset.color === this.identity.color
            ? '3px solid #ff8c00'
            : '2px solid rgba(255,255,255,0.15)';
        });
      });
    });

    this.panel.querySelectorAll<HTMLDivElement>('.hat-pick').forEach(hp => {
      hp.addEventListener('click', () => {
        this.identity.hat = hp.dataset.hat as Hat;
        saveIdentity(this.identity);
        this.panel.querySelectorAll<HTMLDivElement>('.hat-pick').forEach(h => {
          h.style.background = h.dataset.hat === this.identity.hat
            ? 'rgba(255,140,0,0.2)'
            : 'rgba(255,255,255,0.05)';
          h.style.border = h.dataset.hat === this.identity.hat
            ? '2px solid #ff8c00'
            : '1px solid rgba(255,255,255,0.12)';
        });
      });
    });

    const roundsMinus = this.panel.querySelector<HTMLButtonElement>('#rounds-minus');
    const roundsPlus  = this.panel.querySelector<HTMLButtonElement>('#rounds-plus');
    roundsMinus?.addEventListener('click', () => {
      this.rounds = Math.max(1, this.rounds - 1);
      const el = this.panel.querySelector<HTMLSpanElement>('#rounds-val');
      if (el) el.textContent = String(this.rounds);
    });
    roundsPlus?.addEventListener('click', () => {
      this.rounds = Math.min(10, this.rounds + 1);
      const el = this.panel.querySelector<HTMLSpanElement>('#rounds-val');
      if (el) el.textContent = String(this.rounds);
    });

    this.panel.querySelector('#lobby-create')?.addEventListener('click', () => void this.onCreate());
    this.panel.querySelector('#lobby-join')?.addEventListener('click',   () => void this.onJoin());
    this.panel.querySelector('#lobby-copy')?.addEventListener('click',   () => this.onCopy());
  }

  private get meta(): { nickname: string; color: string; hat: string } {
    const name = (this.panel.querySelector<HTMLInputElement>('#lobby-name')?.value ?? '').trim()
      || this.identity.name;
    return { nickname: name, color: this.identity.color, hat: this.identity.hat };
  }

  private setStatus(text: string): void {
    const el = this.panel.querySelector<HTMLDivElement>('#lobby-status');
    if (el) el.textContent = text;
  }

  private onCopy(): void {
    navigator.clipboard.writeText(location.href).catch(() => {});
    this.setStatus('Link copied!');
    setTimeout(() => this.setStatus(''), 2000);
  }

  private async onCreate(): Promise<void> {
    this.setStatus('Creating room…');
    try {
      const { room, code } = await createMatch(this.meta);
      history.pushState({}, '', '/' + code);
      this.setStatus(`Room ${code}`);
      this.dispose();
      new MatchScene(room, code);
    } catch (e: unknown) {
      this.setStatus('Error: ' + (e as Error).message);
    }
  }

  private async onJoin(): Promise<void> {
    const code = (this.panel.querySelector<HTMLInputElement>('#lobby-code')?.value ?? '').toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      this.setStatus('Enter a 6-character room code');
      return;
    }
    this.setStatus('Joining…');
    try {
      const room = await joinMatch(code, this.meta);
      this.dispose();
      new MatchScene(room, code);
    } catch (e: unknown) {
      this.setStatus('Error: ' + (e as Error).message);
    }
  }

  dispose(): void {
    this.panel.style.transform = 'translateY(-50%) translateX(100%)';
    setTimeout(() => this.panel.remove(), 300);
  }
}
