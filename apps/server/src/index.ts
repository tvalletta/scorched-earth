import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";

const PORT = Number(process.env.PORT ?? 2567);

async function main() {
  const gameServer = new Server({
    transport: new WebSocketTransport(),
  });

  // Rooms are registered in subsequent tasks.

  await gameServer.listen(PORT);
  console.log(`[server] listening on ws://localhost:${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
