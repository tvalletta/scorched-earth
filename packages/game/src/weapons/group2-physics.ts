import type { WeaponDef } from "../types";

export const LEAPFROG: WeaponDef = {
  id: "leapfrog", radius: 25, damage: 30, windImmune: false,
  price: 6_000, packSize: 3, leapCount: 3,
};

export const ROLLER: WeaponDef = {
  id: "roller", radius: 25, damage: 40, windImmune: true,
  price: 7_000, packSize: 3, rollOnImpact: true,
};

export const HEAVY_ROLLER: WeaponDef = {
  id: "heavy-roller", radius: 35, damage: 60, windImmune: true,
  price: 14_000, packSize: 2, rollOnImpact: true,
};

export const LASER: WeaponDef = {
  id: "laser", radius: 0, damage: 80, windImmune: true,
  price: 20_000, packSize: 1, laser: true,
};

export const PLASMA_WAVE: WeaponDef = {
  id: "plasma-wave", radius: 0, damage: 90, windImmune: true,
  price: 18_000, packSize: 1, plasmaWave: true,
};

export const TRACER: WeaponDef = {
  id: "tracer", radius: 0, damage: 0, windImmune: false,
  price: 1_000, packSize: 5, tracerMode: true,
};

export const SMOKE: WeaponDef = {
  id: "smoke", radius: 10, damage: 0, windImmune: false,
  price: 800, packSize: 5,
  smokeOnImpact: { width: 100, turnsLeft: 3 },
};
