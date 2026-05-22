import type { Room } from "colyseus.js";
import type { MatchState } from "@se/shared";

export class MatchScene {
  constructor(public room: Room<MatchState>, public code: string) {
    console.log("[match] joined", code, room.sessionId);
  }
}
