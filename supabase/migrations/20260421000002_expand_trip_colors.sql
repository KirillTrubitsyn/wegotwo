-- ============================================================
-- Expand the trips.color palette from 5 to 8 choices.
-- New colors: orange, teal, pink.
-- ============================================================

-- Replace the inline check constraint (auto-named trips_color_check)
-- with an updated one that includes all 8 palette keys.
alter table public.trips drop constraint if exists trips_color_check;

alter table public.trips
  add constraint trips_color_check
    check (color in (
      'blue', 'teal', 'green', 'gold',
      'orange', 'accent', 'pink', 'purple'
    ));
