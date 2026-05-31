import type { WeaponDef } from "../types";

const FUNKY_BOMB_SUB: WeaponDef = {
  id: "funky-bomb-sub",
  radius: 18,
  damage: 30,
  windImmune: true,   // sub-projectiles scatter chaotically, unaffected by wind
  price: 0,
  packSize: 0,
};

export const FUNKY_BOMB: WeaponDef = {
  id: "funky-bomb",
  radius: 0,
  damage: 0,
  windImmune: false,
  price: 8_000,
  packSize: 3,
  split: {
    trigger: "ground",       // was "apex"
    count: 8,
    spreadDeg: 160,          // was 360 — 10°→170° fan covers left+right from impact
    centerDeg: 90,           // centered on up; wide spread reaches both horizontal sides
    inheritVelocity: false,
    ejectionSpeed: 180,      // was 200
    child: FUNKY_BOMB_SUB,
  },
};
