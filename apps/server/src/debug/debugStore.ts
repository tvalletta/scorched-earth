import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { LogEvent } from "@se/shared";

export interface DebugBundle {
  id: string;
  reason: "uncaught" | "manual" | "invariant";
  detail?: string;
  ts: number;
  build: string;
  userAgent: string;
  url: string;
  matchId?: string;
  sessionId?: string;
  phase?: string;
  logs: LogEvent[];
  state?: unknown;
  screenshotPng?: string; // base64 (no data: prefix)
}

export interface RetentionOpts { dir: string; maxCount?: number; maxDays?: number; maxMb?: number; }

export class DebugStore {
  private dir: string;
  private maxCount: number;
  private maxDays: number;
  private maxMb: number;
  private saveSeq = 0;

  constructor(opts: RetentionOpts) {
    this.dir = opts.dir;
    this.maxCount = opts.maxCount ?? 200;
    this.maxDays = opts.maxDays ?? 7;
    this.maxMb = opts.maxMb ?? 500;
    mkdirSync(this.dir, { recursive: true });
    this.prune();
  }

  save(bundle: DebugBundle): void {
    const { screenshotPng, ...meta } = bundle;
    // Persist save order so retention is deterministic even when mtimes tie.
    const withSeq = { ...meta, _seq: ++this.saveSeq };
    writeFileSync(join(this.dir, `${bundle.id}.json`), JSON.stringify(withSeq));
    if (screenshotPng) {
      writeFileSync(join(this.dir, `${bundle.id}.png`), Buffer.from(screenshotPng, "base64"));
    }
    this.prune();
  }

  get(id: string): unknown | null {
    try { return JSON.parse(readFileSync(join(this.dir, `${id}.json`), "utf8")); }
    catch { return null; }
  }

  private entries(): Array<{ id: string; mtime: number; size: number; seq: number }> {
    const map = new Map<string, { id: string; mtime: number; size: number; seq: number }>();
    for (const f of readdirSync(this.dir)) {
      const m = f.match(/^(.*)\.(json|png)$/);
      if (!m) continue;
      const id = m[1]!;
      const full = join(this.dir, f);
      const st = statSync(full);
      const cur = map.get(id) ?? { id, mtime: 0, size: 0, seq: 0 };
      cur.mtime = Math.max(cur.mtime, st.mtimeMs);
      cur.size += st.size;
      if (f.endsWith(".json")) {
        try { cur.seq = JSON.parse(readFileSync(full, "utf8"))._seq ?? 0; } catch { /* keep 0 */ }
      }
      map.set(id, cur);
    }
    return [...map.values()];
  }

  // Newest first: by mtime desc, then save-seq desc (deterministic tiebreak).
  private newestFirst(): Array<{ id: string; mtime: number; size: number; seq: number }> {
    return this.entries().sort((a, b) => b.mtime - a.mtime || b.seq - a.seq);
  }

  private prune(): void {
    // age
    const cutoff = Date.now() - this.maxDays * 86400_000;
    for (const e of this.newestFirst()) if (e.mtime < cutoff) this.remove(e.id);
    // count
    for (const e of this.newestFirst().slice(this.maxCount)) this.remove(e.id);
    // size
    const ids = this.newestFirst();
    let total = ids.reduce((s, e) => s + e.size, 0);
    const cap = this.maxMb * 1024 * 1024;
    for (let i = ids.length - 1; i >= 0 && total > cap; i--) { this.remove(ids[i]!.id); total -= ids[i]!.size; }
  }

  private remove(id: string): void {
    for (const ext of [".json", ".png"]) {
      try { rmSync(join(this.dir, `${id}${ext}`)); } catch { /* already gone */ }
    }
  }
}
