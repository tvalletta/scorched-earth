import type { WeaponDef } from "../types";
import { BABY_NUKE } from "./baby-nuke";

// Internal sub-munitions (not in registry — only spawned by split)
const TRIPLE_SUB: WeaponDef = {
  id: "triple-sub", radius: 40, damage: 70, windImmune: false, price: 0, packSize: 0,
};

const PINEAPPLE_SUB: WeaponDef = {
  id: "pineapple-sub", radius: 28, damage: 45, windImmune: false, price: 0, packSize: 0,
};

const FUNKY_NUKE_SUB: WeaponDef = { ...BABY_NUKE, id: "baby-nuke", price: 0, packSize: 0 };

export const DEATHS_HEAD: WeaponDef = {
  id: "deaths-head", radius: 80, damage: 150, windImmune: false, price: 75_000, packSize: 1,
};

export const DEATHS_KNELL: WeaponDef = {
  id: "deaths-knell", radius: 70, damage: 130, windImmune: false, price: 50_000, packSize: 1,
};

export const TRIPLE_WARHEAD: WeaponDef = {
  id: "triple-warhead", radius: 0, damage: 0, windImmune: false, price: 20_000, packSize: 1,
  split: { trigger: "apex", count: 3, spreadDeg: 60, centerDeg: 90,
           inheritVelocity: true, ejectionSpeed: 280, child: TRIPLE_SUB },
};

export const PINEAPPLE: WeaponDef = {
  id: "pineapple", radius: 0, damage: 0, windImmune: false, price: 25_000, packSize: 1,
  split: { trigger: "apex", count: 9, spreadDeg: 360, centerDeg: 90,
           inheritVelocity: false, ejectionSpeed: 250, child: PINEAPPLE_SUB },
};

export const FUNKY_NUKE: WeaponDef = {
  id: "funky-nuke", radius: 0, damage: 0, windImmune: false, price: 30_000, packSize: 1,
  split: { trigger: "apex", count: 8, spreadDeg: 360, centerDeg: 90,
           inheritVelocity: false, ejectionSpeed: 220, child: FUNKY_NUKE_SUB },
};

export const PLASMA_BALL: WeaponDef = {
  id: "plasma-ball", radius: 35, damage: 70, windImmune: false,
  price: 5_000, packSize: 3, shieldPierce: 0.5,
};

export const PLASMA_BLAST: WeaponDef = {
  id: "plasma-blast", radius: 50, damage: 110, windImmune: false,
  price: 10_000, packSize: 2, shieldPierce: 0.5,
};
