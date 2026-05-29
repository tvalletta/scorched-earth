import type { MatchState } from '@se/shared';

const COLOR_CSS: Record<string, string> = {
  red: '#e63946',
  blue: '#3a86ff',
  green: '#80b918',
  yellow: '#fca311',
  cyan: '#00b4d8',
  magenta: '#b5179e',
  orange: '#f4a261',
  white: '#f1f1f1',
  pink: '#f48fb1',
  lime: '#a6d96a',
};

export class PlayerStrip {
  el: HTMLDivElement;

  constructor(private mySessionId: string) {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:fixed;top:0;left:0;right:0;height:36px;',
      'background:linear-gradient(180deg,rgba(8,6,24,0.95),rgba(8,6,24,0.65));',
      'border-bottom:1px solid rgba(255,255,255,0.08);',
      'display:flex;align-items:center;gap:8px;padding:0 10px;z-index:100;',
      'font-family:system-ui,sans-serif;box-sizing:border-box;',
    ].join('');
    document.getElementById('ui')!.appendChild(this.el);
  }

  update(state: MatchState): void {
    if (!state?.tanks) return;
    const isAiMap = new Map<string, boolean>();
    for (const slot of state.aiSlots.values()) {
      isAiMap.set(slot.sessionId, true);
    }

    const cards: string[] = [];
    for (const [id, tank] of state.tanks.entries()) {
      const isMe = id === this.mySessionId;
      const isActive = state.currentTurnPlayerId === id;
      const isAi = isAiMap.get(id) ?? false;
      const color = COLOR_CSS[tank.color] ?? '#fff';
      const hpPct = Math.max(0, Math.min(100, tank.hp));
      const hpColor = hpPct > 50 ? '#22c55e' : hpPct > 25 ? '#eab308' : '#ef4444';
      const name = (isAi ? '🤖 ' : '') + tank.nickname;

      const borderStyle = isActive ? `2px solid ${color}` : `1px solid rgba(255,255,255,0.15)`;
      const nameColor = isActive ? '#fff' : '#94a3b8';
      const opacity = tank.alive ? '1' : '0.45';
      const hpContent = tank.alive
        ? `<div style="width:36px;height:3px;background:rgba(255,255,255,0.12);border-radius:2px;margin:1px 0;">
             <div style="width:${hpPct}%;height:100%;background:${hpColor};border-radius:2px;"></div>
           </div>
           <span style="font:9px monospace;color:#64748b;">${Math.round(tank.hp)}</span>`
        : `<span style="font-size:11px;">💀</span>`;

      cards.push(`<div style="display:flex;align-items:center;gap:4px;padding:2px 6px;
        border:${borderStyle};border-radius:5px;opacity:${opacity};white-space:nowrap;">
        <div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></div>
        <span style="font:bold 10px system-ui;color:${nameColor};">${name}</span>
        <div style="display:flex;flex-direction:column;align-items:flex-start;">${hpContent}</div>
        ${isActive && isMe ? '<span style="font:bold 7px system-ui;color:#f59e0b;margin-left:2px;">YOUR TURN</span>' : ''}
        ${isActive && !isMe ? '<span style="font:bold 7px system-ui;color:#60a5fa;margin-left:2px;">▶</span>' : ''}
      </div>`);
    }

    const round = `<div style="margin-left:auto;font:bold 10px monospace;color:#64748b;white-space:nowrap;">
      ROUND ${state.round ?? 1} / ${state.maxRounds ?? 5}
    </div>`;

    this.el.innerHTML = cards.join('') + round;
  }

  destroy(): void {
    this.el.remove();
  }
}
