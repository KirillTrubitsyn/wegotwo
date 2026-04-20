-- ============================================================
-- WeGoTwo · Phase 16 · события-экскурсии
--
-- Для Tripster-билетов и экскурсий с частичной оплатой
-- на месте:
--   • `description` — длинное описание (рендерится аккордеоном
--     «Подробнее» на карточке события);
--   • `tour_details` — структурированные поля об оплате:
--     { guide_name, guide_phone, paid_amount, paid_currency,
--       due_amount, due_currency, extras: [{label, amount, currency}] };
--   • `ticket_url` — прямая ссылка на страницу экскурсии
--     (Tripster / Tripadvisor / пр.). Использует существующий
--     `website` как fallback, но выделяем отдельно, чтобы кнопка
--     «Страница экскурсии» имела свой лейбл.
-- ============================================================

alter table public.events
  add column if not exists description  text,
  add column if not exists tour_details jsonb,
  add column if not exists ticket_url   text;

comment on column public.events.description is
  'Long-form markdown description — rendered inside a <details> accordion.';
comment on column public.events.tour_details is
  'Structured payment info for tour events: guide/paid/due/extras.';
comment on column public.events.ticket_url is
  'Direct link to the tour/activity page (Tripster / GetYourGuide / etc.).';
