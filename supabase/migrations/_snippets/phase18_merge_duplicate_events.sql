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
--   1. Группируем события поездки montenegro-2026 по (day_id, kind,
--      title). Группы с count>1 — кандидаты на merge.
--   2. В группе «survivor» — строка с максимальным числом
--      заполненных полей (description, photo_path, map_url,
--      tour_details, start_at); при равенстве — более ранняя.
--   3. Coalesce: в survivor переносим non-null значения из loser'ов
--      (start_at, description, photo_path, map_url, map_embed_url,
--      ticket_url, booking_url, tour_details, document_id,
--      attachments — последнее объединяется как jsonb-массив без
--      дубликатов по document_id).
--   4. Удаляем loser'ы.
--
-- Запускать в Supabase SQL Editor один раз после того, как миграция
-- 20260421000001_phase18_event_attachments.sql применена.
-- ============================================================

do $$
declare
  trip_uuid uuid;
  grp record;
  loser_ids uuid[];
  merged_attachments jsonb;
begin
  select id into trip_uuid from public.trips where slug = 'montenegro-2026';
  if trip_uuid is null then
    raise notice 'trip montenegro-2026 not found — nothing to do';
    return;
  end if;

  for grp in (
    with scored as (
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
      where e.trip_id = trip_uuid
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
      (select id from ranked r2
        where r2.day_id = r.day_id and r2.kind = r.kind
          and r2.title = r.title and r2.rnk = 1) as keep_id,
      array_agg(r.id) filter (where r.rnk > 1) as loser_ids,
      r.day_id, r.kind, r.title
    from ranked r
    where r.cnt > 1
    group by r.day_id, r.kind, r.title
  ) loop
    if grp.keep_id is null or grp.loser_ids is null then continue; end if;
    loser_ids := grp.loser_ids;

    -- Coalesce non-null enrichment fields from losers into survivor.
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
    from (
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
        (array_agg(document_id)  filter (where document_id is not null))[1] as document_id
      from public.events
      where id = any(loser_ids)
    ) d
    where keep.id = grp.keep_id;

    -- Merge attachments: union survivor + loser arrays by document_id.
    select coalesce(jsonb_agg(distinct a), '[]'::jsonb) into merged_attachments
    from (
      select jsonb_build_object('document_id', (elem->>'document_id'),
                                'label',       (elem->>'label'))
               as a
      from public.events ev, jsonb_array_elements(ev.attachments) as elem
      where (ev.id = grp.keep_id or ev.id = any(loser_ids))
        and (elem ? 'document_id')
    ) s;

    update public.events
    set attachments = merged_attachments
    where id = grp.keep_id;

    delete from public.events where id = any(loser_ids);

    raise notice 'merged % duplicates into %', array_length(loser_ids, 1), grp.keep_id;
  end loop;
end $$;
