/**
 * Resolve which destination owns a given date for a trip.
 *
 * Правило: выбираем destination с `type = 'stay'`, где
 * `date_from <= occurred_on <= date_to`. Если диапазонов
 * несколько и они пересекаются — берём первый по sort_order,
 * затем по date_from. Если попаданий нет — возвращаем null.
 *
 * Обёртка кэширует list-запрос на request-level через Map,
 * передаваемую вызывающим кодом. Для единичных вставок передаём
 * new Map() и живём с одним fetch; для массовых backfill-ов
 * один fetch на все expenses поездки.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DestRange = {
  id: string;
  date_from: string | null;
  date_to: string | null;
  sort_order: number | null;
};

/**
 * Fetch stay-type destinations for a trip in a stable order.
 * Exposed so callers can reuse the result across many resolves.
 */
export async function fetchStayDestinations(
  admin: SupabaseClient,
  tripId: string
): Promise<DestRange[]> {
  const { data } = await admin
    .from("destinations")
    .select("id,date_from,date_to,sort_order")
    .eq("trip_id", tripId)
    .eq("type", "stay")
    .order("sort_order", { ascending: true })
    .order("date_from", { ascending: true });
  return (data ?? []) as DestRange[];
}

export function pickDestinationForDate(
  dests: DestRange[],
  occurredOn: string | null | undefined
): string | null {
  if (!occurredOn) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) return null;
  const hit = dests.find(
    (d) =>
      d.date_from != null &&
      d.date_to != null &&
      d.date_from <= occurredOn &&
      occurredOn <= d.date_to
  );
  return hit ? hit.id : null;
}

/**
 * One-shot resolver for a single expense. Делает один запрос
 * к destinations. Для массовых операций предпочтительнее
 * `fetchStayDestinations` + `pickDestinationForDate` в цикле.
 */
export async function resolveDestinationForDate(
  admin: SupabaseClient,
  tripId: string,
  occurredOn: string | null | undefined
): Promise<string | null> {
  if (!occurredOn) return null;
  const dests = await fetchStayDestinations(admin, tripId);
  return pickDestinationForDate(dests, occurredOn);
}
