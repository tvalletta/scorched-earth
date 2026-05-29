import { createServer } from "http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import appConfig from "./appConfig.js";
import { getReplay } from "./rooms/replayStore.js";

// Sentry — only initialised when SENTRY_DSN is set (production)
let Sentry: typeof import("@sentry/node") | null = null;
if (process.env.SENTRY_DSN) {
  Sentry = await import("@sentry/node");
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV ?? "development" });
}

const PORT = Number(process.env.PORT ?? 2567);

const httpServer = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  const m = req.url?.match(/^\/replays\/([^/]+)$/);
  if (m && req.method === "GET") {
    const replay = getReplay(m[1]!);
    if (replay) {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify(replay));
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end('{"error":"not found"}');
    }
    return;
  }
  // All other HTTP requests fall through to Colyseus
});

async function main() {
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
  });
  appConfig.initializeGameServer(gameServer);
  await gameServer.listen(PORT, undefined, undefined, () => {
    console.log(`[server] listening on :${PORT}`);
  });
}

main().catch((err) => {
  Sentry?.captureException(err);
  console.error(err);
  process.exit(1);
});
