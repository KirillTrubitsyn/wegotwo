"use server";

import { getCurrentUsername } from "@/lib/auth/current-user";
import { verifyCode } from "@/lib/auth/access-codes";

/**
 * Подтвердить, что переданный код доступа соответствует текущему
 * залогиненному пользователю. Используется модалкой
 * `<ConfirmDeleteButton>` перед деструктивными операциями
 * (удаление события, фото, поездки и т.п.).
 *
 * Возвращает true только если cookie-сессия активна и код совпал.
 * В любом ошибочном состоянии — false (без деталей, чтобы не
 * протечь инфу о том, залогинен ли пользователь).
 */
export async function verifyAccessCodeAction(code: string): Promise<boolean> {
  const username = await getCurrentUsername();
  if (!username) return false;
  const trimmed = String(code ?? "").trim();
  if (!trimmed) return false;
  return verifyCode(username, trimmed);
}
