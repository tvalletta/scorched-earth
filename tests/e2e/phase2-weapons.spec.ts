import { test, expect } from "@playwright/test";

// Phase 2 weapon-bar smoke tests.
//
// Each test spins up its own two-player room (Alice = host, Bob = guest) so the
// tests are fully independent and can run in any order.
//
// All state inspection goes through `window.__room` (exposed by MatchScene).
// DOM assertions use `waitForFunction` so they naturally retry until the UI
// catches up to the server state.
//
// IMPORTANT: The WeaponBar is not the only `.interactive` element — WindArrow
// and AimControls share that class. We target the WeaponBar by its distinctive
// inline height (58px) using `querySelectorAll` + `Array.find`.

// ─── Test 1 ──────────────────────────────────────────────────────────────────
// Starter loadout has 2 weapons (baby-missile, missile) → exactly 2 slot divs
// should appear in the weapon-bar strip.
test("weapon bar shows 2 slots in Starter loadout", async ({ browser }) => {
  test.setTimeout(90_000);

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  a.on("pageerror", (e) => console.log("A pageerror:", e.message));
  b.on("pageerror", (e) => console.log("B pageerror:", e.message));

  await a.goto("/");
  await b.goto("/");

  // Alice creates the room.
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

  // Wait for both clients to see 2 tanks.
  await a.waitForFunction(
    () => {
      const r = (window as unknown as { __room: { state: { tanks: { size: number } } } }).__room;
      return r.state.tanks.size >= 2;
    },
    null,
    { timeout: 10_000 },
  );

  // Alice configures Starter loadout and disables the auto-fire timer (0 ms)
  // so the turn never fires on its own and the slot count stays stable.
  await a.evaluate(() => {
    const room = (window as unknown as { __room: { send: (k: string, v: unknown) => void } }).__room;
    room.send("configure", { loadoutId: "starter", turnTimerMs: 0 });
    room.send("ready", {});
  });

  // Wait for "playing" phase.
  await expect.poll(
    async () =>
      a.evaluate(() => {
        const r = (window as unknown as { __room: { state: { phase: string } } }).__room;
        return r.state.phase;
      }),
    { timeout: 10_000, intervals: [200] },
  ).toBe("playing");

  // Wait for the WeaponBar (height:58px) to appear and render exactly 2 slots.
  await a.waitForFunction(
    () => {
      const strip = Array.from(document.querySelectorAll(".interactive"))
        .find((el) => (el as HTMLElement).style.height === "58px")
        ?.children[1];
      return strip != null && strip.children.length === 2;
    },
    null,
    { timeout: 15_000 },
  );

  const slotCount = await a.evaluate(() => {
    const strip = Array.from(document.querySelectorAll(".interactive"))
      .find((el) => (el as HTMLElement).style.height === "58px")
      ?.children[1];
    return strip?.children.length ?? 0;
  });
  expect(slotCount).toBe(2);

  await ctxA.close();
  await ctxB.close();
});

// ─── Test 2 ──────────────────────────────────────────────────────────────────
// Pressing keyboard key "2" while it is Alice's turn should select the Missile
// slot (2nd weapon in Standard loadout / WEAPON_REGISTRY order).
// turnTimerMs is set to 0 so the turn does not auto-fire between setup steps.
test("pressing key 2 selects Missile slot", async ({ browser }) => {
  test.setTimeout(90_000);

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  a.on("pageerror", (e) => console.log("A pageerror:", e.message));
  b.on("pageerror", (e) => console.log("B pageerror:", e.message));

  await a.goto("/");
  await b.goto("/");

  // Alice creates the room.
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

  // Wait for both clients to see 2 tanks.
  await a.waitForFunction(
    () => {
      const r = (window as unknown as { __room: { state: { tanks: { size: number } } } }).__room;
      return r.state.tanks.size >= 2;
    },
    null,
    { timeout: 10_000 },
  );

  // Alice sets Standard loadout (default) with auto-fire disabled (0 ms).
  await a.evaluate(() => {
    const room = (window as unknown as { __room: { send: (k: string, v: unknown) => void } }).__room;
    room.send("configure", { turnTimerMs: 0 });
    room.send("ready", {});
  });

  // Wait for "playing" phase.
  await expect.poll(
    async () =>
      a.evaluate(() => {
        const r = (window as unknown as { __room: { state: { phase: string } } }).__room;
        return r.state.phase;
      }),
    { timeout: 10_000, intervals: [200] },
  ).toBe("playing");

  // Wait until it is Alice's turn (first turn goes to the host — Alice).
  await a.waitForFunction(
    () => {
      const r = (window as unknown as {
        __room: { sessionId: string; state: { currentTurnPlayerId: string } };
      }).__room;
      return r.state.currentTurnPlayerId === r.sessionId;
    },
    null,
    { timeout: 10_000 },
  );

  // Wait for the WeaponBar strip to render at least 1 slot.
  await a.waitForFunction(
    () => {
      const strip = Array.from(document.querySelectorAll(".interactive"))
        .find((el) => (el as HTMLElement).style.height === "58px")
        ?.children[1];
      return strip != null && strip.children.length >= 1;
    },
    null,
    { timeout: 10_000 },
  );

  // Press "2" to select Missile.
  await a.keyboard.press("2");

  // Wait for the server to acknowledge the weapon switch (state-based check).
  await a.waitForFunction(
    () => {
      const r = (window as unknown as {
        __room: {
          sessionId: string;
          state: { tanks: Map<string, { weaponId: string }> };
        };
      }).__room;
      const tank = r.state.tanks.get(r.sessionId);
      return tank?.weaponId === "missile";
    },
    null,
    { timeout: 10_000 },
  );

  // DOM check: after the state update, the WeaponBar re-renders.
  // The 2nd slot (index 1) in the strip should have a non-empty background
  // (browsers expand #1e3a6e → rgb(30, 58, 110) in style.cssText, so we check
  // that slot2.style.background is truthy rather than matching the hex literal).
  await a.waitForFunction(
    () => {
      const strip = Array.from(document.querySelectorAll(".interactive"))
        .find((el) => (el as HTMLElement).style.height === "58px")
        ?.children[1];
      if (!strip) return false;
      const slot2 = strip.children[1] as HTMLElement | undefined;
      // Active slot has inline background; inactive slots have no inline background.
      return Boolean(slot2?.style.background);
    },
    null,
    { timeout: 10_000 },
  );

  const slot2Active = await a.evaluate(() => {
    const strip = Array.from(document.querySelectorAll(".interactive"))
      .find((el) => (el as HTMLElement).style.height === "58px")
      ?.children[1];
    const slot2 = strip?.children[1] as HTMLElement | undefined;
    // Background is set to rgb(30,58,110) on the active slot.
    return Boolean(slot2?.style.background);
  });
  expect(slot2Active).toBe(true);

  await ctxA.close();
  await ctxB.close();
});

// ─── Test 3 ──────────────────────────────────────────────────────────────────
// Firing Missile should decrement its ammo from 5 to 4 in both the server
// state and the weapon-bar DOM.
// turnTimerMs is set to 0 so no further auto-fires occur after Alice fires,
// keeping the ammo display stable for the DOM assertion.
test("firing Missile decrements ammo from 5 to 4", async ({ browser }) => {
  test.setTimeout(90_000);

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  a.on("pageerror", (e) => console.log("A pageerror:", e.message));
  b.on("pageerror", (e) => console.log("B pageerror:", e.message));

  await a.goto("/");
  await b.goto("/");

  // Alice creates the room.
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

  // Wait for both clients to see 2 tanks.
  await a.waitForFunction(
    () => {
      const r = (window as unknown as { __room: { state: { tanks: { size: number } } } }).__room;
      return r.state.tanks.size >= 2;
    },
    null,
    { timeout: 10_000 },
  );

  // Alice sets Standard loadout with auto-fire disabled (turnTimerMs: 0).
  // This prevents any further auto-fires after Alice's manual shot, keeping
  // the ammo count stable for the DOM assertion.
  await a.evaluate(() => {
    const room = (window as unknown as { __room: { send: (k: string, v: unknown) => void } }).__room;
    room.send("configure", { turnTimerMs: 0 });
    room.send("ready", {});
  });

  // Wait for "playing" phase.
  await expect.poll(
    async () =>
      a.evaluate(() => {
        const r = (window as unknown as { __room: { state: { phase: string } } }).__room;
        return r.state.phase;
      }),
    { timeout: 10_000, intervals: [200] },
  ).toBe("playing");

  // Wait until it is Alice's turn.
  await a.waitForFunction(
    () => {
      const r = (window as unknown as {
        __room: { sessionId: string; state: { currentTurnPlayerId: string } };
      }).__room;
      return r.state.currentTurnPlayerId === r.sessionId;
    },
    null,
    { timeout: 10_000 },
  );

  // Press "2" to select Missile, then wait for the server to confirm weaponId.
  await a.keyboard.press("2");
  await a.waitForFunction(
    () => {
      const r = (window as unknown as {
        __room: {
          sessionId: string;
          state: { tanks: Map<string, { weaponId: string }> };
        };
      }).__room;
      const tank = r.state.tanks.get(r.sessionId);
      return tank?.weaponId === "missile";
    },
    null,
    { timeout: 10_000 },
  );

  // Record the tick before firing so we can detect turn resolution.
  const tickBefore = await a.evaluate(() => {
    const r = (window as unknown as { __room: { state: { tick: number } } }).__room;
    return r.state.tick;
  });

  // Fire — angle 90° (straight up), power 500 — safe miss that never kills Bob.
  await a.evaluate(() => {
    const room = (window as unknown as { __room: { send: (k: string, v: unknown) => void } }).__room;
    room.send("fire", { angle: 90, power: 500 });
  });

  // Wait for the tick to increment (confirms the server finished resolving the turn).
  await a.waitForFunction(
    (tickBefore) => {
      const r = (window as unknown as { __room: { state: { tick: number } } }).__room;
      return r.state.tick > (tickBefore as number);
    },
    tickBefore,
    { timeout: 30_000 },
  );

  // State check: Missile ammo should be 4.
  const missileAmmo = await a.evaluate(() => {
    const r = (window as unknown as {
      __room: {
        sessionId: string;
        state: { tanks: Map<string, { inventory: Map<string, number> }> };
      };
    }).__room;
    const tank = r.state.tanks.get(r.sessionId);
    return tank?.inventory.get("missile") ?? null;
  });
  expect(missileAmmo).toBe(4);

  // DOM check: the 2nd slot's ammo text should read "4".
  // With turnTimerMs=0 no further turns fire, so the count stays at 4.
  // The last child of each slot div is always the ammo element.
  await a.waitForFunction(
    () => {
      const strip = Array.from(document.querySelectorAll(".interactive"))
        .find((el) => (el as HTMLElement).style.height === "58px")
        ?.children[1];
      if (!strip || strip.children.length < 2) return false;
      const slot2 = strip.children[1] as HTMLElement;
      const ammoEl = slot2.lastElementChild as HTMLElement | null;
      return ammoEl?.textContent === "4";
    },
    null,
    { timeout: 10_000 },
  );

  await ctxA.close();
  await ctxB.close();
});
