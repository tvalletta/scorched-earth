import { describe, it, expect } from "vitest";
import { stepProjectiles } from "./step";
import { WEAPON_REGISTRY } from "../weapons";

// Get weapons by ID to avoid import issues if exports change
const PLASMA_WAVE = WEAPON_REGISTRY.get("plasma-wave")!;
const TRACER = WEAPON_REGISTRY.get("tracer")!;
const DIRT_CLOD = WEAPON_REGISTRY.get("dirt-clod")!;
const SANDHOG = WEAPON_REGISTRY.get("sandhog")!;
const TUNNELER = WEAPON_REGISTRY.get("tunneler")!;
const NAPALM = WEAPON_REGISTRY.get("napalm")!;
const SMOKE = WEAPON_REGISTRY.get("smoke")!;

function flat(h = 900): Int16Array { return new Int16Array(1600).fill(h); }
const base = { tanks: [], terrainWidth: 1600, terrainHeight: 900, wind: 0, gravity: 0, dt: 1/60, wallMode: "none" as const };

describe("Plasma Wave", () => {
  it("emits plasma-wave on terrain impact (not terrain-impact)", () => {
    const terrain = flat(500);
    const r = stepProjectiles({ ...base, terrain,
      projectiles: [{ id: "pw1", x: 400, y: 501, vx: 0, vy: 10,
                      weapon: PLASMA_WAVE, ownerId: "p1", apexReached: true }] });
    expect(r.events.find(e => e.kind === "plasma-wave")).toBeDefined();
    expect(r.events.find(e => e.kind === "terrain-impact")).toBeUndefined();
  });
});

describe("Tracer", () => {
  it("emits tracer-complete with no terrain-impact", () => {
    const terrain = flat(900);
    const r = stepProjectiles({ ...base, terrain,
      projectiles: [{ id: "t1", x: 400, y: 901, vx: 0, vy: 0,
                      weapon: TRACER, ownerId: "p1", apexReached: false }] });
    expect(r.events.find(e => e.kind === "tracer-complete")).toBeDefined();
    expect(r.events.find(e => e.kind === "terrain-impact")).toBeUndefined();
  });
});

describe("Dirt Clod (terrain deposit)", () => {
  it("emits terrain-deposit on terrain hit (not terrain-impact)", () => {
    const terrain = flat(500);
    const r = stepProjectiles({ ...base, terrain,
      projectiles: [{ id: "d1", x: 400, y: 501, vx: 0, vy: 10,
                      weapon: DIRT_CLOD, ownerId: "p1", apexReached: true }] });
    expect(r.events.find(e => e.kind === "terrain-deposit")).toBeDefined();
    expect(r.events.find(e => e.kind === "terrain-impact")).toBeUndefined();
  });
});

describe("Sandhog (burrow)", () => {
  it("emits burrow-complete when hitting terrain", () => {
    const terrain = flat(500);
    const r = stepProjectiles({ ...base, terrain,
      projectiles: [{ id: "s1", x: 400, y: 501, vx: 0, vy: 10,
                      weapon: SANDHOG, ownerId: "p1", apexReached: true }] });
    expect(r.events.find(e => e.kind === "burrow-complete")).toBeDefined();
  });
});

describe("Napalm (burn on impact)", () => {
  it("emits both terrain-impact and burn-deployed", () => {
    const terrain = flat(500);
    const r = stepProjectiles({ ...base, terrain,
      projectiles: [{ id: "n1", x: 400, y: 501, vx: 0, vy: 10,
                      weapon: NAPALM, ownerId: "p1", apexReached: true }] });
    expect(r.events.find(e => e.kind === "terrain-impact")).toBeDefined();
    expect(r.events.find(e => e.kind === "burn-deployed")).toBeDefined();
  });
});

describe("Smoke", () => {
  it("emits smoke-deployed on terrain hit (not terrain-impact)", () => {
    const terrain = flat(500);
    const r = stepProjectiles({ ...base, terrain,
      projectiles: [{ id: "sm1", x: 400, y: 501, vx: 0, vy: 10,
                      weapon: SMOKE, ownerId: "p1", apexReached: true }] });
    expect(r.events.find(e => e.kind === "smoke-deployed")).toBeDefined();
    expect(r.events.find(e => e.kind === "terrain-impact")).toBeUndefined();
  });
});
