-- ============================================================
-- WeGoTwo · Storage buckets and policies
--
-- Buckets are all private. Client reads via signed URLs generated
-- on the server. Paths are namespaced by trip_id so RLS can check
-- membership via the first path segment.
-- ============================================================

insert into storage.buckets (id, name, public)
values
  ('documents', 'documents', false),
  ('receipts',  'receipts',  false),
  ('photos',    'photos',    false)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- helper: parse trip_id from the first path segment
-- ------------------------------------------------------------
create or replace function public.storage_trip_id(path text)
returns uuid language sql immutable as $$
  select nullif(split_part(path, '/', 1), '')::uuid
$$;

-- ------------------------------------------------------------
-- documents bucket: members of the trip can read/write
-- ------------------------------------------------------------
create policy docs_select on storage.objects for select
  using (bucket_id = 'documents'
         and public.can_access_trip(public.storage_trip_id(name)));
create policy docs_insert on storage.objects for insert
  with check (bucket_id = 'documents'
              and public.can_access_trip(public.storage_trip_id(name)));
create policy docs_update on storage.objects for update
  using (bucket_id = 'documents'
         and public.can_access_trip(public.storage_trip_id(name)));
create policy docs_delete on storage.objects for delete
  using (bucket_id = 'documents'
         and public.can_access_trip(public.storage_trip_id(name)));

-- ------------------------------------------------------------
-- receipts bucket
-- ------------------------------------------------------------
create policy rcpt_select on storage.objects for select
  using (bucket_id = 'receipts'
         and public.can_access_trip(public.storage_trip_id(name)));
create policy rcpt_insert on storage.objects for insert
  with check (bucket_id = 'receipts'
              and public.can_access_trip(public.storage_trip_id(name)));
create policy rcpt_update on storage.objects for update
  using (bucket_id = 'receipts'
         and public.can_access_trip(public.storage_trip_id(name)));
create policy rcpt_delete on storage.objects for delete
  using (bucket_id = 'receipts'
         and public.can_access_trip(public.storage_trip_id(name)));

-- ------------------------------------------------------------
-- photos bucket
-- ------------------------------------------------------------
create policy photos_select on storage.objects for select
  using (bucket_id = 'photos'
         and public.can_access_trip(public.storage_trip_id(name)));
create policy photos_insert on storage.objects for insert
  with check (bucket_id = 'photos'
              and public.can_access_trip(public.storage_trip_id(name)));
create policy photos_update on storage.objects for update
  using (bucket_id = 'photos'
         and public.can_access_trip(public.storage_trip_id(name)));
create policy photos_delete on storage.objects for delete
  using (bucket_id = 'photos'
         and public.can_access_trip(public.storage_trip_id(name)));
