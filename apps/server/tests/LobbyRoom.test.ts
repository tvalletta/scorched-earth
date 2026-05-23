import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import appConfig from "../src/appConfig";

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  colyseus = await boot(appConfig);
});

afterAll(async () => {
  await colyseus.shutdown();
});

beforeEach(async () => {
  await colyseus.cleanup();
});

describe("LobbyRoom", () => {
  it("client can join the lobby", async () => {
    const room = await colyseus.sdk.joinOrCreate("lobby", {});
    expect(room.sessionId).toBeTruthy();
    await room.leave();
  });

  it("createMatch returns a 6-char code", async () => {
    const room = await colyseus.sdk.joinOrCreate("lobby", {});

    const code = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), 5000);
      room.onMessage("matchCreated", (msg: { code: string }) => {
        clearTimeout(timer);
        resolve(msg.code);
      });
      room.send("createMatch", {});
    });

    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    await room.leave();
  });
});
