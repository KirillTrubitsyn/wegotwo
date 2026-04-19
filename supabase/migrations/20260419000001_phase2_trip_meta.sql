-- ============================================================
-- WeGoTwo · Phase 2 · trip metadata and events
--
-- Deltas:
--   * trips: add primary_tz, color, status (plus keep archived_at
--     as the source of truth for archive visibility)
--   * events: time-anchored items inside a day, used by phase 3
--     day view. Created here so later phases do not require
--     another migration round.
-- ============================================================

-- ------------------------------------------------------------
-- trips: metadata used by the header (trip + Moscow clocks)
-- and by the trip tile color accent. Also relax owner_id:
-- the app authenticates via a signed HMAC cookie, not Supabase
-- auth, so there is no auth.users row to reference.
-- ------------------------------------------------------------
alter table public.trips
  add column if not exists primary_tz text not null default 'Europe/Moscow',
  add column if not exists color      text not null default 'blue'
    check (color in ('blue','gold','accent','green','purple')),
  add column if not exists status     text not null default 'planning'
    check (status in ('planning','active','completed','archived')),
  add column if not exists created_by_username text;

-- owner_id was required and tied to auth.users; drop NOT NULL so
-- trips can be inserted by the admin (service_role) client.
alter table public.trips
  alter column owner_id drop not null;

comment on column public.trips.primary_tz is
  'IANA TZ for the trip header clock, e.g. Europe/Podgorica';
comment on column public.trips.color is
  'Accent color key from the design palette';
comment on column public.trips.status is
  'Display status; archived_at remains the hard archive flag';
comment on column public.trips.created_by_username is
  'Username from the HMAC unlock cookie (kirill or marina)';

-- ------------------------------------------------------------
-- events: per-day timeline items (meal, visit, transfer, etc.)
-- ------------------------------------------------------------
create table if not exists public.events (
  id             uuid primary key default gen_random_uuid(),
  trip_id        uuid not null references public.trips(id) on delete cascade,
  day_id         uuid not null references public.days(id) on delete cascade,
  destination_id uuid references public.destinations(id) on delete set null,
  place_id       uuid references public.places(id) on delete set null,
  start_at       timestamptz,
  end_at         timestamptz,
  title          text not null,
  notes          text,
  map_url        text,
  kind           text default 'other'
    check (kind in ('meal','visit','transfer','flight','stay','activity','other')),
  sort_order     int default 0,
  created_at     timestamptz not null default now()
);

create index if not exists events_trip_day_idx
  on public.events (trip_id, day_id, sort_order);
create index if not exists events_trip_start_idx
  on public.events (trip_id, start_at);

-- RLS for events: same pattern as other trip-owned tables
alter table public.events enable row level security;

create policy events_select on public.events
  for select using (public.can_access_trip(trip_id));
create policy events_insert on public.events
  for insert with check (public.can_access_trip(trip_id));
create policy events_update on public.events
  for update using (public.can_access_trip(trip_id));
create policy events_delete on public.events
  for delete using (public.can_access_trip(trip_id));
