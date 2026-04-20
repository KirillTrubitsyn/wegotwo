import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import OfflineBanner from "@/components/OfflineBanner";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedDocUrl } from "@/lib/docs/storage";
import { resolveHeaderDestination } from "@/lib/trips/header-ctx";
import ReceiptPreview from "./ReceiptPreview";
import { commitScanAction, discardScanAction } from "../actions";

export const dynamic = "force-dynamic";

type ParsedShape = {
  type?: "flight" | "stay" | "expense" | "unknown";
  summary?: string;
  confidence?: number;
  expense?: {
    merchant?: string | null;
    description?: string | null;
    occurred_on?: string | null;
    amount?: number | null;
    currency?: string | null;
    category?: string | null;
    items?: { description?: string | null; amount?: number | null }[] | null;
  };
  error?: string;
};

export default async function ScanPreviewPage({
  params,
}: {
  params: Promise<{ slug: string; docId: string }>;
}) {
  const { slug, docId } = await params;
  const admin = createAdminClient();

  const { data: tripData } = await admin
    .from("trips")
    .select(
      "id,slug,title,base_currency,country,primary_tz,color,date_from,date_to,archived_at"
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!tripData) notFound();
  const trip = tripData as {
    id: string;
    slug: string;
    title: string;
    base_currency: string;
    country: string | null;
    primary_tz: string;
    color: string;
    date_from: string;
    date_to: string;
    archived_at: string | null;
  };

  const { data: docData } = await admin
    .from("documents")
    .select(
      "id,trip_id,title,storage_path,mime,size_bytes,parsed_fields,parsed_status"
    )
    .eq("id", docId)
    .eq("trip_id", trip.id)
    .maybeSingle();
  if (!docData) notFound();
  const doc = docData as {
    id: string;
    title: string;
    storage_path: string;
    mime: string | null;
    size_bytes: number | null;
    parsed_fields: ParsedShape | null;
    parsed_status: string | null;
  };

  const previewUrl = await signedDocUrl(admin, doc.storage_path);
  const today = new Date().toISOString().slice(0, 10);
  const isPast = Boolean(trip.archived_at) || trip.date_to < today;
  const stayCity = await resolveHeaderDestination(admin, trip.id);

  const pd = doc.parsed_fields ?? {};
  const expense = pd?.expense ?? {};

  // Подбираем дефолты: дата в диапазоне поездки, сумма из Gemini,
  // валюта — сначала из документа, иначе валюта страны пребывания.
  const defaultDate = coerceDateInRange(
    expense.occurred_on ?? null,
    trip.date_from,
    trip.date_to
  );
  const defaultCurrency =
    pickCurrency(expense.currency ?? null) ?? trip.base_currency;

  const commit = commitScanAction.bind(null, slug, docId);
  const discard = discardScanAction.bind(null, slug, docId);

  const parsedStatus = (doc.parsed_status ?? null) as
    | "pending"
    | "needs_review"
    | "parsed"
    | "failed"
    | "skipped"
    | null;

  // Если документ уже закоммичен — возвращаем пользователя на /budget.
  // Теоретически не должно случаться в обычном потоке, но защищаемся.
  const alreadyCommitted = parsedStatus === "parsed";

  return (
    <>
      <OfflineBanner />
      <Header
        title="Проверьте чек"
        subtitle={trip.title}
        back={`/trips/${slug}/budget`}
        trip={
          !isPast
            ? {
                primaryTz: trip.primary_tz,
                color: trip.color,
                clockLabel: stayCity?.label ?? (
                  trip.country
                    ? trip.country.slice(0, 3).toUpperCase()
                    : "TZ"
                ),
                lat: stayCity?.lat ?? null,
                lon: stayCity?.lon ?? null,
                hideClock: false,
              }
            : null
        }
      />

      <div className="px-5 pb-10 pt-4 space-y-4">
        {alreadyCommitted ? (
          <div className="bg-green-lt border border-green/20 rounded-card p-4 text-[13px] text-green">
            Этот чек уже сохранён как расход.{" "}
            <Link
              href={`/trips/${slug}/budget`}
              className="underline underline-offset-2"
            >
              Вернуться в бюджет
            </Link>
            .
          </div>
        ) : (
          <ReceiptPreview
            commitAction={commit}
            discardAction={discard}
            slug={slug}
            docId={docId}
            previewUrl={previewUrl}
            parsedSummary={pd?.summary ?? null}
            parsedConfidence={pd?.confidence ?? null}
            parsedType={pd?.type ?? null}
            parsedError={pd?.error ?? null}
            defaults={{
              occurred_on: defaultDate,
              category: pickCategory(expense.category ?? null),
              merchant: expense.merchant ?? "",
              description: expense.description ?? "",
              amount_original: formatAmount(expense.amount ?? null),
              currency_original: defaultCurrency,
            }}
            baseCurrency={trip.base_currency}
            initialItems={(expense.items ?? []).map((it) => ({
              description: it?.description ?? null,
              amount: typeof it?.amount === "number" ? it.amount : null,
            }))}
          />
        )}
      </div>
    </>
  );
}

function coerceDateInRange(
  d: string | null,
  from: string,
  to: string
): string {
  const today = new Date().toISOString().slice(0, 10);
  const candidate = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  if (candidate && candidate >= from && candidate <= to) return candidate;
  if (today >= from && today <= to) return today;
  return from;
}

function pickCategory(c: string | null): string {
  const allowed = [
    "flight",
    "transport",
    "accommodation",
    "restaurant",
    "groceries",
    "tours",
    "activities",
    "tickets",
    "shopping",
    "telecom",
    "fees",
    "other",
  ];
  if (c && allowed.includes(c)) return c;
  return "restaurant"; // чеки чаще всего — рестораны/кафе
}

function pickCurrency(c: string | null): string | null {
  if (!c) return null;
  const n = c.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(n) ? n : null;
}

function formatAmount(n: number | null): string {
  if (n == null) return "";
  if (!Number.isFinite(n)) return "";
  return (Math.round(n * 100) / 100).toString().replace(".", ",");
}
