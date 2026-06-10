import { generateTerrain, generateUnderside } from "@se/game";
import { TERRAIN_WIDTH, TERRAIN_HEIGHT } from "@se/shared";
import type { TerrainType } from "@se/shared";

const SCALE = 0.45;
const MIN_THICKNESS = 20;

// Mirror of Terrain.ts drawUnderside edge-taper logic for visual parity.
function buildBottom(h: Int16Array, seed: string): Float32Array {
  const W = TERRAIN_WIDTH;
  let sum = 0;
  for (let x = 0; x < W; x++) sum += h[x] ?? 0;
  const avgSurface = sum / W;

  const gen = generateUnderside(seed, W, avgSurface);
  const bottom = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    bottom[x] = Math.max((h[x] ?? 0) + MIN_THICKNESS, gen[x]!);
  }

  // Same narrow taper as Terrain.ts: 5% zone, t^4 curve so the island stays
  // at full natural thickness until right at the canvas edge.
  const edgeZone = Math.round(W * 0.05);
  for (let x = 0; x < W; x++) {
    const dist = Math.min(x, W - 1 - x);
    if (dist >= edgeZone) continue;
    const t = dist / edgeZone;
    const steep = t * t * t * t;
    const edgeTarget = (h[x] ?? 0) + MIN_THICKNESS;
    const tapered = edgeTarget + (bottom[x]! - edgeTarget) * steep;
    bottom[x] = Math.max(
      (h[x] ?? 0) + MIN_THICKNESS,
      Math.min(bottom[x]!, Math.round(tapered)),
    );
  }
  return bottom;
}

function renderTerrain(
  canvas: HTMLCanvasElement,
  h: Int16Array,
  seed: string,
  label: string,
): void {
  const W = TERRAIN_WIDTH;
  const H = TERRAIN_HEIGHT;
  canvas.width = Math.round(W * SCALE);
  canvas.height = Math.round(H * SCALE);

  // willReadFrequently keeps the canvas in CPU memory so toDataURL() returns
  // real pixels even in headless environments where GPU readback is unavailable.
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.scale(SCALE, SCALE);

  // Sky
  ctx.fillStyle = "#0b0019";
  ctx.fillRect(0, 0, W, H);

  const bottom = buildBottom(h, seed);

  // Island body
  ctx.beginPath();
  ctx.moveTo(0, h[0] ?? 0);
  for (let x = 1; x < W; x++) ctx.lineTo(x, h[x] ?? 0);
  for (let x = W - 1; x >= 0; x--) ctx.lineTo(x, bottom[x]!);
  ctx.closePath();
  ctx.fillStyle = "#3a2614";
  ctx.fill();

  // Lower shadow for depth
  ctx.beginPath();
  ctx.moveTo(0, Math.max(h[0] ?? 0, bottom[0]! - 150));
  for (let x = 1; x < W; x++) ctx.lineTo(x, Math.max(h[x] ?? 0, bottom[x]! - 150));
  for (let x = W - 1; x >= 0; x--) ctx.lineTo(x, bottom[x]!);
  ctx.closePath();
  ctx.fillStyle = "rgba(28,18,8,0.6)";
  ctx.fill();

  // Dirt band
  ctx.beginPath();
  ctx.moveTo(0, h[0] ?? 0);
  for (let x = 1; x < W; x++) ctx.lineTo(x, h[x] ?? 0);
  for (let x = W - 1; x >= 0; x--) {
    ctx.lineTo(x, Math.min((h[x] ?? 0) + 200, bottom[x]!, H));
  }
  ctx.closePath();
  ctx.fillStyle = "#5c3a1e";
  ctx.fill();

  // Topsoil strip
  ctx.beginPath();
  ctx.moveTo(0, h[0] ?? 0);
  for (let x = 1; x < W; x++) ctx.lineTo(x, h[x] ?? 0);
  for (let x = W - 1; x >= 0; x--) {
    ctx.lineTo(x, Math.min((h[x] ?? 0) + 15, bottom[x]!, H));
  }
  ctx.closePath();
  ctx.fillStyle = "#6b4a25";
  ctx.fill();

  // Grass
  ctx.beginPath();
  ctx.moveTo(0, h[0] ?? 0);
  for (let x = 1; x < W; x++) ctx.lineTo(x, h[x] ?? 0);
  ctx.strokeStyle = "#8bc34a";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Rim light on underside
  ctx.beginPath();
  ctx.moveTo(0, bottom[0]!);
  for (let x = 4; x < W; x += 4) ctx.lineTo(x, bottom[x]!);
  ctx.strokeStyle = "rgba(107,74,37,0.4)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Label
  ctx.resetTransform();
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "11px monospace";
  ctx.fillText(label, 6, 14);
}

const TERRAIN_TYPES: TerrainType[] = [
  "mountains", "hills", "valleys", "cliffs",
  "crater", "sky-high", "plateau", "flat", "random",
];

// Render each type with two seeds so edge behaviour is visible across variation.
const SEEDS = ["preview-a", "preview-b"];

const container = document.getElementById("container")!;

for (const type of TERRAIN_TYPES) {
  for (const seed of SEEDS) {
    const h = generateTerrain({ seed, type, width: TERRAIN_WIDTH, height: TERRAIN_HEIGHT });

    const canvas = document.createElement("canvas");
    canvas.id = `terrain-${type}-${seed}`;
    canvas.title = `${type} / ${seed}`;
    renderTerrain(canvas, h, seed, `${type} [${seed}]`);
    container.appendChild(canvas);
  }
}
