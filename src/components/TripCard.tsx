import Link from "next/link";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

type Props = {
  slug: string;
  title: string;
  country?: string | null;
  dateFrom: string;
  dateTo: string;
  coverUrl?: string | null;
  variant?: "hero" | "tile";
};

export default function TripCard({
  slug,
  title,
  country,
  dateFrom,
  dateTo,
  coverUrl,
  variant = "tile",
}: Props) {
  const from = parseISO(dateFrom);
  const to = parseISO(dateTo);
  const today = new Date();
  const daysUntil = differenceInCalendarDays(from, today);
  const rangeLabel = `${format(from, "d MMM", { locale: ru })} — ${format(
    to,
    "d MMM yyyy",
    { locale: ru }
  )}`;

  const countdown =
    daysUntil > 0
      ? `через ${daysUntil} ${plural(daysUntil, ["день", "дня", "дней"])}`
      : daysUntil === 0
      ? "сегодня"
      : daysUntil >= -1
      ? "идёт сейчас"
      : "завершена";

  if (variant === "hero") {
    return (
      <Link
        href={`/trips/${slug}`}
        className="block relative rounded-card overflow-hidden shadow-card aspect-[16/11] bg-bg-surface"
      >
        {coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            loading="eager"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/0 to-black/60" />
        <div className="absolute inset-x-0 bottom-0 p-5 text-white">
          <div className="text-[11px] uppercase tracking-[0.6px] opacity-80">
            Ближайшая поездка · {countdown}
          </div>
          <div className="font-semibold text-[24px] tracking-tight mt-1">
            {title}
          </div>
          <div className="text-[13px] opacity-90 mt-0.5">{rangeLabel}</div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/trips/${slug}`}
      className="block rounded-card overflow-hidden shadow-card bg-bg-surface aspect-square relative"
    >
      {coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/0 to-black/55" />
      <div className="absolute inset-x-0 bottom-0 p-3 text-white">
        <div className="font-semibold text-[15px] leading-tight">{title}</div>
        <div className="text-[11px] opacity-85 mt-0.5">{rangeLabel}</div>
      </div>
    </Link>
  );
}

function plural(n: number, forms: [string, string, string]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}
