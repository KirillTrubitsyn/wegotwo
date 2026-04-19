/**
 * User-facing labels for document categories. Kinds come from the
 * CHECK constraint on public.documents.kind, which phase 5 extended
 * with passport / visa / ticket / booking while keeping the legacy
 * ingest values intact.
 *
 * `order` controls the group sequence on the docs list page.
 */
export type DocKind =
  | "passport"
  | "visa"
  | "ticket"
  | "booking"
  | "insurance"
  | "other"
  | "flight"
  | "stay"
  | "excursion"
  | "restaurant"
  | "transfer"
  | "rental"
  | "receipt";

export const DOC_KIND_LABELS: Record<
  string,
  { label: string; icon: string; order: number }
> = {
  passport: { label: "Паспорта", icon: "🪪", order: 10 },
  visa: { label: "Визы", icon: "🛂", order: 20 },
  ticket: { label: "Билеты", icon: "🎫", order: 30 },
  flight: { label: "Перелёты", icon: "✈️", order: 31 },
  booking: { label: "Брони", icon: "🏨", order: 40 },
  stay: { label: "Проживание", icon: "🏠", order: 41 },
  insurance: { label: "Страховки", icon: "🛡", order: 50 },
  transfer: { label: "Трансферы", icon: "🚐", order: 60 },
  rental: { label: "Аренда авто", icon: "🚗", order: 61 },
  excursion: { label: "Экскурсии", icon: "🎟", order: 70 },
  restaurant: { label: "Рестораны", icon: "🍽", order: 71 },
  receipt: { label: "Чеки", icon: "🧾", order: 90 },
  other: { label: "Другое", icon: "📄", order: 100 },
};

/**
 * Kinds exposed in the upload form. Legacy values (flight, stay,
 * excursion, ...) are still renderable but aren't offered manually,
 * they come from the ingest pipeline.
 */
export const UPLOADABLE_KINDS: DocKind[] = [
  "passport",
  "visa",
  "ticket",
  "booking",
  "insurance",
  "other",
];

export function labelForKind(kind: string): {
  label: string;
  icon: string;
  order: number;
} {
  return (
    DOC_KIND_LABELS[kind] ?? { label: kind, icon: "📄", order: 999 }
  );
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

export function extForMime(mime: string | null, fallback = "bin"): string {
  if (!mime) return fallback;
  const m = mime.toLowerCase();
  if (m === "application/pdf") return "pdf";
  if (m === "image/jpeg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/heic" || m === "image/heif") return "heic";
  if (m === "application/zip") return "zip";
  return fallback;
}
