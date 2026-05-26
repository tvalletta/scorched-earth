import type { Room } from "colyseus.js";
import type { MatchState } from "@se/shared";
import { SHOP_DURATION_MS } from "@se/shared";
import { WEAPON_REGISTRY } from "@se/game";

export interface RoundEarningsInfo {
  damageReward: number;
  killReward: number;
  survivalBonus: number;
  total: number;
  prevCash: number;
}

export class ShopScene {
  private el: HTMLDivElement;
  private barEl: HTMLDivElement | null = null;
  private readyBtn: HTMLButtonElement | null = null;
  private readyLabel: HTMLDivElement | null = null;
  private rafId = 0;
  private deadline = 0;
  private localCash: number;
  private localInventory: Map<string, number>;

  constructor(
    private room: Room<MatchState>,
    earnings: RoundEarningsInfo,
  ) {
    const state = room.state;
    const myTank = state.tanks.get(room.sessionId)!;
    this.localCash = myTank.cash;
    this.localInventory = new Map(myTank.inventory.entries());
    this.deadline = state.shopDeadlineMs;

    this.el = document.createElement("div");
    this.el.className = "interactive";
    this.el.style.cssText = [
      "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;",
      "background:rgba(0,0,0,0.80);z-index:200;",
    ].join("");

    this.el.innerHTML = `
      <div style="background:#12121e;border-radius:10px;color:#e0e0e0;font-family:monospace;font-size:11px;display:flex;min-width:560px;max-width:760px;min-height:380px;">

        <!-- Left: Earnings + Weapon Grid -->
        <div style="flex:1;padding:16px;border-right:1px solid #2a2a3e;">

          <!-- Earnings breakdown -->
          <div style="background:#1e1e30;border-radius:6px;padding:10px;margin-bottom:14px;">
            <div style="color:#888;font-size:9px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">📊 Round Earnings</div>
            <div id="shop-earnings"></div>
            <div style="margin-top:8px;display:flex;justify-content:space-between;border-top:1px solid #2a2a3e;padding-top:6px;">
              <span style="color:#888;">Previous balance</span>
              <span>$${earnings.prevCash.toLocaleString()}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:2px;">
              <span style="color:#f4c842;font-weight:bold;">Total cash</span>
              <span id="shop-cash-total" style="color:#f4c842;font-size:14px;font-weight:bold;"></span>
            </div>
          </div>

          <!-- Weapon grid -->
          <div style="color:#888;font-size:9px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">🛒 Buy Weapons</div>
          <div id="shop-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;"></div>
        </div>

        <!-- Right: Inventory + Cart + Ready -->
        <div style="width:170px;padding:14px;display:flex;flex-direction:column;gap:10px;">

          <div>
            <div style="color:#888;font-size:9px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">🎒 Inventory</div>
            <div id="shop-inventory" style="background:#1e1e30;border-radius:6px;padding:8px;"></div>
          </div>

          <div style="flex:1;">
            <div style="color:#888;font-size:9px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">🛒 Cart</div>
            <div id="shop-cart" style="background:#1e1e30;border-radius:6px;padding:8px;min-height:60px;"></div>
          </div>

          <div>
            <button id="shop-ready" style="
              width:100%;background:#2d7a2d;border:none;border-radius:6px;
              padding:10px;color:#fff;font:bold 11px monospace;letter-spacing:1px;cursor:pointer;
            ">READY<br/><span style="font-size:8px;color:#8fc;font-weight:normal;" id="shop-round-label"></span></button>
            <div id="shop-ready-count" style="text-align:center;color:#555;font-size:8px;margin-top:4px;"></div>
          </div>

          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span style="color:#666;font-size:9px;">Shop closes in…</span>
              <span id="shop-countdown" style="color:#f4c842;font-weight:bold;font-size:11px;"></span>
            </div>
            <div style="background:#2a2a3e;border-radius:3px;height:3px;">
              <div id="shop-bar" style="background:#f4c842;height:3px;width:100%;border-radius:3px;"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Populate earnings
    const earningsEl = this.el.querySelector<HTMLDivElement>("#shop-earnings")!;
    const rows = [
      ["💥 Damage reward", `+$${earnings.damageReward.toLocaleString()}`],
      ["💀 Kill reward", `+$${earnings.killReward.toLocaleString()}`],
      ["🛡️ Survival bonus", `+$${earnings.survivalBonus.toLocaleString()}`],
    ];
    earningsEl.innerHTML = rows.map(([label, val]) =>
      `<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid #2a2a3e;">
        <span style="color:#aaa;">${label}</span><span style="color:#4c4;">${val}</span>
      </div>`
    ).join("");

    // Round label
    const roundLabel = this.el.querySelector<HTMLSpanElement>("#shop-round-label")!;
    if (state.round >= state.maxRounds) {
      roundLabel.textContent = `→ END MATCH`;
    } else {
      roundLabel.textContent = `→ Round ${state.round + 1}`;
    }

    // Build weapon grid
    this.buildGrid();
    this.renderInventory();
    this.renderCart();
    this.renderCash();

    // Ready button
    this.readyBtn = this.el.querySelector<HTMLButtonElement>("#shop-ready")!;
    this.readyLabel = this.el.querySelector<HTMLDivElement>("#shop-ready-count")!;
    this.readyBtn.onclick = () => this.onReady();

    this.barEl = this.el.querySelector<HTMLDivElement>("#shop-bar");
    document.getElementById("ui")!.appendChild(this.el);
    this.tick();
  }

  private buildGrid(): void {
    const grid = this.el.querySelector<HTMLDivElement>("#shop-grid")!;
    grid.innerHTML = "";
    for (const weapon of WEAPON_REGISTRY.values()) {
      if (weapon.packSize === 0) continue; // not sold
      const card = document.createElement("div");
      card.dataset.weaponId = weapon.id;
      card.style.cssText = [
        "background:#1e1e30;border-radius:6px;padding:8px;text-align:center;cursor:pointer;",
        "border:1px solid #3a7d44;transition:border-color 0.1s;",
      ].join("");
      const label = weapon.id.replace(/-/g, " ").toUpperCase();
      card.innerHTML = `
        <div style="font-size:11px;font-weight:bold;margin-bottom:4px;">${label}</div>
        <div style="color:#888;font-size:9px;margin-bottom:3px;">Pack of ${weapon.packSize}</div>
        <div style="color:#f4c842;font-size:10px;margin-bottom:6px;">$${weapon.price.toLocaleString()}</div>
        <div class="buy-btn" style="background:#3a7d44;border-radius:3px;padding:3px;font-size:9px;cursor:pointer;">BUY</div>
      `;
      card.querySelector(".buy-btn")!.addEventListener("click", () => this.onBuy(weapon.id));
      grid.appendChild(card);
    }
    this.refreshAffordability();
  }

  private onBuy(weaponId: string): void {
    const weapon = WEAPON_REGISTRY.get(weaponId);
    if (!weapon || weapon.packSize === 0) return;
    if (this.localCash < weapon.price) return;

    // Optimistic update
    this.localCash -= weapon.price;
    this.localInventory.set(weaponId, (this.localInventory.get(weaponId) ?? 0) + weapon.packSize);

    this.room.send("buy", { weaponId });
    this.renderCart();
    this.renderInventory();
    this.renderCash();
    this.refreshAffordability();
  }

  private onReady(): void {
    this.room.send("ready-for-shop");
    if (this.readyBtn) {
      this.readyBtn.disabled = true;
      this.readyBtn.textContent = "Waiting…";
      this.readyBtn.style.background = "#444";
    }
  }

  private refreshAffordability(): void {
    const cards = this.el.querySelectorAll<HTMLDivElement>("[data-weapon-id]");
    for (const card of cards) {
      const id = card.dataset.weaponId!;
      const weapon = WEAPON_REGISTRY.get(id);
      if (!weapon) continue;
      const canAfford = this.localCash >= weapon.price;
      card.style.borderColor = canAfford ? "#3a7d44" : "#444";
      card.style.opacity = canAfford ? "1" : "0.5";
      const btn = card.querySelector<HTMLDivElement>(".buy-btn")!;
      btn.style.background = canAfford ? "#3a7d44" : "#444";
      btn.textContent = canAfford ? "BUY" : "CAN\'T AFFORD";
    }
  }

  private renderInventory(): void {
    const el = this.el.querySelector<HTMLDivElement>("#shop-inventory")!;
    const lines: string[] = [];
    lines.push(`<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid #2a2a3e;"><span style="color:#aaa;font-size:9px;">∞ Baby Missile</span><span style="color:#888;font-size:9px;">free</span></div>`);
    for (const [id, count] of this.localInventory.entries()) {
      if (id === "baby-missile") continue;
      const label = id.replace(/-/g, " ").toUpperCase();
      lines.push(`<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid #2a2a3e;"><span style="color:#aaa;font-size:9px;">${label}</span><span style="color:#4c4;font-size:9px;">×${count}</span></div>`);
    }
    el.innerHTML = lines.join("");
  }

  private renderCart(): void {
    const el = this.el.querySelector<HTMLDivElement>("#shop-cart")!;
    const state = this.room.state;
    const myTank = state.tanks.get(this.room.sessionId)!;
    const startCash = myTank.cash; // server-confirmed cash (before optimistic)
    const spent = startCash - this.localCash;

    if (spent === 0) {
      el.innerHTML = `<div style="color:#555;font-size:9px;">Nothing yet</div>`;
      return;
    }
    el.innerHTML = `
      <div style="border-top:1px solid #2a2a3e;padding-top:4px;margin-top:4px;">
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#888;font-size:9px;">Spent</span>
          <span style="color:#f4c842;font-size:9px;">$${spent.toLocaleString()}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:2px;">
          <span style="color:#888;font-size:9px;">Remaining</span>
          <span style="color:#4c4;font-size:10px;font-weight:bold;">$${this.localCash.toLocaleString()}</span>
        </div>
      </div>`;
  }

  private renderCash(): void {
    const el = this.el.querySelector<HTMLSpanElement>("#shop-cash-total")!;
    el.textContent = `$${this.localCash.toLocaleString()}`;
  }

  private tick(): void {
    const remaining = Math.max(0, this.deadline - Date.now());
    const pct = (remaining / SHOP_DURATION_MS) * 100;
    const countdown = this.el.querySelector<HTMLSpanElement>("#shop-countdown");
    if (countdown) countdown.textContent = Math.ceil(remaining / 1000) + "s";
    if (this.barEl) this.barEl.style.width = pct + "%";

    // Update ready count from server state
    const state = this.room.state;
    const living = Array.from(state.tanks.values()).filter((t) => t.alive);
    const readyCount = living.filter((t) => t.readyForShop).length;
    if (this.readyLabel) this.readyLabel.textContent = `${readyCount} of ${living.length} players ready`;

    if (remaining > 0) {
      this.rafId = requestAnimationFrame(() => this.tick());
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.el.remove();
  }
}
