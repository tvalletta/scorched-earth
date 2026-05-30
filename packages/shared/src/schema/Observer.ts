import { Schema, type } from "@colyseus/schema";

export class Observer extends Schema {
  @type("string") sessionId = "";
  @type("string") nickname = "";
}
