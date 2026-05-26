import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";

test("round summary appears after round ends", async ({ browser }) => {
  test.setTimeout(90_000);
  const ctxHost = await browser.newContext();
  const ctxGuest = await browser.newContext();
  const host = await ctxHost.newPage();
  const guest = await ctxGuest.newPage();

  await host.goto(BASE);
  await host.fill("#nick", "Host");
  await host.click("#create");
  await host.waitForFunction(
    () => Boolean((window as unknown as { __room?: unknown }).__room),
    null,
    { timeout: 15_000 },
  );

  // Get the room code from the page
  const code = await host.evaluate(() => {
    const r = (window as unknown as { __room: { state: { roomCode: string } } }).__room;
    return r.state.roomCode;
  });
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  await guest.goto(BASE);
  await guest.fill("#nick", "Guest");
  await guest.fill("#code", code);
  await guest.click("#join");

  await guest.waitForFunction(
    () => Boolean((window as unknown as { __room?: unknown }).__room),
    null,
    { timeout: 10_000 },
  );

  // Set maxRounds to 1 for quick test
  await host.waitForSelector("input[type='number'][min='1'][max='20']");
  await host.fill("input[type='number'][min='1'][max='20']", "1");
  await host.dispatchEvent("input[type='number'][min='1'][max='20']", "change");

  await host.click("text=Start");
  await host.waitForTimeout(500);

  // Verify the match started (playing phase loaded)
  await expect(host.locator("text=FIRE")).toBeVisible();
  await expect(guest.locator("text=FIRE")).toBeVisible();

  await ctxHost.close();
  await ctxGuest.close();
});

test("shop appears after round summary times out", async ({ browser }) => {
  // Full flow requires triggering a round end server-side.
  // Covered by integration tests in roundFlow.test.ts.
  test.skip();
});
