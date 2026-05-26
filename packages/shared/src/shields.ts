export interface ShieldDef {
  id: string;
  label: string;
  maxHp: number;
  radius: number;
  type: "absorb" | "deflect" | "bend" | "explode";
  hpCostFraction: number;
  price: number;
  packSize: number;
}

export const SHIELD_DEFS = new Map<string, ShieldDef>([
  ["force-field", {
    id: "force-field", label: "Force Field",
    maxHp: 200, radius: 60, type: "absorb", hpCostFraction: 0.5,
    price: 1500, packSize: 1,
  }],
  ["deflector-shield", {
    id: "deflector-shield", label: "Deflector Shield",
    maxHp: 500, radius: 70, type: "deflect", hpCostFraction: 0.25,
    price: 3000, packSize: 1,
  }],
  ["magnetic-shield", {
    id: "magnetic-shield", label: "Magnetic Shield",
    maxHp: 600, radius: 100, type: "bend", hpCostFraction: 0,
    price: 3500, packSize: 1,
  }],
  ["reactive-armor", {
    id: "reactive-armor", label: "Reactive Armor",
    maxHp: 1, radius: 50, type: "explode", hpCostFraction: 1,
    price: 2000, packSize: 3,
  }],
  ["auto-shield", {
    id: "auto-shield", label: "Auto Shield",
    maxHp: 400, radius: 60, type: "absorb", hpCostFraction: 0.5,
    price: 2500, packSize: 2,
  }],
]);
