import { cookies } from "next/headers";
import { verifyToken, UNLOCK_COOKIE_NAME } from "./unlock-token";

/** Reads the signed unlock cookie and returns the username or null. */
export async function getCurrentUsername(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(UNLOCK_COOKIE_NAME)?.value;
  const payload = await verifyToken(token);
  return payload?.u ?? null;
}
