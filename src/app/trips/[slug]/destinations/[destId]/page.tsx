import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import OfflineBanner from "@/components/OfflineBanner";
import CityTabs, { type CityTab } from "@/components/CityTabs";
import Flag from "@/components/Flag";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Trip = {
  id: string;
  slug: string;
  title: string;
  country: string | null;
  primary_tz: string;
  color: string;
  date_from: string;
  date_to: string;
  archived_at: string | null;
};

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
      "id,slug,title,country,primary_tz,color,date_from,date_to,archived_at"
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
        "id,name,country,flag_code,lat,lon,timezone,date_from,date_to,type,photo_path,sort_order"
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

  // Параллелим stay (по dest.id) и signed URL обложки (по dest.photo_path).
  const coverPromise: Promise<string | null> = dest.photo_path
    ? admin.storage
        .from("photos")
        .createSignedUrl(dest.photo_path, 3600)
        .then((r) => r.data?.signedUrl ?? null)
    : Promise.resolve(null);
  const [{ data: stayData }, coverUrl] = await Promise.all([
    admin
      .from("stays")
      .select(
        "id,destination_id,title,address,host,host_phone,confirmation,price,currency,raw"
      )
      .eq("trip_id", trip.id)
      .eq("destination_id", dest.id)
      .maybeSingle(),
    coverPromise,
  ]);
  const stay = (stayData ?? null) as StayRow | null;
  const raw: StayRaw = stay?.raw ?? {};

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
