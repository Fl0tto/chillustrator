/**
 * Stable id generation for nodes, paints, and documents.
 * Framework-independent. Ids are short, URL/SVG-id safe strings.
 */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomToken(length: number): string {
  let out = "";
  const cryptoObj = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    const bytes = new Uint8Array(length);
    cryptoObj.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      out += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return out;
  }
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/** A prefixed, collision-resistant id, e.g. "n_a1b2c3d4". */
export function createId(prefix: string): string {
  return `${prefix}_${randomToken(8)}`;
}

export function createNodeId(): string {
  return createId("n");
}

export function createPaintId(): string {
  return createId("p");
}

export function createDocumentId(): string {
  return createId("doc");
}

/** Id for a single drop-shadow effect entry on a node. */
export function createEffectId(): string {
  return createId("fx");
}

/** Sanitize a user- or import-supplied id into a valid, unique SVG id. */
export function ensureUniqueId(candidate: string, taken: Set<string>): string {
  const base = candidate.replace(/[^A-Za-z0-9_-]/g, "-").replace(/^-+/, "") || "id";
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
