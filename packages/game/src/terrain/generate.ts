import { createPrng } from "../rng/prng";
import type { TerrainOptions } from "../types";
import type { TerrainType } from "@se/shared";
import { CAVE_MIN_GAP, CAVE_EDGE_SEAL } from "@se/shared";

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function buildOctave(seed: string, freq: number, count: number): Float64Array {
  const prng = createPrng(seed);
  const samples = Math.ceil(count / freq) + 1;
  const points = new Float64Array(samples);
  for (let i = 0; i < samples; i++) {
    points[i] = prng.nextFloat() * 2 - 1;
  }
  const out = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const fi = i / freq;
    const i0 = Math.floor(fi);
    const i1 = i0 + 1;
    const t = smoothstep(fi - i0);
    out[i] = lerp(points[i0] as number, points[i1] as number, t);
  }
  return out;
}

function clampHeight(v: number, height: number): number {
  return Math.max(0, Math.min(height, Math.round(v)));
}

function genRandom(opts: TerrainOptions): Int16Array {
  const { seed, width, height } = opts;
  const o1 = buildOctave(seed + "-o1", 200, width);
  const o2 = buildOctave(seed + "-o2", 100, width);
  const o3 = buildOctave(seed + "-o3", 50, width);
  const o4 = buildOctave(seed + "-o4", 25, width);
  const out = new Int16Array(width);
  const baseline = height * 0.65;
  const amplitude = height * 0.20;
  for (let x = 0; x < width; x++) {
    const noise =
      (o1[x] as number) * 0.50 +
      (o2[x] as number) * 0.25 +
      (o3[x] as number) * 0.15 +
      (o4[x] as number) * 0.10;
    out[x] = clampHeight(baseline + noise * amplitude, height);
  }
  return out;
}

function genMountains(opts: TerrainOptions): Int16Array {
  const { seed, width, height } = opts;
  const prng = createPrng(seed + "-peaks");
  const numPeaks = prng.nextInt(2, 4);
  const peaks: Array<{ cx: number; sigma: number; amp: number }> = [];
  for (let i = 0; i < numPeaks; i++) {
    peaks.push({
      cx: (0.10 + prng.nextFloat() * 0.80) * width,
      sigma: (0.05 + prng.nextFloat() * 0.07) * width,
      amp: 0.60 + prng.nextFloat() * 0.40,
    });
  }
  const ridge = buildOctave(seed + "-ridge", 50, width);
  const out = new Int16Array(width);
  for (let x = 0; x < width; x++) {
    let elev = 0;
    for (const p of peaks) {
      const dx = (x - p.cx) / p.sigma;
      elev += p.amp * Math.exp(-dx * dx);
    }
    elev += (ridge[x] as number) * 0.08;
    out[x] = clampHeight(height * 0.85 - elev * height * 0.75, height);
  }
  return out;
}

function genHills(opts: TerrainOptions): Int16Array {
  const { seed, width, height } = opts;
  const prng = createPrng(seed + "-hills");
  const numH = prng.nextInt(2, 3);
  const harmonics: Array<{ freq: number; phase: number; amp: number }> = [];
  for (let i = 0; i < numH; i++) {
    harmonics.push({
      freq: 2 + prng.nextFloat() * 4,
      phase: prng.nextFloat() * Math.PI * 2,
      amp: i === 0 ? 1.0 : 0.40 + prng.nextFloat() * 0.40,
    });
  }
  const totalAmp = harmonics.reduce((s, h) => s + h.amp, 0);
  const out = new Int16Array(width);
  for (let x = 0; x < width; x++) {
    const t = x / (width - 1);
    let elev = 0;
    for (const h of harmonics) {
      elev += (h.amp / totalAmp) * Math.sin(h.freq * Math.PI * 2 * t + h.phase);
    }
    out[x] = clampHeight(height * 0.60 - elev * height * 0.25, height);
  }
  return out;
}

function genValleys(opts: TerrainOptions): Int16Array {
  const { seed, width, height } = opts;
  const noise = buildOctave(seed + "-noise", 100, width);
  const out = new Int16Array(width);
  for (let x = 0; x < width; x++) {
    const t = x / (width - 1);
    const bowl = (2 * t - 1) ** 2;
    out[x] = clampHeight(
      height * (0.30 + bowl * 0.45) + (noise[x] as number) * height * 0.06,
      height,
    );
  }
  return out;
}

function genCliffs(opts: TerrainOptions): Int16Array {
  const { seed, width, height } = opts;
  const prng = createPrng(seed + "-cliffs");
  const numBreaks = prng.nextInt(2, 3);
  const breakXs: number[] = [];
  for (let i = 0; i < numBreaks; i++) {
    breakXs.push(Math.round((0.15 + prng.nextFloat() * 0.70) * width));
  }
  breakXs.sort((a, b) => a - b);
  const levels: number[] = [];
  for (let i = 0; i <= numBreaks; i++) {
    levels.push(Math.round(height * (0.20 + prng.nextFloat() * 0.55)));
  }
  const rampLen = prng.nextInt(6, 10);
  const jitter = buildOctave(seed + "-jitter", 200, width);
  const out = new Int16Array(width);
  for (let x = 0; x < width; x++) {
    // Count how many ramps we've completely passed
    let seg = 0;
    for (const bx of breakXs) {
      if (x > bx + rampLen) seg++;
    }
    let y = levels[seg] as number;
    // Override with ramp interpolation if inside a transition
    for (let bi = 0; bi < breakXs.length; bi++) {
      const bx = breakXs[bi] as number;
      if (x > bx && x <= bx + rampLen) {
        const t = (x - bx) / rampLen;
        y = (levels[bi] as number) + ((levels[bi + 1] as number) - (levels[bi] as number)) * t;
        break;
      }
    }
    // Jitter on plateaus only
    const inRamp = breakXs.some((bx) => x > bx && x <= bx + rampLen);
    if (!inRamp) y += (jitter[x] as number) * 3;
    out[x] = clampHeight(y, height);
  }
  return out;
}

function genCrater(opts: TerrainOptions): Int16Array {
  const { seed, width, height } = opts;
  const prng = createPrng(seed + "-crater");
  const craterRadius = (0.30 + prng.nextFloat() * 0.10) * width;
  const cx = (0.30 + prng.nextFloat() * 0.40) * width;
  const noise = buildOctave(seed + "-jitter", 200, width);
  const out = new Int16Array(width);
  for (let x = 0; x < width; x++) {
    const d = Math.abs(x - cx) / craterRadius;
    let y: number;
    if (d >= 1) {
      y = height * 0.28 + (noise[x] as number) * height * 0.03;
    } else {
      y = height * 0.28 + (1 - d * d) * height * 0.47;
    }
    out[x] = clampHeight(y, height);
  }
  return out;
}

function genSkyHigh(opts: TerrainOptions): Int16Array {
  const { seed, width, height } = opts;
  const prng = createPrng(seed + "-spires");
  const numSpires = prng.nextInt(3, 5);
  const spires: Array<{ cx: number; sigma: number }> = [];
  for (let i = 0; i < numSpires; i++) {
    spires.push({
      cx: (0.08 + prng.nextFloat() * 0.84) * width,
      sigma: (0.03 + prng.nextFloat() * 0.03) * width,
    });
  }
  const floorY = height * 0.80;
  const out = new Int16Array(width);
  for (let x = 0; x < width; x++) {
    let totalSpire = 0;
    for (const s of spires) {
      const dx = (x - s.cx) / s.sigma;
      totalSpire += Math.exp(-dx * dx);
    }
    const spireHeight = Math.min(totalSpire * height * 0.75, floorY - 1);
    out[x] = clampHeight(floorY - spireHeight, height);
  }
  return out;
}

function genPlateau(opts: TerrainOptions): Int16Array {
  const { seed, width, height } = opts;
  const prng = createPrng(seed + "-plateau");
  const leftEdge = Math.round((0.12 + prng.nextFloat() * 0.06) * width);
  const rightEdge = Math.round((1 - 0.12 - prng.nextFloat() * 0.06) * width);
  const plateauY = Math.round(height * (0.18 + prng.nextFloat() * 0.07));
  const floorY = Math.round(height * 0.72);
  const noise = buildOctave(seed + "-top", 200, width);
  const out = new Int16Array(width);
  for (let x = 0; x < width; x++) {
    let y: number;
    if (x <= leftEdge) {
      const t = x / leftEdge;
      y = floorY + (plateauY - floorY) * t;
    } else if (x >= rightEdge) {
      const last = width - 1 - rightEdge;
      const t = last > 0 ? (x - rightEdge) / last : 1;
      y = plateauY + (floorY - plateauY) * t;
    } else {
      y = plateauY + (noise[x] as number) * 2;
    }
    out[x] = clampHeight(y, height);
  }
  return out;
}

function genFlat(opts: TerrainOptions): Int16Array {
  const { width, height } = opts;
  // seed intentionally unused — flat terrain is always uniform
  return new Int16Array(width).fill(Math.round(height * 0.65));
}

const generators: Record<TerrainType, (opts: TerrainOptions) => Int16Array> = {
  mountains: genMountains,
  hills: genHills,
  valleys: genValleys,
  cliffs: genCliffs,
  crater: genCrater,
  "sky-high": genSkyHigh,
  plateau: genPlateau,
  flat: genFlat,
  random: genRandom,
};

export function generateTerrain(opts: TerrainOptions): Int16Array {
  const gen = generators[opts.type] ?? genRandom;
  return gen(opts);
}

/**
 * Cave ceiling for absorb mode: an organic rock roof above the floor with a
 * guaranteed minimum air gap, sealing shut toward the left/right edges so the
 * cave is enclosed. Returns ceiling-y per column (solid for y ≤ ceiling[x]).
 */
export function generateCeiling(opts: TerrainOptions, floor: Int16Array): Int16Array {
  const { seed, width } = opts;
  const o1 = buildOctave(seed + "-c1", 180, width);
  const o2 = buildOctave(seed + "-c2", 70, width);
  const out = new Int16Array(width);
  for (let x = 0; x < width; x++) {
    const noise = (o1[x] as number) * 0.65 + (o2[x] as number) * 0.35; // -1..1
    let gap = CAVE_MIN_GAP + (noise + 1) * 120; // cavern height 280..520
    const edgeDist = Math.min(x, width - 1 - x);
    if (edgeDist < CAVE_EDGE_SEAL) gap *= edgeDist / CAVE_EDGE_SEAL; // seal the sides
    out[x] = Math.max(0, Math.round((floor[x] as number) - gap));
  }
  return out;
}

/**
 * Cosmetic underside profile for the floating island: organic octave noise
 * (like the top surface) plus a U-shaped term so the left/right edges plunge
 * — the island "drops off the face" rather than ending in a vertical cut.
 * Returns bottom-y per column (larger y = deeper).
 */
export function generateUnderside(seed: string, width: number, avgSurface: number): Int16Array {
  const o1 = buildOctave(seed + "-u1", 220, width);
  const o2 = buildOctave(seed + "-u2", 90, width);
  const o3 = buildOctave(seed + "-u3", 40, width);
  const out = new Int16Array(width);
  const baseDepth = 300;
  const amp = 120;
  for (let x = 0; x < width; x++) {
    const t = x / (width - 1);
    const noise = (o1[x] as number) * 0.6 + (o2[x] as number) * 0.3 + (o3[x] as number) * 0.1;
    const edge = Math.pow(Math.abs(t - 0.5) * 2, 2.2) * 260; // plunge toward both edges
    out[x] = Math.round(avgSurface + baseDepth + noise * amp + edge);
  }
  return out;
}
