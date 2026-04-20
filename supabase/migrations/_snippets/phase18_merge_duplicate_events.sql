-- ============================================================
-- Phase 18 · Одноразовый merge дубликатов событий
--
-- Что решает: до фикса в upsertEvent reparse, добавивший start_at,
-- создавал ДУБЛИКАТ события рядом со старой записью без времени.
-- Теперь дедуп tolerant, и новые reparse'ы не будут плодить дубли.
-- Этот скрипт схлопывает уже существующие.
--
-- Подход: два обычных SQL-оператора, без DO-блока и без temp-таблицы.
--
-- Statement 1 (UPDATE с CTE): находит группы дублей, coalesce'ит
-- поля из loser'ов в survivor и мерджит attachments в одном
-- большом UPDATE.
--
-- Statement 2 (DELETE с тем же CTE): удаляет loser'ов.
--
-- История отказов:
--   • PL/pgSQL-переменные (trip_uuid) → конфликт с CTE-парсером.
--   • `min(uuid)` → не существует в Postgres.
--   • BEGIN/COMMIT в Supabase SQL Editor → каждый statement
--     отдельная транзакция, temp-таблица дропалась.
--   • CREATE TEMP TABLE внутри DO $$ → plpgsql кэширует plan до
--     создания таблицы, ERROR 42P01.
-- Решение — вычислить dup_groups в CTE прямо в обоих операторах.
--
-- Запускать в Supabase SQL Editor один раз после того, как миграция
-- 20260421000001_phase18_event_attachments.sql применена.
-- ============================================================

-- ------------------------------------------------------------
-- Statement 1: UPDATE survivor'ов (coalesce полей + merge attachments)
-- ------------------------------------------------------------
with trip as (
  select id from public.trips where slug = 'montenegro-2026'
),
scored as (
  select
    e.id,
    e.day_id,
    e.kind,
    e.title,
    e.created_at,
    (
      (case when e.description   is not null then 1 else 0 end) +
      (case when e.photo_path    is not null then 1 else 0 end) +
      (case when e.tour_details  is not null then 1 else 0 end) +
      (case when e.map_url       is not null then 1 else 0 end) +
      (case when e.map_embed_url is not null then 1 else 0 end) +
      (case when e.ticket_url    is not null then 1 else 0 end) +
      (case when e.booking_url   is not null then 1 else 0 end) +
      (case when e.start_at      is not null then 1 else 0 end)
    ) as score
  from public.events e
  join trip t on e.trip_id = t.id
),
ranked as (
  select
    id, day_id, kind, title,
    row_number() over (
      partition by day_id, kind, lower(regexp_replace(title, '\s+', ' ', 'g'))
      order by score desc, created_at asc
    ) as rnk,
    count(*) over (partition by day_id, kind, title) as cnt
  from scored
),
dup_groups as (
  select
    (array_agg(id) filter (where rnk = 1))[1] as keep_id,
    array_agg(id) filter (where rnk > 1)     as loser_ids
  from ranked
  where cnt > 1
  group by day_id, kind, lower(regexp_replace(title, '\s+', ' ', 'g'))
),
loser_data as (
  select
    g.keep_id,
    max(e.start_at)      as start_at,
    max(e.end_at)        as end_at,
    max(e.description)   as description,
    max(e.photo_path)    as photo_path,
    max(e.map_url)       as map_url,
    max(e.map_embed_url) as map_embed_url,
    max(e.ticket_url)    as ticket_url,
    max(e.booking_url)   as booking_url,
    max(e.website)       as website,
    max(e.phone)         as phone,
    max(e.notes)         as notes,
    max(e.address)       as address,
    max(e.emoji)         as emoji,
    (array_agg(e.tour_details) filter (where e.tour_details is not null))[1] as tour_details,
    (array_agg(e.document_id)  filter (where e.document_id  is not null))[1] as document_id
  from dup_groups g
  join public.events e on e.id = any(g.loser_ids)
  group by g.keep_id
),
-- Раскладываем все attachments из keep + losers в плоские строки
-- (keep_id, doc_id, label).
flat_attachments as (
  select
    g.keep_id,
    elem->>'document_id' as doc_id,
    elem->>'label'       as label
  from dup_groups g
  join public.events ev
    on ev.id = g.keep_id or ev.id = any(g.loser_ids)
  cross join lateral jsonb_array_elements(
    coalesce(ev.attachments, '[]'::jsonb)
  ) elem
  where elem ? 'document_id'
    and elem->>'document_id' is not null
),
-- Dedup по (keep_id, doc_id): label берём первый не-null.
distinct_attachments as (
  select distinct on (keep_id, doc_id)
    keep_id, doc_id, label
  from flat_attachments
  order by keep_id, doc_id, label nulls last
),
merged_attachments as (
  select
    keep_id,
    jsonb_agg(
      jsonb_build_object('document_id', doc_id, 'label', label)
      order by doc_id
    ) as merged
  from distinct_attachments
  group by keep_id
)
update public.events keep
set
  start_at      = coalesce(keep.start_at,      d.start_at),
  end_at        = coalesce(keep.end_at,        d.end_at),
  description   = coalesce(keep.description,   d.description),
  photo_path    = coalesce(keep.photo_path,    d.photo_path),
  map_url       = coalesce(keep.map_url,       d.map_url),
  map_embed_url = coalesce(keep.map_embed_url, d.map_embed_url),
  ticket_url    = coalesce(keep.ticket_url,    d.ticket_url),
  booking_url   = coalesce(keep.booking_url,   d.booking_url),
  website       = coalesce(keep.website,       d.website),
  phone         = coalesce(keep.phone,         d.phone),
  notes         = coalesce(keep.notes,         d.notes),
  address       = coalesce(keep.address,       d.address),
  emoji         = coalesce(keep.emoji,         d.emoji),
  tour_details  = coalesce(keep.tour_details,  d.tour_details),
  document_id   = coalesce(keep.document_id,   d.document_id),
  attachments   = coalesce(ma.merged, keep.attachments)
from dup_groups g
left join loser_data        d  on d.keep_id  = g.keep_id
left join merged_attachments ma on ma.keep_id = g.keep_id
where keep.id = g.keep_id;

-- ------------------------------------------------------------
-- Statement 2: DELETE loser'ов (тот же CTE-набор).
-- ------------------------------------------------------------
with trip as (
  select id from public.trips where slug = 'montenegro-2026'
),
scored as (
  select
    e.id,
    e.day_id,
    e.kind,
    e.title,
    e.created_at,
    (
      (case when e.description   is not null then 1 else 0 end) +
      (case when e.photo_path    is not null then 1 else 0 end) +
      (case when e.tour_details  is not null then 1 else 0 end) +
      (case when e.map_url       is not null then 1 else 0 end) +
      (case when e.map_embed_url is not null then 1 else 0 end) +
      (case when e.ticket_url    is not null then 1 else 0 end) +
      (case when e.booking_url   is not null then 1 else 0 end) +
      (case when e.start_at      is not null then 1 else 0 end)
    ) as score
  from public.events e
  join trip t on e.trip_id = t.id
),
ranked as (
  select
    id, day_id, kind, title,
    row_number() over (
      partition by day_id, kind, lower(regexp_replace(title, '\s+', ' ', 'g'))
      order by score desc, created_at asc
    ) as rnk,
    count(*) over (partition by day_id, kind, title) as cnt
  from scored
),
dup_groups as (
  select
    array_agg(id) filter (where rnk > 1) as loser_ids
  from ranked
  where cnt > 1
  group by day_id, kind, lower(regexp_replace(title, '\s+', ' ', 'g'))
)
delete from public.events
where id in (
  select unnest(loser_ids)
  from dup_groups
  where loser_ids is not null
);
