import type { WeaponDef } from "../types";

export const DIRT_CLOD: WeaponDef = {
  id: "dirt-clod", radius: 0, damage: 0, windImmune: false,
  price: 1_500, packSize: 5,
  terrainDeposit: { halfWidth: 20, height: 40 },
};

export const DIRT_BALL: WeaponDef = {
  id: "dirt-ball", radius: 0, damage: 0, windImmune: false,
  price: 3_000, packSize: 3,
  terrainDeposit: { halfWidth: 40, height: 60 },
};

export const LIQUID_DIRT: WeaponDef = {
  id: "liquid-dirt", radius: 0, damage: 0, windImmune: false,
  price: 5_000, packSize: 2,
  terrainDeposit: { halfWidth: 150, height: 40, spray: true },
};

export const SANDHOG: WeaponDef = {
  id: "sandhog", radius: 0, damage: 0, windImmune: true,
  price: 7_500, packSize: 2, burrow: true,
};

export const TUNNELER: WeaponDef = {
  id: "tunneler", radius: 30, damage: 30, windImmune: true,
  price: 9_000, packSize: 2, burrow: true,
};
