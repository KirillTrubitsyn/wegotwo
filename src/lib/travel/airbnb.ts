/**
 * Detect an Airbnb booking and build the deep link to the Trips page.
 *
 * The confirmation code on an Airbnb reservation is the alphanumeric
 * "code" shown on the receipt and embedded in the trips URL:
 *
 *   https://ru.airbnb.com/trips/v1/reservation-details/ro/RESERVATION2_CHECKIN/HMWZ5QPBNE
 *                                                                              └─ confirmation ─┘
 *
 * Heuristics for detection:
 *   • confirmation of exactly 10 chars, uppercase letters/digits, starts with `HM`;
 *   • OR the stay title / raw document contains "Airbnb";
 *   • OR the host phone / address hints are already Airbnb-typical.
 *
 * Returns null when we cannot tell — caller keeps the field empty.
 */
const AIRBNB_CONFIRMATION_RE = /^HM[A-Z0-9]{8}$/;

export function isAirbnbConfirmation(code: string | null | undefined): boolean {
  if (!code) return false;
  return AIRBNB_CONFIRMATION_RE.test(code.trim().toUpperCase());
}

export function airbnbReservationUrl(
  code: string | null | undefined
): string | null {
  if (!isAirbnbConfirmation(code)) return null;
  const c = (code as string).trim().toUpperCase();
  return `https://www.airbnb.com/trips/v1/reservation-details/ro/RESERVATION2_CHECKIN/${c}`;
}

/**
 * Detect Booking.com by confirmation shape (10 digits, optionally
 * grouped as 4.3.3 like "6932.785.830") or by the `booking.com`
 * substring in the stay fields we already captured.
 */
const BOOKING_CONFIRMATION_RE = /^\d{9,12}$/;

export function isBookingConfirmation(code: string | null | undefined): boolean {
  if (!code) return false;
  const normalized = code.trim().replace(/[\s.\-]/g, "");
  return BOOKING_CONFIRMATION_RE.test(normalized);
}

export function bookingReservationUrl(
  code: string | null | undefined
): string | null {
  if (!isBookingConfirmation(code)) return null;
  const normalized = (code as string).trim().replace(/[\s.\-]/g, "");
  return `https://secure.booking.com/confirmation.ru.html?bn=${normalized}`;
}

/**
 * Best-effort provider detection. Returns the canonical label and
 * deep-link URL, or null.
 */
export function detectStayProvider(
  confirmation: string | null | undefined
): { label: string; url: string } | null {
  const airbnb = airbnbReservationUrl(confirmation);
  if (airbnb) return { label: "Airbnb", url: airbnb };
  const booking = bookingReservationUrl(confirmation);
  if (booking) return { label: "Booking.com", url: booking };
  return null;
}
