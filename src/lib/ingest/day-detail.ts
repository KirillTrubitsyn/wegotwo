/**
 * Auto-generate `days.detail` (one-line краткое описание дня)
 * from the ingested events on that day.
 *
 * Priority: flights first (they define the "shape" of the day),
 * then stay check-ins (start of a new city), then check-outs, then
 * activities/meals. We keep the summary short — max ~80 chars —
 * because the day-card renders it as a subtitle.
 *
 * Called after ingest from `commit.ts` and from the backfill
 * endpoint `rebuild-events`. We only overwrite an existing detail
 * if the stored value is empty OR equals a previously auto-generated
 * string (we detect that with the invisible marker prefix below).
 * Manual edits from the UI use `updateDayMetaAction` which does not
 * set the marker, so the user's text is never clobbered.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Invisible marker stored at the start of auto-generated details.
 *  Using a zero-width joiner keeps the visible string clean. */
export const AUTOGEN_MARKER = "\u200d";

type EventRow = {
  kind: string;
  title: string;
  start_at: string | null;
  sort_order: number | null;
};

export function formatDayDetail(events: EventRow[]): string | null {
  if (events.length === 0) return null;

  const sorted = [...events].sort((a, b) => {
    const ta = a.start_at ? Date.parse(a.start_at) : Number.POSITIVE_INFINITY;
    const tb = b.start_at ? Date.parse(b.start_at) : Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

  const parts: string[] = [];
  const seen = new Set<string>();
  const add = (s: string | null | undefined) => {
    if (!s) return;
    const t = s.trim();
    if (!t) return;
    if (seen.has(t.toLowerCase())) return;
    seen.add(t.toLowerCase());
    parts.push(t);
  };

  for (const e of sorted) {
    if (parts.length >= 3) break;
    const t = e.title.trim();
    if (!t) continue;
    if (e.kind === "flight") {
      // Flight title: "Air Algérie AH3001: Москва → Алжир".
      // Strip the airline + code; keep the route.
      const m = t.match(/:\s*(.+→.+)$/);
      add(m ? `Перелёт ${m[1].trim()}` : t);
    } else if (e.kind === "stay") {
      if (t.startsWith("Заселение")) add("Заселение");
      else if (t.startsWith("Выезд")) add("Выезд");
      else add(t);
    } else {
      add(t);
    }
  }

  if (parts.length === 0) return null;
  const joined = parts.join(" · ");
  // Cap length so it fits the day card nicely.
  return joined.length > 90 ? joined.slice(0, 87).trimEnd() + "…" : joined;
}

/**
 * Fetch all events for a day and regenerate its `detail` if it is
 * empty or was previously auto-generated (marker-prefixed).
 */
export async function refreshDayDetail(
  admin: SupabaseClient,
  dayId: string
): Promise<string | null> {
  const { data: day } = await admin
    .from("days")
    .select("id,detail")
    .eq("id", dayId)
    .maybeSingle();
  if (!day) return null;
  const current = (day as { detail: string | null }).detail ?? "";
  const isAutogenOrEmpty =
    current === "" || current.startsWith(AUTOGEN_MARKER);
  if (!isAutogenOrEmpty) return current;

  const { data: events } = await admin
    .from("events")
    .select("kind,title,start_at,sort_order")
    .eq("day_id", dayId);
  const list = (events ?? []) as EventRow[];
  const summary = formatDayDetail(list);
  const next = summary ? `${AUTOGEN_MARKER}${summary}` : null;
  await admin.from("days").update({ detail: next }).eq("id", dayId);
  return summary;
}

/**
 * Strip the autogen marker for display. UI callers pass the
 * raw column value and get the clean string back.
 */
export function displayDayDetail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.startsWith(AUTOGEN_MARKER) ? raw.slice(AUTOGEN_MARKER.length) : raw;
}
