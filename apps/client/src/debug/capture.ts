import type { Application } from "pixi.js";
import { RingBuffer, type LogEvent } from "@se/shared";

declare const __BUILD_ID__: string;
declare const __SERVER_URL__: string;

export const debugRing = new RingBuffer(300);

interface CaptureCtx {
  app?: Application;
  matchId?: () => string | undefined;
  sessionId?: () => string | undefined;
  phase?: () => string | undefined;
  stateSnapshot?: () => unknown;
}
let ctx: CaptureCtx = {};
export function setCaptureContext(c: CaptureCtx): void { ctx = { ...ctx, ...c }; }

const lastByReason = new Map<string, number>();

export async function capture(reason: "uncaught" | "manual" | "invariant", detail?: string): Promise<void> {
  const key = `${reason}:${detail ?? ""}`;
  const now = Date.now();
  if (reason === "invariant" && now - (lastByReason.get(key) ?? 0) < 10_000) return; // rate limit
  lastByReason.set(key, now);

  let screenshotPng: string | undefined;
  try {
    if (ctx.app) {
      // renderer.extract is added dynamically by pixi.js/extract; cast to access it at runtime
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const url: string = await (ctx.app.renderer as any).extract.base64(ctx.app.stage);
      screenshotPng = url.split(",")[1]; // strip data: prefix
    }
  } catch { /* WebGL context loss — omit screenshot */ }

  const bundle = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    reason, detail, ts: now,
    build: typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev",
    userAgent: navigator.userAgent, url: location.href,
    matchId: ctx.matchId?.(), sessionId: ctx.sessionId?.(), phase: ctx.phase?.(),
    logs: debugRing.snapshot() as LogEvent[],
    state: ctx.stateSnapshot?.(),
    screenshotPng,
  };

  const http = (typeof __SERVER_URL__ !== "undefined" ? __SERVER_URL__ : "ws://localhost:2567").replace(/^ws/, "http");
  try {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 5000);
    await fetch(`${http}/debug`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(bundle), signal: controller.signal,
    });
    clearTimeout(to);
  } catch { /* swallow; capture must never throw into the app */ }
}

export function installCaptureTriggers(): void {
  window.addEventListener("error", (e) => { void capture("uncaught", e.message); });
  window.addEventListener("unhandledrejection", (e) => { void capture("uncaught", String((e as PromiseRejectionEvent).reason)); });
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) { e.preventDefault(); void capture("manual"); toast("Debug snapshot sent"); }
  });
}

function toast(msg: string): void {
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.cssText = "position:fixed;bottom:120px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);" +
    "color:#ffd24a;font:bold 12px system-ui;padding:8px 16px;border-radius:8px;z-index:9999;pointer-events:none;";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}
