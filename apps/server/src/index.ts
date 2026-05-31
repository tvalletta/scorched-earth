import { createServer } from "http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import appConfig from "./appConfig.js";
import { getReplay } from "./rooms/replayStore.js";
import { DebugStore } from "./debug/debugStore.js";

interface SentryClient {
  captureException(err: unknown): void;
  captureMessage(msg: string, opts?: { level?: string; extra?: Record<string, unknown> }): void;
}

// Module-scoped Sentry reference — set during init before main() runs
let Sentry: SentryClient | null = null;

// Conditionally init Sentry — only when SENTRY_DSN is set (production)
if (process.env.SENTRY_DSN) {
  const s = await import("@sentry/node");
  s.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV ?? "development" });
  Sentry = s as unknown as SentryClient;
}

const PORT = Number(process.env.PORT ?? 2567);

const DEBUG_ENABLED =
  (process.env.DEBUG_CAPTURE_ENABLED ?? (process.env.NODE_ENV !== "production" ? "1" : "0")) === "1";
const debugStore = DEBUG_ENABLED
  ? new DebugStore({
      dir: process.env.DEBUG_DIR ?? "./data/debug",
      maxCount: Number(process.env.DEBUG_RETENTION_MAX ?? 200),
      maxDays: Number(process.env.DEBUG_RETENTION_DAYS ?? 7),
      maxMb: Number(process.env.DEBUG_RETENTION_MB ?? 500),
    })
  : null;

const DEBUG_BODY_LIMIT = 8 * 1024 * 1024; // 8 MB

const httpServer = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", build: process.env.BUILD_ID ?? "dev" }));
    return;
  }
  const mReplay = req.url?.match(/^\/replays\/([^/]+)$/);
  if (mReplay && req.method === "GET") {
    const replay = getReplay(mReplay[1]!);
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
  if (req.method === "OPTIONS" && (req.url === "/debug" || req.url?.startsWith("/debug/"))) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }
  if (req.method === "POST" && req.url === "/debug") {
    if (!debugStore) {
      res.writeHead(404, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end('{"error":"debug capture disabled"}');
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > DEBUG_BODY_LIMIT) {
        req.destroy();
        res.writeHead(413, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end('{"error":"payload too large"}');
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      let bundle: ReturnType<typeof JSON.parse>;
      try {
        bundle = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        res.writeHead(400, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end('{"error":"invalid json"}');
        return;
      }
      debugStore.save(bundle);
      Sentry?.captureMessage("[debug-bundle] " + bundle.reason, {
        level: bundle.reason === "manual" ? "info" : "warning",
        extra: {
          id: bundle.id,
          matchId: bundle.matchId,
          phase: bundle.phase,
          detail: bundle.detail,
        },
      });
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify({ ok: true, id: bundle.id }));
    });
    req.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(400, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end('{"error":"request error"}');
      }
    });
    return;
  }
  const mDebug = req.url?.match(/^\/debug\/([^/]+)$/);
  if (mDebug && req.method === "GET") {
    if (!debugStore) {
      res.writeHead(404, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end('{"error":"debug capture disabled"}');
      return;
    }
    const entry = debugStore.get(mDebug[1]!);
    if (entry) {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify(entry));
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end('{"error":"not found"}');
    }
    return;
  }
  // Unmatched path
  res.writeHead(404);
  res.end();
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
  debugStore?.save({
    id: `${Date.now()}-srv`,
    reason: "uncaught",
    detail: String((err as Error)?.message ?? err),
    ts: Date.now(),
    build: process.env.BUILD_ID ?? "dev",
    userAgent: "server",
    url: "server",
    logs: [],
  });
  console.error(err);
  process.exit(1);
});
