/**
 * Lookup table mapping IATA airport codes to the public flight
 * information board ("табло вылетов/прилётов"). Used to add
 * clickable "📋 Табло SVO" / "📋 Табло TIV" chips on flight events.
 *
 * We store the page that shows BOTH arrivals and departures on one
 * screen where the airport offers it, otherwise the departures page.
 * Fallback: the airport home page.
 */

type AirportEntry = {
  iata: string;
  /** Short display name (city or airport short-name). */
  name: string;
  /** Departures / general flight board URL. */
  boardUrl: string;
};

const AIRPORTS: AirportEntry[] = [
  // Moscow
  { iata: "SVO", name: "Шереметьево", boardUrl: "https://www.svo.aero/ru/flights" },
  { iata: "DME", name: "Домодедово", boardUrl: "https://www.dme.ru/flights/onboard" },
  { iata: "VKO", name: "Внуково", boardUrl: "https://www.vnukovo.ru/flights/" },
  // St. Petersburg
  { iata: "LED", name: "Пулково", boardUrl: "https://pulkovoairport.ru/flights/" },
  // Montenegro
  { iata: "TIV", name: "Тиват", boardUrl: "https://montenegroairports.com/tivat/flights/" },
  { iata: "TGD", name: "Подгорица", boardUrl: "https://montenegroairports.com/podgorica/flights/" },
  // Serbia
  { iata: "BEG", name: "Белград", boardUrl: "https://www.beg.aero/en/flights/departures_and_arrivals" },
  // France
  { iata: "CDG", name: "Париж CDG", boardUrl: "https://www.parisaeroport.fr/passagers/vols" },
  { iata: "ORY", name: "Париж Орли", boardUrl: "https://www.parisaeroport.fr/passagers/vols" },
  // Germany
  { iata: "BER", name: "Берлин", boardUrl: "https://ber.berlin-airport.de/en/flights.html" },
  { iata: "FRA", name: "Франкфурт", boardUrl: "https://www.frankfurt-airport.com/en/flights.html" },
  { iata: "MUC", name: "Мюнхен", boardUrl: "https://www.munich-airport.com/flight-information" },
  // Switzerland
  { iata: "ZRH", name: "Цюрих", boardUrl: "https://www.zurich-airport.com/en/passengers/flights" },
  { iata: "GVA", name: "Женева", boardUrl: "https://www.gva.ch/en/flights" },
  // Algeria
  { iata: "ALG", name: "Алжир", boardUrl: "https://www.aeroportalger.dz" },
  // Turkey
  { iata: "IST", name: "Стамбул", boardUrl: "https://www.istairport.com/en/flight-info/" },
  { iata: "SAW", name: "Сабиха Гёкчен", boardUrl: "https://www.sabihagokcen.aero/flights" },
  // UAE
  { iata: "DXB", name: "Дубай", boardUrl: "https://www.dubaiairports.ae/flight-information" },
  { iata: "AUH", name: "Абу-Даби", boardUrl: "https://www.abudhabiairport.ae/en/flight-information" },
];

export function lookupAirport(
  iata: string | null | undefined
): AirportEntry | null {
  if (!iata) return null;
  const code = iata.trim().toUpperCase();
  if (code.length !== 3) return null;
  return AIRPORTS.find((a) => a.iata === code) ?? null;
}
