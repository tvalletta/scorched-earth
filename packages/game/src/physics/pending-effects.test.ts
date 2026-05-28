import { describe, it, expect } from "vitest";
import { processPendingEffects } from "./pending-effects";
import type { PendingEffectData, TankSnapshot } from "./pending-effects";

describe("processPendingEffects", () => {
  it("applies burn damage to tanks inside the zone", () => {
    const zones: PendingEffectData[] = [
      { kind: "burn-zone", x: 100, width: 80, damage: 15, turnsLeft: 2 },
    ];
    const tanks: TankSnapshot[] = [
      { sessionId: "p1", x: 100, hp: 100 }, // inside zone (100 ± 40)
      { sessionId: "p2", x: 200, hp: 100 }, // outside
    ];
    const { damages, survivors } = processPendingEffects(zones, tanks);
    expect(damages).toContainEqual({ sessionId: "p1", amount: 15 });
    expect(damages).not.toContainEqual(expect.objectContaining({ sessionId: "p2" }));
    expect(survivors[0].turnsLeft).toBe(1); // decremented
  });

  it("removes effects with turnsLeft 0 after decrement", () => {
    const zones: PendingEffectData[] = [
      { kind: "burn-zone", x: 100, width: 80, damage: 15, turnsLeft: 1 },
    ];
    const { survivors } = processPendingEffects(zones, []);
    expect(survivors).toHaveLength(0);
  });

  it("smoke zones deal no damage", () => {
    const zones: PendingEffectData[] = [
      { kind: "smoke-zone", x: 100, width: 100, damage: 0, turnsLeft: 3 },
    ];
    const tanks: TankSnapshot[] = [{ sessionId: "p1", x: 100, hp: 100 }];
    const { damages } = processPendingEffects(zones, tanks);
    expect(damages).toHaveLength(0);
  });
});
