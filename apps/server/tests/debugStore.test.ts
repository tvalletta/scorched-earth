import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readdirSync, utimesSync } from "node:fs";
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

  it("deletes bundles older than maxDays", () => {
    const store = new DebugStore({ dir, maxCount: 9999, maxDays: 7, maxMb: 9999 });
    store.save(bundle("old"));
    const past = (Date.now() - 10 * 86400_000) / 1000; // 10 days ago, in seconds
    utimesSync(join(dir, "old.json"), past, past);
    store.save(bundle("fresh")); // triggers prune
    const jsons = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    expect(jsons).toEqual(["fresh.json"]);
  });

  it("evicts oldest bundles when total size exceeds maxMb", () => {
    const big = Buffer.alloc(60 * 1024, 1).toString("base64"); // ~60KB decoded per png
    const store = new DebugStore({ dir, maxCount: 9999, maxDays: 9999, maxMb: 0.1 }); // 100KB cap
    store.save({ ...bundle("a"), screenshotPng: big });
    store.save({ ...bundle("b"), screenshotPng: big });
    // ~120KB of pngs > 100KB cap → oldest ("a") evicted, "b" kept
    const pngs = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
    expect(pngs).toEqual(["b.png"]);
  });
});
