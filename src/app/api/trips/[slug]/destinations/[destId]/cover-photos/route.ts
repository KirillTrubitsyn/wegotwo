import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUsername } from "@/lib/auth/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PHOTO_LIMIT = 120;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * GET /api/trips/{slug}/destinations/{destId}/cover-photos
 *
 * Возвращает фотографии поездки для пикера обложки города. Раньше
 * этот список (до 120 фото + signed URLs) загружался прямо в server
 * render страницы города — это давало лишний select + пакетный
 * createSignedUrls на каждый заход в город, даже если модалка
 * редактирования не открывалась. Теперь данные подтягиваются только
 * по факту открытия модалки.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string; destId: string }> }
) {
  const username = await getCurrentUsername();
  if (!username) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  const { slug, destId } = await ctx.params;
  const admin = createAdminClient();

  const { data: tripRow } = await admin
    .from("trips")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  const trip = tripRow as { id: string } | null;
  if (!trip) {
    return NextResponse.json(
      { ok: false, error: "Trip not found" },
      { status: 404 }
    );
  }

  // Привязки destId к поездке достаточно для авторизации — middleware
  // уже отсёк гостей, а проверка trip_id защищает от случайного
  // межпоездочного утечки путём подмены destId.
  const { data: destRow } = await admin
    .from("destinations")
    .select("id")
    .eq("id", destId)
    .eq("trip_id", trip.id)
    .maybeSingle();
  if (!destRow) {
    return NextResponse.json(
      { ok: false, error: "Destination not found" },
      { status: 404 }
    );
  }

  const { data: photoData } = await admin
    .from("photos")
    .select("id,storage_path,thumbnail_path,taken_at")
    .eq("trip_id", trip.id)
    .order("taken_at", { ascending: false, nullsFirst: false })
    .limit(PHOTO_LIMIT);

  const photoRows = (photoData ?? []) as Array<{
    id: string;
    storage_path: string;
    thumbnail_path: string | null;
  }>;

  const thumbPaths = photoRows
    .map((p) => p.thumbnail_path ?? p.storage_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);

  const thumbUrlByPath = new Map<string, string>();
  if (thumbPaths.length > 0) {
    const { data: signed } = await admin.storage
      .from("photos")
      .createSignedUrls(thumbPaths, SIGNED_URL_TTL_SECONDS);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) thumbUrlByPath.set(s.path, s.signedUrl);
    }
  }

  const photos = photoRows.map((p) => {
    const key = p.thumbnail_path ?? p.storage_path;
    return {
      id: p.id,
      thumbUrl: thumbUrlByPath.get(key) ?? null,
      storagePath: p.storage_path,
    };
  });

  return NextResponse.json({ ok: true, photos });
}
