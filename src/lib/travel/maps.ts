/**
 * Helpers to build Google Maps URLs without an API key.
 *
 * Two forms:
 *   - `mapSearchUrl` — opens Google Maps on mobile / new tab with a
 *     clickable place pin.
 *   - `mapEmbedUrl` — returns a URL suitable for `<iframe src>` that
 *     renders a static map preview. Uses `output=embed` which works
 *     from any origin without a key (unlike the Maps Embed API).
 *
 * Both prefer `lat,lon` when available (precise pin) and fall back
 * to the address string.
 */

export function mapSearchUrl(
  address: string | null,
  lat: number | null,
  lon: number | null
): string | null {
  if (lat != null && lon != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
  }
  const addr = (address ?? "").trim();
  if (!addr) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    addr
  )}`;
}

export function mapEmbedUrl(
  address: string | null,
  lat: number | null,
  lon: number | null
): string | null {
  if (lat != null && lon != null) {
    return `https://maps.google.com/maps?q=${lat},${lon}&z=15&output=embed`;
  }
  const addr = (address ?? "").trim();
  if (!addr) return null;
  return `https://maps.google.com/maps?q=${encodeURIComponent(
    addr
  )}&z=15&output=embed`;
}
