"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyCode } from "@/lib/auth/access-codes";
import {
  COOKIE_OPTIONS,
  UNLOCK_COOKIE_NAME,
  issueToken,
} from "@/lib/auth/unlock-token";

/**
 * Server Action for the /unlock form.
 * Validates the (username, code) pair and on success sets the
 * signed unlock cookie and redirects to `next` or /.
 */
export async function submitUnlock(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!username || !code) {
    redirect(`/unlock?error=missing&next=${encodeURIComponent(next)}`);
  }

  if (!verifyCode(username, code)) {
    redirect(`/unlock?error=invalid&next=${encodeURIComponent(next)}`);
  }

  const token = await issueToken(username);
  const jar = await cookies();
  jar.set(UNLOCK_COOKIE_NAME, token, COOKIE_OPTIONS);

  redirect(next.startsWith("/") ? next : "/");
}
