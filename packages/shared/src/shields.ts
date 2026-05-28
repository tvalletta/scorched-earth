export interface ShieldDef {
  id: string;
  label: string;
  maxHp: number;
  radius: number;
  type: "absorb" | "bend";
  price: number;
  packSize: number;
  reflectFraction?: number; // Force Shield only
}

export const SHIELD_DEFS = new Map<string, ShieldDef>([
  ["shield", {
    id: "shield", label: "Shield",
    maxHp: 50, radius: 55, type: "absorb",
    price: 5_000, packSize: 1,
  }],
  ["heavy-shield", {
    id: "heavy-shield", label: "Heavy Shield",
    maxHp: 150, radius: 60, type: "absorb",
    price: 12_000, packSize: 1,
  }],
  ["super-magnetic", {
    id: "super-magnetic", label: "Super Magnetic Shield",
    maxHp: 250, radius: 80, type: "bend",
    price: 25_000, packSize: 1,
  }],
  ["force-shield", {
    id: "force-shield", label: "Force Shield",
    maxHp: 500, radius: 65, type: "absorb",
    price: 50_000, packSize: 1,
    reflectFraction: 0.25,
  }],
]);
