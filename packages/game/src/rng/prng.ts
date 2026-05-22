export interface Prng {
  nextFloat(): number;
  nextInt(min: number, max: number): number;
}

// xoshiro128** — fast, high-quality, deterministic PRNG.
// Reference: https://prng.di.unimi.it/xoshiro128starstar.c

function hashSeed(seed: string): [number, number, number, number] {
  // SplitMix32-based string-to-state expansion.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const state: [number, number, number, number] = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    h = (h + 0x9e3779b9) >>> 0;
    let z = h;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    state[i] = (z ^ (z >>> 16)) >>> 0;
  }
  if (state[0] === 0 && state[1] === 0 && state[2] === 0 && state[3] === 0) {
    state[0] = 1;
  }
  return state;
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

export function createPrng(seed: string): Prng {
  const s = hashSeed(seed);

  function next(): number {
    const result = (Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0);
    const t = (s[1] << 9) >>> 0;
    s[2] = (s[2] ^ s[0]) >>> 0;
    s[3] = (s[3] ^ s[1]) >>> 0;
    s[1] = (s[1] ^ s[2]) >>> 0;
    s[0] = (s[0] ^ s[3]) >>> 0;
    s[2] = (s[2] ^ t) >>> 0;
    s[3] = rotl(s[3], 11);
    return result;
  }

  return {
    nextFloat(): number {
      return (next() >>> 8) / 0x1000000;
    },
    nextInt(min: number, max: number): number {
      const range = max - min + 1;
      return min + Math.floor(this.nextFloat() * range);
    },
  };
}
