"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useWeather } from "@/lib/hooks/useWeather";
import { swatch, type TripColor } from "@/lib/trip-colors";

// Лайтбокс с фотографией K&M открывается только по клику на аватар.
// Грузим его лениво, чтобы portal + keydown listener + большая
// картинка не сидели в основном bundle Header'а на каждой странице.
const HeaderAvatarLightbox = dynamic(
  () => import("./HeaderAvatarLightbox"),
  { ssr: false }
);

type TripCtx = {
  /** IANA TZ of the trip, e.g. "Europe/Podgorica" */
  primaryTz: string;
  /** Trip accent color key */
  color: TripColor | string | null | undefined;
  /** Short label for the trip-side clock ("TZ", "Черногория", etc.). */
  clockLabel?: string;
  /** Optional coordinates for current-weather chip. */
  lat?: number | null;
  lon?: number | null;
  /** If true, hide the live clock row (used for archived trips). */
  hideClock?: boolean;
};

type Props = {
  title: string;
  subtitle?: string | null;
  /** href to render a Back arrow, usually "/" or trip root. */
  back?: string | null;
  /** If present, render live clocks and optional weather. */
  trip?: TripCtx | null;
  /** Replace the title text with an SVG wordmark (home screen). */
  logoSrc?: string | null;
  /** Show a standalone live Moscow clock row under the title. */
  mskClock?: boolean;
  /** Extra action slot rendered on the right side, before the avatar. */
  actions?: ReactNode;
};

const MSK_LABEL = "MSK";
// Moscow fallback for the weather chip on screens with no trip context.
const MSK_LAT = 55.7558;
const MSK_LON = 37.6173;

function formatTime(timeZone: string): string {
  return new Date().toLocaleString("ru-RU", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(timeZone: string): string {
  return new Date().toLocaleString("ru-RU", {
    timeZone,
    day: "numeric",
    month: "short",
  });
}

function formatWeekday(timeZone: string): string {
  const raw = new Date().toLocaleString("ru-RU", {
    timeZone,
    weekday: "short",
  });
  return raw.replace(/\.?$/, "").replace(/^./, (c) => c.toUpperCase());
}

export default function Header({
  title,
  subtitle,
  back,
  trip,
  logoSrc,
  mskClock,
  actions,
}: Props) {
  const [now, setNow] = useState<{ date: string; local: string; msk: string }>(
    { date: "", local: "", msk: "" }
  );
  const [mskNow, setMskNow] = useState<{
    weekday: string;
    date: string;
    time: string;
  }>({ weekday: "", date: "", time: "" });
  const [photoOpen, setPhotoOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!trip || trip.hideClock) return;
    const tick = () =>
      setNow({
        date: formatDate(trip.primaryTz),
        local: formatTime(trip.primaryTz),
        msk: formatTime("Europe/Moscow"),
      });
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [trip]);

  useEffect(() => {
    if (!mskClock) return;
    const tick = () =>
      setMskNow({
        weekday: formatWeekday("Europe/Moscow"),
        date: formatDate("Europe/Moscow"),
        time: formatTime("Europe/Moscow"),
      });
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [mskClock]);

  // Trip weather if we have coordinates; otherwise fall back to Moscow.
  const tripHasCoords =
    typeof trip?.lat === "number" && typeof trip?.lon === "number";
  const weatherTz = tripHasCoords ? trip!.primaryTz : "Europe/Moscow";
  const weatherLat = tripHasCoords ? (trip!.lat as number) : MSK_LAT;
  const weatherLon = tripHasCoords ? (trip!.lon as number) : MSK_LON;
  const weather = useWeather({
    timezone: weatherTz,
    lat: weatherLat,
    lon: weatherLon,
  });

  const s = swatch(trip?.color);
  const chipClass = tripHasCoords
    ? s.light
    : "bg-blue-lt text-blue";

  // Куда ведёт тап на чип погоды: полноценный экран прогноза.
  const weatherHref = (() => {
    const params = new URLSearchParams({
      lat: String(weatherLat),
      lon: String(weatherLon),
      tz: weatherTz,
    });
    if (tripHasCoords && trip?.clockLabel) {
      params.set("label", trip.clockLabel);
    } else if (!tripHasCoords) {
      params.set("label", MSK_LABEL);
    }
    if (trip?.color) params.set("color", String(trip.color));
    if (pathname && !pathname.startsWith("/weather")) {
      params.set("back", pathname);
    }
    return `/weather?${params.toString()}`;
  })();

  return (
    <header className="sticky top-0 z-[100] bg-white/[0.88] backdrop-blur-[24px] border-b border-black/[0.06] px-5 pt-[max(18px,env(safe-area-inset-top))] pb-4">
      <div className="flex items-center gap-3">
        {back && (
          <Link
            href={back}
            aria-label="Назад"
            className="w-9 h-9 -ml-2 rounded-full flex items-center justify-center text-text-sec active:bg-bg-surface"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M15 6l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        )}
        <div className="min-w-0 flex-1">
          {logoSrc ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logoSrc}
              alt={title}
              className="h-[40px] w-auto block select-none"
              draggable={false}
            />
          ) : (
            <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-text-main truncate">
              {title}
            </h1>
          )}
          {trip && !trip.hideClock ? (
            <p className="text-[13px] text-text-sec mt-[2px] tabular-nums">
              {now.date}
              {" · "}
              <span className={s.text}>
                {trip.clockLabel ?? "TZ"} {now.local}
              </span>
              {" / "}
              <span>
                {MSK_LABEL} {now.msk}
              </span>
            </p>
          ) : mskClock ? (
            <p className="text-[13px] text-text-sec mt-[4px] tabular-nums">
              {mskNow.weekday}
              {" · "}
              {mskNow.date}
              {" · "}
              <span className="font-mono font-semibold text-text-main">
                {MSK_LABEL} {mskNow.time}
              </span>
            </p>
          ) : subtitle ? (
            <p className="text-[13px] text-text-sec mt-[2px]">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-[8px] flex-shrink-0">
          {actions}
          {weather && (
            <Link
              href={weatherHref}
              className={`flex items-center gap-[4px] ${chipClass} px-[10px] py-[4px] rounded-[10px] active:opacity-80 transition-opacity`}
              aria-label={`Погода ${tripHasCoords ? "в поездке" : "в Москве"} — открыть прогноз на неделю`}
            >
              <span className="text-[16px] leading-none">{weather.icon}</span>
              <span className="font-mono text-[15px] font-bold leading-none">
                {weather.temperature > 0 ? "+" : ""}
                {weather.temperature}°
              </span>
            </Link>
          )}
          <button
            type="button"
            onClick={() => setPhotoOpen(true)}
            aria-label="Кирилл и Марина"
            className="focus:outline-none active:scale-95 transition-transform"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/photos/K&M.webp"
              alt="Кирилл и Марина"
              width={42}
              height={42}
              decoding="async"
              className="h-[42px] w-[42px] rounded-full shadow-avatar object-cover bg-white"
            />
          </button>
        </div>
      </div>

      {/*
        On-demand рендер: chunk лайтбокса не запрашивается, пока юзер
        не тапнул по аватару. Header сидит на каждой странице, и
        pre-загрузка кода portal'а на каждом маршруте была пустой
        тратой мобильного трафика.
      */}
      {photoOpen && (
        <HeaderAvatarLightbox
          open={photoOpen}
          onClose={() => setPhotoOpen(false)}
        />
      )}
    </header>
  );
}

