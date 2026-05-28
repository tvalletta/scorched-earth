import { Schema, type } from "@colyseus/schema";

export class PendingEffect extends Schema {
  @type("string") kind = "";      // "burn-zone" | "smoke-zone"
  @type("number") x = 0;
  @type("number") width = 0;
  @type("number") damage = 0;
  @type("number") turnsLeft = 0;
}
