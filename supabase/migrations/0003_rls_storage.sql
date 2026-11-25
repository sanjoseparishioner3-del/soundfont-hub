-- SoundFont Hub – Row Level Security + Storage

-- Enable RLS everywhere
do $$ declare t text; begin
  foreach t in array array[
    'profiles','user_roles','categories','soundfonts','soundfont_files','audio_previews','supported_applications',
    'product_compatibility','collections','collection_items','bundles','bundle_items','carts','cart_items','orders',
    'order_items','payments','payment_methods','payment_proofs','customer_library','download_logs','favorites','reviews',
    'notifications','discount_codes','announcements','tutorials','support_tickets','support_messages','system_settings','audit_logs']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

-- Admin full-access policies on admin-managed tables
do $$ declare t text; begin
  foreach t in array array[
    'categories','soundfonts','soundfont_files','audio_previews','supported_applications','product_compatibility',
    'collections','collection_items','bundles','bundle_items','payment_methods','customer_library','reviews',
    'discount_codes','announcements','tutorials','support_tickets','system_settings','profiles']
  loop
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
  end loop;
end $$;

-- profiles / roles
create policy profiles_own_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_own_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy roles_own_select on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- Public catalog reads
create policy categories_read on public.categories for select using (true);
create policy apps_read on public.supported_applications for select using (true);
create policy soundfonts_read on public.soundfonts for select using (is_published);
create policy previews_read on public.audio_previews for select
  using (exists (select 1 from public.soundfonts s where s.id = soundfont_id and s.is_published));
create policy compat_read on public.product_compatibility for select
  using (exists (select 1 from public.soundfonts s where s.id = soundfont_id and s.is_published));
create policy collections_read on public.collections for select using (is_published);
create policy collection_items_read on public.collection_items for select
  using (exists (select 1 from public.collections c where c.id = collection_id and c.is_published));
create policy bundles_read on public.bundles for select using (is_published);
create policy bundle_items_read on public.bundle_items for select
  using (exists (select 1 from public.bundles b where b.id = bundle_id and b.is_published));
create policy reviews_read on public.reviews for select using (is_visible or user_id = auth.uid());
create policy tutorials_read on public.tutorials for select using (is_published);
create policy announcements_read on public.announcements for select using (is_active);
create policy settings_read on public.system_settings for select using (is_public);

-- Real file locations are never public. Only owners/admins read soundfont_files; everyone reads a safe view.
create policy files_owner_read on public.soundfont_files for select to authenticated
  using (exists (select 1 from public.customer_library cl where cl.soundfont_id = soundfont_files.soundfont_id and cl.user_id = auth.uid()));
create view public.soundfont_files_public as
  select f.id, f.soundfont_id, f.file_name, f.kind, f.size_bytes, f.version, f.created_at
  from public.soundfont_files f join public.soundfonts s on s.id = f.soundfont_id where s.is_published;
grant select on public.soundfont_files_public to anon, authenticated;

-- Reviews with first-name only reviewer label (profiles stay private)
create view public.reviews_public as
  select r.id, r.soundfont_id, r.rating, r.body, r.created_at,
         coalesce(nullif(split_part(p.full_name, ' ', 1), ''), 'Customer') as reviewer,
         s.name as product_name, s.slug as product_slug
  from public.reviews r
  join public.profiles p on p.id = r.user_id
  join public.soundfonts s on s.id = r.soundfont_id and s.is_published
  where r.is_visible;
grant select on public.reviews_public to anon, authenticated;

-- Payment destinations are visible to signed-in customers only
create policy payment_methods_read on public.payment_methods for select to authenticated using (is_enabled);

-- Cart (writes go through add_to_cart / create_order RPCs)
create policy carts_own on public.carts for select to authenticated using (user_id = auth.uid());
create policy cart_items_own_select on public.cart_items for select to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));
create policy cart_items_own_delete on public.cart_items for delete to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));

-- Orders & payments (read-only for customers; all mutations through RPCs)
create policy orders_read on public.orders for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy order_items_read on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));
create policy payments_read on public.payments for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy proofs_read on public.payment_proofs for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- Library, downloads, favorites
create policy library_own on public.customer_library for select to authenticated using (user_id = auth.uid());
create policy downloads_read on public.download_logs for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy favorites_own on public.favorites for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Reviews: only owners of a product may review it
create policy reviews_insert on public.reviews for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.customer_library cl where cl.user_id = auth.uid() and cl.soundfont_id = reviews.soundfont_id));
create policy reviews_update_own on public.reviews for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and is_visible);
create policy reviews_delete_own on public.reviews for delete to authenticated using (user_id = auth.uid());

-- Notifications
create policy notif_own_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_own_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_admin_insert on public.notifications for insert to authenticated with check (public.is_admin());

-- Support
create policy tickets_own_select on public.support_tickets for select to authenticated using (user_id = auth.uid());
create policy tickets_own_insert on public.support_tickets for insert to authenticated with check (user_id = auth.uid());
create policy tickets_own_close on public.support_tickets for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy messages_read on public.support_messages for select to authenticated
  using (public.is_admin() or exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()));
create policy messages_insert_customer on public.support_messages for insert to authenticated
  with check (sender_id = auth.uid() and not is_staff
    and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = auth.uid()));
create policy messages_insert_staff on public.support_messages for insert to authenticated
  with check (sender_id = auth.uid() and is_staff and public.is_admin());

-- Audit logs: admin read only (written by triggers / definer functions)
create policy audit_admin_read on public.audit_logs for select to authenticated using (public.is_admin());

-- Realtime
alter publication supabase_realtime add table public.notifications, public.support_messages, public.orders;

-- ================= Storage =================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('covers', 'covers', true, 5242880, array['image/png','image/jpeg','image/webp']),
  ('previews', 'previews', true, 31457280, array['audio/mpeg','audio/wav','audio/ogg','audio/x-wav']),
  ('site', 'site', true, 5242880, array['image/png','image/jpeg','image/webp','image/svg+xml','image/x-icon']),
  ('soundfonts', 'soundfonts', false, 52428800, null),
  ('payment-proofs', 'payment-proofs', false, 5242880, array['image/png','image/jpeg','image/webp']),
  ('support-attachments', 'support-attachments', false, 5242880, array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy storage_admin_public_buckets on storage.objects for all to authenticated
  using (bucket_id in ('covers','previews','site') and public.is_admin())
  with check (bucket_id in ('covers','previews','site') and public.is_admin());

create policy storage_proofs_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('payment-proofs','support-attachments') and (storage.foldername(name))[1] = auth.uid()::text);
create policy storage_proofs_read on storage.objects for select to authenticated
  using (bucket_id in ('payment-proofs','support-attachments') and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
