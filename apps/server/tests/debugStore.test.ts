import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DebugStore } from "../src/debug/debugStore";

function bundle(id: string) {
  return { id, reason: "manual" as const, ts: Date.now(), build: "test",
    userAgent: "x", url: "http://x", logs: [], screenshotPng: undefined };
}

describe("DebugStore retention", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "dbg-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("keeps only the newest maxCount bundles", () => {
    const store = new DebugStore({ dir, maxCount: 3, maxDays: 9999, maxMb: 9999 });
    for (let i = 0; i < 6; i++) store.save(bundle(`id${i}`));
    const jsons = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    expect(jsons.length).toBe(3);
    expect(jsons).toEqual(["id3.json", "id4.json", "id5.json"]);
  });
});
