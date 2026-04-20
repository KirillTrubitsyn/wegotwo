-- ============================================================
-- Phase 13 · Ingest enhancements
--
-- (1) Multi-segment flights. Старый flight-ряд хранит «сводку»
--     (первый сегмент для dep_at/from_code/..., общий PNR), плюс
--     полный массив сегментов в flights.segments.
--
-- (2) Ресторанные чеки с позициями и разбивкой Кирилл/Марина/общее.
--     expenses.items  — массив {description, amount, share},
--     expenses.split_summary — агрегированные суммы по плательщикам
--     в валюте документа. Общая сумма расхода по-прежнему в
--     amount_original + amount_base; разбивка вспомогательная.
--
-- (3) Индекс для быстрого dedup stays по confirmation.
-- ============================================================

alter table public.flights
  add column if not exists segments jsonb not null default '[]'::jsonb;

alter table public.expenses
  add column if not exists items jsonb not null default '[]'::jsonb;

alter table public.expenses
  add column if not exists split_summary jsonb;

create index if not exists stays_trip_confirmation_idx
  on public.stays (trip_id, confirmation)
  where confirmation is not null;

create index if not exists stays_trip_checkin_idx
  on public.stays (trip_id, check_in)
  where check_in is not null;
