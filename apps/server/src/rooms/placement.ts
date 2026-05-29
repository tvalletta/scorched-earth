import { TERRAIN_WIDTH } from '@se/shared';

const EDGE_MARGIN = 40;

export function randomSlots(
  count: number,
  terrain: Int16Array,
  minBuffer = 120,
): number[] {
  const slots: number[] = [];
  let attempts = 0;
  const MAX_ATTEMPTS = count * 200;

  while (slots.length < count && attempts < MAX_ATTEMPTS) {
    attempts++;
    const x = Math.floor(Math.random() * (TERRAIN_WIDTH - EDGE_MARGIN * 2)) + EDGE_MARGIN;
    if (slots.every(s => Math.abs(s - x) >= minBuffer)) {
      slots.push(x);
    }
  }

  // Fallback: even spacing when random placement is geometrically impossible.
  // At typical max player counts (≤10) with TERRAIN_WIDTH=1600, spacing ≈ 145px > minBuffer=120.
  // For extreme counts, spacing may be less than minBuffer — acceptable since no valid solution exists.
  if (slots.length < count) {
    const spacing = TERRAIN_WIDTH / (count + 1);
    return Array.from({ length: count }, (_, i) => Math.round(spacing * (i + 1)));
  }

  return slots;
}
