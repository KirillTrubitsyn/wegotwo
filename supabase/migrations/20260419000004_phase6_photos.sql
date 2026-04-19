-- ============================================================
-- WeGoTwo · Phase 6 · Photos
--
-- `photos.uploaded_by` is an FK to Supabase Auth (profiles).
-- The app uses HMAC-cookie auth, so we mirror the pattern from
-- expenses/documents: add a text `uploaded_by_username` column
-- and stop requiring the FK. No existing rows are affected.
--
-- Also adds a composite index for the gallery group-by-day
-- query which sorts by taken_at within a day.
-- ============================================================

alter table public.photos
  add column if not exists uploaded_by_username text;

create index if not exists photos_trip_day_taken_idx
  on public.photos (trip_id, day_id, taken_at);
