"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useWeather } from "@/lib/hooks/useWeather";
import { swatch, type TripColor } from "@/lib/trip-colors";

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
};

const MSK_LABEL = "MSK";

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

export default function Header({ title, subtitle, back, trip }: Props) {
  const [now, setNow] = useState<{ date: string; local: string; msk: string }>(
    { date: "", local: "", msk: "" }
  );

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

  const weather = useWeather({
    timezone: trip?.primaryTz ?? "Europe/Moscow",
    lat: trip?.lat ?? null,
    lon: trip?.lon ?? null,
  });

  const s = swatch(trip?.color);

  return (
    <header className="sticky top-0 z-[100] bg-white/[0.88] backdrop-blur-[24px] border-b border-black/[0.06] px-5 pt-[max(14px,env(safe-area-inset-top))] pb-3">
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
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-text-main truncate">
            {title}
          </h1>
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
          ) : subtitle ? (
            <p className="text-[13px] text-text-sec mt-[2px]">{subtitle}</p>
          ) : null}
        </div>
        {trip && weather && (
          <div
            className={`flex items-center gap-[4px] ${s.light} px-[10px] py-[4px] rounded-[10px] flex-shrink-0`}
          >
            <span className="text-[16px] leading-none">{weather.icon}</span>
            <span className="font-mono text-[15px] font-bold leading-none">
              {weather.temperature > 0 ? "+" : ""}
              {weather.temperature}°
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
