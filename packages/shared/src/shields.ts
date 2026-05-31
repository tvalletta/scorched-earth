export type ShieldType = "absorb" | "deflect" | "bend" | "explode";

export interface ShieldDef {
  id: string;
  label: string;
  maxHp: number;
  radius: number;
  type: ShieldType;
  hpCostFraction: number; // shieldHp lost = shieldedDamage * hpCostFraction
  price: number;
  packSize: number;
}

export const MAGNETIC_DRAIN_HP_PER_SEC = 15;
export const MAGNETIC_FORCE_CONST = 8000; // bend strength = CONST / dist²
export const REACTIVE_BLAST = { radius: 60, damage: 40 } as const;

export const SHIELD_DEFS = new Map<string, ShieldDef>([
  ["force-field",      { id:"force-field",      label:"Force Field",      maxHp:200, radius:60,  type:"absorb",  hpCostFraction:0.5,  price:1_500, packSize:1 }],
  ["deflector-shield", { id:"deflector-shield", label:"Deflector Shield", maxHp:500, radius:70,  type:"deflect", hpCostFraction:0.25, price:3_000, packSize:1 }],
  ["magnetic-shield",  { id:"magnetic-shield",  label:"Magnetic Shield",  maxHp:600, radius:100, type:"bend",    hpCostFraction:0,    price:3_500, packSize:1 }],
  ["reactive-armor",   { id:"reactive-armor",   label:"Reactive Armor",   maxHp:1,   radius:50,  type:"explode", hpCostFraction:1,    price:2_000, packSize:3 }],
  ["auto-shield",      { id:"auto-shield",      label:"Auto Shield",      maxHp:400, radius:60,  type:"absorb",  hpCostFraction:0.5,  price:2_500, packSize:2 }],
]);
