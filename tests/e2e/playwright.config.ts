import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5173" },
  timeout: 60_000,
  webServer: [
    {
      command: "pnpm --filter @se/server dev",
      // Colyseus WS-only transport does not respond to plain HTTP GET, so we
      // use a TCP-level port check rather than `url` (which would hang).
      port: 2567,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "pnpm --filter @se/client dev",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
