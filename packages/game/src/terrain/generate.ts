import { createPrng } from "../rng/prng";
import type { TerrainOptions } from "../types";

// Value-noise with octave summation (cheap, deterministic, sufficient for Phase 1).
// Phase 5 will add type-specific generators per `TerrainOptions.type`.

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
    points[i] = prng.nextFloat() * 2 - 1; // [-1, 1]
  }
  const out = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const fi = i / freq;
    const i0 = Math.floor(fi);
    const i1 = i0 + 1;
    const t = smoothstep(fi - i0);
    // Safe: i0 and i1 are within [0, samples-1] because samples = ceil(count/freq)+1.
    out[i] = lerp(points[i0] as number, points[i1] as number, t);
  }
  return out;
}

export function generateTerrain(opts: TerrainOptions): Int16Array {
  const { seed, width, height } = opts;
  const o1 = buildOctave(seed + "-o1", 200, width);
  const o2 = buildOctave(seed + "-o2", 100, width);
  const o3 = buildOctave(seed + "-o3", 50, width);
  const o4 = buildOctave(seed + "-o4", 25, width);

  const out = new Int16Array(width);
  const baseline = height * 0.65;
  const amplitude = height * 0.20;
  for (let x = 0; x < width; x++) {
    // Safe: all octaves are length `width`, x < width.
    const noise =
      (o1[x] as number) * 0.50 +
      (o2[x] as number) * 0.25 +
      (o3[x] as number) * 0.15 +
      (o4[x] as number) * 0.10;
    let h = baseline + noise * amplitude;
    if (h < 0) h = 0;
    if (h > height) h = height;
    out[x] = Math.round(h);
  }
  return out;
}
