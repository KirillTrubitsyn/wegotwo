"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUsername } from "@/lib/auth/current-user";
import { processPhoto } from "@/lib/photos/thumb";

const PHOTOS_BUCKET = "photos";
const MAX_BYTES = 30 * 1024 * 1024; // 30 MB per image (post-HEIC conversion)

const ACCEPT_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export type PhotoFormErrors = {
  form?: string;
  fields?: { file?: string; caption?: string; day_id?: string };
};

export type PhotoActionState =
  | { ok: true }
  | ({ ok: false } & PhotoFormErrors);

function errState(e: PhotoFormErrors): PhotoActionState {
  return { ok: false, ...e };
}

type TripCtx = {
  id: string;
  primary_tz: string;
};

type DayRow = { id: string; date: string };

async function resolveTrip(slug: string): Promise<TripCtx | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("trips")
    .select("id,primary_tz")
    .eq("slug", slug)
    .maybeSingle();
  return (data as TripCtx | null) ?? null;
}

/**
 * Map a taken_at timestamp to the day row whose local date in the
 * trip's primary timezone matches. Returns null if taken_at is
 * null or no day matches.
 */
async function matchDay(
  tripId: string,
  tz: string,
  takenAtIso: string | null
): Promise<string | null> {
  if (!takenAtIso) return null;
  const d = new Date(takenAtIso);
  if (Number.isNaN(d.getTime())) return null;

  // Format as YYYY-MM-DD in the trip's primary tz.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) return null;
  const iso = `${year}-${month}-${day}`;

  const admin = createAdminClient();
  const { data } = await admin
    .from("days")
    .select("id")
    .eq("trip_id", tripId)
    .eq("date", iso)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

const hiddenSchema = z.object({
  taken_at: z
    .string()
    .optional()
    .transform((v) => (v ? v : null)),
  lat: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null)),
  lon: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null)),
  caption: z.string().trim().max(300).optional().or(z.literal("")),
});

export async function uploadPhotoAction(
  slug: string,
  _prev: PhotoActionState,
  fd: FormData
): Promise<PhotoActionState> {
  const username = await getCurrentUsername();
  if (!username) return errState({ form: "Требуется вход" });

  const trip = await resolveTrip(slug);
  if (!trip) return errState({ form: "Поездка не найдена" });

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return errState({ fields: { file: "Выберите фото" } });
  }
  if (file.size > MAX_BYTES) {
    return errState({ fields: { file: "Файл больше 30 МБ" } });
  }

  const mime = file.type || "image/jpeg";
  if (!ACCEPT_MIME.has(mime)) {
    return errState({
      fields: { file: "Поддерживаются JPG, PNG, WebP, HEIC" },
    });
  }

  const meta = hiddenSchema.safeParse({
    taken_at: fd.get("taken_at") ? String(fd.get("taken_at")) : undefined,
    lat: fd.get("lat") ? String(fd.get("lat")) : undefined,
    lon: fd.get("lon") ? String(fd.get("lon")) : undefined,
    caption: fd.get("caption") ? String(fd.get("caption")) : undefined,
  });
  if (!meta.success) return errState({ form: "Некорректные метаданные" });

  const takenAt = meta.data.taken_at ?? null;
  const lat = Number.isFinite(meta.data.lat ?? NaN)
    ? (meta.data.lat as number)
    : null;
  const lon = Number.isFinite(meta.data.lon ?? NaN)
    ? (meta.data.lon as number)
    : null;
  const caption = meta.data.caption || null;

  const ab = await file.arrayBuffer();
  let processed;
  try {
    processed = await processPhoto(ab);
  } catch (e) {
    return errState({
      form: e instanceof Error ? e.message : "Не удалось обработать файл",
    });
  }

  const id =
    typeof crypto.randomUUID === "function" ? crypto.randomUUID() : "";
  if (!id) return errState({ form: "Не удалось сгенерировать id" });

  const fullPath = `${trip.id}/${id}-full.jpg`;
  const thumbPath = `${trip.id}/${id}-thumb.jpg`;

  const admin = createAdminClient();
  const up1 = await admin.storage
    .from(PHOTOS_BUCKET)
    .upload(fullPath, processed.full, {
      contentType: "image/jpeg",
      upsert: false,
    });
  if (up1.error) return errState({ form: up1.error.message });

  const up2 = await admin.storage
    .from(PHOTOS_BUCKET)
    .upload(thumbPath, processed.thumb, {
      contentType: "image/jpeg",
      upsert: false,
    });
  if (up2.error) {
    await admin.storage.from(PHOTOS_BUCKET).remove([fullPath]);
    return errState({ form: up2.error.message });
  }

  const dayId = await matchDay(trip.id, trip.primary_tz, takenAt);

  const { error } = await admin.from("photos").insert({
    id,
    trip_id: trip.id,
    day_id: dayId,
    storage_path: fullPath,
    thumbnail_path: thumbPath,
    taken_at: takenAt,
    lat,
    lon,
    width: processed.width || null,
    height: processed.height || null,
    caption,
    uploaded_by_username: username,
  });
  if (error) {
    await admin.storage
      .from(PHOTOS_BUCKET)
      .remove([fullPath, thumbPath]);
    return errState({ form: error.message });
  }

  revalidatePath(`/trips/${slug}/photos`);
  revalidatePath(`/trips/${slug}`);
  redirect(`/trips/${slug}/photos`);
}

const updateSchema = z.object({
  caption: z.string().trim().max(300).optional().or(z.literal("")),
  day_id: z.string().uuid().optional().or(z.literal("")),
});

export async function updatePhotoAction(
  slug: string,
  photoId: string,
  _prev: PhotoActionState,
  fd: FormData
): Promise<PhotoActionState> {
  const username = await getCurrentUsername();
  if (!username) return errState({ form: "Требуется вход" });

  const trip = await resolveTrip(slug);
  if (!trip) return errState({ form: "Поездка не найдена" });

  const parsed = updateSchema.safeParse({
    caption: fd.get("caption") ? String(fd.get("caption")) : undefined,
    day_id: fd.get("day_id") ? String(fd.get("day_id")) : undefined,
  });
  if (!parsed.success) {
    return errState({ form: "Некорректные данные" });
  }

  const admin = createAdminClient();
  let dayId: string | null = null;
  if (parsed.data.day_id) {
    // Validate the day belongs to this trip.
    const { data } = await admin
      .from("days")
      .select("id")
      .eq("id", parsed.data.day_id)
      .eq("trip_id", trip.id)
      .maybeSingle();
    if (!(data as DayRow | null)) {
      return errState({ fields: { day_id: "День не найден" } });
    }
    dayId = parsed.data.day_id;
  }

  const { error } = await admin
    .from("photos")
    .update({
      caption: parsed.data.caption || null,
      day_id: dayId,
    })
    .eq("id", photoId)
    .eq("trip_id", trip.id);
  if (error) return errState({ form: error.message });

  revalidatePath(`/trips/${slug}/photos`);
  revalidatePath(`/trips/${slug}/photos/${photoId}`);
  return { ok: true };
}

export async function deletePhotoAction(slug: string, photoId: string) {
  const username = await getCurrentUsername();
  if (!username) return;

  const admin = createAdminClient();
  const { data } = await admin
    .from("photos")
    .select("id,storage_path,thumbnail_path,trip_id")
    .eq("id", photoId)
    .maybeSingle();
  const row = data as
    | {
        id: string;
        storage_path: string;
        thumbnail_path: string | null;
        trip_id: string;
      }
    | null;

  if (row) {
    await admin.from("photos").delete().eq("id", row.id);
    const paths = [row.storage_path, row.thumbnail_path].filter(
      (p): p is string => !!p
    );
    if (paths.length > 0) {
      await admin.storage.from(PHOTOS_BUCKET).remove(paths);
    }
  }

  revalidatePath(`/trips/${slug}/photos`);
  revalidatePath(`/trips/${slug}`);
}
