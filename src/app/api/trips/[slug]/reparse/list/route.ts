import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUsername } from "@/lib/auth/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/trips/{slug}/reparse/list
 *
 * Возвращает список document_id для поездки, которые подлежат
 * перечитыванию через Gemini. UI-клиент (кнопка «🧠» на Дни)
 * итерирует этот список и вызывает `/reparse/one?id=...` по
 * одному — так мы укладываемся в Vercel function timeout и
 * показываем прогресс пользователю.
 *
 * Аутентификация — cookie-сессия (HMAC токен из /unlock).
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const username = await getCurrentUsername();
  if (!username) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  const { slug } = await ctx.params;
  const admin = createAdminClient();

  const { data: trip } = await admin
    .from("trips")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!trip) {
    return NextResponse.json(
      { ok: false, error: "Trip not found" },
      { status: 404 }
    );
  }

  const { data: docs } = await admin
    .from("documents")
    .select("id")
    .eq("trip_id", (trip as { id: string }).id)
    .eq("archived", false)
    .in("parsed_status", ["parsed", "needs_review"])
    .order("created_at", { ascending: true });

  return NextResponse.json({
    ok: true,
    doc_ids: ((docs ?? []) as Array<{ id: string }>).map((d) => d.id),
  });
}
