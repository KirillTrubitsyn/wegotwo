/**
 * Lookup table mapping airline names (or 2-letter IATA codes that
 * appear in a flight `code` like "JU 331") to the carrier's public
 * website. Used to add a "✈ Сайт авиакомпании" chip to flight
 * events in the day timeline.
 *
 * Scope is deliberately small: the carriers we actually use in
 * WeGoTwo trips (Russia / SEE / EU low-cost). Unknown airlines fall
 * through and no chip is rendered.
 */

type AirlineEntry = {
  /** IATA 2-letter code. */
  iata: string;
  /** Display name variants, compared case-insensitively. */
  names: string[];
  /** Public website. */
  url: string;
  /** Manage-booking page (deeper link than `url`). */
  manageUrl?: string;
  /** Customer phone in E.164. */
  phone?: string;
};

const AIRLINES: AirlineEntry[] = [
  {
    iata: "SU",
    names: ["Aeroflot", "Аэрофлот"],
    url: "https://www.aeroflot.ru",
    manageUrl: "https://www.aeroflot.ru/ru-ru/my_booking",
    phone: "+74959810101",
  },
  {
    iata: "S7",
    names: ["S7 Airlines", "S7", "Сибирь"],
    url: "https://www.s7.ru",
    manageUrl: "https://www.s7.ru/ru/my-booking/",
    phone: "+74957773333",
  },
  {
    iata: "U6",
    names: ["Ural Airlines", "Уральские авиалинии"],
    url: "https://www.uralairlines.ru",
  },
  {
    iata: "DP",
    names: ["Pobeda", "Победа"],
    url: "https://www.pobeda.aero",
  },
  {
    iata: "JU",
    names: ["Air Serbia", "Эйр Сербия"],
    url: "https://www.airserbia.com",
    manageUrl: "https://www.airserbia.com/manage-booking",
    phone: "+381113112123",
  },
  {
    iata: "AH",
    names: ["Air Algérie", "Air Algerie", "Эйр Алжир"],
    url: "https://www.airalgerie.dz",
    phone: "+21321986363",
  },
  {
    iata: "TK",
    names: ["Turkish Airlines", "Турецкие авиалинии"],
    url: "https://www.turkishairlines.com",
    manageUrl: "https://www.turkishairlines.com/ru-ru/manage-booking",
  },
  {
    iata: "U2",
    names: ["EasyJet"],
    url: "https://www.easyjet.com",
    manageUrl: "https://www.easyjet.com/en/manage-bookings",
    phone: "+443303655000",
  },
  {
    iata: "EW",
    names: ["Eurowings", "Eurowings (SWISS)"],
    url: "https://www.eurowings.com",
    manageUrl: "https://www.eurowings.com/en/my-bookings.html",
  },
  {
    iata: "LX",
    names: ["SWISS", "Swiss International"],
    url: "https://www.swiss.com",
    manageUrl: "https://shop.swiss.com/booking/manage-booking",
    phone: "+41848700700",
  },
  {
    iata: "LH",
    names: ["Lufthansa"],
    url: "https://www.lufthansa.com",
    manageUrl: "https://www.lufthansa.com/ru/ru/online-check-in",
  },
  {
    iata: "FR",
    names: ["Ryanair"],
    url: "https://www.ryanair.com",
    manageUrl: "https://www.ryanair.com/gb/en/check-in",
  },
  {
    iata: "W6",
    names: ["Wizz Air", "Wizzair"],
    url: "https://wizzair.com",
    manageUrl: "https://wizzair.com/en-gb/booking/select-flight/my-bookings",
  },
];

/**
 * Resolve an airline entry from either the human name ("Air Serbia")
 * or the IATA code embedded in a flight code ("JU 331" → IATA "JU").
 */
export function lookupAirline(
  airline: string | null | undefined,
  flightCode?: string | null | undefined
): AirlineEntry | null {
  if (airline) {
    const needle = airline.trim().toLowerCase();
    for (const a of AIRLINES) {
      if (a.names.some((n) => n.toLowerCase() === needle)) return a;
    }
    // Partial match — helps with things like "Eurowings (SWISS)".
    for (const a of AIRLINES) {
      if (a.names.some((n) => needle.includes(n.toLowerCase()))) return a;
    }
  }
  if (flightCode) {
    const m = flightCode.trim().toUpperCase().match(/^([A-Z0-9]{2})\s?\d/);
    if (m) {
      const iata = m[1];
      const hit = AIRLINES.find((a) => a.iata === iata);
      if (hit) return hit;
    }
  }
  return null;
}
