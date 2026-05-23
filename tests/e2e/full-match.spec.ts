import { test, expect } from "@playwright/test";

// Phase 1 full-match smoke: two players join the same room, host starts the
// match with a short turn timer, and we verify the room progresses through
// multiple turns (proving turn rotation + autofire + state sync are wired up).
//
// We deliberately do NOT assert that the match reaches the "ended" phase. The
// auto-fire defaults (angle=90, power=500 — straight up) never deal damage to
// the opponent, and the BABY_MISSILE radius (20) on random terrain makes a
// deterministic "match-ending" client-driven shot unreliable in CI. Coverage
// for damage → match-end is provided by the server's vitest suite
// (apps/server/tests/MatchRoom.test.ts).
test("two players join, start, and rotate turns", async ({ browser }) => {
  test.setTimeout(90_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  // Surface console errors for debugging
  a.on("pageerror", (e) => console.log("A pageerror:", e.message));
  b.on("pageerror", (e) => console.log("B pageerror:", e.message));

  await a.goto("/");
  await b.goto("/");

  // Player A creates a match. LobbyScene disposes too quickly to reliably read
  // the code from #status, so wait for MatchScene to load and read roomCode
  // straight from the synced state.
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

  // Player B joins via the same code.
  await b.fill("#nick", "Bob");
  await b.fill("#code", code);
  await b.click("#join");
  await b.waitForFunction(
    () => Boolean((window as unknown as { __room?: unknown }).__room),
    null,
    { timeout: 10_000 },
  );

  // Both clients should see both tanks once Bob's join syncs.
  await a.waitForFunction(
    () => {
      const r = (window as unknown as { __room: { state: { tanks: { size: number } } } }).__room;
      return r.state.tanks.size >= 2;
    },
    null,
    { timeout: 10_000 },
  );
  await b.waitForFunction(
    () => {
      const r = (window as unknown as { __room: { state: { tanks: { size: number } } } }).__room;
      return r.state.tanks.size >= 2;
    },
    null,
    { timeout: 10_000 },
  );

  // Host (Alice) configures a short turn timer so the match progresses fast,
  // then sends ready to start the match.
  await a.evaluate(() => {
    const room = (window as unknown as { __room: { send: (k: string, v: unknown) => void } }).__room;
    room.send("configure", { turnTimerMs: 1500 });
    room.send("ready", {});
  });

  // Match should reach "playing" phase.
  await expect.poll(
    async () => {
      return await a.evaluate(() => {
        const r = (window as unknown as { __room: { state: { phase: string } } }).__room;
        return r.state.phase;
      });
    },
    { timeout: 10_000, intervals: [200] },
  ).toBe("playing");

  // After the turn timer + a couple of auto-fires, state.tick must increase,
  // proving turn rotation and the resolve pipeline are wired together.
  await expect.poll(
    async () => {
      return await a.evaluate(() => {
        const r = (window as unknown as { __room: { state: { tick: number } } }).__room;
        return r.state.tick;
      });
    },
    { timeout: 45_000, intervals: [500] },
  ).toBeGreaterThanOrEqual(2);

  // Both clients should agree on whose turn it is (within a small sync window).
  await expect.poll(
    async () => {
      const aTurn = await a.evaluate(() => {
        const r = (window as unknown as { __room: { state: { currentTurnPlayerId: string } } }).__room;
        return r.state.currentTurnPlayerId;
      });
      const bTurn = await b.evaluate(() => {
        const r = (window as unknown as { __room: { state: { currentTurnPlayerId: string } } }).__room;
        return r.state.currentTurnPlayerId;
      });
      return aTurn === bTurn && aTurn.length > 0;
    },
    { timeout: 10_000, intervals: [200] },
  ).toBe(true);

  await ctxA.close();
  await ctxB.close();
});
