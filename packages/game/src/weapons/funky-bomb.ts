import type { WeaponDef } from "../types";

const FUNKY_BOMB_SUB: WeaponDef = {
  id: "funky-bomb-sub",
  radius: 18,
  damage: 20,
  windImmune: false,
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
    trigger: "apex",
    count: 8,
    spreadDeg: 360,
    centerDeg: 90,
    inheritVelocity: false,
    ejectionSpeed: 200,
    child: FUNKY_BOMB_SUB,
  },
};
