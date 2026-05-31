import { describe, it, expect, vi } from "vitest";
import { RingBuffer, createLogger } from "./log";

describe("RingBuffer", () => {
  it("keeps only the last N entries", () => {
    const rb = new RingBuffer(3);
    for (let i = 0; i < 5; i++) rb.push({ t: i, level: "info", scope: "x", msg: String(i) });
    expect(rb.snapshot().map((e) => e.msg)).toEqual(["2", "3", "4"]);
  });
});

describe("createLogger", () => {
  it("respects the level threshold and writes to the ring", () => {
    const rb = new RingBuffer(10);
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const log = createLogger("net", { level: "info", ring: rb });
    log.debug("hidden");
    log.info("shown", { a: 1 });
    expect(rb.snapshot().map((e) => e.msg)).toEqual(["shown"]);
    expect(rb.snapshot()[0]!.scope).toBe("net");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("child() prefixes scope", () => {
    const rb = new RingBuffer(10);
    const log = createLogger("room", { level: "debug", ring: rb }).child("turn");
    log.debug("hi");
    expect(rb.snapshot()[0]!.scope).toBe("room:turn");
  });
});
