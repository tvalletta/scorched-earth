export interface LoadoutDef {
  id: string;
  label: string;
  weapons: Record<string, number>; // weaponId → count; -1 = infinite
}

export const LOADOUTS: LoadoutDef[] = [
  {
    id: "starter",
    label: "Starter",
    weapons: { "baby-missile": -1, "missile": 5 },
  },
  {
    id: "standard",
    label: "Standard",
    weapons: {
      "baby-missile": -1,
      "missile": 5,
      "baby-nuke": 3,
      "nuke": 2,
      "funky-bomb": 2,
      "mirv": 1,
    },
  },
  {
    id: "bonanza",
    label: "Bonanza",
    weapons: {
      "baby-missile": -1,
      "missile": 10,
      "baby-nuke": 6,
      "nuke": 4,
      "funky-bomb": 5,
      "mirv": 3,
    },
  },
];

export const LOADOUT_MAP = new Map(LOADOUTS.map((l) => [l.id, l]));
export const DEFAULT_LOADOUT_ID = "standard";
