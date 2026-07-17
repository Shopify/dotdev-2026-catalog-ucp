// Stable id generator. randomUUID gives a 36-char hyphenated id that satisfies the
// server's /^[a-z0-9-]{6,64}$/i board-id guard (LLD §10).
export function newId(): string {
  return crypto.randomUUID();
}
