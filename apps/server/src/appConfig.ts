import type { Server } from "colyseus";
import { LobbyRoom } from "./rooms/LobbyRoom.js";
import { MatchRoom } from "./rooms/MatchRoom.js";

export default {
  initializeGameServer: (gameServer: Server) => {
    gameServer.define("lobby", LobbyRoom);
    gameServer.define("match", MatchRoom).filterBy(["code"]);
  },
};
