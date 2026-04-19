/**
 * Places (restaurants, sights, services) that belong to specific
 * day-dates of the europe-2026 trip. Each entry becomes a row in the
 * `events` table after seeding and renders as a rich card on the day
 * timeline (photo, address, website, menu, phone, map).
 *
 * `dayDate` is the local calendar date of the event in `Europe/Paris`
 * (the trip's primary TZ). `sortOrder` positions the place among the
 * other events of that day; keep 50/100/200/… to leave room for the
 * bare itinerary events above.
 */
export type SeedPlace = {
  dayDate: string;
  sortOrder: number;
  title: string;
  emoji: string;
  kind: "meal" | "visit" | "activity" | "flight" | "stay" | "transfer" | "other";
  time: string;
  address: string;
  notes: string;
  website?: string;
  menuUrl?: string;
  phone?: string;
  mapUrl: string;
  photoFile: string;
};

export const SEED_PLACES: SeedPlace[] = [
  {
    dayDate: "2026-02-23",
    sortOrder: 100,
    title: "Gallopin",
    emoji: "🍽",
    kind: "meal",
    time: "20:00",
    address: "40 Rue Notre Dame des Victoires, 75002 Paris",
    notes:
      "Бронирование подтверждено на имя Tatiana Zaslavska. Ужин в понедельник, 23 февраля, в 20:00.",
    website: "https://gallopin.com",
    menuUrl:
      "https://gallopin.com/wp-content/uploads/sites/5/2024/10/CARTE-071024.pdf",
    phone: "+33142364538",
    mapUrl:
      "https://www.google.com/maps/place/Gallopin/@48.8688309,2.3395555,16z/data=!3m1!4b1!4m6!3m5!1s0x47e66f7392b06ec9:0x48498858b1b3d54d!8m2!3d48.8688309!4d2.3421358!16s%2Fg%2F11j4tbvj3q",
    photoFile: "gallopin.png",
  },
  {
    dayDate: "2026-02-24",
    sortOrder: 50,
    title: "Гастро тур по центру Парижа",
    emoji: "🍴",
    kind: "activity",
    time: "10:30",
    address: "Центр Парижа",
    notes:
      "Гастро тур по центру Парижа. Точка встречи с гидом Яном по координатам.",
    mapUrl:
      "https://www.google.com/maps/place/48%C2%B052'04.7%22N+2%C2%B019'45.3%22E/@48.8677696,2.3257866,17z/data=!4m4!3m3!8m2!3d48.867967!4d2.3292575!18m1!1e1",
    photoFile: "gastrotur.jpeg",
  },
  {
    dayDate: "2026-02-24",
    sortOrder: 100,
    title: "L'Escargot Montorgueil",
    emoji: "🍽",
    kind: "meal",
    time: "13:30",
    address: "38 Rue Montorgueil, 75001 Paris",
    notes:
      "Бронирование подтверждено на вторник, 24 февраля 2026, в 13:30 (2 персоны).",
    website: "http://escargotmontorgueil.com/",
    menuUrl:
      "https://www.escargotmontorgueil.com/wp-content/uploads/2024/10/Menu-web-.pdf",
    phone: "+33142368351",
    mapUrl:
      "https://www.google.com/maps/place/L'Escargot/@48.8641932,2.3467171,17z/data=!3m1!4b1!4m6!3m5!1s0x47e66e185dbb4adb:0x5499c49530ad0adf!8m2!3d48.8641932!4d2.3467171!16s%2Fg%2F1tsr2hvq",
    photoFile: "escargot.png",
  },
  {
    dayDate: "2026-02-25",
    sortOrder: 100,
    title: "Музей Орсе — экскурсия «Шедевры»",
    emoji: "🎨",
    kind: "visit",
    time: "13:30",
    address: "62 Rue de Lille, 75007 Paris",
    notes:
      "Экскурсия «Шедевры музея Орсе». Встреча у статуи слона, гид с табличкой «My Super Tour». Метро Solferino (12 линия), выход 2. Для такси: 62 Rue de Lille. Оставшуюся стоимость оплатить гиду наличными в евро.",
    website: "https://www.musee-orsay.fr/fr",
    mapUrl:
      "https://www.google.com/maps/place/%D0%9C%D1%83%D0%B7%D0%B5%D0%B9+%D0%9E%D1%80%D1%81%D0%B5/@48.8599614,2.3265614,17z",
    photoFile: "orsay.png",
  },
  {
    dayDate: "2026-02-25",
    sortOrder: 200,
    title: "Bouillon Racine",
    emoji: "🍽",
    kind: "meal",
    time: "16:00",
    address: "3 Rue Racine, 75006 Paris",
    notes:
      "Бронирование подтверждено: столик на 2 человек, среда, 25 февраля, 16:00.",
    website: "http://bouillonracine.fr/",
    menuUrl: "https://www.bouillonracine.fr/menus/",
    mapUrl:
      "https://www.google.com/maps/place/Bouillon+Racine/@48.8509949,2.3329937,15z",
    photoFile: "bouillon.png",
  },
  {
    dayDate: "2026-02-27",
    sortOrder: 50,
    title: "Bürgeramt Hohenzollerndamm",
    emoji: "🏛",
    kind: "visit",
    time: "12:36",
    address: "Hohenzollerndamm 177, 10713 Berlin",
    notes:
      "Перенос ВНЖ в новый паспорт Марины. Vorgangsnummer: 441589. Код отмены: a555. Оплата на месте: наличные или Girocard (с PIN). Вход через Mansfelder / Ecke Brienner Straße.",
    website: "https://service.berlin.de/standort/122219/",
    mapUrl:
      "https://maps.google.com/?cid=1180515766436257038&g_mp=Cidnb29nbGUubWFwcy5wbGFjZXMudjEuUGxhY2VzLlNlYXJjaFRleHQ",
    photoFile: "buergeramt.png",
  },
  {
    dayDate: "2026-02-27",
    sortOrder: 100,
    title: "White Smile F200 — чистка зубов",
    emoji: "🦷",
    kind: "visit",
    time: "14:00",
    address: "Friedrichstraße 200, 10117 Berlin-Mitte",
    notes: "Профессиональная чистка зубов, Марина.",
    website: "https://www.zahnarzt-berlin-praxis.de",
    phone: "+493020641570",
    mapUrl: "https://www.google.com/maps/search/Friedrichstraße+200+Berlin",
    photoFile: "white-smile.jpeg",
  },
  {
    dayDate: "2026-02-27",
    sortOrder: 200,
    title: "Grill Royal",
    emoji: "🍽",
    kind: "meal",
    time: "20:30",
    address: "Friedrichstraße 105b, 10117 Berlin",
    notes: "Бронирование подтверждено на имя Sebastian PFLUM, 20:30.",
    website: "http://grillroyal.com/",
    menuUrl: "https://grillroyal.com/menu/",
    mapUrl:
      "https://www.google.com/maps/place/Grill+Royal/@52.5226847,13.3887989,17z/data=!3m1!4b1!4m6!3m5!1s0x47a851c27d3a8b8f:0xb0c069335f393de5!8m2!3d52.5226847!4d13.3887989!16s%2Fg%2F1tf3ydky",
    photoFile: "grill-royal.png",
  },
  {
    dayDate: "2026-03-05",
    sortOrder: 100,
    title: "Gasthaus zum Gupf ⭐",
    emoji: "🍽",
    kind: "meal",
    time: "19:00",
    address: "Gupf 21, 9038 Rehetobel, Switzerland",
    notes:
      "★ 1 звезда Michelin. €€€, классическая кухня. Ужин втроём — Кирилл, Оля и Клаус. Ресторан шеф-повара Вальтера Клозе на высоте 1083 м с видом на Боденское озеро и Альпы.",
    website: "https://www.gupf.ch/",
    menuUrl: "https://www.gupf.ch/en/culinary",
    phone: "+41718771110",
    mapUrl:
      "https://www.google.com/maps/place/Gasthaus+zum+Gupf/@47.430624,9.490245,17z/",
    photoFile: "gupf.png",
  },
  {
    dayDate: "2026-03-06",
    sortOrder: 100,
    title: "Mangold ⭐",
    emoji: "🍽",
    kind: "meal",
    time: "19:00",
    address: "Pfänderstraße 3, 6911 Lochau, Austria",
    notes:
      "★ 1 звезда Michelin. €€€, классическая кухня. Ужин втроём — Кирилл, Оля и Клаус. Семейный гурме-ресторан шефа Михаэля Шварценбахера.",
    website: "https://www.restaurant-mangold.at/",
    menuUrl: "https://www.restaurant-mangold.at/kulinarik/",
    phone: "+43557442431",
    mapUrl:
      "https://www.google.com/maps/place/Mangold/data=!4m2!3m1!1s0x479b0d15f332d6f5:0x966fd2c0da36e5d6",
    photoFile: "mangold.png",
  },
];

/** City cover photos tied to destinations by their seed id. */
export type SeedCityCover = {
  destinationSeedId: string;
  photoFile: string;
};

export const SEED_CITY_COVERS: SeedCityCover[] = [
  { destinationSeedId: "paris", photoFile: "paris.jpg" },
  { destinationSeedId: "berlin", photoFile: "berlin.jpg" },
  { destinationSeedId: "walzenhausen", photoFile: "switzerland.jpg" },
];
