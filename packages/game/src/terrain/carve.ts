import type { CarveOp } from "../types";

export interface CarveOptions {
  terrainHeight?: number;
}

/**
 * Lowers terrain columns affected by a circular explosion.
 *
 * For each column within [x - radius, x + radius]:
 *  - Compute the vertical extent of the circle at that column.
 *  - If the BOTTOM of the circle is BELOW the current surface, the surface
 *    drops down to the bottom of the circle.
 *  - If the TOP of the circle is below the surface, no change (no overhangs).
 */
export function carveInPlace(
  terrain: Int16Array,
  op: CarveOp,
  options: CarveOptions = {},
): void {
  const { x: cx, y: cy, radius } = op;
  const xMin = Math.max(0, Math.floor(cx - radius));
  const xMax = Math.min(terrain.length - 1, Math.ceil(cx + radius));
  const maxY = options.terrainHeight ?? Number.POSITIVE_INFINITY;

  for (let i = xMin; i <= xMax; i++) {
    const dx = i - cx;
    const dy2 = radius * radius - dx * dx;
    if (dy2 < 0) continue;
    const dy = Math.sqrt(dy2);
    const circleTop = cy - dy;
    const circleBottom = cy + dy;
    const currentSurface = terrain[i] as number;

    if (circleTop > currentSurface) continue;

    if (circleBottom > currentSurface) {
      let newY = Math.round(circleBottom);
      if (newY < 0) newY = 0;
      if (newY > maxY) newY = maxY;
      terrain[i] = newY;
    }
  }
}

export function applyCarve(
  terrain: Int16Array,
  op: CarveOp,
  options: CarveOptions = {},
): Int16Array {
  const out = new Int16Array(terrain);
  carveInPlace(out, op, options);
  return out;
}
