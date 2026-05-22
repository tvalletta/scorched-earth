import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: { provider: "v8", thresholds: { lines: 70, functions: 70 } },
    testTimeout: 10_000,
  },
});
