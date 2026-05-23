import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5173, host: "127.0.0.1" },
  define: {
    __SERVER_URL__: JSON.stringify(process.env.VITE_SERVER_URL ?? "ws://localhost:2567"),
  },
});
