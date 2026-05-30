import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import appConfig from "../src/appConfig";

let colyseus: ColyseusTestServer;
beforeAll(async () => { colyseus = await boot(appConfig); });
afterAll(async () => { await colyseus.shutdown(); });
beforeEach(async () => { await colyseus.cleanup(); });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("absorb cave", () => {
  it("absorb mode generates a sealed cave (hasCeiling + ceilingSeed)", async () => {
    const a = await colyseus.sdk.joinOrCreate("match", { code: "CAVE1", nickname: "H", color: "red" });
    await wait(40);
    a.send("configure", { wallModePool: "absorb" });
    await wait(40);
    a.send("ready", {});
    await wait(160);
    expect(a.state.phase).not.toBe("lobby");
    expect(a.state.wallMode).toBe("absorb");
    expect(a.state.hasCeiling).toBe(true);
    expect(a.state.ceilingSeed.length).toBeGreaterThan(0);
    await a.leave();
  });

  it("non-absorb mode has no ceiling", async () => {
    const a = await colyseus.sdk.joinOrCreate("match", { code: "CAVE2", nickname: "H", color: "red" });
    await wait(40);
    a.send("configure", { wallModePool: "none" });
    await wait(40);
    a.send("ready", {});
    await wait(160);
    expect(a.state.wallMode).toBe("none");
    expect(a.state.hasCeiling).toBe(false);
    await a.leave();
  });
});
