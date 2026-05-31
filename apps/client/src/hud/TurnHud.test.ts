// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { TurnHud } from "./TurnHud";

function mkState(over: Partial<any> = {}) {
  const tanks = new Map<string, any>([
    ["A", { sessionId: "A", nickname: "Red", color: "red", hp: 82, alive: true }],
    ["B", { sessionId: "B", nickname: "Blue", color: "blue", hp: 40, alive: true }],
    ["C", { sessionId: "C", nickname: "Green", color: "green", hp: 0, alive: false }],
  ]);
  return {
    phase: "playing", currentTurnPlayerId: "A", turnTimerMs: 30000,
    turnDeadlineMs: Date.now() + 18000, round: 1, maxRounds: 5,
    tanks, aiSlots: [], ...over,
  };
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
});
