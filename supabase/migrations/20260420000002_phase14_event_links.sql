-- ============================================================
-- WeGoTwo · Phase 14 · rich timeline events
--
-- Цель: в таймлайне дня события "Заселение" и "Перелёт" должны
-- выглядеть так же, как карточка города (destination page):
--   • превью Google Maps (iframe) кликабельное в Карты;
--   • ссылка на бронирование (Airbnb / Booking / отель);
--   • ссылки на табло вылета/прилёта для перелётов;
--   • ссылка на сайт авиакомпании.
--
-- Для этого расширяем `events` тремя полями:
--   booking_url   — прямая ссылка на бронь (Airbnb / Booking);
--   map_embed_url — URL для `<iframe>` с предпросмотром карты;
--   links         — массив произвольных кнопок-ссылок
--                   [{label, url, icon, kind}] — это более гибкий
--                   путь, чем плодить колонки под каждую категорию.
-- И храним booking_url на уровне `stays`, чтобы потом можно было
-- перегенерировать события без потери ссылки из документа.
-- ============================================================

alter table public.events
  add column if not exists booking_url   text,
  add column if not exists map_embed_url text,
  add column if not exists links         jsonb not null default '[]'::jsonb;

comment on column public.events.booking_url is
  'Airbnb / Booking.com / hotel reservation URL for this event';
comment on column public.events.map_embed_url is
  'Google Maps iframe src — place preview rendered inside the event card';
comment on column public.events.links is
  'Additional action buttons: [{label,url,icon,kind}] — airport boards, airline sites, etc.';

alter table public.stays
  add column if not exists booking_url text;

comment on column public.stays.booking_url is
  'Deep link to the reservation (Airbnb trips page, Booking confirmation)';
