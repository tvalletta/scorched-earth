import { Schema, type } from "@colyseus/schema";

export class AiSlot extends Schema {
  @type("string") sessionId = "";
  @type("string") difficulty = "shooter";
  @type("string") nickname = "";
}
