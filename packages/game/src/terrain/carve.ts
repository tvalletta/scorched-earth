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
      // When the blast center is more than 2 radii below a column's surface
      // (i.e. the column is a cliff far above the blast), cap the surface drop
      // to one radius. Prevents shooting at a cliff base from removing the
      // entire cliff top dozens of pixels above the explosion.
      if (cy - currentSurface > 2 * radius) {
        newY = Math.min(newY, Math.round(currentSurface + radius));
      }
      if (newY < 0) newY = 0;
      if (newY > maxY) newY = maxY;
      terrain[i] = newY;
    }
  }
}

/**
 * Carves a crater into the cave ceiling. The ceiling is the underside of the
 * upper rock (solid for y ≤ ceiling[x]); a hit removes rock so the ceiling
 * recedes UPWARD — the mirror of carveInPlace's downward floor crater.
 */
export function carveCeilingInPlace(ceiling: Int16Array, op: CarveOp): void {
  const { x: cx, y: cy, radius } = op;
  const xMin = Math.max(0, Math.floor(cx - radius));
  const xMax = Math.min(ceiling.length - 1, Math.ceil(cx + radius));
  for (let i = xMin; i <= xMax; i++) {
    const dx = i - cx;
    const dy2 = radius * radius - dx * dx;
    if (dy2 < 0) continue;
    const circleTop = cy - Math.sqrt(dy2);
    const currentCeiling = ceiling[i] as number;
    if (circleTop < currentCeiling) {
      ceiling[i] = Math.max(0, Math.round(circleTop));
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

export interface SettleOptions {
  slopeThreshold?: number;
  maxPasses?: number;
}

/**
 * Redistributes terrain height after a blast. Scans adjacent column pairs;
 * when the height difference exceeds slopeThreshold, soil slides from the
 * higher column to the lower until equilibrium or maxPasses is reached.
 *
 * Screen coords: smaller y = higher on screen. "Higher column" = smaller y = cliff.
 * Sliding: cliff y increases (surface lowers), valley y decreases (surface rises).
 *
 * Returns snapshot of terrain[lo..hi] BEFORE settling (for DirtParticles comparison).
 */
export function settleInPlace(
  terrain: Int16Array,
  xMin: number,
  xMax: number,
  options: SettleOptions = {},
): Int16Array {
  const SLOPE_THRESHOLD = options.slopeThreshold ?? 80;
  const MAX_PASSES = options.maxPasses ?? 30;

  const lo = Math.max(0, xMin - 5);
  const hi = Math.min(terrain.length - 1, xMax + 5);

  const before = terrain.slice(lo, hi + 1);

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let anyChange = false;
    for (let x = lo; x < hi; x++) {
      const left = terrain[x] as number;
      const right = terrain[x + 1] as number;
      const diff = right - left;

      if (Math.abs(diff) > SLOPE_THRESHOLD) {
        const slide = Math.ceil((Math.abs(diff) - SLOPE_THRESHOLD) / 2);
        if (slide === 0) continue;
        if (diff > 0) {
          terrain[x] = left + slide;
          terrain[x + 1] = right - slide;
        } else {
          terrain[x] = left - slide;
          terrain[x + 1] = right + slide;
        }
        anyChange = true;
      }
    }
    if (!anyChange) break;
  }

  return before;
}
