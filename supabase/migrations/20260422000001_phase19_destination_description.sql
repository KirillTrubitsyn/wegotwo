-- ============================================================
-- WeGoTwo · Phase 19 · destinations.description
--
-- Каждому городу поездки даём текстовое описание (markdown), которое:
--   • либо подтягивается из загруженных документов через Gemini
--     (новый kind 'city_summary' в parsed_fields → ingest пишет в
--     destinations.description с description_source='auto');
--   • либо редактируется вручную (UI ставит description_source
--     ='manual', и автоподтяжка перестаёт его перезаписывать).
--
-- description_source = null означает «описания нет», 'auto' — оно
-- пришло из документа и может быть свободно перезаписано следующим
-- reparse, 'manual' — пользователь правил руками, не трогать.
-- ============================================================

alter table public.destinations
  add column if not exists description text,
  add column if not exists description_source text
    check (description_source in ('auto', 'manual'));

comment on column public.destinations.description is
  'Markdown-описание города. Подтягивается из документов или правится вручную.';
comment on column public.destinations.description_source is
  'Источник описания: ''auto'' (Gemini из документа) или ''manual'' (пользователь). null = описания нет.';
