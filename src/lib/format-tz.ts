/**
 * Format an ISO timestamptz into HH:MM in a specific IANA timezone.
 * Returns null for null/empty input.
 */
export function formatTimeInTz(iso: string | null, tz: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dtf = new Intl.DateTimeFormat("ru-RU", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = dtf.formatToParts(d);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = map.hour === "24" ? "00" : map.hour;
  return `${hour}:${map.minute}`;
}
