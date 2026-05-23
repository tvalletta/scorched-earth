import { Schema, type } from "@colyseus/schema";

export class CarveOp extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") radius = 0;
  @type("number") tick = 0;
}
