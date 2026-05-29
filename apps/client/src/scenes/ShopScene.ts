import type { Room } from "colyseus.js";
import type { MatchState } from "@se/shared";
import { SHOP_DURATION_MS } from "@se/shared";
import { WEAPON_REGISTRY, ITEM_REGISTRY } from "@se/game";

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
  private activeTab: string = "ALL";

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
      "background:rgba(8,6,24,0.88);z-index:200;",
    ].join("");

    this.el.innerHTML = `
      <div style="background:#0a0820;border:2px solid rgba(255,140,0,0.4);border-radius:12px;color:#e2e8f0;font-family:monospace;font-size:11px;display:flex;min-width:600px;max-width:820px;min-height:420px;">

        <!-- Left: Earnings + Weapon Grid -->
        <div style="flex:1;padding:16px;border-right:1px solid rgba(255,255,255,0.08);">

          <!-- Earnings breakdown -->
          <div style="background:rgba(255,140,0,0.06);border:1px solid rgba(255,140,0,0.2);border-radius:8px;padding:10px;margin-bottom:14px;">
            <div style="font:900 12px 'Impact',fantasy;color:#ff8c00;letter-spacing:2px;text-shadow:0 0 8px rgba(255,140,0,0.3);margin-bottom:6px;">📊 ROUND EARNINGS</div>
            <div id="shop-earnings"></div>
            <div style="margin-top:8px;display:flex;justify-content:space-between;border-top:1px solid rgba(255,255,255,0.08);padding-top:6px;">
              <span style="color:#94a3b8;">Previous balance</span>
              <span style="color:#e2e8f0;">$${earnings.prevCash.toLocaleString()}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:2px;">
              <span style="color:#fbbf24;font-weight:bold;">Total cash</span>
              <span id="shop-cash-total" style="color:#fbbf24;font-size:14px;font-weight:bold;"></span>
            </div>
          </div>

          <!-- Category tabs -->
          <div id="shop-tabs" style="display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap;"></div>

          <!-- Weapon grid -->
          <div id="shop-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;max-height:280px;overflow-y:auto;"></div>

          <!-- Defense grid -->
          <div style="font:900 12px 'Impact',fantasy;color:#ff8c00;letter-spacing:2px;text-shadow:0 0 8px rgba(255,140,0,0.3);margin:12px 0 8px;">🛡 DEFENSE</div>
          <div id="shop-defense-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;"></div>
        </div>

        <!-- Right: Inventory + Cart + Ready -->
        <div style="width:180px;padding:14px;display:flex;flex-direction:column;gap:10px;">

          <div>
            <div style="font:900 11px 'Impact',fantasy;color:#ff8c00;letter-spacing:2px;margin-bottom:6px;">🎒 INVENTORY</div>
            <div id="shop-inventory" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:8px;"></div>
          </div>

          <div style="flex:1;">
            <div style="font:900 11px 'Impact',fantasy;color:#ff8c00;letter-spacing:2px;margin-bottom:6px;">🛒 CART</div>
            <div id="shop-cart" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:8px;min-height:60px;"></div>
          </div>

          <div>
            <button id="shop-ready" style="
              width:100%;background:linear-gradient(180deg,#ff8c00,#cc5500);border:3px solid #7f2d00;border-radius:8px;
              box-shadow:0 4px 0 #7f2d00;padding:10px;color:#fff;font:bold 13px system-ui;cursor:pointer;
            ">READY<br/><span style="font-size:8px;color:rgba(255,255,255,0.7);font-weight:normal;" id="shop-round-label"></span></button>
            <div id="shop-ready-count" style="text-align:center;color:#94a3b8;font-size:8px;margin-top:4px;"></div>
          </div>

          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span style="color:#94a3b8;font-size:9px;">Shop closes in…</span>
              <span id="shop-countdown" style="color:#ff8c00;font-weight:bold;font-size:11px;"></span>
            </div>
            <div style="background:#1a1535;border-radius:3px;height:3px;">
              <div id="shop-bar" style="background:linear-gradient(90deg,#ff8c00,#ff4500);height:3px;width:100%;border-radius:3px;"></div>
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
      `<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
        <span style="color:#94a3b8;">${label}</span><span style="color:#fbbf24;">${val}</span>
      </div>`
    ).join("");

    // Round label
    const roundLabel = this.el.querySelector<HTMLSpanElement>("#shop-round-label")!;
    if (state.round >= state.maxRounds) {
      roundLabel.textContent = `→ END MATCH`;
    } else {
      roundLabel.textContent = `→ Round ${state.round + 1}`;
    }

    // Build category tabs + weapon grid
    this.buildTabs();
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

  // Category membership for weapon tabs
  private static readonly WEAPON_CATEGORIES: Record<string, string> = {
    // BALLISTIC — classic projectiles
    "baby-missile": "BALLISTIC",
    "missile": "BALLISTIC",
    "baby-nuke": "BALLISTIC",
    "nuke": "BALLISTIC",
    "funky-bomb": "BALLISTIC",
    "mirv": "BALLISTIC",
    "deaths-head": "BALLISTIC",
    "deaths-knell": "BALLISTIC",
    "triple-warhead": "BALLISTIC",
    "pineapple": "BALLISTIC",
    "funky-nuke": "BALLISTIC",
    // ENERGY — plasma, laser, wave
    "plasma-ball": "ENERGY",
    "plasma-blast": "ENERGY",
    "laser": "ENERGY",
    "plasma-wave": "ENERGY",
    // FIRE — burn weapons
    "napalm": "FIRE",
    "hot-napalm": "FIRE",
    "fireball": "FIRE",
    // UTILITY — terrain, recon, physics oddities
    "leapfrog": "UTILITY",
    "roller": "UTILITY",
    "heavy-roller": "UTILITY",
    "tracer": "UTILITY",
    "smoke": "UTILITY",
    "dirt-clod": "UTILITY",
    "dirt-ball": "UTILITY",
    "liquid-dirt": "UTILITY",
    "sandhog": "UTILITY",
    "tunneler": "UTILITY",
  };

  // Emoji icons per weapon
  private static readonly WEAPON_ICONS: Record<string, string> = {
    "baby-missile": "🚀", "missile": "💣", "baby-nuke": "☢️", "nuke": "💥",
    "funky-bomb": "🎆", "mirv": "🪐", "deaths-head": "💀", "deaths-knell": "🔔",
    "triple-warhead": "🧨", "pineapple": "🍍", "funky-nuke": "🌀",
    "plasma-ball": "⚡", "plasma-blast": "⚡", "laser": "🔴", "plasma-wave": "🌊",
    "napalm": "🔥", "hot-napalm": "🔥", "fireball": "🔥",
    "leapfrog": "🐸", "roller": "🪨", "heavy-roller": "🪨",
    "tracer": "🔎", "smoke": "💨",
    "dirt-clod": "🌍", "dirt-ball": "🌍", "liquid-dirt": "🟤",
    "sandhog": "⛏️", "tunneler": "⛏️",
  };

  private buildTabs(): void {
    const tabsEl = this.el.querySelector<HTMLDivElement>("#shop-tabs")!;
    const tabs = ["ALL", "BALLISTIC", "FIRE", "ENERGY", "UTILITY"];
    tabsEl.innerHTML = "";
    for (const tab of tabs) {
      const btn = document.createElement("button");
      btn.textContent = tab;
      btn.dataset.tab = tab;
      this.styleTab(btn, tab === this.activeTab);
      btn.addEventListener("click", () => {
        this.activeTab = tab;
        this.buildTabs();
        this.buildGrid();
      });
      tabsEl.appendChild(btn);
    }
  }

  private styleTab(btn: HTMLButtonElement, active: boolean): void {
    btn.style.cssText = active
      ? "background:linear-gradient(180deg,#ff8c00,#cc5500);border:2px solid #7f2d00;border-radius:6px;padding:3px 8px;color:#fff;font:bold 9px system-ui;cursor:pointer;letter-spacing:1px;"
      : "background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:3px 8px;color:#94a3b8;font:bold 9px system-ui;cursor:pointer;letter-spacing:1px;";
  }

  private buildGrid(): void {
    const grid = this.el.querySelector<HTMLDivElement>("#shop-grid")!;
    grid.innerHTML = "";
    for (const weapon of WEAPON_REGISTRY.values()) {
      if (weapon.packSize === 0) continue; // not sold
      const cat = ShopScene.WEAPON_CATEGORIES[weapon.id] ?? "BALLISTIC";
      if (this.activeTab !== "ALL" && cat !== this.activeTab) continue;
      const card = document.createElement("div");
      card.dataset.weaponId = weapon.id;
      card.style.cssText = [
        "background:rgba(255,255,255,0.04);border-radius:8px;padding:8px 4px;text-align:center;cursor:pointer;",
        "border:1px solid rgba(255,255,255,0.1);transition:border-color 0.1s;min-width:70px;",
      ].join("");
      const icon = ShopScene.WEAPON_ICONS[weapon.id] ?? "💣";
      const ammo = this.localInventory.get(weapon.id) ?? 0;
      card.innerHTML = `
        <div style="font-size:22px;margin-bottom:3px;">${icon}</div>
        <div style="font-size:9px;font-weight:bold;color:#e2e8f0;line-height:1.2;margin-bottom:3px;word-break:break-word;">${weapon.id.replace(/-/g, " ").toUpperCase()}</div>
        ${ammo > 0 ? `<div style="color:#fbbf24;font-size:8px;margin-bottom:2px;">×${ammo}</div>` : `<div style="font-size:8px;margin-bottom:2px;">&nbsp;</div>`}
        <div style="color:#fbbf24;font-size:9px;margin-bottom:5px;">$${weapon.price.toLocaleString()}</div>
        <div class="buy-btn" style="background:linear-gradient(180deg,#ff8c00,#cc5500);border:1px solid #7f2d00;border-radius:4px;padding:2px 4px;font-size:8px;cursor:pointer;color:#fff;">BUY</div>
      `;
      card.querySelector(".buy-btn")!.addEventListener("click", () => this.onBuy(weapon.id));
      grid.appendChild(card);
    }

    const defenseGrid = this.el.querySelector<HTMLDivElement>("#shop-defense-grid")!;
    defenseGrid.innerHTML = "";
    for (const item of ITEM_REGISTRY.values()) {
      if (item.packSize === 0) continue;
      const card = document.createElement("div");
      card.dataset.itemId = item.id;
      card.style.cssText = [
        "background:rgba(255,255,255,0.04);border-radius:8px;padding:8px 4px;text-align:center;cursor:pointer;",
        "border:1px solid rgba(255,255,255,0.1);transition:border-color 0.1s;min-width:70px;",
      ].join("");
      const label = item.id.replace(/-/g, " ").toUpperCase();
      const ammo = this.localInventory.get(item.id) ?? 0;
      card.innerHTML = `
        <div style="font-size:22px;margin-bottom:3px;">🛡️</div>
        <div style="font-size:9px;font-weight:bold;color:#e2e8f0;line-height:1.2;margin-bottom:3px;">${label}</div>
        ${ammo > 0 ? `<div style="color:#fbbf24;font-size:8px;margin-bottom:2px;">×${ammo}</div>` : `<div style="font-size:8px;margin-bottom:2px;">&nbsp;</div>`}
        <div style="color:#fbbf24;font-size:9px;margin-bottom:5px;">$${item.price.toLocaleString()}</div>
        <div class="buy-btn" style="background:linear-gradient(180deg,#ff8c00,#cc5500);border:1px solid #7f2d00;border-radius:4px;padding:2px 4px;font-size:8px;cursor:pointer;color:#fff;">BUY</div>
      `;
      card.querySelector(".buy-btn")!.addEventListener("click", () => this.onBuyItem(item.id));
      defenseGrid.appendChild(card);
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
    this.buildGrid();
    this.renderCart();
    this.renderInventory();
    this.renderCash();
  }

  private onBuyItem(itemId: string): void {
    const item = ITEM_REGISTRY.get(itemId);
    if (!item || item.packSize === 0) return;
    if (this.localCash < item.price) return;

    this.localCash -= item.price;
    this.localInventory.set(itemId, (this.localInventory.get(itemId) ?? 0) + item.packSize);

    this.room.send("buy", { weaponId: itemId });
    this.buildGrid();
    this.renderCart();
    this.renderInventory();
    this.renderCash();
  }

  private onReady(): void {
    this.room.send("ready-for-shop");
    if (this.readyBtn) {
      this.readyBtn.disabled = true;
      this.readyBtn.textContent = "Waiting…";
      this.readyBtn.style.background = "rgba(255,255,255,0.06)";
      this.readyBtn.style.boxShadow = "none";
      this.readyBtn.style.border = "2px solid rgba(255,255,255,0.15)";
    }
  }

  private refreshAffordability(): void {
    // Existing weapon cards
    const cards = this.el.querySelectorAll<HTMLDivElement>("[data-weapon-id]");
    for (const card of cards) {
      const id = card.dataset.weaponId!;
      const weapon = WEAPON_REGISTRY.get(id);
      if (!weapon) continue;
      const canAfford = this.localCash >= weapon.price;
      card.style.borderColor = canAfford ? "rgba(255,140,0,0.4)" : "rgba(255,255,255,0.1)";
      card.style.opacity = canAfford ? "1" : "0.5";
      const btn = card.querySelector<HTMLDivElement>(".buy-btn")!;
      btn.style.background = canAfford ? "linear-gradient(180deg,#ff8c00,#cc5500)" : "#333";
      btn.textContent = canAfford ? "BUY" : "CAN\'T AFFORD";
    }

    // Defense item cards
    const defenseCards = this.el.querySelectorAll<HTMLDivElement>("[data-item-id]");
    for (const card of defenseCards) {
      const id = card.dataset.itemId!;
      const item = ITEM_REGISTRY.get(id);
      if (!item) continue;
      const canAfford = this.localCash >= item.price;
      card.style.borderColor = canAfford ? "rgba(255,140,0,0.4)" : "rgba(255,255,255,0.1)";
      card.style.opacity = canAfford ? "1" : "0.5";
      const btn = card.querySelector<HTMLDivElement>(".buy-btn")!;
      btn.style.background = canAfford ? "linear-gradient(180deg,#ff8c00,#cc5500)" : "#333";
      btn.textContent = canAfford ? "BUY" : "CAN\'T AFFORD";
    }
  }

  private renderInventory(): void {
    const el = this.el.querySelector<HTMLDivElement>("#shop-inventory")!;
    const lines: string[] = [];
    lines.push(`<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.08);"><span style="color:#94a3b8;font-size:9px;">∞ Baby Missile</span><span style="color:#94a3b8;font-size:9px;">free</span></div>`);
    for (const [id, count] of this.localInventory.entries()) {
      if (id === "baby-missile") continue;
      const label = id.replace(/-/g, " ").toUpperCase();
      lines.push(`<div style="display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.08);"><span style="color:#e2e8f0;font-size:9px;">${label}</span><span style="color:#fbbf24;font-size:9px;">×${count}</span></div>`);
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
      el.innerHTML = `<div style="color:#94a3b8;font-size:9px;">Nothing yet</div>`;
      return;
    }
    el.innerHTML = `
      <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:4px;margin-top:4px;">
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#94a3b8;font-size:9px;">Spent</span>
          <span style="color:#fbbf24;font-size:9px;">$${spent.toLocaleString()}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:2px;">
          <span style="color:#94a3b8;font-size:9px;">Remaining</span>
          <span style="color:#ff8c00;font-size:10px;font-weight:bold;">$${this.localCash.toLocaleString()}</span>
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
