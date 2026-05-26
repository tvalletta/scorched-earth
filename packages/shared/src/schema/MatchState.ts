import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";
import { Tank } from "./Tank";
import { CarveOp } from "./CarveOp";

export type MatchPhase = "lobby" | "playing" | "resolving" | "ended";

export class MatchState extends Schema {
  @type("string") phase: MatchPhase = "lobby";
  @type("string") roomCode = "";
  @type("string") hostId = "";
  @type("number") tick = 0;
  @type("number") wind = 0;
  @type("number") gravity = 250;
  @type("string") terrainSeed = "";
  @type("string") terrainType = "random";
  @type("number") terrainVersion = 0;
  @type([CarveOp]) terrainOps = new ArraySchema<CarveOp>();
  @type("string") currentTurnPlayerId = "";
  @type("number") turnDeadlineMs = 0;
  @type("number") turnTimerMs = 30_000;
  @type("number") maxPlayers = 10;
  @type({ map: Tank }) tanks = new MapSchema<Tank>();
  @type("string") winnerId = "";
  @type("string") loadoutId = "standard";
}
