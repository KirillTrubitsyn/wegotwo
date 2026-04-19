-- ============================================================
-- WeGoTwo · Initial schema
-- ============================================================

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- profiles: one row per Supabase auth user
-- ------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- trips: top-level entity, one row per trip
-- ------------------------------------------------------------
create table public.trips (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  title             text not null,
  subtitle          text,
  cover_photo_path  text,
  country           text,
  date_from         date not null,
  date_to           date not null,
  route_summary     text,
  base_currency     text not null default 'RUB' check (base_currency in ('RUB','EUR','USD','CHF','GBP')),
  budget_plan       numeric(12,2),
  stats             jsonb not null default '[]'::jsonb,
  source_folder     text,         -- e.g. "Черногория" for Cowork ingest
  owner_id          uuid not null references public.profiles(id) on delete restrict,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on public.trips (owner_id);
create index on public.trips (date_from);

-- ------------------------------------------------------------
-- trip_members: who can access a trip (owner + invited members)
-- ------------------------------------------------------------
create table public.trip_members (
  trip_id  uuid not null references public.trips(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  role     text not null default 'editor' check (role in ('owner','editor','viewer')),
  added_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

-- ------------------------------------------------------------
-- destinations: cities/locations within a trip
-- ------------------------------------------------------------
create table public.destinations (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips(id) on delete cascade,
  name          text not null,
  country       text,
  flag_code     text,
  lat           double precision,
  lon           double precision,
  timezone      text,
  date_from     date,
  date_to       date,
  type          text default 'stay' check (type in ('home','stay','transit')),
  default_currency text,           -- e.g. EUR for Tivat
  color         text,
  sort_order    int default 0,
  created_at    timestamptz not null default now()
);
create index on public.destinations (trip_id);

-- ------------------------------------------------------------
-- days: timeline cards within a trip
-- ------------------------------------------------------------
create table public.days (
  id             uuid primary key default gen_random_uuid(),
  trip_id        uuid not null references public.trips(id) on delete cascade,
  destination_id uuid references public.destinations(id) on delete set null,
  date           date not null,
  date_label     text,
  title          text,
  badge          text,
  badge_type     text,
  detail         text,
  sort_order     int default 0,
  created_at     timestamptz not null default now()
);
create index on public.days (trip_id, date);

-- ------------------------------------------------------------
-- places: specific spots (restaurant, museum, viewpoint)
-- ------------------------------------------------------------
create table public.places (
  id             uuid primary key default gen_random_uuid(),
  trip_id        uuid not null references public.trips(id) on delete cascade,
  destination_id uuid references public.destinations(id) on delete set null,
  day_id         uuid references public.days(id) on delete set null,
  name           text not null,
  category       text,
  lat            double precision,
  lon            double precision,
  notes          text,
  url            text,
  sort_order     int default 0,
  created_at     timestamptz not null default now()
);
create index on public.places (trip_id);

-- ------------------------------------------------------------
-- documents: uploaded PDFs and other files
-- ------------------------------------------------------------
create table public.documents (
  id             uuid primary key default gen_random_uuid(),
  trip_id        uuid not null references public.trips(id) on delete cascade,
  kind           text not null default 'other'
                  check (kind in ('flight','stay','excursion','restaurant',
                                  'insurance','transfer','rental','receipt','other')),
  title          text not null,
  storage_path   text not null,              -- e.g. documents/{trip_id}/{uuid}.pdf
  size_bytes     bigint,
  mime           text,
  content_hash   text unique,                -- sha256, used for dedup on ingest
  source         text default 'manual'
                  check (source in ('manual','cowork','receipt_scan')),
  uploaded_by    uuid references public.profiles(id) on delete set null,
  parsed_at      timestamptz,
  parsed_status  text default 'pending'
                  check (parsed_status in ('pending','parsed','needs_review','failed','skipped')),
  parsed_fields  jsonb,
  archived       boolean not null default false,
  created_at     timestamptz not null default now()
);
create index on public.documents (trip_id);
create index on public.documents (content_hash);

-- ------------------------------------------------------------
-- flights: parsed flight segments
-- ------------------------------------------------------------
create table public.flights (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  airline     text,
  code        text,                  -- JU331, U24633 etc.
  from_code   text,
  from_city   text,
  to_code     text,
  to_city     text,
  dep_at      timestamptz,
  arr_at      timestamptz,
  seat        text,
  pnr         text,
  baggage     text,
  terminal    text,
  raw         jsonb,
  created_at  timestamptz not null default now()
);
create index on public.flights (trip_id, dep_at);

-- ------------------------------------------------------------
-- stays: parsed accommodation bookings
-- ------------------------------------------------------------
create table public.stays (
  id             uuid primary key default gen_random_uuid(),
  trip_id        uuid not null references public.trips(id) on delete cascade,
  destination_id uuid references public.destinations(id) on delete set null,
  document_id    uuid references public.documents(id) on delete set null,
  title          text,
  address        text,
  lat            double precision,
  lon            double precision,
  check_in       timestamptz,
  check_out      timestamptz,
  host           text,
  host_phone     text,
  confirmation   text,
  price          numeric(12,2),
  currency       text,
  raw            jsonb,
  created_at     timestamptz not null default now()
);
create index on public.stays (trip_id, check_in);

-- ------------------------------------------------------------
-- exchange_rates: snapshot of rate at a specific date
-- ------------------------------------------------------------
create table public.exchange_rates (
  rate_date  date not null,
  base       text not null,
  quote      text not null,
  rate       numeric(18,8) not null,
  source     text not null,            -- cbr | ecb | er_api
  fetched_at timestamptz not null default now(),
  primary key (rate_date, base, quote)
);
create index on public.exchange_rates (rate_date);

-- ------------------------------------------------------------
-- expenses: cost items by day and category
-- ------------------------------------------------------------
create table public.expenses (
  id                  uuid primary key default gen_random_uuid(),
  trip_id             uuid not null references public.trips(id) on delete cascade,
  day_id              uuid references public.days(id) on delete set null,
  destination_id      uuid references public.destinations(id) on delete set null,
  document_id         uuid references public.documents(id) on delete set null,
  receipt_id          uuid,                   -- FK added after receipts table
  occurred_on         date not null,
  category            text not null
                       check (category in ('flight','transport','accommodation',
                                           'restaurant','groceries','tours',
                                           'activities','tickets','shopping',
                                           'telecom','fees','other')),
  merchant            text,
  description         text,
  amount_original     numeric(12,2) not null,
  currency_original   text not null,
  amount_base         numeric(12,2) not null,
  currency_base       text not null,
  rate_date           date not null,
  rate_used           numeric(18,8) not null,
  source              text default 'manual'
                       check (source in ('manual','document','receipt_scan','cowork')),
  paid_by             uuid references public.profiles(id) on delete set null,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on public.expenses (trip_id, occurred_on);
create index on public.expenses (category);

-- ------------------------------------------------------------
-- receipts: photographed bills/receipts, parsed by Gemini
-- ------------------------------------------------------------
create table public.receipts (
  id                  uuid primary key default gen_random_uuid(),
  trip_id             uuid not null references public.trips(id) on delete cascade,
  day_id              uuid references public.days(id) on delete set null,
  expense_id          uuid references public.expenses(id) on delete set null,
  storage_path        text not null,          -- receipts/{trip_id}/{uuid}.jpg
  thumbnail_path      text,                    -- receipts/{trip_id}/{uuid}_thumb.jpg
  merchant            text,
  merchant_address    text,
  occurred_at         timestamptz,
  currency            text,
  subtotal            numeric(12,2),
  tip                 numeric(12,2),
  total               numeric(12,2),
  category            text,
  parsed_at           timestamptz,
  parser_model        text,
  parser_version      text,
  parsed_status       text default 'pending'
                       check (parsed_status in ('pending','parsed','needs_review','failed')),
  raw_response        jsonb,
  uploaded_by         uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index on public.receipts (trip_id);

-- add FK from expenses.receipt_id now that receipts exists
alter table public.expenses
  add constraint expenses_receipt_fk
  foreign key (receipt_id) references public.receipts(id) on delete set null;

-- ------------------------------------------------------------
-- receipt_items: line items inside a receipt (for grocery runs etc)
-- ------------------------------------------------------------
create table public.receipt_items (
  id          uuid primary key default gen_random_uuid(),
  receipt_id  uuid not null references public.receipts(id) on delete cascade,
  name        text not null,
  quantity    numeric(10,3),
  unit_price  numeric(12,2),
  total       numeric(12,2),
  sort_order  int default 0
);
create index on public.receipt_items (receipt_id);

-- ------------------------------------------------------------
-- photos: trip photo gallery
-- ------------------------------------------------------------
create table public.photos (
  id             uuid primary key default gen_random_uuid(),
  trip_id        uuid not null references public.trips(id) on delete cascade,
  destination_id uuid references public.destinations(id) on delete set null,
  day_id         uuid references public.days(id) on delete set null,
  storage_path   text not null,                 -- full-size (2048px)
  thumbnail_path text,                           -- 400px
  taken_at       timestamptz,
  lat            double precision,
  lon            double precision,
  width          int,
  height         int,
  caption        text,
  is_cover       boolean default false,
  uploaded_by    uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index on public.photos (trip_id, taken_at);

-- ------------------------------------------------------------
-- cowork_ingest_log: audit log of Cowork operations
-- ------------------------------------------------------------
create table public.cowork_ingest_log (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid references public.trips(id) on delete set null,
  action       text not null,                    -- plan | ingest | update | delete
  source_folder text,
  files        jsonb,
  gemini_usage jsonb,
  status       text not null default 'started'
                check (status in ('started','success','partial','failed')),
  error        text,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz
);
create index on public.cowork_ingest_log (trip_id, started_at desc);

-- ------------------------------------------------------------
-- updated_at triggers
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trips_touch before update on public.trips
  for each row execute function public.touch_updated_at();
create trigger expenses_touch before update on public.expenses
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- auto-create profile on new auth user
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
