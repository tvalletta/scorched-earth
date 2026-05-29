import { describe, it, expect } from 'vitest';
import { generateName } from './nameGenerator';

describe('generateName', () => {
  it('returns a non-empty string with no spaces', () => {
    const name = generateName();
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
    expect(name).not.toContain(' ');
  });

  it('returns different values across calls', () => {
    const names = new Set(Array.from({ length: 20 }, () => generateName()));
    expect(names.size).toBeGreaterThan(1);
  });

  it('matches AdjNoun pattern — starts with uppercase', () => {
    const name = generateName();
    expect(name[0]).toBe(name[0]?.toUpperCase());
  });
});
