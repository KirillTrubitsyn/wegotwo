-- ============================================================
-- Phase 18 · Одноразовый merge дубликатов событий
--
-- Что решает: до фикса в upsertEvent reparse, добавивший start_at,
-- создавал ДУБЛИКАТ события рядом со старой записью без времени
-- (один event с 09:00 + маленькой «Доплата гиду», второй с null
-- start_at + обложкой/описанием). Теперь дедуп tolerant, и новые
-- reparse'ы не будут плодить дубликаты. Этот скрипт схлопывает уже
-- существующие.
--
-- Подход:
--   1. Временная таблица _phase18_dup_groups содержит (keep_id,
--      loser_ids[]) — по одной строке на группу дублей.
--   2. Survivor = строка с максимальным числом заполненных полей;
--      при равенстве — более ранняя (created_at).
--   3. Coalesce non-null значения из loser'ов в survivor.
--   4. Attachments объединяем как union по document_id.
--   5. Loser'ов удаляем.
--
-- ВАЖНО — две особенности, на которые обожглись:
--   * `min(uuid)` в Postgres не существует → survivor берём через
--     `(array_agg(id) filter (where rnk = 1))[1]`.
--   * Supabase SQL Editor выполняет `BEGIN; ... COMMIT;` как
--     отдельные транзакции, и `CREATE TEMP TABLE ... ON COMMIT DROP`
--     дропает таблицу сразу после первого statement. Решение —
--     обернуть всё в `DO $$ … $$`, внутри которого весь блок
--     выполняется в одной транзакции. PL/pgSQL-переменные НЕ
--     используем (они конфликтовали с CTE-парсером в прошлой версии).
--
-- Запускать в Supabase SQL Editor один раз после того, как миграция
-- 20260421000001_phase18_event_attachments.sql применена.
-- ============================================================

do $$
begin
  create temp table _phase18_dup_groups (
    keep_id   uuid,
    loser_ids uuid[]
  ) on commit drop;

  -- 1. Собираем группы дубликатов.
  insert into _phase18_dup_groups (keep_id, loser_ids)
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
        partition by day_id, kind, title
        order by score desc, created_at asc
      ) as rnk,
      count(*) over (partition by day_id, kind, title) as cnt
    from scored
  )
  select
    (array_agg(id) filter (where rnk = 1))[1] as keep_id,
    array_agg(id) filter (where rnk > 1) as loser_ids
  from ranked
  where cnt > 1
  group by day_id, kind, title;

  -- 2. Coalesce enrichment полей из loser'ов в survivor.
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
    document_id   = coalesce(keep.document_id,   d.document_id)
  from _phase18_dup_groups g
  cross join lateral (
    select
      max(start_at)      as start_at,
      max(end_at)        as end_at,
      max(description)   as description,
      max(photo_path)    as photo_path,
      max(map_url)       as map_url,
      max(map_embed_url) as map_embed_url,
      max(ticket_url)    as ticket_url,
      max(booking_url)   as booking_url,
      max(website)       as website,
      max(phone)         as phone,
      max(notes)         as notes,
      max(address)       as address,
      max(emoji)         as emoji,
      (array_agg(tour_details) filter (where tour_details is not null))[1] as tour_details,
      (array_agg(document_id)  filter (where document_id  is not null))[1] as document_id
    from public.events
    where id = any(g.loser_ids)
  ) d
  where keep.id = g.keep_id;

  -- 3. Объединяем attachments: union по document_id (label
  -- сохраняем из первой не-null версии).
  update public.events keep
  set attachments = coalesce(a.merged, '[]'::jsonb)
  from _phase18_dup_groups g
  cross join lateral (
    select jsonb_agg(
             jsonb_build_object('document_id', doc_id, 'label', label)
             order by doc_id
           ) as merged
    from (
      select distinct on (elem->>'document_id')
        elem->>'document_id' as doc_id,
        elem->>'label'       as label
      from public.events ev,
           jsonb_array_elements(coalesce(ev.attachments, '[]'::jsonb)) elem
      where (ev.id = g.keep_id or ev.id = any(g.loser_ids))
        and elem->>'document_id' is not null
      order by elem->>'document_id', (elem->>'label') nulls last
    ) s
  ) a
  where keep.id = g.keep_id
    and g.loser_ids is not null;

  -- 4. Удаляем loser'ов.
  delete from public.events
  where id in (
    select unnest(loser_ids)
    from _phase18_dup_groups
    where loser_ids is not null
  );
end $$;
