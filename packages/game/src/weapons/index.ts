import type { WeaponDef } from "../types";
import { BABY_MISSILE } from "./baby-missile";
import { MISSILE } from "./missile";
import { BABY_NUKE } from "./baby-nuke";
import { NUKE } from "./nuke";
import { FUNKY_BOMB } from "./funky-bomb";
import { MIRV } from "./mirv";

export { BABY_MISSILE, MISSILE, BABY_NUKE, NUKE, FUNKY_BOMB, MIRV };

// Player-selectable weapons in display order. Sub-munition defs are NOT registered.
export const WEAPON_REGISTRY = new Map<string, WeaponDef>([
  [BABY_MISSILE.id, BABY_MISSILE],
  [MISSILE.id, MISSILE],
  [BABY_NUKE.id, BABY_NUKE],
  [NUKE.id, NUKE],
  [FUNKY_BOMB.id, FUNKY_BOMB],
  [MIRV.id, MIRV],
]);
