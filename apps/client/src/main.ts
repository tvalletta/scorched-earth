import { Application } from "pixi.js";
import { LobbyScene } from "./scenes/LobbyScene";

declare global {
  interface Window { pixiApp?: Application }
}

async function main() {
  const app = new Application();
  await app.init({ resizeTo: window, background: 0xa6e1fa, antialias: true });
  document.getElementById("app")!.appendChild(app.canvas);
  window.pixiApp = app;
  new LobbyScene();
}

main().catch(console.error);
