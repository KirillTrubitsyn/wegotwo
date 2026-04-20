-- ============================================================
-- WeGoTwo · Phase 17 · events.document_id
--
-- Связываем событие таймлайна с исходным документом (Tripster
-- билет, посадочный талон, Airbnb PDF). Нужно для кнопки
-- «🎫 Билет» на карточке события — Timeline будет генерить signed
-- URL на оригинальный файл.
--
-- Nullable: события, созданные вручную через UI, продолжают
-- существовать без привязки к документу.
-- ============================================================

alter table public.events
  add column if not exists document_id uuid
    references public.documents(id) on delete set null;

create index if not exists events_document_idx
  on public.events (document_id)
  where document_id is not null;

comment on column public.events.document_id is
  'FK to documents — the source file this event was auto-generated from. Null for manual events.';
