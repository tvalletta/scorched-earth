import { describe, it, expect } from "vitest";
import { generateRoomCode } from "../src/codeGen";

describe("generateRoomCode", () => {
  it("returns a 6-char [A-Z0-9] code", () => {
    const code = generateRoomCode(new Set());
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
  });

  it("avoids codes in the existing set", () => {
    const existing = new Set<string>();
    const codes = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const c = generateRoomCode(existing);
      expect(existing.has(c)).toBe(false);
      existing.add(c);
      codes.add(c);
    }
    expect(codes.size).toBe(1000);
  });

  it("does not throw when called repeatedly", () => {
    const existing = new Set<string>();
    expect(() => generateRoomCode(existing)).not.toThrow();
  });
});
