import { test, expect } from "@playwright/test";

test("player drops and reconnects within grace", async ({ browser }) => {
  test.setTimeout(90_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await a.goto("/");
  await b.goto("/");

  // Alice creates a match.
  await a.fill("#nick", "Alice");
  await a.click("#create");
  await a.waitForFunction(
    () => Boolean((window as unknown as { __room?: unknown }).__room),
    null,
    { timeout: 15_000 },
  );
  const code = await a.evaluate(() => {
    const r = (window as unknown as { __room: { state: { roomCode: string } } }).__room;
    return r.state.roomCode;
  });
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  // Bob joins.
  await b.fill("#nick", "Bob");
  await b.fill("#code", code);
  await b.click("#join");
  await b.waitForFunction(
    () => Boolean((window as unknown as { __room?: unknown }).__room),
    null,
    { timeout: 10_000 },
  );

  // Both clients see both tanks.
  await a.waitForFunction(
    () => {
      const r = (window as unknown as { __room: { state: { tanks: { size: number } } } }).__room;
      return r.state.tanks.size >= 2;
    },
    null,
    { timeout: 10_000 },
  );

  // Host starts the match (use default turn timer so Bob's tank doesn't get
  // taken out by an auto-fire before we drop him).
  await a.evaluate(() => {
    (window as unknown as { __room: { send: (k: string, v: unknown) => void } }).__room.send("ready", {});
  });
  await a.waitForTimeout(500);

  // Drop Bob's connection by closing his context.
  await ctxB.close();
  // Give the server's onLeave handler time to mark Bob's tank disconnected.
  await a.waitForTimeout(2000);

  // Bob's tank should now be marked disconnected (connected=false) on Alice's
  // room state. We don't assert the tank is removed: Phase 1 uses Colyseus's
  // reconnect grace, so the tank stays in state with connected=false.
  const bConnected = await a.evaluate(() => {
    type RoomLike = {
      state: { tanks: Map<string, { connected: boolean; nickname: string }> };
    };
    const r = (window as unknown as { __room: RoomLike }).__room;
    for (const t of r.state.tanks.values()) {
      if (t.nickname === "Bob") return t.connected;
    }
    return null;
  });
  expect(bConnected).toBe(false);

  // NOTE: Phase 1's join flow creates a NEW tank rather than reconnecting an
  // existing session via a reconnect token. True reconnection-by-token is
  // deferred to Phase 11. This E2E therefore covers only the Phase 1 contract:
  // dropping a client marks their tank `connected=false` within the grace
  // window. Task 21's host-migration test (apps/server/tests/MatchRoom.test.ts)
  // covers the server-side leave / migration behavior in unit form.

  await ctxA.close();
});
