import { cli, type Options } from "@colyseus/loadtest";
import { Client } from "@colyseus/sdk";

cli(async (options: Options) => {
  const client = new Client(options.endpoint);

  // Pair clients by clientId: even = host, odd = joiner
  const isHost = options.clientId % 2 === 0;
  const roomCode = `LOAD${Math.floor(options.clientId / 2).toString().padStart(4, "0")}`;

  let room: Awaited<ReturnType<typeof client.joinOrCreate>>;
  try {
    room = await client.joinOrCreate("match", {
      code: roomCode,
      nickname: `Bot${options.clientId}`,
      color: "red",
      hat: "none",
    });
  } catch (e) {
    console.error(`[client ${options.clientId}] join failed:`, e);
    return;
  }

  // Host starts the match after a short wait for the joiner to connect
  if (isHost) {
    await new Promise((r) => setTimeout(r, 500));
    room.send("ready", {});
  }

  // Wait for game to end, fire on our turns
  await new Promise<void>((resolve) => {
    room.onStateChange((state: { phase: string; currentTurnPlayerId: string }) => {
      if (state.phase === "playing" && state.currentTurnPlayerId === room.sessionId) {
        setTimeout(() => {
          if (state.phase === "playing" && state.currentTurnPlayerId === room.sessionId) {
            room.send("fire", {
              angle: 30 + Math.random() * 120,
              power: 200 + Math.random() * 600,
            });
          }
        }, 300 + Math.random() * 400);
      }
      if (state.phase === "ended") {
        room.leave().then(resolve).catch(resolve);
      }
    });

    // Safety timeout — leave after 5 minutes regardless
    setTimeout(() => { room.leave().then(resolve).catch(resolve); }, 5 * 60 * 1000);
  });
});
