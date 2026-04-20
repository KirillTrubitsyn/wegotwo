-- ============================================================
-- WeGoTwo · Phase 15 · stays.map_url
--
-- Позволяет вручную задать точную Google Maps ссылку на место
-- проживания. Когда `stays.map_url` NOT NULL, событие «Заселение»
-- использует её как `map_url` (и выводит координаты из неё в
-- `map_embed_url`) вместо авто-генерации по адресу. Это нужно в
-- случаях, когда адрес неоднозначен или Google Maps плохо его
-- резолвит — пользователь вставляет ссылку из "поделиться" в
-- Google Maps, и мы получаем точный пин.
-- ============================================================

alter table public.stays
  add column if not exists map_url text;

comment on column public.stays.map_url is
  'Manual Google Maps URL for the stay. Overrides address-based auto-generation in events.';
