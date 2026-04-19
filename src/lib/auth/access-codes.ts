/**
 * Reads WEGOTWO_ACCESS_CODES from env and verifies name+code pairs.
 * Values are compared in constant time to frustrate timing attacks.
 */

function parseCodes(): Record<string, string> {
  const raw = process.env.WEGOTWO_ACCESS_CODES;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    /* fall through */
  }
  return {};
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function verifyCode(username: string, code: string): boolean {
  const codes = parseCodes();
  const expected = codes[username.trim().toLowerCase()];
  if (!expected) return false;
  return timingSafeEqual(expected, code);
}

export function listUsernames(): string[] {
  return Object.keys(parseCodes());
}
