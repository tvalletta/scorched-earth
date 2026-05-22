const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // omit I/O/0/1 for readability
const CODE_LENGTH = 6;
const MAX_RETRIES = 1000;

export function generateRoomCode(existing: Set<string>): string {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    if (!existing.has(code)) return code;
  }
  throw new Error("Could not generate a unique room code after 1000 attempts");
}
