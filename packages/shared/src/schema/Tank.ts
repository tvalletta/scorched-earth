import { Schema, MapSchema, type } from "@colyseus/schema";

export class Tank extends Schema {
  @type("string") playerId = "";
  @type("string") sessionId = "";
  @type("string") nickname = "";
  @type("string") color = "red";
  @type("string") hat = "none";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") hp = 100;
  @type("number") angle = 90;
  @type("number") power = 500;
  @type("boolean") alive = true;
  @type("boolean") connected = true;
  @type("string") weaponId = "baby-missile";
  @type({ map: "number" }) inventory = new MapSchema<number>();
  // Phase 3 — economy
  @type("number") cash = 10_000;
  @type("number") damageDealtThisRound = 0;
  @type("number") killsThisRound = 0;
  @type("boolean") readyForShop = false;
  @type("number") totalDamageDealt = 0;
  @type("number") totalKills = 0;
}
