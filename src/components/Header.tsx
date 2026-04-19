"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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

export default function Header({ title, subtitle, back, trip }: Props) {
  const [now, setNow] = useState<{ date: string; local: string; msk: string }>(
    { date: "", local: "", msk: "" }
  );
  const [photoOpen, setPhotoOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

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

  // Close the lightbox on Escape.
  useEffect(() => {
    if (!photoOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPhotoOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photoOpen]);

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
        <div className="flex items-center gap-[8px] flex-shrink-0">
          {weather && (
            <div
              className={`flex items-center gap-[4px] ${chipClass} px-[10px] py-[4px] rounded-[10px]`}
              aria-label={`Погода ${tripHasCoords ? "в поездке" : "в Москве"}`}
            >
              <span className="text-[16px] leading-none">{weather.icon}</span>
              <span className="font-mono text-[15px] font-bold leading-none">
                {weather.temperature > 0 ? "+" : ""}
                {weather.temperature}°
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setPhotoOpen(true)}
            aria-label="Кирилл и Марина"
            className="focus:outline-none active:scale-95 transition-transform"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/photos/K&M.svg"
              alt="Кирилл и Марина"
              className="h-[42px] w-[42px] rounded-full shadow-avatar object-cover bg-white"
            />
          </button>
        </div>
      </div>

      {mounted && photoOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[999] bg-black/90 backdrop-blur-md flex items-center justify-center"
              onClick={() => setPhotoOpen(false)}
              role="dialog"
              aria-modal="true"
            >
              <button
                type="button"
                onClick={() => setPhotoOpen(false)}
                className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors z-[1000]"
                style={{ marginTop: "env(safe-area-inset-top)" }}
                aria-label="Закрыть"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <div
                className="w-[90vw] max-w-[400px] rounded-[16px] overflow-hidden shadow-2xl bg-white"
                onClick={(e) => e.stopPropagation()}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/photos/K&M.svg"
                  alt="Кирилл и Марина"
                  className="w-full h-auto block"
                />
              </div>
            </div>,
            document.body
          )
        : null}
    </header>
  );
}

