-- ============================================================
-- WeGoTwo · Phase 5 · Documents
--
-- The initial schema constrains documents.kind to a fixed set
-- matching parsed booking types (flight, stay, excursion, ...).
-- Phase 5 adds user-facing categories (passport, visa, ticket,
-- booking) and keeps the old values for backward compatibility
-- with the ingest pipeline.
--
-- We also add `uploaded_by_username` so the HMAC-cookie auth can
-- attribute uploads without depending on the Supabase Auth FK in
-- `uploaded_by` (mirroring the expenses.paid_by_username pattern).
-- ============================================================

-- Relax/rewrite the kind check: old values are preserved so
-- previously inserted rows and the ingest pipeline keep working.
alter table public.documents
  drop constraint if exists documents_kind_check;

alter table public.documents
  add constraint documents_kind_check
  check (kind in (
    -- phase 5 user-facing categories
    'passport','visa','ticket','booking','insurance','other',
    -- legacy values kept for ingest and receipts
    'flight','stay','excursion','restaurant','transfer','rental','receipt'
  ));

alter table public.documents
  add column if not exists uploaded_by_username text;

create index if not exists documents_trip_kind_idx
  on public.documents (trip_id, kind);
