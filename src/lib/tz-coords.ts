/**
 * Координаты столиц/центров по IANA-таймзоне. Используется как fallback,
 * когда у поездки ещё нет destination типа `stay` с заполненными
 * координатами — чтобы погодный чип в хэдере показывал погоду города
 * поездки, а не Москвы.
 *
 * Покрывает наиболее частые направления; при необходимости легко
 * расширяется. Если TZ нет в карте — пусть Header сам решит, на что
 * фолбэчиться (обычно Москва).
 */

type Coords = { lat: number; lon: number; label: string };

const MAP: Record<string, Coords> = {
  // Россия / СНГ
  "Europe/Moscow": { lat: 55.7558, lon: 37.6173, label: "MSK" },
  "Europe/Kaliningrad": { lat: 54.7104, lon: 20.4522, label: "KGD" },
  "Europe/Samara": { lat: 53.1959, lon: 50.1008, label: "SAM" },
  "Asia/Yekaterinburg": { lat: 56.8389, lon: 60.6057, label: "EKB" },
  "Asia/Novosibirsk": { lat: 55.0084, lon: 82.9357, label: "NOV" },
  "Asia/Vladivostok": { lat: 43.1198, lon: 131.8869, label: "VVO" },
  "Europe/Minsk": { lat: 53.9006, lon: 27.559, label: "MSQ" },
  "Asia/Almaty": { lat: 43.2389, lon: 76.8897, label: "ALA" },
  "Asia/Tbilisi": { lat: 41.7151, lon: 44.8271, label: "TBS" },
  "Asia/Yerevan": { lat: 40.1792, lon: 44.4991, label: "EVN" },
  "Asia/Baku": { lat: 40.4093, lon: 49.8671, label: "BAK" },

  // Европа
  "Europe/Podgorica": { lat: 42.4304, lon: 19.2594, label: "POD" },
  "Europe/Belgrade": { lat: 44.7866, lon: 20.4489, label: "BEG" },
  "Europe/Sarajevo": { lat: 43.8563, lon: 18.4131, label: "SJJ" },
  "Europe/Zagreb": { lat: 45.815, lon: 15.9819, label: "ZAG" },
  "Europe/Athens": { lat: 37.9838, lon: 23.7275, label: "ATH" },
  "Europe/Istanbul": { lat: 41.0082, lon: 28.9784, label: "IST" },
  "Europe/Sofia": { lat: 42.6977, lon: 23.3219, label: "SOF" },
  "Europe/Bucharest": { lat: 44.4268, lon: 26.1025, label: "BUH" },
  "Europe/Budapest": { lat: 47.4979, lon: 19.0402, label: "BUD" },
  "Europe/Vienna": { lat: 48.2082, lon: 16.3738, label: "VIE" },
  "Europe/Prague": { lat: 50.0755, lon: 14.4378, label: "PRG" },
  "Europe/Warsaw": { lat: 52.2297, lon: 21.0122, label: "WAW" },
  "Europe/Berlin": { lat: 52.52, lon: 13.405, label: "BER" },
  "Europe/Amsterdam": { lat: 52.3676, lon: 4.9041, label: "AMS" },
  "Europe/Brussels": { lat: 50.8503, lon: 4.3517, label: "BRU" },
  "Europe/Paris": { lat: 48.8566, lon: 2.3522, label: "PAR" },
  "Europe/London": { lat: 51.5072, lon: -0.1276, label: "LON" },
  "Europe/Dublin": { lat: 53.3498, lon: -6.2603, label: "DUB" },
  "Europe/Madrid": { lat: 40.4168, lon: -3.7038, label: "MAD" },
  "Europe/Lisbon": { lat: 38.7169, lon: -9.1399, label: "LIS" },
  "Europe/Rome": { lat: 41.9028, lon: 12.4964, label: "ROM" },
  "Europe/Zurich": { lat: 47.3769, lon: 8.5417, label: "ZRH" },
  "Europe/Copenhagen": { lat: 55.6761, lon: 12.5683, label: "CPH" },
  "Europe/Stockholm": { lat: 59.3293, lon: 18.0686, label: "STO" },
  "Europe/Oslo": { lat: 59.9139, lon: 10.7522, label: "OSL" },
  "Europe/Helsinki": { lat: 60.1699, lon: 24.9384, label: "HEL" },
  "Europe/Tallinn": { lat: 59.437, lon: 24.7536, label: "TLL" },
  "Europe/Riga": { lat: 56.9496, lon: 24.1052, label: "RIX" },
  "Europe/Vilnius": { lat: 54.6872, lon: 25.2797, label: "VNO" },
  "Atlantic/Reykjavik": { lat: 64.1466, lon: -21.9426, label: "REK" },

  // Ближний Восток
  "Asia/Dubai": { lat: 25.2048, lon: 55.2708, label: "DXB" },
  "Asia/Qatar": { lat: 25.2854, lon: 51.531, label: "DOH" },
  "Asia/Riyadh": { lat: 24.7136, lon: 46.6753, label: "RUH" },
  "Asia/Tel_Aviv": { lat: 32.0853, lon: 34.7818, label: "TLV" },
  "Asia/Jerusalem": { lat: 31.7683, lon: 35.2137, label: "JLM" },

  // Азия
  "Asia/Bangkok": { lat: 13.7563, lon: 100.5018, label: "BKK" },
  "Asia/Singapore": { lat: 1.3521, lon: 103.8198, label: "SIN" },
  "Asia/Hong_Kong": { lat: 22.3193, lon: 114.1694, label: "HKG" },
  "Asia/Shanghai": { lat: 31.2304, lon: 121.4737, label: "SHA" },
  "Asia/Tokyo": { lat: 35.6762, lon: 139.6503, label: "TYO" },
  "Asia/Seoul": { lat: 37.5665, lon: 126.978, label: "SEL" },
  "Asia/Kuala_Lumpur": { lat: 3.139, lon: 101.6869, label: "KUL" },
  "Asia/Jakarta": { lat: -6.2088, lon: 106.8456, label: "JKT" },
  "Asia/Kolkata": { lat: 22.5726, lon: 88.3639, label: "CCU" },

  // Америки
  "America/New_York": { lat: 40.7128, lon: -74.006, label: "NYC" },
  "America/Los_Angeles": { lat: 34.0522, lon: -118.2437, label: "LAX" },
  "America/Chicago": { lat: 41.8781, lon: -87.6298, label: "CHI" },
  "America/Mexico_City": { lat: 19.4326, lon: -99.1332, label: "MEX" },
  "America/Sao_Paulo": { lat: -23.5505, lon: -46.6333, label: "SAO" },
  "America/Buenos_Aires": { lat: -34.6037, lon: -58.3816, label: "BUE" },

  // Прочее
  "Africa/Cairo": { lat: 30.0444, lon: 31.2357, label: "CAI" },
  "Africa/Casablanca": { lat: 33.5731, lon: -7.5898, label: "CAS" },
  "Australia/Sydney": { lat: -33.8688, lon: 151.2093, label: "SYD" },
};

export function tzCoords(tz: string | null | undefined): Coords | null {
  if (!tz) return null;
  return MAP[tz] ?? null;
}
