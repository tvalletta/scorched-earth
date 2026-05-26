export interface ItemDef {
  id: string;
  label: string;
  price: number;
  packSize: number;
}

export const ITEM_REGISTRY = new Map<string, ItemDef>([
  ["force-field",      { id: "force-field",      label: "Force Field",      price: 1500, packSize: 1 }],
  ["deflector-shield", { id: "deflector-shield", label: "Deflector Shield", price: 3000, packSize: 1 }],
  ["magnetic-shield",  { id: "magnetic-shield",  label: "Magnetic Shield",  price: 3500, packSize: 1 }],
  ["reactive-armor",   { id: "reactive-armor",   label: "Reactive Armor",   price: 2000, packSize: 3 }],
  ["auto-shield",      { id: "auto-shield",      label: "Auto Shield",      price: 2500, packSize: 2 }],
  ["battery",          { id: "battery",          label: "Battery",          price: 1000, packSize: 2 }],
  ["parachute",        { id: "parachute",        label: "Parachute",        price: 500,  packSize: 3 }],
  ["patriot",          { id: "patriot",          label: "Patriot",          price: 3000, packSize: 1 }],
  ["fuel-small",       { id: "fuel-small",       label: "Fuel Tank (S)",    price: 500,  packSize: 2 }],
  ["fuel-large",       { id: "fuel-large",       label: "Fuel Tank (L)",    price: 1000, packSize: 1 }],
]);
