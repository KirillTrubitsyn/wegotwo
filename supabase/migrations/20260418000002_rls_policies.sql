-- ============================================================
-- WeGoTwo · Row Level Security policies
--
-- Rules of access:
--   A user sees a trip if they are the owner OR a member (trip_members).
--   All related rows (destinations, days, expenses, etc.) are visible
--   whenever the parent trip is visible.
--   The service_role bypasses RLS and is used by Cowork ingest only.
-- ============================================================

-- enable RLS on every user-facing table
alter table public.profiles          enable row level security;
alter table public.trips             enable row level security;
alter table public.trip_members      enable row level security;
alter table public.destinations      enable row level security;
alter table public.days              enable row level security;
alter table public.places            enable row level security;
alter table public.documents         enable row level security;
alter table public.flights           enable row level security;
alter table public.stays             enable row level security;
alter table public.expenses          enable row level security;
alter table public.receipts          enable row level security;
alter table public.receipt_items     enable row level security;
alter table public.photos            enable row level security;
alter table public.exchange_rates    enable row level security;
alter table public.cowork_ingest_log enable row level security;

-- ------------------------------------------------------------
-- helper: can the current user access this trip
-- ------------------------------------------------------------
create or replace function public.can_access_trip(tid uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.trips t
    where t.id = tid and t.owner_id = auth.uid()
  ) or exists (
    select 1 from public.trip_members m
    where m.trip_id = tid and m.user_id = auth.uid()
  );
$$;

-- ------------------------------------------------------------
-- profiles: user sees own profile; reads other profiles only
-- if they share a trip (needed to show "added by X")
-- ------------------------------------------------------------
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid());

create policy profiles_shared_read on public.profiles
  for select using (
    exists (
      select 1 from public.trip_members me
      join public.trip_members other on other.trip_id = me.trip_id
      where me.user_id = auth.uid() and other.user_id = profiles.id
    )
  );

create policy profiles_self_update on public.profiles
  for update using (id = auth.uid());

-- ------------------------------------------------------------
-- trips
-- ------------------------------------------------------------
create policy trips_read on public.trips
  for select using (public.can_access_trip(id));

create policy trips_insert on public.trips
  for insert with check (owner_id = auth.uid());

create policy trips_update on public.trips
  for update using (public.can_access_trip(id));

create policy trips_delete on public.trips
  for delete using (owner_id = auth.uid());

-- ------------------------------------------------------------
-- trip_members
-- ------------------------------------------------------------
create policy tm_read on public.trip_members
  for select using (public.can_access_trip(trip_id));

create policy tm_insert on public.trip_members
  for insert with check (
    exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid())
  );

create policy tm_delete on public.trip_members
  for delete using (
    exists (select 1 from public.trips t where t.id = trip_id and t.owner_id = auth.uid())
  );

-- ------------------------------------------------------------
-- Generic "trip-owned" tables: one policy set each
-- ------------------------------------------------------------
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'destinations','days','places','documents','flights','stays',
    'expenses','receipts','photos'
  ]
  loop
    execute format('create policy %I on public.%I for select using (public.can_access_trip(trip_id));',
                   tbl||'_select', tbl);
    execute format('create policy %I on public.%I for insert with check (public.can_access_trip(trip_id));',
                   tbl||'_insert', tbl);
    execute format('create policy %I on public.%I for update using (public.can_access_trip(trip_id));',
                   tbl||'_update', tbl);
    execute format('create policy %I on public.%I for delete using (public.can_access_trip(trip_id));',
                   tbl||'_delete', tbl);
  end loop;
end $$;

-- receipt_items piggyback on receipts
create policy receipt_items_select on public.receipt_items
  for select using (
    exists (select 1 from public.receipts r
            where r.id = receipt_items.receipt_id
              and public.can_access_trip(r.trip_id))
  );
create policy receipt_items_write on public.receipt_items
  for all using (
    exists (select 1 from public.receipts r
            where r.id = receipt_items.receipt_id
              and public.can_access_trip(r.trip_id))
  ) with check (
    exists (select 1 from public.receipts r
            where r.id = receipt_items.receipt_id
              and public.can_access_trip(r.trip_id))
  );

-- exchange_rates: read-only to all authenticated users
create policy rates_read on public.exchange_rates
  for select using (auth.role() = 'authenticated');

-- cowork_ingest_log: read-only to trip members (for audit UI)
create policy ingest_log_read on public.cowork_ingest_log
  for select using (trip_id is null or public.can_access_trip(trip_id));
