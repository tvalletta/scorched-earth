import { Client, Room } from "colyseus.js";
import type { MatchState } from "@se/shared";

declare const __SERVER_URL__: string;

let _client: Client | null = null;

export function getClient(): Client {
  if (!_client) _client = new Client(__SERVER_URL__);
  return _client;
}

export async function joinLobby(): Promise<Room> {
  return getClient().joinOrCreate("lobby");
}

export async function createMatch(
  meta: { nickname: string; color: string; hat: string },
): Promise<{ room: Room<MatchState>; code: string }> {
  const lobby = await joinLobby();
  const code = await new Promise<string>((resolve, reject) => {
    lobby.onMessage("matchCreated", (msg: { code: string }) => resolve(msg.code));
    setTimeout(() => reject(new Error("createMatch timeout")), 5000);
    lobby.send("createMatch", {});
  });
  await lobby.leave();
  const room = await getClient().joinOrCreate<MatchState>(
    "match",
    { code, ...meta },
  );
  return { room, code };
}

export class RoomNotFoundError extends Error {
  constructor(public code: string) {
    super(`Room ${code} not found`);
    this.name = "RoomNotFoundError";
  }
}

export async function joinMatch(
  code: string,
  meta: { nickname: string; color: string; hat: string },
): Promise<Room<MatchState>> {
  // Use join (not joinOrCreate): an invite to a missing room must error, not
  // silently spin up a fresh empty room behind the same code.
  try {
    return await getClient().join<MatchState>("match", { code, ...meta });
  } catch (e: unknown) {
    const err = e as { code?: number; message?: string };
    const msg = String(err?.message ?? e);
    if (err?.code === 4210 || err?.code === 4212 || /no rooms|not found|invalid room/i.test(msg)) {
      throw new RoomNotFoundError(code);
    }
    throw e;
  }
}
