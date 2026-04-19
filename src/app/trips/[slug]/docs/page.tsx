import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import OfflineBanner from "@/components/OfflineBanner";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOC_KIND_LABELS, formatBytes, labelForKind } from "@/lib/docs/labels";

export const dynamic = "force-dynamic";

type Trip = {
  id: string;
  slug: string;
  title: string;
  primary_tz: string;
  country: string | null;
  color: string;
  date_to: string;
  archived_at: string | null;
};

type DocRow = {
  id: string;
  kind: string;
  title: string;
  size_bytes: number | string | null;
  mime: string | null;
  created_at: string;
};

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "string" ? Number(v) : v;
}

export default async function DocsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: tripData } = await admin
    .from("trips")
    .select(
      "id,slug,title,primary_tz,country,color,date_to,archived_at"
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!tripData) notFound();
  const trip = tripData as Trip;

  const { data: docData } = await admin
    .from("documents")
    .select("id,kind,title,size_bytes,mime,created_at")
    .eq("trip_id", trip.id)
    .eq("archived", false)
    .order("created_at", { ascending: false });
  const docs = (docData ?? []) as DocRow[];

  // Group by kind in the order defined in DOC_KIND_LABELS.
  const groups = new Map<string, DocRow[]>();
  for (const d of docs) {
    const arr = groups.get(d.kind) ?? [];
    arr.push(d);
    groups.set(d.kind, arr);
  }
  const sortedKinds = Array.from(groups.keys()).sort((a, b) => {
    return labelForKind(a).order - labelForKind(b).order;
  });

  const today = new Date().toISOString().slice(0, 10);
  const isPast = Boolean(trip.archived_at) || trip.date_to < today;

  return (
    <>
      <OfflineBanner />
      <Header
        title="Документы"
        subtitle={trip.title}
        back={`/trips/${trip.slug}`}
        trip={
          !isPast
            ? {
                primaryTz: trip.primary_tz,
                color: trip.color,
                clockLabel: trip.country
                  ? trip.country.slice(0, 3).toUpperCase()
                  : "TZ",
                hideClock: false,
              }
            : null
        }
      />

      <div className="px-5 pb-28 pt-4 space-y-5">
        {docs.length === 0 ? (
          <div className="rounded-card bg-white shadow-card p-6 text-center">
            <p className="text-text-main font-medium text-[15px]">
              Документов пока нет
            </p>
            <p className="text-text-sec text-[13px] mt-1">
              Загрузите паспорт, визу, билет или бронь кнопкой ниже.
            </p>
          </div>
        ) : (
          sortedKinds.map((kind) => {
            const rows = groups.get(kind)!;
            const label = DOC_KIND_LABELS[kind] ?? {
              label: kind,
              icon: "📄",
              order: 999,
            };
            return (
              <section key={kind}>
                <div className="flex items-center justify-between mb-2 px-1">
                  <h2 className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold">
                    {label.icon} {label.label}
                  </h2>
                  <span className="text-[12px] text-text-sec">
                    {rows.length}
                  </span>
                </div>
                <div className="bg-white rounded-card shadow-card divide-y divide-black/[0.05]">
                  {rows.map((d) => (
                    <DocRowView
                      key={d.id}
                      doc={d}
                      tripSlug={trip.slug}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>

      <Link
        href={`/trips/${trip.slug}/docs/new`}
        className="fixed bottom-[max(72px,calc(env(safe-area-inset-bottom)+72px))] left-1/2 -translate-x-1/2 w-[calc(100%-40px)] max-w-[440px] bg-text-main text-white rounded-btn py-[14px] text-[15px] font-medium text-center shadow-float active:opacity-85"
      >
        + Документ
      </Link>

      <BottomNav slug={trip.slug} />
    </>
  );
}

function DocRowView({
  doc: d,
  tripSlug,
}: {
  doc: DocRow;
  tripSlug: string;
}) {
  const label = labelForKind(d.kind);
  const size = toNum(d.size_bytes);
  const isPdf = d.mime === "application/pdf";
  const isImage = (d.mime ?? "").startsWith("image/");
  const typeHint = isPdf ? "PDF" : isImage ? "Изображение" : "Файл";

  return (
    <Link
      href={`/trips/${tripSlug}/docs/${d.id}`}
      className="flex items-center gap-3 px-4 py-3 active:bg-bg-surface"
    >
      <div className="w-9 h-9 rounded-full bg-bg-surface flex items-center justify-center text-[15px] flex-shrink-0">
        {label.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-text-main truncate">
          {d.title}
        </div>
        <div className="text-[12px] text-text-sec truncate">
          {typeHint}
          {size > 0 ? ` · ${formatBytes(size)}` : ""}
        </div>
      </div>
      <div className="text-text-sec text-[18px] flex-shrink-0">›</div>
    </Link>
  );
}
