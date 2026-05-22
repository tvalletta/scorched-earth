import { Application } from "pixi.js";

declare global {
  interface Window { pixiApp?: Application }
}

async function main() {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: 0xa6e1fa,
    antialias: true,
  });
  document.getElementById("app")!.appendChild(app.canvas);
  window.pixiApp = app;
  console.log("[client] PixiJS app initialized");
}

main().catch(console.error);
