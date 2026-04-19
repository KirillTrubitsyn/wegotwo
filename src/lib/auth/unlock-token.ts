/**
 * Signed "unlock" token stored in an HttpOnly cookie.
 * Verifies the holder once entered a valid access code from
 * WEGOTWO_ACCESS_CODES. Uses Web Crypto (Edge-compatible) so it
 * can run inside middleware.
 */

const COOKIE_NAME = "wgt_unlock";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

export const UNLOCK_COOKIE_NAME = COOKIE_NAME;

type Payload = {
  /** username matched in WEGOTWO_ACCESS_CODES */
  u: string;
  /** issued-at, seconds since epoch */
  iat: number;
  /** expires-at, seconds since epoch */
  exp: number;
};

function b64url(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  // Important: build the Uint8Array on top of an explicit ArrayBuffer so the
  // result is `Uint8Array<ArrayBuffer>` (not `Uint8Array<ArrayBufferLike>`).
  // TypeScript 5.7+ narrows `BufferSource` (used by crypto.subtle.verify) to
  // `ArrayBuffer | ArrayBufferView<ArrayBuffer>`, and `Uint8Array.from` infers
  // the loose `ArrayBufferLike` variant which is not assignable.
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const buf = new ArrayBuffer(bin.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function getSecret(): string {
  const s = process.env.WEGOTWO_COOKIE_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "WEGOTWO_COOKIE_SECRET is missing or too short (needs >= 16 chars)"
    );
  }
  return s;
}

export async function issueToken(
  username: string,
  ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: Payload = { u: username, iat: now, exp: now + ttlSeconds };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(getSecret());
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifyToken(token: string | undefined | null): Promise<Payload | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const key = await hmacKey(getSecret());
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlDecode(sig),
      new TextEncoder().encode(body)
    );
    if (!ok) return null;
    const json = new TextDecoder().decode(b64urlDecode(body));
    const payload = JSON.parse(json) as Payload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: DEFAULT_TTL_SECONDS,
};
