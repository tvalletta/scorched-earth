import type { Container, Application } from 'pixi.js';

export interface TankPosition { x: number; y: number; }
interface Viewport { width: number; height: number; }

// Visible world band used for camera bounds (NOT the taller physics bounds).
export const WORLD_LEFT = 0;
export const WORLD_RIGHT = 1600;     // TERRAIN_WIDTH
export const WORLD_TOP = -150;       // headroom above peaks for high shots
export const WORLD_BOTTOM = 1020;    // ~TERRAIN_HEIGHT(900) + 120 underside
export const MAX_SCALE = 2.0;
export const ZOOM_SENSITIVITY = 0.0008; // wheel feel; tune in-app

export function minScaleFor(vp: { width: number; height: number }): number {
  const worldW = WORLD_RIGHT - WORLD_LEFT;
  const worldH = WORLD_BOTTOM - WORLD_TOP;
  return Math.max(vp.width / worldW, vp.height / worldH);
}

/** Clamp world position so no viewport pixel maps outside the world band.
 * If the scaled world is smaller than the viewport on an axis, center it. */
export function clampPan(
  x: number, y: number, scale: number, vp: { width: number; height: number },
): { x: number; y: number } {
  const clampAxis = (pos: number, worldMin: number, worldMax: number, vpLen: number) => {
    const scaledLen = (worldMax - worldMin) * scale;
    if (scaledLen <= vpLen) {
      // center: midpoint of world maps to midpoint of viewport
      return vpLen / 2 - ((worldMin + worldMax) / 2) * scale;
    }
    const minPos = vpLen - worldMax * scale; // world-right edge at viewport-right
    const maxPos = -worldMin * scale;        // world-left edge at viewport-left
    return Math.min(maxPos, Math.max(minPos, pos));
  };
  return {
    x: clampAxis(x, WORLD_LEFT, WORLD_RIGHT, vp.width),
    y: clampAxis(y, WORLD_TOP, WORLD_BOTTOM, vp.height),
  };
}

// Exported for unit testing
export function computeFit(
  tanks: TankPosition[],
  viewport: Viewport,
): { x: number; y: number; scale: number } {
  if (tanks.length === 0) {
    return { x: viewport.width / 2, y: viewport.height / 2, scale: 1 };
  }
  const xs = tanks.map(t => t.x);
  const ys = tanks.map(t => t.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const padX = (maxX - minX) * 0.2 + 80;
  const padY = (maxY - minY) * 0.2 + 80;
  const worldW = maxX - minX + padX * 2;
  const worldH = maxY - minY + padY * 2;
  const rawScale = Math.min(viewport.width / worldW, viewport.height / worldH);
  const scale = Math.max(0.4, Math.min(2.0, rawScale));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    x: viewport.width / 2 - cx * scale,
    y: viewport.height / 2 - cy * scale,
    scale,
  };
}

export class Camera {
  private targetX = 0;
  private targetY = 0;
  private targetScale = 1;

  private shakeIntensity = 0;
  private shakeDuration = 0;
  private shakeElapsed = 0;

  private isDragging = false;
  private dragStartWorldX = 0;
  private dragStartWorldY = 0;
  private dragStartMouseX = 0;
  private dragStartMouseY = 0;
  userOverride = false;
  private trackingSuspended = false;

  constructor(private world: Container, private app: Application) {
    this.targetX = world.position.x;
    this.targetY = world.position.y;
    this.targetScale = world.scale.x;
    this.attachInputListeners();
  }

  private get viewport(): Viewport {
    return { width: this.app.screen.width, height: this.app.screen.height };
  }

  private minScale(): number { return minScaleFor(this.viewport); }

  private clampToBounds(): void {
    this.targetScale = Math.max(this.minScale(), Math.min(MAX_SCALE, this.targetScale));
    const p = clampPan(this.targetX, this.targetY, this.targetScale, this.viewport);
    this.targetX = p.x; this.targetY = p.y;
  }

  update(dt: number): void {
    if (!Number.isFinite(this.targetX) || !Number.isFinite(this.targetY) || !Number.isFinite(this.targetScale)) {
      this.targetX = this.viewport.width / 2; this.targetY = this.viewport.height / 2; this.targetScale = 1;
    }
    const POS_LERP = 1 - Math.pow(1 - 0.08, dt * 60);
    const SCALE_LERP = 1 - Math.pow(1 - 0.06, dt * 60);

    this.world.scale.set(
      this.world.scale.x + (this.targetScale - this.world.scale.x) * SCALE_LERP,
    );
    this.world.position.x += (this.targetX - this.world.position.x) * POS_LERP;
    this.world.position.y += (this.targetY - this.world.position.y) * POS_LERP;

    if (this.shakeIntensity > 0.1) {
      this.shakeElapsed += dt;
      const progress = Math.min(this.shakeElapsed / this.shakeDuration, 1);
      const intensity = this.shakeIntensity * Math.exp(-progress * 8);
      if (!this.isDragging) {
        const ox = (Math.random() * 2 - 1) * intensity;
        const oy = (Math.random() * 2 - 1) * intensity;
        this.world.position.x += ox;
        this.world.position.y += oy;
      }
      if (progress >= 1) this.shakeIntensity = 0;
    }
  }

  fitToTanks(tanks: TankPosition[]): void {
    if (this.userOverride) return;
    const fit = computeFit(tanks, this.viewport);
    this.targetX = fit.x;
    this.targetY = fit.y;
    this.targetScale = fit.scale;
    this.clampToBounds();
  }

  trackProjectile(x: number, y: number): void {
    if (this.trackingSuspended || this.userOverride) return;
    const TRACK_LERP = 0.18;
    const scale = this.targetScale;
    const cx = this.viewport.width / 2 - x * scale;
    const cy = this.viewport.height / 2 - y * scale;
    this.targetX += (cx - this.targetX) * TRACK_LERP;
    this.targetY += (cy - this.targetY) * TRACK_LERP;
  }

  shake(blastRadius: number): void {
    this.shakeIntensity = Math.min(blastRadius * 0.08, 12);
    this.shakeDuration = Math.min(0.2 + blastRadius * 0.005, 1.0);
    this.shakeElapsed = 0;
  }

  resetView(): void {
    this.userOverride = false;
    this.trackingSuspended = false;
  }

  onTurnStart(): void {
    this.trackingSuspended = false;
    this.userOverride = false;
  }

  get worldX(): number { return this.world.position.x; }
  get worldY(): number { return this.world.position.y; }

  private attachInputListeners(): void {
    const canvas = this.app.canvas;

    canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const oldScale = this.targetScale;
      const factor = Math.exp(-e.deltaY * ZOOM_SENSITIVITY);
      const newScale = Math.max(this.minScale(), Math.min(MAX_SCALE, oldScale * factor));
      const wx = (sx - this.targetX) / oldScale;
      const wy = (sy - this.targetY) / oldScale;
      this.targetX = sx - wx * newScale;
      this.targetY = sy - wy * newScale;
      this.targetScale = newScale;
      this.userOverride = true;
      this.clampToBounds();
    }, { passive: false });

    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      this.isDragging = true;
      this.shakeIntensity = 0;
      this.trackingSuspended = true;
      this.dragStartMouseX = e.clientX;
      this.dragStartMouseY = e.clientY;
      this.dragStartWorldX = this.world.position.x;
      this.dragStartWorldY = this.world.position.y;
    });
    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.dragStartMouseX;
      const dy = e.clientY - this.dragStartMouseY;
      this.targetX = this.dragStartWorldX + dx;
      this.targetY = this.dragStartWorldY + dy;
      this.userOverride = true;
      this.clampToBounds();
      this.world.position.set(this.targetX, this.targetY);
    });
    const endDrag = () => { this.isDragging = false; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    window.addEventListener('blur', endDrag);

    canvas.addEventListener('dblclick', () => this.resetView());

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') this.resetView();
    });
  }

  destroy(): void {
    // Input listeners on window are long-lived per match; acceptable cost
  }
}
