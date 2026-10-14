-- Run in Supabase SQL editor after Drizzle push.
-- Clerk native integration: JWT sub claim = user_id.

alter table receipts enable row level security;
alter table line_items enable row level security;
alter table review_queue enable row level security;
alter table usage_events enable row level security;

create policy "receipts_select_own" on receipts
  for select using ((auth.jwt() ->> 'sub') = user_id);
create policy "receipts_insert_own" on receipts
  for insert with check ((auth.jwt() ->> 'sub') = user_id);
create policy "receipts_update_own" on receipts
  for update using ((auth.jwt() ->> 'sub') = user_id);
create policy "receipts_delete_own" on receipts
  for delete using ((auth.jwt() ->> 'sub') = user_id);

create policy "line_items_select_own" on line_items
  for select using ((auth.jwt() ->> 'sub') = user_id);
create policy "line_items_insert_own" on line_items
  for insert with check ((auth.jwt() ->> 'sub') = user_id);
create policy "line_items_update_own" on line_items
  for update using ((auth.jwt() ->> 'sub') = user_id);
create policy "line_items_delete_own" on line_items
  for delete using ((auth.jwt() ->> 'sub') = user_id);

create policy "review_queue_select_own" on review_queue
  for select using ((auth.jwt() ->> 'sub') = user_id);
create policy "review_queue_insert_own" on review_queue
  for insert with check ((auth.jwt() ->> 'sub') = user_id);
create policy "review_queue_update_own" on review_queue
  for update using ((auth.jwt() ->> 'sub') = user_id);
create policy "review_queue_delete_own" on review_queue
  for delete using ((auth.jwt() ->> 'sub') = user_id);

create policy "usage_events_select_own" on usage_events
  for select using ((auth.jwt() ->> 'sub') = user_id);
create policy "usage_events_insert_own" on usage_events
  for insert with check ((auth.jwt() ->> 'sub') = user_id);

-- Storage bucket: create private bucket "receipts" in dashboard, then:
-- create policy "receipts_storage_select" on storage.objects
--   for select using (bucket_id = 'receipts' and (auth.jwt() ->> 'sub') = (storage.foldername(name))[1]);
-- create policy "receipts_storage_insert" on storage.objects
--   for insert with check (bucket_id = 'receipts' and (auth.jwt() ->> 'sub') = (storage.foldername(name))[1]);
