-- ============================================================
-- WeGoTwo · Phase 8 · rich event cards and destination covers
--
-- Goal:
--   Allow an event in the day timeline to carry enough info to
--   render a full place card: restaurant photo, website, menu
--   URL, phone, street address and an emoji. Destinations get
--   a cover photo_path so the trip page can show city tiles
--   similar to the original europe-2026 layout.
-- ============================================================

-- ------------------------------------------------------------
-- events: rich fields for restaurants / sights / services
-- ------------------------------------------------------------
alter table public.events
  add column if not exists photo_path text,
  add column if not exists website    text,
  add column if not exists menu_url   text,
  add column if not exists phone      text,
  add column if not exists emoji      text,
  add column if not exists address    text;

comment on column public.events.photo_path is
  'Storage path in photos bucket: {trip_id}/seed/... for seeded cards';
comment on column public.events.website is
  'Primary website URL for the place';
comment on column public.events.menu_url is
  'Menu or program URL (restaurants, museums, etc.)';
comment on column public.events.phone is
  'E.164 or tel: URI';
comment on column public.events.emoji is
  'Display emoji overriding the default kind icon';
comment on column public.events.address is
  'Human-readable address shown under the title';

-- ------------------------------------------------------------
-- destinations: cover photo for city/stay tiles
-- ------------------------------------------------------------
alter table public.destinations
  add column if not exists photo_path text;

comment on column public.destinations.photo_path is
  'Storage path in photos bucket: {trip_id}/seed/cities/...';
