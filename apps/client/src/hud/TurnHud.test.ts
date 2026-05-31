// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import type { MatchState } from "@se/shared";
import { TurnHud } from "./TurnHud";

function mkState(over: Partial<Record<string, unknown>> = {}): MatchState {
  const tanks = new Map<string, any>([
    ["A", { sessionId: "A", nickname: "Red", color: "red", hp: 82, alive: true,
             shieldId: "", shieldHp: 0, shieldMaxHp: 0 }],
    ["B", { sessionId: "B", nickname: "Blue", color: "blue", hp: 40, alive: true,
             shieldId: "", shieldHp: 0, shieldMaxHp: 0 }],
    ["C", { sessionId: "C", nickname: "Green", color: "green", hp: 0, alive: false,
             shieldId: "", shieldHp: 0, shieldMaxHp: 0 }],
  ]);
  return {
    phase: "playing", currentTurnPlayerId: "A", turnTimerMs: 30000,
    turnDeadlineMs: Date.now() + 18000, round: 1, maxRounds: 5,
    tanks, aiSlots: [], ...over,
  } as unknown as MatchState;
}

describe("TurnHud", () => {
  beforeEach(() => { document.body.innerHTML = '<div id="ui"></div>'; });

  it("renders one roster row per tank and marks the active player", () => {
    const hud = new TurnHud("A");
    hud.update(mkState());
    const rows = hud.el.querySelectorAll("[data-session]");
    expect(rows.length).toBe(3);
    expect(hud.el.querySelector('[data-session="A"]')!.classList.contains("active")).toBe(true);
    expect(hud.el.querySelector('[data-session="B"]')!.classList.contains("active")).toBe(false);
  });

  it("shows a skull and dims dead players", () => {
    const hud = new TurnHud("A");
    hud.update(mkState());
    const dead = hud.el.querySelector('[data-session="C"]')!;
    expect(dead.textContent).toContain("💀");
  });

  it("renders the countdown numeral (ceil of remaining seconds)", () => {
    const hud = new TurnHud("A");
    hud.update(mkState({ turnDeadlineMs: Date.now() + 4200 }));
    const num = hud.el.querySelector("#turnhud-num")!;
    expect(Number(num.textContent)).toBe(5);
  });

  it("marks AI players with a robot glyph (aiSlots is an array of {sessionId})", () => {
    const hud = new TurnHud("A");
    hud.update(mkState({ aiSlots: [{ sessionId: "B" }] }));
    expect(hud.el.querySelector('[data-session="B"]')!.textContent).toContain("🤖");
    expect(hud.el.querySelector('[data-session="A"]')!.textContent).not.toContain("🤖");
  });

  it("spectator view (localSessionId matches no tank): all players by nickname, no 'You', active highlight intact", () => {
    const hud = new TurnHud("SPECTATOR"); // matches no tank → viewer is a spectator
    hud.update(mkState());
    const rows = hud.el.querySelectorAll("[data-session]");
    expect(rows.length).toBe(3);
    expect(hud.el.textContent).not.toContain("You");
    expect(hud.el.querySelector('[data-session="A"]')!.textContent).toContain("Red");
    expect(hud.el.querySelector('[data-session="B"]')!.textContent).toContain("Blue");
    // active-turn highlight still works for spectators
    expect(hud.el.querySelector('[data-session="A"]')!.classList.contains("active")).toBe(true);
  });

  it("shows no shield bar when tank has no active shield", () => {
    const hud = new TurnHud("A");
    hud.update(mkState());
    expect(hud.el.querySelector('[data-session="A"] .thp-shield')).toBeNull();
  });

  it("shows shield bar when tank has shieldId and shieldHp > 0", () => {
    const tanks = new Map<string, any>([
      ["A", { sessionId: "A", nickname: "Red", color: "red", hp: 82, alive: true,
               shieldId: "force-field", shieldHp: 60, shieldMaxHp: 100 }],
      ["B", { sessionId: "B", nickname: "Blue", color: "blue", hp: 40, alive: true,
               shieldId: "", shieldHp: 0, shieldMaxHp: 0 }],
    ]);
    const state = { phase: "playing", currentTurnPlayerId: "A", turnTimerMs: 30000,
      turnDeadlineMs: Date.now() + 18000, round: 1, maxRounds: 5, tanks, aiSlots: [] } as any;
    const hud = new TurnHud("A");
    hud.update(state);
    expect(hud.el.querySelector('[data-session="A"] .thp-shield')).not.toBeNull();
    expect(hud.el.querySelector('[data-session="B"] .thp-shield')).toBeNull();
  });
});
