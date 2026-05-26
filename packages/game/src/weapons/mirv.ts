import type { WeaponDef } from "../types";

const MIRV_SUB: WeaponDef = {
  id: "mirv-sub",
  radius: 25,
  damage: 35,
  windImmune: false,
};

export const MIRV: WeaponDef = {
  id: "mirv",
  radius: 0,
  damage: 0,
  windImmune: false,
  split: {
    trigger: "apex",
    count: 5,
    spreadDeg: 120,
    centerDeg: 90,
    inheritVelocity: true,
    ejectionSpeed: 300,
    child: MIRV_SUB,
  },
};
