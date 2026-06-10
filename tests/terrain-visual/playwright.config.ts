import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5183" },
  timeout: 30_000,
  // Only needs the Vite client dev server — no game server required.
  webServer: {
    command: "pnpm --filter @se/client dev",
    url: "http://127.0.0.1:5183",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
