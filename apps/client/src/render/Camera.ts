import type { Container, Application } from 'pixi.js';

export interface TankPosition { x: number; y: number; }
interface Viewport { width: number; height: number; }

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

  update(dt: number): void {
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
  }

  get worldX(): number { return this.world.position.x; }
  get worldY(): number { return this.world.position.y; }

  private attachInputListeners(): void {
    const canvas = this.app.canvas;

    canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.targetScale = Math.max(0.4, Math.min(2.0, this.targetScale * delta));
    }, { passive: false });

    canvas.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return;
      this.isDragging = true;
      this.shakeIntensity = 0;
      this.trackingSuspended = true;
      this.dragStartMouseX = e.clientX;
      this.dragStartMouseY = e.clientY;
      this.dragStartWorldX = this.world.position.x;
      this.dragStartWorldY = this.world.position.y;
    });
    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.dragStartMouseX;
      const dy = e.clientY - this.dragStartMouseY;
      this.targetX = this.dragStartWorldX + dx;
      this.targetY = this.dragStartWorldY + dy;
      this.world.position.set(this.targetX, this.targetY);
      this.userOverride = true;
    });
    window.addEventListener('mouseup', () => { this.isDragging = false; });

    canvas.addEventListener('dblclick', () => this.resetView());

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') this.resetView();
    });
  }

  destroy(): void {
    // Input listeners on window are long-lived per match; acceptable cost
  }
}
