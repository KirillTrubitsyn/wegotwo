export interface Destination {
  id: string;
  name: string;
  country: string;
  flagCode: string;
  lat: number;
  lon: number;
  timezone: string;
  dateFrom: string;
  dateTo: string;
  type: "home" | "stay" | "transit";
  color: string;
}

export const destinations: Destination[] = [
  {
    id: "moscow",
    name: "Москва",
    country: "Россия",
    flagCode: "ru",
    lat: 55.7558,
    lon: 37.6173,
    timezone: "Europe/Moscow",
    dateFrom: "2026-02-22",
    dateTo: "2026-02-23",
    type: "home",
    color: "green",
  },
  {
    id: "algiers",
    name: "Алжир",
    country: "Алжир",
    flagCode: "dz",
    lat: 36.7538,
    lon: 3.0588,
    timezone: "Africa/Algiers",
    dateFrom: "2026-02-23",
    dateTo: "2026-02-23",
    type: "transit",
    color: "green",
  },
  {
    id: "paris",
    name: "Париж",
    country: "Франция",
    flagCode: "fr",
    lat: 48.8566,
    lon: 2.3522,
    timezone: "Europe/Paris",
    dateFrom: "2026-02-23",
    dateTo: "2026-02-26",
    type: "stay",
    color: "blue",
  },
  {
    id: "berlin",
    name: "Берлин",
    country: "Германия",
    flagCode: "de",
    lat: 52.52,
    lon: 13.405,
    timezone: "Europe/Berlin",
    dateFrom: "2026-02-26",
    dateTo: "2026-03-01",
    type: "stay",
    color: "gold",
  },
  {
    id: "walzenhausen",
    name: "Вальценхаузен",
    country: "Швейцария",
    flagCode: "ch",
    lat: 47.4488,
    lon: 9.6088,
    timezone: "Europe/Zurich",
    dateFrom: "2026-03-01",
    dateTo: "2026-03-07",
    type: "stay",
    color: "accent",
  },
  {
    id: "belgrade",
    name: "Белград",
    country: "Сербия",
    flagCode: "rs",
    lat: 44.8176,
    lon: 20.4633,
    timezone: "Europe/Belgrade",
    dateFrom: "2026-03-07",
    dateTo: "2026-03-07",
    type: "transit",
    color: "green",
  },
  {
    id: "moscow-return",
    name: "Москва",
    country: "Россия",
    flagCode: "ru",
    lat: 55.7558,
    lon: 37.6173,
    timezone: "Europe/Moscow",
    dateFrom: "2026-03-07",
    dateTo: "2026-03-08",
    type: "home",
    color: "green",
  },
];
