import { Room } from "colyseus";
import { MatchState } from "@se/shared";

export class MatchRoom extends Room<MatchState> {
  onCreate(_options: { code?: string } = {}): void {
    this.setState(new MatchState());
  }
}
