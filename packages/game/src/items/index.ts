export interface ItemDef {
  id: string;
  label: string;
  price: number;
  packSize: number;
}

export const ITEM_REGISTRY = new Map<string, ItemDef>([
  ["shield",         { id: "shield",         label: "Shield",                price: 5_000,  packSize: 1 }],
  ["heavy-shield",   { id: "heavy-shield",   label: "Heavy Shield",          price: 12_000, packSize: 1 }],
  ["super-magnetic", { id: "super-magnetic", label: "Super Magnetic Shield", price: 25_000, packSize: 1 }],
  ["force-shield",   { id: "force-shield",   label: "Force Shield",          price: 50_000, packSize: 1 }],
  ["battery",        { id: "battery",        label: "Battery",               price: 2_000,  packSize: 1 }],
  ["parachute",      { id: "parachute",      label: "Parachute",             price: 200,    packSize: 1 }],
  ["patriot",        { id: "patriot",        label: "Patriot",               price: 15_000, packSize: 1 }],
  ["wimpy-pack",     { id: "wimpy-pack",     label: "Wimpy Pack",            price: 5_000,  packSize: 1 }],
  ["fuel-small",     { id: "fuel-small",     label: "Fuel Tank (S)",         price: 500,    packSize: 2 }],
  ["fuel-large",     { id: "fuel-large",     label: "Fuel Tank (L)",         price: 1000,   packSize: 1 }],
]);
