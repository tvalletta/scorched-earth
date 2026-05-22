import type { Server } from "colyseus";
import { LobbyRoom } from "./rooms/LobbyRoom";
import { MatchRoom } from "./rooms/MatchRoom";

export default {
  initializeGameServer: (gameServer: Server) => {
    gameServer.define("lobby", LobbyRoom);
    gameServer.define("match", MatchRoom).filterBy(["code"]);
  },
};
