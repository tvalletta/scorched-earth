import type { WeaponDef } from "../types";
import { BABY_MISSILE } from "./baby-missile";
import { MISSILE } from "./missile";
import { BABY_NUKE } from "./baby-nuke";
import { NUKE } from "./nuke";
import { FUNKY_BOMB } from "./funky-bomb";
import { MIRV } from "./mirv";
import { DEATHS_HEAD, DEATHS_KNELL, TRIPLE_WARHEAD, PINEAPPLE, FUNKY_NUKE, PLASMA_BALL, PLASMA_BLAST } from "./group1-variants";
import { LEAPFROG, ROLLER, HEAVY_ROLLER, LASER, PLASMA_WAVE, TRACER, SMOKE } from "./group2-physics";
import { DIRT_CLOD, DIRT_BALL, LIQUID_DIRT, SANDHOG, TUNNELER } from "./group3-terrain";

export { BABY_MISSILE, MISSILE, BABY_NUKE, NUKE, FUNKY_BOMB, MIRV };
export { DEATHS_HEAD, DEATHS_KNELL, TRIPLE_WARHEAD, PINEAPPLE, FUNKY_NUKE, PLASMA_BALL, PLASMA_BLAST };
export { LEAPFROG, ROLLER, HEAVY_ROLLER, LASER, PLASMA_WAVE, TRACER, SMOKE };
export { DIRT_CLOD, DIRT_BALL, LIQUID_DIRT, SANDHOG, TUNNELER };

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
  [LEAPFROG.id, LEAPFROG],
  [ROLLER.id, ROLLER],
  [HEAVY_ROLLER.id, HEAVY_ROLLER],
  [LASER.id, LASER],
  [PLASMA_WAVE.id, PLASMA_WAVE],
  [TRACER.id, TRACER],
  [SMOKE.id, SMOKE],
  [DIRT_CLOD.id, DIRT_CLOD],
  [DIRT_BALL.id, DIRT_BALL],
  [LIQUID_DIRT.id, LIQUID_DIRT],
  [SANDHOG.id, SANDHOG],
  [TUNNELER.id, TUNNELER],
]);
