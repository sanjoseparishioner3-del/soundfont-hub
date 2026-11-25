-- SoundFont Hub – server-side business logic (all money / access decisions live here)

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  -- Admin powers require an MFA-verified session (aal2) unless explicitly disabled for local development
  -- via system_settings.require_admin_mfa = false.
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
     and (
       coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
       or coalesce((select value from public.system_settings where key = 'require_admin_mfa'), 'true'::jsonb) = 'false'::jsonb
     );
$$;

-- True role membership regardless of MFA level (lets the UI route admins to MFA enrolment/challenge).
create or replace function public.has_admin_role() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.log_audit(p_action text, p_entity text, p_entity_id text, p_details jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs(actor_id, action, entity, entity_id, details)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_details, '{}'));
$$;
revoke all on function public.log_audit(text, text, text, jsonb) from public, anon, authenticated;

-- ---------- new user bootstrap ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  insert into public.user_roles(user_id, role) values (new.id, 'customer');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Admin initialisation: run manually in the SQL editor (not callable from the API).
create or replace function public.promote_admin(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then raise exception 'No user with email %', p_email; end if;
  insert into public.user_roles(user_id, role) values (v_id, 'admin') on conflict do nothing;
end $$;
revoke all on function public.promote_admin(text) from public, anon, authenticated;

-- ---------- derived data ----------
create or replace function public.refresh_rating() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(new.soundfont_id, old.soundfont_id);
begin
  update public.soundfonts s set
    rating_avg = coalesce((select round(avg(rating)::numeric, 2) from public.reviews where soundfont_id = v_id and is_visible), 0),
    rating_count = (select count(*) from public.reviews where soundfont_id = v_id and is_visible)
  where s.id = v_id;
  return null;
end $$;
create trigger reviews_rating after insert or update or delete on public.reviews
  for each row execute function public.refresh_rating();

create or replace function public.refresh_file_size() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(new.soundfont_id, old.soundfont_id);
begin
  update public.soundfonts set file_size_bytes =
    coalesce((select sum(size_bytes) from public.soundfont_files where soundfont_id = v_id), 0)
  where id = v_id;
  -- new version of an existing product -> notify owners
  if tg_op = 'INSERT' and exists (select 1 from public.soundfont_files where soundfont_id = v_id and id <> new.id) then
    insert into public.notifications(user_id, type, title, body, link)
    select cl.user_id, 'product_update', 'Update available: ' || s.name, 'Version ' || new.version || ' is ready to download.', '/library'
    from public.customer_library cl join public.soundfonts s on s.id = cl.soundfont_id
    where cl.soundfont_id = v_id;
  end if;
  return null;
end $$;
create trigger files_size after insert or update or delete on public.soundfont_files
  for each row execute function public.refresh_file_size();

-- Non-admins may only change a review's rating/body: not its product, owner, or moderation flag
-- (otherwise a user could re-point a review at a product they don't own, or un-hide a moderated review).
create or replace function public.guard_review_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.soundfont_id := old.soundfont_id;
    new.user_id := old.user_id;
    new.is_visible := old.is_visible;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
create trigger reviews_guard before update on public.reviews
  for each row execute function public.guard_review_update();

-- Users may edit their display name, not the email copy used by admin tools.
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then new.email := old.email; new.id := old.id; end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------- cart & checkout ----------
create or replace function public.add_to_cart(p_soundfont uuid default null, p_bundle uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_cart uuid;
begin
  if v_uid is null then raise exception 'Please sign in first'; end if;
  if (p_soundfont is null) = (p_bundle is null) then raise exception 'Specify exactly one item'; end if;
  if p_soundfont is not null then
    if not exists (select 1 from soundfonts where id = p_soundfont and is_published and type = 'premium') then
      raise exception 'This product cannot be purchased';
    end if;
    if exists (select 1 from customer_library where user_id = v_uid and soundfont_id = p_soundfont) then
      raise exception 'You already own this SoundFont';
    end if;
  else
    if not exists (select 1 from bundles where id = p_bundle and is_published) then
      raise exception 'This bundle is not available';
    end if;
    if not exists (
      select 1 from bundle_items bi where bi.bundle_id = p_bundle
        and not exists (select 1 from customer_library cl where cl.user_id = v_uid and cl.soundfont_id = bi.soundfont_id)
    ) then raise exception 'You already own every SoundFont in this bundle'; end if;
  end if;
  insert into carts(user_id) values (v_uid) on conflict (user_id) do nothing;
  select id into v_cart from carts where user_id = v_uid;
  insert into cart_items(cart_id, soundfont_id, bundle_id) values (v_cart, p_soundfont, p_bundle)
  on conflict do nothing;  -- duplicates are silently ignored by the partial unique indexes
end $$;

create or replace function public.create_order(p_currency public.currency_code, p_code text default null)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_cart uuid;
  v_order public.orders;
  v_dc public.discount_codes;
  v_subtotal numeric(10,2) := 0;
  v_discount numeric(10,2) := 0;
  r record;
begin
  if v_uid is null then raise exception 'Please sign in first'; end if;
  perform pg_advisory_xact_lock(hashtext('order:' || v_uid::text));
  select id into v_cart from carts where user_id = v_uid;
  if v_cart is null or not exists (select 1 from cart_items where cart_id = v_cart) then
    raise exception 'Your cart is empty';
  end if;

  if p_code is not null and length(trim(p_code)) > 0 then
    select * into v_dc from discount_codes where code = upper(trim(p_code));
    if not found or not v_dc.is_active
       or (v_dc.starts_at is not null and v_dc.starts_at > now())
       or (v_dc.expires_at is not null and v_dc.expires_at < now())
       or (v_dc.max_uses is not null and v_dc.uses >= v_dc.max_uses) then
      raise exception 'Discount code is not valid';
    end if;
  end if;

  insert into orders(order_number, user_id, currency, subtotal, total, discount_code_id)
  values ('SFH-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('order_number_seq')::text, 5, '0'),
          v_uid, p_currency, 0, 0, v_dc.id)
  returning * into v_order;

  for r in
    select ci.soundfont_id, ci.bundle_id,
           coalesce(s.name, b.name) as name,
           coalesce(s.is_published and s.type = 'premium', b.is_published, false) as ok,
           case p_currency when 'PHP' then coalesce(s.price_php, b.price_php) else coalesce(s.price_usd, b.price_usd) end as price
    from cart_items ci
    left join soundfonts s on s.id = ci.soundfont_id
    left join bundles b on b.id = ci.bundle_id
    where ci.cart_id = v_cart
  loop
    if not r.ok then raise exception '% is no longer available', r.name; end if;
    if r.soundfont_id is not null and exists
      (select 1 from customer_library where user_id = v_uid and soundfont_id = r.soundfont_id) then
      raise exception 'You already own %', r.name;
    end if;
    insert into order_items(order_id, soundfont_id, bundle_id, name_snapshot, unit_price)
    values (v_order.id, r.soundfont_id, r.bundle_id, r.name, r.price);
    v_subtotal := v_subtotal + r.price;
  end loop;

  if v_dc.id is not null then
    if v_dc.percent_off is not null then
      v_discount := round(v_subtotal * v_dc.percent_off / 100, 2);
    else
      v_discount := case p_currency when 'PHP' then v_dc.amount_off_php else v_dc.amount_off_usd end;
      if v_discount is null then raise exception 'Discount code does not apply to %', p_currency; end if;
    end if;
    v_discount := least(v_discount, v_subtotal);
  end if;
  if v_subtotal - v_discount <= 0 then raise exception 'Order total must be greater than zero'; end if;

  update orders set subtotal = v_subtotal, discount_total = v_discount, total = v_subtotal - v_discount
  where id = v_order.id returning * into v_order;
  delete from cart_items where cart_id = v_cart;
  return v_order;
end $$;

-- Quote only (no side effects) so the cart can show server-computed totals.
create or replace function public.quote_cart(p_currency public.currency_code, p_code text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_sub numeric(10,2) := 0; v_disc numeric(10,2) := 0;
  v_dc public.discount_codes; v_err text;
begin
  select coalesce(sum(case p_currency when 'PHP' then coalesce(s.price_php, b.price_php) else coalesce(s.price_usd, b.price_usd) end), 0)
    into v_sub
  from carts c join cart_items ci on ci.cart_id = c.id
  left join soundfonts s on s.id = ci.soundfont_id left join bundles b on b.id = ci.bundle_id
  where c.user_id = v_uid;
  if p_code is not null and length(trim(p_code)) > 0 then
    select * into v_dc from discount_codes where code = upper(trim(p_code));
    if not found or not v_dc.is_active
       or (v_dc.starts_at is not null and v_dc.starts_at > now())
       or (v_dc.expires_at is not null and v_dc.expires_at < now())
       or (v_dc.max_uses is not null and v_dc.uses >= v_dc.max_uses) then
      v_err := 'Discount code is not valid';
    elsif v_dc.percent_off is not null then
      v_disc := round(v_sub * v_dc.percent_off / 100, 2);
    else
      v_disc := case p_currency when 'PHP' then v_dc.amount_off_php else v_dc.amount_off_usd end;
      if v_disc is null then v_err := 'Discount code does not apply to ' || p_currency; v_disc := 0; end if;
    end if;
  end if;
  v_disc := least(coalesce(v_disc, 0), v_sub);
  return jsonb_build_object('subtotal', v_sub, 'discount', v_disc, 'total', v_sub - v_disc, 'error', v_err);
end $$;

create or replace function public.submit_payment(p_order uuid, p_provider text, p_reference text, p_proof_path text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_order public.orders; v_method public.payment_methods;
  v_ref text := upper(regexp_replace(coalesce(p_reference, ''), '[\s]', '', 'g')); v_payment uuid;
begin
  if v_uid is null then raise exception 'Please sign in first'; end if;
  select * into v_order from orders where id = p_order and user_id = v_uid for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status not in ('awaiting_payment', 'rejected') then
    raise exception 'This order can no longer accept a payment submission';
  end if;
  select * into v_method from payment_methods where provider = p_provider and is_enabled;
  if not found then raise exception 'This payment method is not available'; end if;
  if v_method.currency <> v_order.currency then
    raise exception '% only accepts payments in %', v_method.display_name, v_method.currency;
  end if;
  if p_proof_path is null or p_proof_path not like v_uid::text || '/%' then
    raise exception 'Proof of payment is required';
  end if;
  if v_ref !~ '^[A-Z0-9\-]{6,40}$' then raise exception 'Enter a valid transaction reference number'; end if;
  begin
    insert into payments(order_id, user_id, provider, amount, currency, reference_number)
    values (v_order.id, v_uid, p_provider, v_order.total, v_order.currency, v_ref) returning id into v_payment;
  exception when unique_violation then
    raise exception 'This transaction reference has already been submitted';
  end;
  insert into payment_proofs(payment_id, user_id, storage_path) values (v_payment, v_uid, p_proof_path);
  update orders set status = 'pending_verification', rejection_reason = null where id = v_order.id;
  insert into notifications(user_id, type, title, body, link)
  select ur.user_id, 'payment_submitted', 'Payment submitted: ' || v_order.order_number,
         v_order.currency || ' ' || v_order.total || ' via ' || v_method.display_name, '/admin/payments'
  from user_roles ur where ur.role = 'admin';
  insert into notifications(user_id, type, title, body, link)
  values (v_uid, 'payment_submitted', 'Payment received for review', 'We will verify order ' || v_order.order_number || ' shortly.', '/account/orders/' || v_order.id);
end $$;

create or replace function public.cancel_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update orders set status = 'cancelled'
  where id = p_order and user_id = auth.uid() and status in ('awaiting_payment', 'rejected');
  if not found then raise exception 'Order cannot be cancelled'; end if;
end $$;

-- Admin approves / rejects. Row-locked so an order can never be approved twice.
create or replace function public.review_payment(p_order uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_order public.orders; v_pay uuid;
begin
  if not public.is_admin() then raise exception 'Forbidden'; end if;
  select * into v_order from orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status <> 'pending_verification' then raise exception 'Order was already processed (%).', v_order.status; end if;
  select id into v_pay from payments where order_id = p_order and status = 'pending_verification' order by submitted_at desc limit 1;

  if p_approve then
    update payments set status = 'approved', verified_by = auth.uid(), verified_at = now() where id = v_pay;
    update orders set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() where id = p_order;

    insert into customer_library(user_id, soundfont_id, source, order_id)
    select v_order.user_id, x.sf, x.src, p_order from (
      select oi.soundfont_id as sf, 'purchase' as src from order_items oi where oi.order_id = p_order and oi.soundfont_id is not null
      union
      select bi.soundfont_id, 'bundle' from order_items oi join bundle_items bi on bi.bundle_id = oi.bundle_id
      where oi.order_id = p_order and oi.bundle_id is not null
    ) x on conflict (user_id, soundfont_id) do nothing;

    update soundfonts set sales_count = sales_count + 1 where id in (
      select soundfont_id from customer_library where order_id = p_order);
    if v_order.discount_code_id is not null then
      update discount_codes set uses = uses + 1 where id = v_order.discount_code_id;
    end if;
    insert into notifications(user_id, type, title, body, link) values
      (v_order.user_id, 'payment_approved', 'Payment approved', 'Order ' || v_order.order_number || ' was approved.', '/library'),
      (v_order.user_id, 'order_completed', 'Your SoundFonts are ready', 'They now appear in My Sound Library.', '/library');
    perform public.log_audit('payment.approve', 'order', p_order::text, jsonb_build_object('order_number', v_order.order_number, 'total', v_order.total));
  else
    update payments set status = 'rejected', verified_by = auth.uid(), verified_at = now() where id = v_pay;
    update orders set status = 'rejected', rejection_reason = nullif(trim(p_reason), ''), reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_order;
    insert into notifications(user_id, type, title, body, link)
    values (v_order.user_id, 'payment_rejected', 'Payment rejected',
            coalesce(nullif(trim(p_reason), ''), 'We could not verify your payment.'), '/account/orders/' || p_order);
    perform public.log_audit('payment.reject', 'order', p_order::text, jsonb_build_object('reason', p_reason));
  end if;
end $$;

create or replace function public.refund_order(p_order uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_order public.orders;
begin
  if not public.is_admin() then raise exception 'Forbidden'; end if;
  select * into v_order from orders where id = p_order for update;
  if not found or v_order.status <> 'approved' then raise exception 'Only approved orders can be refunded'; end if;
  update orders set status = 'refunded' where id = p_order;
  delete from customer_library where order_id = p_order and source in ('purchase', 'bundle');
  perform public.log_audit('order.refund', 'order', p_order::text, jsonb_build_object('reason', p_reason));
end $$;

-- ---------- library / downloads ----------
create or replace function public.claim_free(p_soundfont uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if not exists (select 1 from soundfonts where id = p_soundfont and is_published and type = 'free') then
    raise exception 'Not a free SoundFont';
  end if;
  insert into customer_library(user_id, soundfont_id, source) values (auth.uid(), p_soundfont, 'free')
  on conflict do nothing;
end $$;

-- Single authority for "may this user download this file?". The Edge Function calls this with the
-- caller's JWT, then signs a short-lived URL only if it returns a row.
create or replace function public.authorize_download(p_soundfont uuid, p_file uuid default null, p_ip text default null, p_ua text default null)
returns table(file_id uuid, storage_provider text, object_key text, file_name text)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_sf public.soundfonts; v_file public.soundfont_files;
begin
  if v_uid is null then raise exception 'Please sign in first'; end if;
  select * into v_sf from soundfonts where id = p_soundfont and (is_published or public.is_admin());
  if not found then raise exception 'SoundFont not found'; end if;
  if v_sf.type = 'free' then
    insert into customer_library(user_id, soundfont_id, source) values (v_uid, p_soundfont, 'free') on conflict do nothing;
  elsif not public.is_admin() and not exists (select 1 from customer_library where user_id = v_uid and soundfont_id = p_soundfont) then
    raise exception 'Purchase required';
  end if;
  if (select count(*) from download_logs where user_id = v_uid and created_at > now() - interval '1 hour') >= 40 then
    raise exception 'Download limit reached. Please try again later.';
  end if;
  select * into v_file from soundfont_files f
  where f.soundfont_id = p_soundfont and (p_file is null or f.id = p_file)
  order by f.created_at desc limit 1;
  if not found then raise exception 'No file is available for this SoundFont yet'; end if;
  insert into download_logs(user_id, soundfont_id, file_id, ip, user_agent) values (v_uid, p_soundfont, v_file.id, left(p_ip, 64), left(p_ua, 255));
  update soundfonts set download_count = download_count + 1 where id = p_soundfont;
  return query select v_file.id, v_file.storage_provider, v_file.object_key, v_file.file_name;
end $$;

-- ---------- notifications ----------
create or replace function public.mark_all_notifications_read() returns void
language sql security definer set search_path = public as $$
  update notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

create or replace function public.broadcast_notification(p_type text, p_title text, p_body text, p_link text default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'Forbidden'; end if;
  if p_type not in ('new_release', 'promotion', 'product_update') then raise exception 'Invalid type'; end if;
  insert into notifications(user_id, type, title, body, link)
  select id, p_type, p_title, coalesce(p_body, ''), p_link from profiles;
  get diagnostics n = row_count;
  perform public.log_audit('notification.broadcast', 'notification', null, jsonb_build_object('title', p_title, 'recipients', n));
  return n;
end $$;

-- ---------- support ----------
create or replace function public.on_support_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ticket public.support_tickets;
begin
  select * into v_ticket from support_tickets where id = new.ticket_id;
  update support_tickets set updated_at = now(),
    status = case when new.is_staff and status = 'open' then 'in_progress'
                  when not new.is_staff and status in ('resolved', 'closed') then 'open' else status end
  where id = new.ticket_id;
  if new.is_staff then
    insert into notifications(user_id, type, title, body, link)
    values (v_ticket.user_id, 'ticket_reply', 'Support replied: ' || v_ticket.subject, left(new.body, 140), '/support/' || v_ticket.id);
  else
    insert into notifications(user_id, type, title, body, link)
    select user_id, 'ticket_reply', 'New ticket message: ' || v_ticket.subject, left(new.body, 140), '/admin/tickets'
    from user_roles where role = 'admin';
  end if;
  return null;
end $$;
create trigger support_message_after after insert on public.support_messages
  for each row execute function public.on_support_message();

-- ---------- admin analytics ----------
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'Forbidden'; end if;
  select jsonb_build_object(
    'revenue_php', coalesce((select sum(total) from orders where status = 'approved' and currency = 'PHP'), 0),
    'revenue_usd', coalesce((select sum(total) from orders where status = 'approved' and currency = 'USD'), 0),
    'approved_orders', (select count(*) from orders where status = 'approved'),
    'pending_verifications', (select count(*) from orders where status = 'pending_verification'),
    'customers', (select count(*) from user_roles where role = 'customer'),
    'products', (select count(*) from soundfonts),
    'free_products', (select count(*) from soundfonts where type = 'free'),
    'premium_products', (select count(*) from soundfonts where type = 'premium'),
    'downloads', (select count(*) from download_logs),
    'storage_bytes', coalesce((select sum(size_bytes) from soundfont_files), 0),
    'best_sellers', coalesce((select jsonb_agg(t) from (
        select id, name, sales_count, download_count from soundfonts order by sales_count desc, download_count desc limit 5) t), '[]'),
    'recent_orders', coalesce((select jsonb_agg(t) from (
        select o.id, o.order_number, o.total, o.currency, o.status, o.created_at, p.email
        from orders o join profiles p on p.id = o.user_id order by o.created_at desc limit 8) t), '[]'),
    'monthly_revenue', coalesce((select jsonb_agg(t order by t.month) from (
        select to_char(date_trunc('month', created_at), 'YYYY-MM') as month,
               coalesce(sum(total) filter (where currency = 'PHP'), 0) as php,
               coalesce(sum(total) filter (where currency = 'USD'), 0) as usd
        from orders where status = 'approved' and created_at > now() - interval '12 months'
        group by 1) t), '[]')
  ) into result;
  return result;
end $$;

-- ---------- audit triggers for admin-managed tables ----------
create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Skip counter-only updates (every download/sale/review bumps these) so the audit log stays meaningful.
  if tg_op = 'UPDATE' and tg_table_name = 'soundfonts'
     and (to_jsonb(new) - 'download_count' - 'sales_count' - 'rating_avg' - 'rating_count' - 'file_size_bytes' - 'updated_at')
       = (to_jsonb(old) - 'download_count' - 'sales_count' - 'rating_avg' - 'rating_count' - 'file_size_bytes' - 'updated_at') then
    return null;
  end if;
  insert into audit_logs(actor_id, action, entity, entity_id, details)
  values (auth.uid(), tg_table_name || '.' || lower(tg_op), tg_table_name,
          coalesce((to_jsonb(new)->>'id'), (to_jsonb(old)->>'id'), (to_jsonb(new)->>'key'), (to_jsonb(old)->>'key')),
          case when tg_op = 'DELETE' then jsonb_build_object('name', coalesce(to_jsonb(old)->>'name', to_jsonb(old)->>'title', to_jsonb(old)->>'code'))
               else jsonb_build_object('name', coalesce(to_jsonb(new)->>'name', to_jsonb(new)->>'title', to_jsonb(new)->>'code', to_jsonb(new)->>'key')) end);
  return null;
end $$;
do $$ declare t text; begin
  foreach t in array array['soundfonts','soundfont_files','bundles','discount_codes','payment_methods','system_settings','categories','collections','tutorials','announcements'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row_change()', 'audit_' || t, t);
  end loop;
end $$;

-- ---------- grants ----------
revoke execute on all functions in schema public from public, anon;
grant execute on function public.is_admin(), public.has_admin_role() to authenticated, anon;
grant execute on function
  public.add_to_cart(uuid, uuid), public.create_order(public.currency_code, text), public.quote_cart(public.currency_code, text),
  public.submit_payment(uuid, text, text, text), public.cancel_order(uuid), public.review_payment(uuid, boolean, text),
  public.refund_order(uuid, text), public.claim_free(uuid), public.authorize_download(uuid, uuid, text, text),
  public.mark_all_notifications_read(), public.broadcast_notification(text, text, text, text), public.admin_stats()
  to authenticated;
