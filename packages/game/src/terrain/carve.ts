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
 *
 * This correctly handles near-vertical walls: a column whose terrain sits
 * above the explosion center (small surface Y) still gets carved as long as
 * the circle's bottom reaches into the dirt (circleBottom > currentSurface).
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

  // Don't carve if the top of the circle is at or below the lowest (deepest)
  // surface in the blast span. In screen coordinates, lower Y = higher ground,
  // so the "deepest" (most underground) surface has the HIGHEST Y value.
  // If even the highest surface Y is still above the circle's top, nothing can
  // be carved (no overhangs supported).
  let maxSurfaceInSpan = 0;
  for (let i = xMin; i <= xMax; i++) {
    const s = terrain[i] as number;
    if (s > maxSurfaceInSpan) maxSurfaceInSpan = s;
  }
  if (cy - radius >= maxSurfaceInSpan) return; // entirely underground

  for (let i = xMin; i <= xMax; i++) {
    const dx = i - cx;
    const dy2 = radius * radius - dx * dx;
    if (dy2 < 0) continue;
    const dy = Math.sqrt(dy2);
    const circleBottom = cy + dy;
    const currentSurface = terrain[i] as number;

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
