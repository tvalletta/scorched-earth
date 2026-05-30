import { TERRAIN_WIDTH, CAVE_EDGE_SEAL } from '@se/shared';

const EDGE_MARGIN = 40;
const CAVE_MIN_HEADROOM = 90; // floor − ceiling needed for a tank to sit

export interface SlotOptions {
  /** When present, placement stays inside the open cave band with headroom. */
  ceiling?: Int16Array;
}

export function randomSlots(
  count: number,
  terrain: Int16Array,
  minBuffer = 120,
  opts: SlotOptions = {},
): number[] {
  const ceiling = opts.ceiling;
  const loEdge = ceiling ? CAVE_EDGE_SEAL + EDGE_MARGIN : EDGE_MARGIN;
  const hiEdge = TERRAIN_WIDTH - loEdge;

  const valid = (x: number): boolean => {
    if (!ceiling) return true;
    return (terrain[x] ?? 0) - (ceiling[x] ?? 0) >= CAVE_MIN_HEADROOM;
  };

  const slots: number[] = [];
  let attempts = 0;
  const MAX_ATTEMPTS = count * 300;
  while (slots.length < count && attempts < MAX_ATTEMPTS) {
    attempts++;
    const x = Math.floor(Math.random() * (hiEdge - loEdge)) + loEdge;
    if (valid(x) && slots.every((s) => Math.abs(s - x) >= minBuffer)) {
      slots.push(x);
    }
  }

  // Fallback: even spacing across the usable band when random placement fails.
  if (slots.length < count) {
    const spacing = (hiEdge - loEdge) / (count + 1);
    return Array.from({ length: count }, (_, i) => Math.round(loEdge + spacing * (i + 1)));
  }

  return slots;
}
