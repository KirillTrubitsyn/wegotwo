"use client";

import { useCallback, useEffect, useState } from "react";
import { getWeatherInfo, type CurrentWeather } from "../weather";

const REFRESH_MS = 10 * 60 * 1000;
const STORAGE_KEY = "wgt-weather-cache";

type Input = {
  /** IANA timezone, e.g. Europe/Podgorica */
  timezone: string;
  lat: number | null | undefined;
  lon: number | null | undefined;
};

type Cached = {
  fetchedAt: number;
  weather: CurrentWeather;
};

function cacheKey(lat: number, lon: number) {
  return `${STORAGE_KEY}:${lat.toFixed(3)},${lon.toFixed(3)}`;
}

function readCache(key: string): Cached | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as Cached;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: Cached) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota errors */
  }
}

async function fetchCurrent({
  timezone,
  lat,
  lon,
}: {
  timezone: string;
  lat: number;
  lon: number;
}): Promise<CurrentWeather> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,weather_code,is_day",
    timezone,
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  const data = await res.json();
  const c = data?.current;
  if (!c) throw new Error("empty current");
  const info = getWeatherInfo(c.weather_code, c.is_day === 1);
  return {
    temperature: Math.round(c.temperature_2m),
    weatherCode: c.weather_code,
    description: info.description,
    icon: info.icon,
    isDay: c.is_day === 1,
  };
}

export function useWeather({ timezone, lat, lon }: Input) {
  const [data, setData] = useState<CurrentWeather | null>(null);
  const hasCoords = typeof lat === "number" && typeof lon === "number";

  const refresh = useCallback(async () => {
    if (!hasCoords) return;
    const key = cacheKey(lat as number, lon as number);
    const cached = readCache(key);
    if (cached && Date.now() - cached.fetchedAt < REFRESH_MS) {
      setData(cached.weather);
      return;
    }
    try {
      const weather = await fetchCurrent({
        timezone,
        lat: lat as number,
        lon: lon as number,
      });
      setData(weather);
      writeCache(key, { weather, fetchedAt: Date.now() });
    } catch {
      if (cached) setData(cached.weather);
    }
  }, [hasCoords, lat, lon, timezone]);

  useEffect(() => {
    refresh();
    if (!hasCoords) return;
    const id = setInterval(refresh, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hasCoords, refresh]);

  return data;
}
