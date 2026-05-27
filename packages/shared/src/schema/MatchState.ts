import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";
import { Tank } from "./Tank";
import { CarveOp } from "./CarveOp";

export type MatchPhase =
  | "lobby"
  | "playing"
  | "resolving"
  | "round-summary"
  | "shopping"
  | "ended";

export class MatchState extends Schema {
  @type("string") phase: MatchPhase = "lobby";
  @type("string") roomCode = "";
  @type("string") hostId = "";
  @type("number") tick = 0;
  @type("number") wind = 0;
  @type("number") gravity = 250;
  @type("string") terrainSeed = "";
  @type("string") terrainType = "random";
  // Phase 5 — terrain variety & walls
  @type("string") wallMode = "none";
  @type("string") terrainTypePool = "all";
  @type("string") wallModePool = "all";
  @type("number") terrainVersion = 0;
  @type([CarveOp]) terrainOps = new ArraySchema<CarveOp>();
  @type("string") currentTurnPlayerId = "";
  @type("number") turnDeadlineMs = 0;
  @type("number") turnTimerMs = 30_000;
  @type("number") maxPlayers = 10;
  @type({ map: Tank }) tanks = new MapSchema<Tank>();
  @type("string") winnerId = "";
  @type("string") loadoutId = "standard";
  // Phase 3 — multi-round
  @type("number") round = 1;
  @type("number") maxRounds = 5;
  @type({ map: "number" }) roundsWon = new MapSchema<number>();
  @type("number") summaryDeadlineMs = 0;
  @type("number") shopDeadlineMs = 0;
  // Phase 4 — tick-stream
  @type("number") resolvingTick = 0;
}
