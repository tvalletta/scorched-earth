import type { WeaponDef } from "../types";
import { BABY_MISSILE } from "./baby-missile";
import { MISSILE } from "./missile";
import { BABY_NUKE } from "./baby-nuke";
import { NUKE } from "./nuke";
import { FUNKY_BOMB } from "./funky-bomb";
import { MIRV } from "./mirv";
import { DEATHS_HEAD, DEATHS_KNELL, TRIPLE_WARHEAD, PINEAPPLE, FUNKY_NUKE, PLASMA_BALL, PLASMA_BLAST } from "./group1-variants";

export { BABY_MISSILE, MISSILE, BABY_NUKE, NUKE, FUNKY_BOMB, MIRV };
export { DEATHS_HEAD, DEATHS_KNELL, TRIPLE_WARHEAD, PINEAPPLE, FUNKY_NUKE, PLASMA_BALL, PLASMA_BLAST };

// Player-selectable weapons in display order. Sub-munition defs are NOT registered.
export const WEAPON_REGISTRY = new Map<string, WeaponDef>([
  [BABY_MISSILE.id, BABY_MISSILE],
  [MISSILE.id, MISSILE],
  [BABY_NUKE.id, BABY_NUKE],
  [NUKE.id, NUKE],
  [FUNKY_BOMB.id, FUNKY_BOMB],
  [MIRV.id, MIRV],
  [DEATHS_HEAD.id, DEATHS_HEAD],
  [DEATHS_KNELL.id, DEATHS_KNELL],
  [TRIPLE_WARHEAD.id, TRIPLE_WARHEAD],
  [PINEAPPLE.id, PINEAPPLE],
  [FUNKY_NUKE.id, FUNKY_NUKE],
  [PLASMA_BALL.id, PLASMA_BALL],
  [PLASMA_BLAST.id, PLASMA_BLAST],
]);
