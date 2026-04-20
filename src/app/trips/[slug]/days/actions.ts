"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUsername } from "@/lib/auth/current-user";
import { rebuildTripEvents } from "@/lib/ingest/rebuild";

const EVENT_KINDS = [
  "meal",
  "visit",
  "transfer",
  "flight",
  "stay",
  "activity",
  "other",
] as const;

const timeRe = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const eventSchema = z
  .object({
    title: z.string().trim().min(2, "Минимум 2 символа").max(120),
    kind: z.enum(EVENT_KINDS),
    start_time: z
      .string()
      .trim()
      .regex(timeRe, "Время HH:MM")
      .optional()
      .or(z.literal("")),
    end_time: z
      .string()
      .trim()
      .regex(timeRe, "Время HH:MM")
      .optional()
      .or(z.literal("")),
    notes: z.string().trim().max(1000).optional().or(z.literal("")),
    map_url: z
      .string()
      .trim()
      .max(500)
      .optional()
      .or(z.literal("")),
  })
  .refine(
    (v) =>
      !v.start_time ||
      !v.end_time ||
      v.start_time === "" ||
      v.end_time === "" ||
      v.start_time <= v.end_time,
    { message: "Конец раньше начала", path: ["end_time"] }
  );

export type EventFormErrors = {
  form?: string;
  fields?: Partial<Record<keyof z.infer<typeof eventSchema>, string>>;
};

export type EventActionState = { ok: true } | ({ ok: false } & EventFormErrors);

function extractEvent(formData: FormData) {
  return {
    title: String(formData.get("title") ?? ""),
    kind: String(formData.get("kind") ?? "other"),
    start_time: String(formData.get("start_time") ?? ""),
    end_time: String(formData.get("end_time") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    map_url: String(formData.get("map_url") ?? ""),
  };
}

function firstIssues(err: z.ZodError<z.infer<typeof eventSchema>>) {
  const out: EventFormErrors["fields"] = {};
  for (const i of err.issues) {
    const key = i.path[0] as keyof z.infer<typeof eventSchema>;
    if (key && !out[key]) out[key] = i.message;
  }
  return out;
}

/**
 * Combine a day's date (YYYY-MM-DD) with a HH:MM time into an
 * ISO timestamp in the trip's timezone. We store as timestamptz
 * via Postgres at-time-zone.
 */
function combineDateTime(dayDate: string, time: string, tz: string): string {
  // Build an ISO-ish local string; let Postgres handle the TZ conversion.
  // We return the string and include a tz hint in a separate field.
  // For simplicity in Phase 3 we attach the offset UTC assumption.
  // start_at/end_at columns are timestamptz; passing a naive local
  // timestamp with explicit UTC offset is the cleanest approach.
  // We compute the offset from the tz for the given date via Intl.
  const local = new Date(`${dayDate}T${time}:00`);
  const offsetMin = getTzOffsetMinutes(tz, local);
  const utc = new Date(local.getTime() - offsetMin * 60 * 1000);
  return utc.toISOString();
}

function getTzOffsetMinutes(tz: string, date: Date): number {
  // Compute the offset of `tz` at `date` by formatting the same instant
  // in the target TZ and comparing to UTC.
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour === "24" ? "00" : map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return (asUTC - date.getTime()) / 60000;
}

async function resolveTripContext(slug: string) {
  const admin = createAdminClient();
  const { data: trip } = await admin
    .from("trips")
    .select("id,primary_tz")
    .eq("slug", slug)
    .maybeSingle();
  return trip as { id: string; primary_tz: string } | null;
}

async function resolveDayContext(slug: string, dayNumber: number) {
  const trip = await resolveTripContext(slug);
  if (!trip) return null;
  const admin = createAdminClient();
  const { data: days } = await admin
    .from("days")
    .select("id,date")
    .eq("trip_id", trip.id)
    .order("date", { ascending: true });
  const list = (days ?? []) as Array<{ id: string; date: string }>;
  const day = list[dayNumber - 1];
  if (!day) return null;
  return { trip, day };
}

async function nextSortOrder(dayId: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("events")
    .select("sort_order")
    .eq("day_id", dayId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const arr = (data ?? []) as Array<{ sort_order: number | null }>;
  const last = arr[0]?.sort_order ?? -1;
  return (last ?? -1) + 1;
}

export async function createEventAction(
  slug: string,
  dayNumber: number,
  _prev: EventActionState,
  formData: FormData
): Promise<EventActionState> {
  const username = await getCurrentUsername();
  if (!username) return { ok: false, form: "Требуется вход" };

  const ctx = await resolveDayContext(slug, dayNumber);
  if (!ctx) return { ok: false, form: "День не найден" };

  const data = extractEvent(formData);
  const parsed = eventSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, fields: firstIssues(parsed.error) };
  }

  const admin = createAdminClient();
  const start_at = parsed.data.start_time
    ? combineDateTime(ctx.day.date, parsed.data.start_time, ctx.trip.primary_tz)
    : null;
  const end_at = parsed.data.end_time
    ? combineDateTime(ctx.day.date, parsed.data.end_time, ctx.trip.primary_tz)
    : null;

  const sortOrder = await nextSortOrder(ctx.day.id);

  const { error } = await admin.from("events").insert({
    trip_id: ctx.trip.id,
    day_id: ctx.day.id,
    title: parsed.data.title,
    kind: parsed.data.kind,
    start_at,
    end_at,
    notes: parsed.data.notes || null,
    map_url: parsed.data.map_url || null,
    sort_order: sortOrder,
  });

  if (error) return { ok: false, form: error.message };

  revalidatePath(`/trips/${slug}/days`);
  revalidatePath(`/trips/${slug}/days/${dayNumber}`);
  return { ok: true };
}

export async function updateEventAction(
  slug: string,
  dayNumber: number,
  eventId: string,
  _prev: EventActionState,
  formData: FormData
): Promise<EventActionState> {
  const username = await getCurrentUsername();
  if (!username) return { ok: false, form: "Требуется вход" };

  const ctx = await resolveDayContext(slug, dayNumber);
  if (!ctx) return { ok: false, form: "День не найден" };

  const data = extractEvent(formData);
  const parsed = eventSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, fields: firstIssues(parsed.error) };
  }

  const admin = createAdminClient();
  const start_at = parsed.data.start_time
    ? combineDateTime(ctx.day.date, parsed.data.start_time, ctx.trip.primary_tz)
    : null;
  const end_at = parsed.data.end_time
    ? combineDateTime(ctx.day.date, parsed.data.end_time, ctx.trip.primary_tz)
    : null;

  const { error } = await admin
    .from("events")
    .update({
      title: parsed.data.title,
      kind: parsed.data.kind,
      start_at,
      end_at,
      notes: parsed.data.notes || null,
      map_url: parsed.data.map_url || null,
    })
    .eq("id", eventId)
    .eq("day_id", ctx.day.id);

  if (error) return { ok: false, form: error.message };

  revalidatePath(`/trips/${slug}/days`);
  revalidatePath(`/trips/${slug}/days/${dayNumber}`);
  return { ok: true };
}

export async function deleteEventAction(
  slug: string,
  dayNumber: number,
  eventId: string
) {
  const username = await getCurrentUsername();
  if (!username) return;
  const admin = createAdminClient();
  await admin.from("events").delete().eq("id", eventId);
  revalidatePath(`/trips/${slug}/days`);
  revalidatePath(`/trips/${slug}/days/${dayNumber}`);
}

/**
 * Move an event up or down in the day's timeline by swapping
 * sort_order with its neighbour. Simpler than drag and drop and
 * works well on mobile.
 */
export async function reorderEventAction(
  slug: string,
  dayNumber: number,
  eventId: string,
  direction: "up" | "down"
) {
  const username = await getCurrentUsername();
  if (!username) return;
  const ctx = await resolveDayContext(slug, dayNumber);
  if (!ctx) return;

  const admin = createAdminClient();
  const { data: list } = await admin
    .from("events")
    .select("id,sort_order")
    .eq("day_id", ctx.day.id)
    .order("sort_order", { ascending: true });

  const events = (list ?? []) as Array<{ id: string; sort_order: number }>;
  const idx = events.findIndex((e) => e.id === eventId);
  if (idx < 0) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= events.length) return;

  const a = events[idx];
  const b = events[swapIdx];

  await admin.from("events").update({ sort_order: b.sort_order }).eq("id", a.id);
  await admin.from("events").update({ sort_order: a.sort_order }).eq("id", b.id);

  revalidatePath(`/trips/${slug}/days/${dayNumber}`);
}

/**
 * Update a day's editable metadata (title, detail, badge).
 * Sort order and date are managed by syncDaysForTrip.
 */
const dayMetaSchema = z.object({
  title: z.string().trim().max(120).optional().or(z.literal("")),
  detail: z.string().trim().max(400).optional().or(z.literal("")),
  badge: z.string().trim().max(24).optional().or(z.literal("")),
});

export async function updateDayMetaAction(
  slug: string,
  dayNumber: number,
  formData: FormData
) {
  const username = await getCurrentUsername();
  if (!username) return;
  const ctx = await resolveDayContext(slug, dayNumber);
  if (!ctx) return;

  const parsed = dayMetaSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    detail: String(formData.get("detail") ?? ""),
    badge: String(formData.get("badge") ?? ""),
  });
  if (!parsed.success) return;

  const admin = createAdminClient();
  await admin
    .from("days")
    .update({
      title: parsed.data.title || null,
      detail: parsed.data.detail || null,
      badge: parsed.data.badge || null,
    })
    .eq("id", ctx.day.id);

  revalidatePath(`/trips/${slug}/days`);
  revalidatePath(`/trips/${slug}/days/${dayNumber}`);
}

/**
 * Rebuild timeline events for a trip from the UI. Dedupes duplicate
 * stays, regenerates events with fresh enrichment (map preview,
 * booking URL, airline/airport action buttons) and refreshes each
 * day's auto-generated "краткое описание".
 *
 * Uses the same core as the bearer-token API route, just auth'd via
 * the session cookie. Users in the cloud preview / production can
 * trigger it without a terminal.
 */
export async function rebuildTimelineAction(slug: string) {
  const username = await getCurrentUsername();
  if (!username) return;
  const admin = createAdminClient();
  try {
    await rebuildTripEvents(admin, slug);
  } catch (e) {
    console.error("[rebuildTimelineAction]", e);
  }
  revalidatePath(`/trips/${slug}`);
  revalidatePath(`/trips/${slug}/days`);
}
