import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import Header from "@/components/Header";
import OfflineBanner from "@/components/OfflineBanner";
import { getWeatherInfo } from "@/lib/weather";
import { swatch } from "@/lib/trip-colors";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DailyForecast = {
  date: string;
  weatherCode: number;
  tMax: number;
  tMin: number;
  precipProb: number | null;
  precipMm: number | null;
  windKmh: number | null;
  sunrise: string | null;
  sunset: string | null;
};

type CurrentNow = {
  temperature: number;
  weatherCode: number;
  isDay: boolean;
  feelsLike: number | null;
  humidity: number | null;
  windKmh: number | null;
};

type ForecastBundle = {
  daily: DailyForecast[];
  current: CurrentNow | null;
};

async function fetchForecast(
  lat: number,
  lon: number,
  tz: string
): Promise<ForecastBundle | null> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: tz,
    forecast_days: "7",
    current:
      "temperature_2m,weather_code,is_day,apparent_temperature,relative_humidity_2m,wind_speed_10m",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,sunrise,sunset",
  });
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?${params}`,
      { next: { revalidate: 600 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const d = data?.daily;
    if (!d?.time?.length) return null;

    const daily: DailyForecast[] = d.time.map((dateStr: string, i: number) => ({
      date: dateStr,
      weatherCode: d.weather_code?.[i] ?? 0,
      tMax: Math.round(d.temperature_2m_max?.[i] ?? 0),
      tMin: Math.round(d.temperature_2m_min?.[i] ?? 0),
      precipProb:
        typeof d.precipitation_probability_max?.[i] === "number"
          ? d.precipitation_probability_max[i]
          : null,
      precipMm:
        typeof d.precipitation_sum?.[i] === "number"
          ? d.precipitation_sum[i]
          : null,
      windKmh:
        typeof d.wind_speed_10m_max?.[i] === "number"
          ? Math.round(d.wind_speed_10m_max[i])
          : null,
      sunrise: d.sunrise?.[i] ?? null,
      sunset: d.sunset?.[i] ?? null,
    }));

    const c = data?.current;
    const current: CurrentNow | null = c
      ? {
          temperature: Math.round(c.temperature_2m ?? 0),
          weatherCode: c.weather_code ?? 0,
          isDay: c.is_day === 1,
          feelsLike:
            typeof c.apparent_temperature === "number"
              ? Math.round(c.apparent_temperature)
              : null,
          humidity:
            typeof c.relative_humidity_2m === "number"
              ? Math.round(c.relative_humidity_2m)
              : null,
          windKmh:
            typeof c.wind_speed_10m === "number"
              ? Math.round(c.wind_speed_10m)
              : null,
        }
      : null;

    return { daily, current };
  } catch {
    return null;
  }
}

function formatTime(iso: string | null, tz: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatTemp(t: number): string {
  return `${t > 0 ? "+" : ""}${t}°`;
}

export default async function WeatherPage({
  searchParams,
}: {
  searchParams: Promise<{
    lat?: string;
    lon?: string;
    tz?: string;
    label?: string;
    color?: string;
    back?: string;
  }>;
}) {
  const sp = await searchParams;
  const lat = Number(sp.lat);
  const lon = Number(sp.lon);
  const tz = sp.tz || "Europe/Moscow";
  const label = sp.label || "";
  const color = sp.color || null;
  // Разрешаем только относительные пути, чтобы исключить open-redirect.
  const back = sp.back && sp.back.startsWith("/") ? sp.back : "/";

  const valid = Number.isFinite(lat) && Number.isFinite(lon);
  const data = valid ? await fetchForecast(lat, lon, tz) : null;

  const s = swatch(color);

  return (
    <>
      <OfflineBanner />
      <Header
        title="Прогноз"
        subtitle={label || tz}
        back={back}
        mskClock={false}
      />

      <div className="px-5 pb-32 pt-4 space-y-4">
        {!valid ? (
          <Empty text="Координаты не заданы." />
        ) : !data ? (
          <Empty text="Не удалось загрузить прогноз. Попробуйте позже." />
        ) : (
          <>
            {data.current && (
              <CurrentCard
                current={data.current}
                label={label || tz}
                accent={s.text}
              />
            )}

            <section>
              <h2 className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold mb-2 px-1">
                На неделю
              </h2>
              <div className="bg-white rounded-card shadow-card divide-y divide-black/[0.06] overflow-hidden">
                {data.daily.map((d, i) => (
                  <DayRow
                    key={d.date}
                    forecast={d}
                    tz={tz}
                    isToday={i === 0}
                  />
                ))}
              </div>
            </section>

            <p className="text-[11px] text-text-mut text-center pt-2">
              Источник: Open-Meteo · {tz}
            </p>
          </>
        )}
      </div>
    </>
  );
}

function CurrentCard({
  current,
  label,
  accent,
}: {
  current: CurrentNow;
  label: string;
  accent: string;
}) {
  const info = getWeatherInfo(current.weatherCode, current.isDay);
  return (
    <section className="bg-white rounded-card shadow-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold">
            Сейчас
          </div>
          <div className="text-[13px] text-text-sec mt-[2px] truncate">
            {label}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[44px] leading-none font-mono font-semibold text-text-main tabular-nums">
            {formatTemp(current.temperature)}
          </div>
          <div className={`text-[13px] mt-1 ${accent} font-medium`}>
            {info.icon} {info.description}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-black/[0.06]">
        <Stat
          label="Ощущается"
          value={current.feelsLike != null ? formatTemp(current.feelsLike) : "—"}
        />
        <Stat
          label="Влажность"
          value={current.humidity != null ? `${current.humidity}%` : "—"}
        />
        <Stat
          label="Ветер"
          value={current.windKmh != null ? `${current.windKmh} км/ч` : "—"}
        />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.5px] text-text-mut font-semibold">
        {label}
      </div>
      <div className="text-[14px] font-medium text-text-main mt-[2px] tabular-nums">
        {value}
      </div>
    </div>
  );
}

function DayRow({
  forecast,
  tz,
  isToday,
}: {
  forecast: DailyForecast;
  tz: string;
  isToday: boolean;
}) {
  const date = parseISO(forecast.date);
  const weekday = isToday
    ? "Сегодня"
    : format(date, "EEEEEE", { locale: ru }).replace(/\.$/, "");
  const dayLabel = format(date, "d MMM", { locale: ru });
  const info = getWeatherInfo(forecast.weatherCode, true);

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-[70px] flex-shrink-0">
        <div className="text-[14px] font-semibold text-text-main capitalize">
          {weekday}
        </div>
        <div className="text-[11px] text-text-sec">{dayLabel}</div>
      </div>

      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-[22px] leading-none">{info.icon}</span>
        <div className="min-w-0">
          <div className="text-[13px] text-text-main truncate">
            {info.description}
          </div>
          <div className="text-[11px] text-text-sec flex items-center gap-2">
            {forecast.precipProb != null && forecast.precipProb > 0 && (
              <span title="Вероятность осадков">
                💧 {forecast.precipProb}%
              </span>
            )}
            {forecast.windKmh != null && forecast.windKmh >= 5 && (
              <span title="Ветер">💨 {forecast.windKmh}</span>
            )}
            {forecast.sunrise && (
              <span className="hidden xs:inline">
                ☀️ {formatTime(forecast.sunrise, tz)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-baseline gap-2 flex-shrink-0 tabular-nums font-mono">
        <span className="text-[15px] font-semibold text-text-main">
          {formatTemp(forecast.tMax)}
        </span>
        <span className="text-[13px] text-text-sec">
          {formatTemp(forecast.tMin)}
        </span>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-card bg-white shadow-card p-6 text-center">
      <p className="text-text-main font-medium text-[15px]">{text}</p>
    </div>
  );
}
