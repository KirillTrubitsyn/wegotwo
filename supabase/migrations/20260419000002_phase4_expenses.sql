-- ============================================================
-- WeGoTwo · Phase 4 · budget and expenses without profiles
--
-- The app uses an HMAC cookie for auth rather than Supabase Auth,
-- so there is no auth.users row to reference from expenses.paid_by
-- or expenses.created_by. Relax NOT NULL and add username columns
-- so the admin client can insert rows the same way it does for
-- trips.created_by_username.
--
-- Also: add split mode so a two-person app can mark a row as
-- "shared equally" vs "paid only by payer" (the default). The
-- balance calculation uses this flag.
-- ============================================================

alter table public.expenses
  alter column paid_by drop not null;

alter table public.expenses
  alter column created_by drop not null;

alter table public.expenses
  add column if not exists paid_by_username text,
  add column if not exists created_by_username text,
  add column if not exists split text not null default 'equal'
    check (split in ('equal', 'payer'));

comment on column public.expenses.paid_by_username is
  'Username of the person who paid (kirill or marina)';
comment on column public.expenses.created_by_username is
  'Username of the person who recorded the expense';
comment on column public.expenses.split is
  'equal: shared 50/50; payer: payer covers it entirely';

-- Index for balance queries that group by paid_by_username
create index if not exists expenses_trip_payer_idx
  on public.expenses (trip_id, paid_by_username);
