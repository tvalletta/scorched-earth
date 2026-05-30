export interface SimProjectile { x: number; y: number; vx: number; vy: number; }
export interface Vec2 { x: number; y: number; }

/** Integrate a cosmetic projectile one step under gravity + wind. */
export function stepProjectile(
  p: SimProjectile,
  opts: { gravity: number; wind: number; dt: number },
): SimProjectile {
  const vx = p.vx + opts.wind * opts.dt;
  const vy = p.vy + opts.gravity * opts.dt;
  return { x: p.x + vx * opts.dt, y: p.y + vy * opts.dt, vx, vy };
}

/**
 * Cosmetic aim: lob a shot from `from` toward `to`. Screen space has +y down,
 * so "up" is negative vy. `noise` in [0,1) randomizes the arc so shots vary.
 */
export function aimAt(from: Vec2, to: Vec2, noise: number): { vx: number; vy: number } {
  const dir = Math.sign(to.x - from.x) || 1;
  const dist = Math.abs(to.x - from.x);
  const power = 260 + Math.min(dist, 1200) * 0.18 + noise * 80;
  const launchAngleRad = (50 + noise * 25) * (Math.PI / 180); // 50–75° above horizontal
  return {
    vx: dir * Math.cos(launchAngleRad) * power,
    vy: -Math.sin(launchAngleRad) * power,
  };
}

/** Whether the cosmetic battle should reset (one side wins, or it has run long enough). */
export function shouldReset(s: { aliveCount: number; elapsedMs: number; maxMs: number }): boolean {
  return s.aliveCount <= 1 || s.elapsedMs >= s.maxMs;
}
