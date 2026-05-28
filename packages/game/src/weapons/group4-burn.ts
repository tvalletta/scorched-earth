import type { WeaponDef } from "../types";

export const NAPALM: WeaponDef = {
  id: "napalm", radius: 50, damage: 60, windImmune: false,
  price: 6_000, packSize: 3,
  burnOnImpact: { width: 80, damage: 15, turnsLeft: 2 },
};

export const HOT_NAPALM: WeaponDef = {
  id: "hot-napalm", radius: 60, damage: 80, windImmune: false,
  price: 11_000, packSize: 2,
  burnOnImpact: { width: 120, damage: 25, turnsLeft: 2 },
};

export const FIREBALL: WeaponDef = {
  id: "fireball", radius: 30, damage: 45, windImmune: false,
  price: 4_000, packSize: 3,
  burnOnImpact: { width: 60, damage: 20, turnsLeft: 1 },
};
