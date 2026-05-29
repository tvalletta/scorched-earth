import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadIdentity, saveIdentity } from './identity';
import type { StoredIdentity } from './identity';

const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
});

beforeEach(() => { Object.keys(store).forEach(k => delete store[k]); });

describe('identity persistence', () => {
  it('returns a generated identity when localStorage is empty', () => {
    const id = loadIdentity();
    expect(typeof id.name).toBe('string');
    expect(id.name.length).toBeGreaterThan(0);
    expect(id.hat).toBe('none');
  });

  it('round-trips save and load', () => {
    const saved: StoredIdentity = { name: 'IronWolf', color: 'blue', hat: 'helm' };
    saveIdentity(saved);
    expect(loadIdentity()).toEqual(saved);
  });

  it('falls back to random on malformed JSON', () => {
    store['scorched_identity'] = 'not-json{{';
    const id = loadIdentity();
    expect(typeof id.name).toBe('string');
  });

  it('falls back to random when name is empty string', () => {
    saveIdentity({ name: '', color: 'red', hat: 'none' });
    const id = loadIdentity();
    expect(id.name.length).toBeGreaterThan(0);
  });
});
