import { defineConfig } from "vite";
import { execSync } from "node:child_process";

const BUILD_ID = (() => {
  let sha = "nogit";
  try { sha = execSync("git rev-parse --short HEAD").toString().trim(); } catch { /* not a git checkout */ }
  return `${sha}-${new Date().toISOString()}`;
})();

export default defineConfig({
  server: { port: 5183, host: "127.0.0.1", historyApiFallback: true },
  define: {
    __SERVER_URL__: JSON.stringify(process.env.VITE_SERVER_URL ?? "ws://localhost:2567"),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
});
