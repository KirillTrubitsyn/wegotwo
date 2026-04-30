import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import OfflineBanner from "@/components/OfflineBanner";
import CityTabs, { type CityTab } from "@/components/CityTabs";
import Flag from "@/components/Flag";
import DestinationEditTrigger from "@/components/DestinationEditTrigger";
import { createAdminClient } from "@/lib/supabase/admin";
import { CATEGORY_LABELS, formatMoney } from "@/lib/budget/labels";
import {
  updateDestinationAction,
  setDestinationCoverAction,
  clearManualDescriptionAction,
} from "../actions";

// ISR — как и остальные страницы поездки. Все мутации вызывают
// revalidatePath(`/trips/${slug}/destinations/${destId}`), поэтому
// данные обновляются сразу после правки города.
export const revalidate = 30;

type Trip = {
  id: string;
  slug: string;
  title: string;
  country: string | null;
  base_currency: string;
  primary_tz: string;
  color: string;
  date_from: string;
  date_to: string;
  archived_at: string | null;
};

type ExpenseRow = {
  id: string;
  category: string;
  amount_base: number | string | null;
  currency_base: string | null;
  merchant: string | null;
  description: string | null;
  occurred_on: string | null;
};

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "string" ? Number(v) : v;
}

type Destination = {
  id: string;
  name: string;
  country: string | null;
  flag_code: string | null;
  lat: number | null;
  lon: number | null;
  timezone: string | null;
  date_from: string | null;
  date_to: string | null;
  type: "home" | "stay" | "transit" | null;
  photo_path: string | null;
  sort_order: number | null;
  description: string | null;
  description_source: "auto" | "manual" | null;
};

type StayRaw = {
  id?: string;
  city?: string;
  name?: string;
  address?: string;
  mapEmbedUrl?: string;
  mapUrl?: string;
  checkIn?: string;
  checkOut?: string;
  confirmationLabel?: string;
  confirmationCode?: string;
  pin?: string;
  host?: string;
  price?: string;
  phone?: string;
  details?: string;
  bookingUrl?: string;
  bookingLabel?: string;
  checkinInstructions?: string[];
  wifi?: { network?: string; password?: string };
  extraDetails?: Array<{ label: string; value: string }>;
};

type StayRow = {
  id: string;
  destination_id: string | null;
  title: string | null;
  address: string | null;
  host: string | null;
  host_phone: string | null;
  confirmation: string | null;
  price: number | null;
  currency: string | null;
  raw: StayRaw | null;
};

function formatRange(from: string | null, to: string | null): string | null {
  if (!from || !to) return null;
  const a = parseISO(from);
  const b = parseISO(to);
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (sameMonth) {
    return `${format(a, "d", { locale: ru })}–${format(b, "d MMMM yyyy", {
      locale: ru,
    })}`;
  }
  return `${format(a, "d MMM", { locale: ru })} — ${format(b, "d MMM yyyy", {
    locale: ru,
  })}`;
}

export default async function DestinationPage({
  params,
}: {
  params: Promise<{ slug: string; destId: string }>;
}) {
  const { slug, destId } = await params;
  const admin = createAdminClient();

  const { data: tripData } = await admin
    .from("trips")
    .select(
      "id,slug,title,country,base_currency,primary_tz,color,date_from,date_to,archived_at"
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!tripData) notFound();
  const trip = tripData as Trip;

  // Параллелим destData (основной) с tabDestsRaw (для табов городов):
  // обе зависят только от trip.id.
  const [{ data: destData }, { data: tabDestsRaw }] = await Promise.all([
    admin
      .from("destinations")
      .select(
        "id,name,country,flag_code,lat,lon,timezone,date_from,date_to,type,photo_path,sort_order,description,description_source"
      )
      .eq("id", destId)
      .eq("trip_id", trip.id)
      .maybeSingle(),
    admin
      .from("destinations")
      .select("id,name,flag_code,type,sort_order,date_from")
      .eq("trip_id", trip.id)
      .in("type", ["stay", "home"])
      .order("sort_order", { ascending: true }),
  ]);
  if (!destData) notFound();
  const dest = destData as Destination;

  const cityTabs: CityTab[] = (tabDestsRaw ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    flagCode: (t.flag_code as string | null) ?? null,
    type: (t.type as string | null) ?? null,
    sortOrder: (t.sort_order as number | null) ?? null,
    dateFrom: (t.date_from as string | null) ?? null,
  }));

  // Параллелим stay, signed URL обложки и список расходов, привязанных
  // к этому городу. Список фотографий поездки для пикера обложки
  // больше не грузится здесь — он подтягивается лениво при открытии
  // модалки редактирования (см. /api/.../cover-photos), чтобы не
  // подписывать 120 thumb-URL'ов на каждом заходе в город.
  // TTL обложки города: страница ISR с возможным возрастом часами,
  // так что 7 дней безопаснее одного часа.
  const coverPromise: Promise<string | null> = dest.photo_path
    ? admin.storage
        .from("photos")
        .createSignedUrl(dest.photo_path, 60 * 60 * 24 * 7)
        .then((r) => r.data?.signedUrl ?? null)
    : Promise.resolve(null);
  const [
    { data: stayData },
    coverUrl,
    { data: expData },
  ] = await Promise.all([
    admin
      .from("stays")
      .select(
        "id,destination_id,title,address,host,host_phone,confirmation,price,currency,raw"
      )
      .eq("trip_id", trip.id)
      .eq("destination_id", dest.id)
      .maybeSingle(),
    coverPromise,
    admin
      .from("expenses")
      .select(
        "id,category,amount_base,currency_base,merchant,description,occurred_on"
      )
      .eq("trip_id", trip.id)
      .eq("destination_id", dest.id)
      .order("occurred_on", { ascending: false }),
  ]);
  const stay = (stayData ?? null) as StayRow | null;
  const raw: StayRaw = stay?.raw ?? {};

  // Агрегаты по расходам этого города. Суммы считаем в trip.base_currency,
  // которую commit-слой уже записал в amount_base / currency_base.
  const expenses = (expData ?? []) as ExpenseRow[];
  const baseCurrency = trip.base_currency;
  let expTotal = 0;
  const expByCategory: Record<string, number> = {};
  for (const e of expenses) {
    if (e.currency_base !== baseCurrency) continue;
    const amt = toNum(e.amount_base);
    expTotal += amt;
    expByCategory[e.category] = (expByCategory[e.category] ?? 0) + amt;
  }
  expTotal = Math.round(expTotal * 100) / 100;
  const expCategoryEntries = Object.entries(expByCategory)
    .map(([k, v]) => [k, Math.round(v * 100) / 100] as const)
    .sort((a, b) => b[1] - a[1]);

  const today = new Date().toISOString().slice(0, 10);
  const isPast = Boolean(trip.archived_at) || trip.date_to < today;

  const title = dest.name;
  const rangeLabel = formatRange(dest.date_from, dest.date_to);

  const priceLabel = raw.price
    ? raw.price
    : stay?.price != null && stay?.currency
    ? `${stay.price.toLocaleString("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} ${stay.currency}`
    : null;

  return (
    <>
      <OfflineBanner />
      <Header
        title={trip.title}
        subtitle={null}
        back={null}
        trip={
          !isPast
            ? {
                primaryTz: dest.timezone ?? trip.primary_tz,
                color: trip.color,
                clockLabel: dest.country
                  ? dest.country.slice(0, 3).toUpperCase()
                  : "TZ",
                lat: dest.lat,
                lon: dest.lon,
                hideClock: false,
              }
            : null
        }
      />

      <div className="px-5 pb-28 pt-4 space-y-4">
        <CityTabs slug={trip.slug} tabs={cityTabs} activeId={dest.id} />

        <Link
          href={`/trips/${trip.slug}`}
          className="inline-block text-[13px] text-text-sec hover:text-text-main"
        >
          ← Обзор
        </Link>

        {/* City headline */}
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[22px] font-bold text-text-main flex items-center gap-[10px]">
                <Flag code={dest.flag_code} size="md" />
                <span>{title}</span>
              </h1>
              {rangeLabel && (
                <div className="text-[13px] text-text-sec tnum mt-[2px]">
                  {rangeLabel}
                </div>
              )}
            </div>
            {!isPast && (
              <DestinationEditTrigger
                tripSlug={trip.slug}
                destId={dest.id}
                destName={dest.name}
                destDescription={dest.description ?? ""}
                descriptionSource={dest.description_source}
                currentPhotoStoragePath={dest.photo_path}
                save={async (fd: FormData) => {
                  "use server";
                  return await updateDestinationAction(
                    trip.slug,
                    dest.id,
                    fd
                  );
                }}
                setCover={async (photoId: string | null) => {
                  "use server";
                  return await setDestinationCoverAction(
                    trip.slug,
                    dest.id,
                    photoId
                  );
                }}
                clearManual={async () => {
                  "use server";
                  return await clearManualDescriptionAction(
                    trip.slug,
                    dest.id
                  );
                }}
              />
            )}
          </div>

          {dest.description && (
            <details className="mt-3 rounded-card bg-bg-surface border border-black/[0.06] group">
              <summary className="cursor-pointer list-none px-3 py-[10px] text-[12px] font-medium text-text-sec select-none flex items-center justify-between">
                <span>О городе</span>
                <span className="text-[11px] transition-transform group-open:rotate-180">
                  ▾
                </span>
              </summary>
              <div className="px-3 pb-3 pt-1 text-[13px] text-text-main leading-[1.55] whitespace-pre-line">
                {dest.description}
              </div>
            </details>
          )}
        </div>

        {/* Map block */}
        {(raw.mapEmbedUrl || raw.mapUrl || coverUrl) && (
          <div className="relative rounded-card overflow-hidden shadow-card bg-bg-surface">
            {raw.mapEmbedUrl ? (
              <iframe
                src={raw.mapEmbedUrl}
                className="w-full h-[220px] block border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            ) : coverUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={coverUrl}
                alt={dest.name}
                className="w-full h-[220px] object-cover"
                loading="lazy"
              />
            ) : null}
            {raw.mapUrl && (
              <a
                href={raw.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute top-3 left-3 inline-flex items-center gap-[5px] px-[12px] py-[7px] rounded-badge text-[12px] font-medium bg-white shadow-card text-blue hover:bg-blue-lt"
              >
                <span>🗺</span> Карты ↗
              </a>
            )}
          </div>
        )}

        {/* Stay card */}
        {stay && (
          <div className="bg-white rounded-card shadow-card p-5 space-y-4">
            <div>
              <h2 className="text-[17px] font-bold text-text-main">
                {stay.title ?? raw.name ?? "Проживание"}
              </h2>
              {stay.address && (
                <div className="text-[13px] text-text-sec mt-[4px] whitespace-pre-line leading-[1.45]">
                  {stay.address}
                </div>
              )}
            </div>

            {(raw.confirmationCode || stay.confirmation) && (
              <div className="rounded-card bg-blue-lt border border-blue/15 p-4">
                <div className="text-[10px] uppercase tracking-[0.6px] text-blue font-semibold mb-[4px]">
                  {raw.confirmationLabel ?? "Код подтверждения"}
                </div>
                <div className="text-[22px] font-mono font-bold text-blue tracking-[3px] tnum">
                  {raw.confirmationCode ?? stay.confirmation}
                </div>
              </div>
            )}

            {/* Compact meta grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {raw.checkIn && (
                <MetaItem label="Заезд" value={raw.checkIn} />
              )}
              {raw.checkOut && (
                <MetaItem label="Выезд" value={raw.checkOut} />
              )}
              {(stay.host || raw.host) && (
                <MetaItem
                  label="Хозяин"
                  value={(stay.host ?? raw.host) as string}
                />
              )}
              {priceLabel && <MetaItem label="Оплачено" value={priceLabel} />}
              {raw.pin && <MetaItem label="PIN" value={raw.pin} />}
              {raw.wifi?.network && (
                <MetaItem label="Wi-Fi" value={raw.wifi.network} />
              )}
              {raw.wifi?.password && (
                <MetaItem label="Пароль" value={raw.wifi.password} />
              )}
              {(stay.host_phone || raw.phone) && (
                <MetaItem
                  label="Телефон"
                  value={(stay.host_phone ?? raw.phone) as string}
                />
              )}
            </div>

            {raw.details && (
              <div className="text-[13px] text-text-sec leading-[1.5]">
                {raw.details}
              </div>
            )}

            {/* Check-in instructions */}
            {raw.checkinInstructions && raw.checkinInstructions.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold mb-2">
                  Как попасть в квартиру
                </div>
                <ol className="space-y-[6px]">
                  {raw.checkinInstructions.map((line, i) => (
                    <li
                      key={i}
                      className="flex gap-[10px] text-[13px] text-text-main leading-[1.5]"
                    >
                      <span className="font-semibold text-text-sec tnum w-[18px] shrink-0">
                        {i + 1}.
                      </span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Action chips */}
            <div className="flex flex-wrap gap-2">
              {raw.bookingUrl && (
                <a
                  href={raw.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-[5px] px-[14px] py-[7px] rounded-badge text-[12px] font-medium bg-gold-lt border border-gold/30 text-[#8a6200] hover:bg-gold/25"
                >
                  <span>🔑</span> {raw.bookingLabel ?? "Бронирование"}
                </a>
              )}
              {(stay.host_phone || raw.phone) && (
                <a
                  href={`tel:${(stay.host_phone ?? raw.phone ?? "").replace(
                    /[^+\d]/g,
                    ""
                  )}`}
                  className="inline-flex items-center gap-[5px] px-[14px] py-[7px] rounded-badge text-[12px] font-medium bg-green-lt border border-green/30 text-green hover:bg-green/20"
                >
                  <span>📞</span> Позвонить
                </a>
              )}
              {raw.mapUrl && (
                <a
                  href={raw.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-[5px] px-[14px] py-[7px] rounded-badge text-[12px] font-medium bg-blue-lt border border-blue/20 text-blue hover:bg-blue/15"
                >
                  <span>🗺</span> На карте
                </a>
              )}
            </div>
          </div>
        )}

        {!stay && (
          <div className="bg-white rounded-card shadow-card p-5 text-text-sec text-[13px]">
            Детали проживания для этого города ещё не заполнены.
          </div>
        )}

        {/* Expenses by city */}
        {expenses.length > 0 && (
          <div className="bg-white rounded-card shadow-card p-5">
            <div className="flex items-baseline justify-between mb-3">
              <div className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold">
                Траты в городе
              </div>
              <div className="font-mono text-[16px] font-bold text-text-main tnum">
                {formatMoney(expTotal, baseCurrency)}
              </div>
            </div>
            <div className="space-y-2 mb-4">
              {expCategoryEntries.map(([cat, sum]) => {
                const pct = expTotal > 0 ? (sum / expTotal) * 100 : 0;
                const label = CATEGORY_LABELS[cat] ?? {
                  label: cat,
                  icon: "•",
                };
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-text-main">
                        {label.icon} {label.label}
                      </span>
                      <span className="font-mono text-text-sec tnum">
                        {formatMoney(sum, baseCurrency)}
                      </span>
                    </div>
                    <div className="h-[3px] bg-bg-surface rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full bg-blue"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <Link
              href={`/trips/${trip.slug}/budget`}
              className="inline-block text-[13px] text-blue font-medium"
            >
              Все траты поездки →
            </Link>
          </div>
        )}
      </div>

      <BottomNav slug={trip.slug} />
    </>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.5px] text-text-sec font-semibold mb-[2px]">
        {label}
      </div>
      <div className="text-[14px] text-text-main font-medium tnum">
        {value}
      </div>
    </div>
  );
}
