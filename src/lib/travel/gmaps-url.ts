/**
 * Извлекает координаты из любых Google Maps URL-ов, которые юзер
 * вставляет из "Share" в мобильном приложении:
 *
 *   https://www.google.com/maps/place/…/@42.4289015,18.6980888,20z
 *   https://www.google.com/maps/place/…/data=!3d42.4289015!4d18.6980888
 *   https://maps.google.com/?q=42.42,18.69
 *   https://goo.gl/maps/xxxx (short link — не резолвим)
 *
 * Приоритет:
 *   1) `!3dLAT!4dLON` — точный пин из `data=` (Google даёт эти
 *      координаты сразу на POI, пока `@lat,lon` указывает на центр
 *      карты с зумом);
 *   2) `@lat,lon[,zoom]` — fallback, если `!3d!4d` не нашлось;
 *   3) `q=lat,lon` / `ll=lat,lon` / `?query=lat,lon` — для ссылок
 *      из query-string.
 *
 * Возвращает null, если URL не парсится.
 */
export function parseGoogleMapsCoords(
  url: string | null | undefined
): { lat: number; lon: number } | null {
  if (!url) return null;
  const s = url.trim();
  if (!s) return null;

  // Priority 1: !3d!4d
  {
    const m = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (m) {
      const lat = Number(m[1]);
      const lon = Number(m[2]);
      if (isValidLatLon(lat, lon)) return { lat, lon };
    }
  }

  // Priority 2: @lat,lon
  {
    const m = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (m) {
      const lat = Number(m[1]);
      const lon = Number(m[2]);
      if (isValidLatLon(lat, lon)) return { lat, lon };
    }
  }

  // Priority 3: q=lat,lon / ll=lat,lon / query=lat,lon
  {
    const m = s.match(
      /[?&](?:q|ll|query)=(-?\d+(?:\.\d+)?)(?:,|%2C)(-?\d+(?:\.\d+)?)/i
    );
    if (m) {
      const lat = Number(m[1]);
      const lon = Number(m[2]);
      if (isValidLatLon(lat, lon)) return { lat, lon };
    }
  }

  return null;
}

function isValidLatLon(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}
