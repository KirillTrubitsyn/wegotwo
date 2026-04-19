/**
 * WMO weather codes with Russian labels and emoji icons.
 * Mirrors the mapping used in the europe-2026 reference.
 */

export type CurrentWeather = {
  temperature: number;
  weatherCode: number;
  description: string;
  icon: string;
  isDay: boolean;
};

type Entry = {
  description: string;
  icon: string;
  nightIcon?: string;
};

const WMO: Record<number, Entry> = {
  0: { description: "Ясно", icon: "☀️", nightIcon: "🌙" },
  1: { description: "Малооблачно", icon: "🌤", nightIcon: "🌙" },
  2: { description: "Переменная обл.", icon: "⛅", nightIcon: "☁️" },
  3: { description: "Облачно", icon: "☁️" },
  45: { description: "Туман", icon: "🌫" },
  48: { description: "Изморозь", icon: "🌫" },
  51: { description: "Лёгкая морось", icon: "🌦" },
  53: { description: "Морось", icon: "🌦" },
  55: { description: "Сильная морось", icon: "🌦" },
  56: { description: "Ледяная морось", icon: "🌧" },
  57: { description: "Сильная лед. морось", icon: "🌧" },
  61: { description: "Небольшой дождь", icon: "🌧" },
  63: { description: "Дождь", icon: "🌧" },
  65: { description: "Сильный дождь", icon: "🌧" },
  66: { description: "Лед. дождь", icon: "🌧" },
  67: { description: "Сильный лед. дождь", icon: "🌧" },
  71: { description: "Небольшой снег", icon: "🌨" },
  73: { description: "Снег", icon: "🌨" },
  75: { description: "Сильный снег", icon: "❄️" },
  77: { description: "Снежная крупа", icon: "🌨" },
  80: { description: "Ливень", icon: "🌧" },
  81: { description: "Сильный ливень", icon: "🌧" },
  82: { description: "Очень сильный ливень", icon: "🌧" },
  85: { description: "Снегопад", icon: "🌨" },
  86: { description: "Сильный снегопад", icon: "❄️" },
  95: { description: "Гроза", icon: "⛈" },
  96: { description: "Гроза с градом", icon: "⛈" },
  99: { description: "Сильная гроза", icon: "⛈" },
};

export function getWeatherInfo(code: number, isDay = true) {
  const entry = WMO[code] ?? { description: "Неизвестно", icon: "❓" };
  return {
    description: entry.description,
    icon: !isDay && entry.nightIcon ? entry.nightIcon : entry.icon,
  };
}
