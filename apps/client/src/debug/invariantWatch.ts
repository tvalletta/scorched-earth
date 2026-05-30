import { checkMatchInvariants, checkCameraFinite, type MatchStateLike } from "@se/shared";
import { capture } from "./capture";

export class InvariantWatch {
  private lastRun = 0;
  constructor(private getState: () => MatchStateLike, private getCam: () => { x: number; y: number; scale: number }) {}

  tick(): void {
    const now = Date.now();
    if (now - this.lastRun < 1000) return;
    this.lastRun = now;
    const v = [...checkMatchInvariants(this.getState()), ...checkCameraFinite(this.getCam())];
    for (const violation of v) {
      console.error(`[invariant] ${violation.name}: ${violation.detail}`);
      void capture("invariant", violation.name);
    }
  }
}
