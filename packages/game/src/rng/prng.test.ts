import { describe, it, expect } from "vitest";
import { createPrng } from "./prng";

describe("createPrng", () => {
  it("is deterministic for the same seed", () => {
    const a = createPrng("test-seed");
    const b = createPrng("test-seed");
    for (let i = 0; i < 100; i++) {
      expect(a.nextFloat()).toBe(b.nextFloat());
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = createPrng("seed-1");
    const b = createPrng("seed-2");
    const aSeq = Array.from({ length: 10 }, () => a.nextFloat());
    const bSeq = Array.from({ length: 10 }, () => b.nextFloat());
    expect(aSeq).not.toEqual(bSeq);
  });

  it("nextFloat is in [0, 1)", () => {
    const p = createPrng("range-test");
    for (let i = 0; i < 1000; i++) {
      const v = p.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("nextInt(min, max) is inclusive of both bounds", () => {
    const p = createPrng("int-test");
    const values = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = p.nextInt(-10, 10);
      expect(v).toBeGreaterThanOrEqual(-10);
      expect(v).toBeLessThanOrEqual(10);
      expect(Number.isInteger(v)).toBe(true);
      values.add(v);
    }
    expect(values.size).toBeGreaterThan(15);
  });

  it("distribution is reasonably uniform", () => {
    const p = createPrng("uniform-test");
    const buckets = new Array(10).fill(0);
    const N = 10_000;
    for (let i = 0; i < N; i++) {
      buckets[Math.floor(p.nextFloat() * 10)]++;
    }
    for (const c of buckets) {
      expect(c).toBeGreaterThan(N / 10 * 0.85);
      expect(c).toBeLessThan(N / 10 * 1.15);
    }
  });

  it("pick returns an element from the array", () => {
    const p = createPrng("pick-test");
    const arr = ["a", "b", "c", "d"];
    for (let i = 0; i < 200; i++) {
      const v = p.pick(arr);
      expect(arr).toContain(v);
    }
  });

  it("pick covers all elements given enough draws", () => {
    const p = createPrng("pick-coverage");
    const arr = [1, 2, 3, 4, 5];
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(p.pick(arr));
    expect(seen.size).toBe(5);
  });

  it("pick throws on empty array", () => {
    const p = createPrng("pick-empty");
    expect(() => p.pick([])).toThrow("pick: empty array");
  });

  it("pick is deterministic — same seed same sequence", () => {
    const a = createPrng("pick-det");
    const b = createPrng("pick-det");
    const arr = ["x", "y", "z"];
    for (let i = 0; i < 50; i++) {
      expect(a.pick(arr)).toBe(b.pick(arr));
    }
  });
});
