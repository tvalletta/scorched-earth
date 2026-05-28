const HIT_THRESHOLD = 18; // px — how close perpendicular to beam center counts as a hit

export interface LaserInput {
  originX: number;
  originY: number;
  angleDeg: number;      // standard math convention: 0=right, 90=up, 180=left, 270=down
  targets: Array<{ playerId: string; x: number; y: number; shieldHp: number }>;
  damage: number;
  terrain: Int16Array;
  terrainWidth: number;
  terrainHeight: number;
}

export interface LaserResult {
  endX: number;
  endY: number;
  damages: Array<{ playerId: string; amount: number; shieldDamage: number; hullDamage: number }>;
}

export function resolveLaserBeam(input: LaserInput): LaserResult {
  const { originX, originY, angleDeg, targets, damage, terrain, terrainWidth, terrainHeight } = input;

  // Angle convention: 0 = right, 90 = up (screen y flipped so dy = -sin)
  // This matches: vx = cos(rad), vy = -sin(rad)
  // NOTE: The game's projectile uses vx = -cos(rad), vy = -sin(rad) (angle 0 fires LEFT).
  // Laser uses the intuitive convention: angle 0 fires RIGHT (positive X direction).
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = -Math.sin(rad); // screen coords: positive Y is down

  let x = originX;
  let y = originY;
  const stepSize = 2; // px per step
  const maxDist = Math.sqrt(terrainWidth ** 2 + terrainHeight ** 2);

  const hitTanks = new Set<string>();

  for (let dist = 0; dist < maxDist; dist += stepSize) {
    x = originX + dx * dist;
    y = originY + dy * dist;

    // Out of bounds — stop beam
    if (x < 0 || x >= terrainWidth || y < 0 || y >= terrainHeight) break;

    // Terrain hit — beam is blocked
    const tx = Math.floor(Math.max(0, Math.min(terrainWidth - 1, x)));
    const surfaceY = terrain[tx] ?? terrainHeight;
    if (y >= surfaceY) {
      break;
    }

    // Check each target tank — hit if within HIT_THRESHOLD perpendicular distance
    // and the tank is along the forward direction (not behind origin)
    for (const t of targets) {
      if (hitTanks.has(t.playerId)) continue;
      // Perpendicular distance from tank center to beam line
      const perpDist = Math.abs((t.x - originX) * dy - (t.y - originY) * dx);
      // Along-beam distance (must be between origin and current step end)
      const alongDist = (t.x - originX) * dx + (t.y - originY) * dy;
      if (perpDist < HIT_THRESHOLD && alongDist >= 0 && alongDist <= dist + stepSize) {
        hitTanks.add(t.playerId);
      }
    }
  }

  const damages = [];
  for (const t of targets) {
    if (!hitTanks.has(t.playerId)) continue;
    const shieldAbsorbed = Math.min(damage, t.shieldHp);
    const hullDamage = damage - shieldAbsorbed;
    damages.push({ playerId: t.playerId, amount: damage, shieldDamage: shieldAbsorbed, hullDamage });
  }

  return { endX: x, endY: y, damages };
}
