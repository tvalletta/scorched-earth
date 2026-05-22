import { Room, type Client } from "colyseus";
import { Schema, type } from "@colyseus/schema";
import { generateRoomCode } from "../codeGen";

class LobbyState extends Schema {
  @type("number") openMatchCount = 0;
}

export const ACTIVE_CODES = new Set<string>();

export class LobbyRoom extends Room<LobbyState> {
  override autoDispose = false;

  onCreate(): void {
    this.setState(new LobbyState());

    this.onMessage("createMatch", (client: Client) => {
      const code = generateRoomCode(ACTIVE_CODES);
      ACTIVE_CODES.add(code);
      this.state.openMatchCount++;
      client.send("matchCreated", { code });
    });
  }
}
