export type Intent =
  | { kind: "aim"; angle: number; power: number }
  | { kind: "fire"; angle: number; power: number }
  | { kind: "configure"; turnTimerMs?: number; loadoutId?: string; maxRounds?: number }
  | { kind: "ready" }
  | { kind: "chat"; text: string }
  | { kind: "select-weapon"; weaponId: string }
  | { kind: "buy"; weaponId: string }
  | { kind: "ready-for-shop" }
  | { kind: "move"; direction: "left" | "right"; pixels: number }
  | { kind: "equip-shield"; shieldId: string }
  | { kind: "use-battery" };

export type IntentKind = Intent["kind"];

export function clampAngle(angle: number): number {
  if (angle < 0) return 0;
  if (angle > 180) return 180;
  return angle;
}

export function clampPower(power: number): number {
  if (power < 0) return 0;
  if (power > 1000) return 1000;
  return power;
}
