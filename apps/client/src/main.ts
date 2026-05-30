import { Application } from "pixi.js";
import { LobbyController } from "./scenes/LobbyController";

declare global {
  interface Window { pixiApp?: Application }
}

async function main() {
  const app = new Application();
  await app.init({ resizeTo: window, background: 0xa6e1fa, antialias: true });
  document.getElementById("app")!.appendChild(app.canvas);
  window.pixiApp = app;
  await new LobbyController(app).enter();
}

main().catch(console.error);
