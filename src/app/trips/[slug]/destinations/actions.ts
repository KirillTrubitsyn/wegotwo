"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUsername } from "@/lib/auth/current-user";

/**
 * Обновить редактируемые поля города поездки:
 *   • name — название (поверх того, что подтянул парсер).
 *   • description — markdown-описание. Любая ручная правка
 *     устанавливает description_source='manual', чтобы будущие
 *     reparse не перезаписали текст пользователя.
 *   • photo_path — обложка города. Принимаем готовый storage_path
 *     фотки из бакета photos (UI выбирает из загруженных в поездку
 *     фото и передаёт сюда storage_path первой фотки).
 *
 * Передавать в FormData можно ровно те поля, которые меняются —
 * остальные не трогаем. Пустая строка description означает «удалить»
 * (description_source тоже сбрасываем в null).
 */
export async function updateDestinationAction(
  slug: string,
  destId: string,
  fd: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const username = await getCurrentUsername();
  if (!username) return { ok: false, error: "Требуется вход" };

  const admin = createAdminClient();
  const { data: tripRow } = await admin
    .from("trips")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  const trip = tripRow as { id: string } | null;
  if (!trip) return { ok: false, error: "Поездка не найдена" };

  const { data: destRow } = await admin
    .from("destinations")
    .select("id")
    .eq("id", destId)
    .eq("trip_id", trip.id)
    .maybeSingle();
  if (!destRow) return { ok: false, error: "Город не найден" };

  const patch: Record<string, unknown> = {};

  const rawName = fd.get("name");
  if (typeof rawName === "string") {
    const name = rawName.trim();
    if (name.length > 0) patch.name = name.slice(0, 120);
  }

  // description: пустая строка = «убрать описание». Иначе записываем
  // как manual и текст ограничиваем разумным лимитом (4 KB — сильно
  // больше типичных 600 символов из city_summary, но защищает от
  // случайной вставки книги).
  const rawDesc = fd.get("description");
  if (typeof rawDesc === "string") {
    const desc = rawDesc.trim();
    if (desc.length === 0) {
      patch.description = null;
      patch.description_source = null;
    } else {
      patch.description = desc.slice(0, 4000);
      patch.description_source = "manual";
    }
  }

  if (Object.keys(patch).length === 0) {
    return { ok: true };
  }

  const { error } = await admin
    .from("destinations")
    .update(patch)
    .eq("id", destId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/trips/${slug}`);
  revalidatePath(`/trips/${slug}/destinations/${destId}`);
  return { ok: true };
}

/**
 * Назначить (или снять) обложку города. photoId=null убирает обложку.
 * UI вызывает это отдельно от updateDestinationAction, чтобы тап
 * «Сделать обложкой» применялся мгновенно без открытой формы.
 */
export async function setDestinationCoverAction(
  slug: string,
  destId: string,
  photoId: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const username = await getCurrentUsername();
  if (!username) return { ok: false, error: "Требуется вход" };

  const admin = createAdminClient();
  const { data: tripRow } = await admin
    .from("trips")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  const trip = tripRow as { id: string } | null;
  if (!trip) return { ok: false, error: "Поездка не найдена" };

  const { data: destRow } = await admin
    .from("destinations")
    .select("id")
    .eq("id", destId)
    .eq("trip_id", trip.id)
    .maybeSingle();
  if (!destRow) return { ok: false, error: "Город не найден" };

  let nextPath: string | null = null;
  if (photoId) {
    const { data: photoRow } = await admin
      .from("photos")
      .select("storage_path")
      .eq("id", photoId)
      .eq("trip_id", trip.id)
      .maybeSingle();
    const p = photoRow as { storage_path: string } | null;
    if (!p) return { ok: false, error: "Фото не найдено" };
    nextPath = p.storage_path;
  }

  const { error } = await admin
    .from("destinations")
    .update({ photo_path: nextPath })
    .eq("id", destId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/trips/${slug}`);
  revalidatePath(`/trips/${slug}/destinations/${destId}`);
  return { ok: true };
}

/**
 * Сбросить ручное описание обратно в auto-режим: подчищаем флаг
 * description_source, чтобы следующий reparse документов мог
 * перезаписать текст. Само описание оставляем как есть до прихода
 * новых данных от Gemini, чтобы не оставить город пустым.
 */
export async function clearManualDescriptionAction(
  slug: string,
  destId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const username = await getCurrentUsername();
  if (!username) return { ok: false, error: "Требуется вход" };

  const admin = createAdminClient();
  const { data: tripRow } = await admin
    .from("trips")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  const trip = tripRow as { id: string } | null;
  if (!trip) return { ok: false, error: "Поездка не найдена" };

  const { error } = await admin
    .from("destinations")
    .update({ description_source: null })
    .eq("id", destId)
    .eq("trip_id", trip.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/trips/${slug}/destinations/${destId}`);
  return { ok: true };
}
