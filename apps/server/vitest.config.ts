import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: { provider: "v8", thresholds: { lines: 70, functions: 70 } },
    testTimeout: 10_000,
    // Colyseus test server binds a fixed port (2568) per boot — disable
    // parallelism so multiple test files don't collide on EADDRINUSE.
    fileParallelism: false,
  },
});
