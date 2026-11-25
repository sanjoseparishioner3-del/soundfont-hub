create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'customer');
create type public.product_type as enum ('free', 'premium');
create type public.currency_code as enum ('PHP', 'USD');
create type public.order_status as enum
  ('awaiting_payment', 'pending_verification', 'approved', 'rejected', 'cancelled', 'refunded');
create type public.ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');
create type public.compat_status as enum ('verified', 'unverified', 'incompatible');

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.soundfonts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  category_id uuid references public.categories(id) on delete set null,
  type public.product_type not null default 'free',
  price_php numeric(10,2) not null default 0 check (price_php >= 0),
  price_usd numeric(10,2) not null default 0 check (price_usd >= 0),
  cover_path text,
  version text not null default '1.0.0',
  preset_count int,
  sound_count int,
  velocity_layers int,
  channel_mode text check (channel_mode in ('stereo', 'mono', 'mixed')),
  presets jsonb not null default '[]'::jsonb,
  install_instructions text not null default '',
  license_text text not null default '',
  is_published boolean not null default false,
  is_featured boolean not null default false,
  download_count int not null default 0,
  sales_count int not null default 0,
  rating_avg numeric(3,2) not null default 0,
  rating_count int not null default 0,
  file_size_bytes bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint premium_has_price check (type = 'free' or (price_php > 0 and price_usd > 0))
);
create index soundfonts_category_idx on public.soundfonts(category_id);
create index soundfonts_pub_created_idx on public.soundfonts(is_published, created_at desc);
create index soundfonts_name_trgm on public.soundfonts using gin (to_tsvector('simple', name || ' ' || description));
create trigger soundfonts_touch before update on public.soundfonts
  for each row execute function public.touch_updated_at();

create table public.soundfont_files (
  id uuid primary key default gen_random_uuid(),
  soundfont_id uuid not null references public.soundfonts(id) on delete cascade,
  storage_provider text not null default 'r2' check (storage_provider in ('r2', 'supabase')),
  object_key text not null,
  file_name text not null,
  kind text not null check (kind in ('sf2', 'zip')),
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  version text not null default '1.0.0',
  created_at timestamptz not null default now(),
  unique (soundfont_id, sha256),
  unique (storage_provider, object_key)
);
create index soundfont_files_sf_idx on public.soundfont_files(soundfont_id);
create index soundfont_files_sha_idx on public.soundfont_files(sha256);

create table public.audio_previews (
  id uuid primary key default gen_random_uuid(),
  soundfont_id uuid not null references public.soundfonts(id) on delete cascade,
  title text not null,
  storage_path text not null,
  mime text not null check (mime in ('audio/mpeg', 'audio/wav', 'audio/ogg')),
  duration_sec numeric(8,2),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index audio_previews_sf_idx on public.audio_previews(soundfont_id, sort_order);

create table public.supported_applications (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  platforms text,
  website text,
  sort_order int not null default 0
);

create table public.product_compatibility (
  soundfont_id uuid not null references public.soundfonts(id) on delete cascade,
  application_id uuid not null references public.supported_applications(id) on delete cascade,
  status public.compat_status not null default 'unverified',
  tested_version text,
  notes text,
  tested_at date,
  primary key (soundfont_id, application_id)
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  cover_path text,
  is_published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create table public.collection_items (
  collection_id uuid not null references public.collections(id) on delete cascade,
  soundfont_id uuid not null references public.soundfonts(id) on delete cascade,
  sort_order int not null default 0,
  primary key (collection_id, soundfont_id)
);

create table public.bundles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  cover_path text,
  price_php numeric(10,2) not null check (price_php > 0),
  price_usd numeric(10,2) not null check (price_usd > 0),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger bundles_touch before update on public.bundles
  for each row execute function public.touch_updated_at();
create table public.bundle_items (
  bundle_id uuid not null references public.bundles(id) on delete cascade,
  soundfont_id uuid not null references public.soundfonts(id) on delete restrict,
  primary key (bundle_id, soundfont_id)
);

create table public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code)),
  percent_off numeric(5,2) check (percent_off > 0 and percent_off <= 100),
  amount_off_php numeric(10,2) check (amount_off_php > 0),
  amount_off_usd numeric(10,2) check (amount_off_usd > 0),
  max_uses int,
  uses int not null default 0,
  starts_at timestamptz,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (percent_off is not null or amount_off_php is not null or amount_off_usd is not null)
);

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  soundfont_id uuid references public.soundfonts(id) on delete cascade,
  bundle_id uuid references public.bundles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((soundfont_id is null) <> (bundle_id is null))
);
create unique index cart_items_sf_uq on public.cart_items(cart_id, soundfont_id) where soundfont_id is not null;
create unique index cart_items_bn_uq on public.cart_items(cart_id, bundle_id) where bundle_id is not null;

create sequence public.order_number_seq start 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid not null references public.profiles(id) on delete restrict,
  currency public.currency_code not null,
  subtotal numeric(10,2) not null check (subtotal >= 0),
  discount_total numeric(10,2) not null default 0 check (discount_total >= 0),
  total numeric(10,2) not null check (total >= 0),
  discount_code_id uuid references public.discount_codes(id) on delete set null,
  status public.order_status not null default 'awaiting_payment',
  rejection_reason text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_user_idx on public.orders(user_id, created_at desc);
create index orders_status_idx on public.orders(status, created_at desc);
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  soundfont_id uuid references public.soundfonts(id) on delete set null,
  bundle_id uuid references public.bundles(id) on delete set null,
  name_snapshot text not null,
  unit_price numeric(10,2) not null check (unit_price >= 0)
);
create index order_items_order_idx on public.order_items(order_id);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique check (provider in ('gcash', 'paypal')),
  display_name text not null,
  qr_path text,
  destination text,
  account_name text,
  instructions text not null default '',
  currency public.currency_code not null,
  is_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  provider text not null check (provider in ('gcash', 'paypal')),
  amount numeric(10,2) not null,
  currency public.currency_code not null,
  reference_number text not null,
  status text not null default 'pending_verification'
    check (status in ('pending_verification', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  constraint payments_ref_format check (reference_number ~ '^[A-Z0-9\-]{6,40}$')
);
create unique index payments_provider_ref_uq on public.payments(provider, reference_number);
create index payments_order_idx on public.payments(order_id);

create table public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table public.customer_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  soundfont_id uuid not null references public.soundfonts(id) on delete cascade,
  source text not null check (source in ('purchase', 'bundle', 'free', 'admin')),
  order_id uuid references public.orders(id) on delete set null,
  acquired_at timestamptz not null default now(),
  unique (user_id, soundfont_id)
);
create index customer_library_user_idx on public.customer_library(user_id, acquired_at desc);

create table public.download_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  soundfont_id uuid not null references public.soundfonts(id) on delete cascade,
  file_id uuid references public.soundfont_files(id) on delete set null,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index download_logs_user_idx on public.download_logs(user_id, created_at desc);
create index download_logs_sf_idx on public.download_logs(soundfont_id);

create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  soundfont_id uuid not null references public.soundfonts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, soundfont_id)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  soundfont_id uuid not null references public.soundfonts(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 2000),
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, soundfont_id)
);
create index reviews_sf_idx on public.reviews(soundfont_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in (
    'payment_submitted', 'payment_approved', 'payment_rejected', 'order_completed',
    'new_release', 'product_update', 'promotion', 'ticket_reply')),
  title text not null,
  body text not null default '',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.tutorials (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text not null default '',
  body_md text not null default '',
  image_path text,
  video_url text,
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'general',
  subject text not null check (char_length(subject) between 3 and 150),
  status public.ticket_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_user_idx on public.support_tickets(user_id, updated_at desc);
create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  is_staff boolean not null default false,
  body text not null check (char_length(body) between 1 and 4000),
  attachment_path text,
  created_at timestamptz not null default now()
);
create index support_messages_ticket_idx on public.support_messages(ticket_id, created_at);

create table public.system_settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  is_public boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs(created_at desc);


create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
     and (
       coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
       or coalesce((select value from public.system_settings where key = 'require_admin_mfa'), 'true'::jsonb) = 'false'::jsonb
     );
$$;

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

create or replace function public.promote_admin(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then raise exception 'No user with email %', p_email; end if;
  insert into public.user_roles(user_id, role) values (v_id, 'admin') on conflict do nothing;
end $$;
revoke all on function public.promote_admin(text) from public, anon, authenticated;

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

create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then new.email := old.email; new.id := old.id; end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

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
  on conflict do nothing;
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

create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
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

revoke execute on all functions in schema public from public, anon;
grant execute on function public.is_admin(), public.has_admin_role() to authenticated, anon;
grant execute on function
  public.add_to_cart(uuid, uuid), public.create_order(public.currency_code, text), public.quote_cart(public.currency_code, text),
  public.submit_payment(uuid, text, text, text), public.cancel_order(uuid), public.review_payment(uuid, boolean, text),
  public.refund_order(uuid, text), public.claim_free(uuid), public.authorize_download(uuid, uuid, text, text),
  public.mark_all_notifications_read(), public.broadcast_notification(text, text, text, text), public.admin_stats()
  to authenticated;


do $$ declare t text; begin
  foreach t in array array[
    'profiles','user_roles','categories','soundfonts','soundfont_files','audio_previews','supported_applications',
    'product_compatibility','collections','collection_items','bundles','bundle_items','carts','cart_items','orders',
    'order_items','payments','payment_methods','payment_proofs','customer_library','download_logs','favorites','reviews',
    'notifications','discount_codes','announcements','tutorials','support_tickets','support_messages','system_settings','audit_logs']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array[
    'categories','soundfonts','soundfont_files','audio_previews','supported_applications','product_compatibility',
    'collections','collection_items','bundles','bundle_items','payment_methods','customer_library','reviews',
    'discount_codes','announcements','tutorials','support_tickets','system_settings','profiles']
  loop
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_all', t);
  end loop;
end $$;

create policy profiles_own_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_own_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy roles_own_select on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_admin());

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

create policy files_owner_read on public.soundfont_files for select to authenticated
  using (exists (select 1 from public.customer_library cl where cl.soundfont_id = soundfont_files.soundfont_id and cl.user_id = auth.uid()));
create view public.soundfont_files_public as
  select f.id, f.soundfont_id, f.file_name, f.kind, f.size_bytes, f.version, f.created_at
  from public.soundfont_files f join public.soundfonts s on s.id = f.soundfont_id where s.is_published;
grant select on public.soundfont_files_public to anon, authenticated;

create view public.reviews_public as
  select r.id, r.soundfont_id, r.rating, r.body, r.created_at,
         coalesce(nullif(split_part(p.full_name, ' ', 1), ''), 'Customer') as reviewer,
         s.name as product_name, s.slug as product_slug
  from public.reviews r
  join public.profiles p on p.id = r.user_id
  join public.soundfonts s on s.id = r.soundfont_id and s.is_published
  where r.is_visible;
grant select on public.reviews_public to anon, authenticated;

create policy payment_methods_read on public.payment_methods for select to authenticated using (is_enabled);

create policy carts_own on public.carts for select to authenticated using (user_id = auth.uid());
create policy cart_items_own_select on public.cart_items for select to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));
create policy cart_items_own_delete on public.cart_items for delete to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));

create policy orders_read on public.orders for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy order_items_read on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));
create policy payments_read on public.payments for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy proofs_read on public.payment_proofs for select to authenticated using (user_id = auth.uid() or public.is_admin());

create policy library_own on public.customer_library for select to authenticated using (user_id = auth.uid());
create policy downloads_read on public.download_logs for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy favorites_own on public.favorites for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy reviews_insert on public.reviews for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.customer_library cl where cl.user_id = auth.uid() and cl.soundfont_id = reviews.soundfont_id));
create policy reviews_update_own on public.reviews for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and is_visible);
create policy reviews_delete_own on public.reviews for delete to authenticated using (user_id = auth.uid());

create policy notif_own_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_own_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_admin_insert on public.notifications for insert to authenticated with check (public.is_admin());

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

create policy audit_admin_read on public.audit_logs for select to authenticated using (public.is_admin());

alter publication supabase_realtime add table public.notifications, public.support_messages, public.orders;

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

insert into public.categories (slug, name, sort_order) values
  ('grand-piano','Grand Piano',1),('acoustic-piano','Acoustic Piano',2),('electric-piano','Electric Piano',3),
  ('worship-piano','Worship Piano',4),('ambient-pads','Ambient Pads',5),('warm-pads','Warm Pads',6),
  ('strings','Strings',7),('organ','Organ',8),('synthesizer','Synthesizer',9),('brass','Brass',10),
  ('bass','Bass',11),('guitar','Guitar',12),('drums','Drums',13),('lead-sounds','Lead Sounds',14),
  ('orchestral','Orchestral',15),('layered-sounds','Layered Sounds',16),
  ('worship-collections','Worship Collections',17),('complete-bundles','Complete SoundFont Bundles',18)
on conflict (slug) do nothing;

insert into public.supported_applications (slug, name, platforms, sort_order) values
  ('audio-evolution-mobile','Audio Evolution Mobile','Android, iOS',1),
  ('onstage','OnStage','iOS, Android',2),
  ('numa-player','Numa Player','iOS, Android',3),
  ('fluidsynth','FluidSynth','Windows, macOS, Linux',4)
on conflict (slug) do nothing;

insert into public.payment_methods (provider, display_name, currency, is_enabled, instructions) values
  ('gcash','GCash','PHP',false,'Scan the QR code in your GCash app and pay the exact amount shown. Never share your PIN or OTP with anyone.'),
  ('paypal','PayPal','USD',false,'Scan the QR code or use the PayPal destination shown and pay the exact amount. Never share your password or OTP with anyone.')
on conflict (provider) do nothing;

insert into public.system_settings (key, value, is_public) values
  ('site_name','"SoundFont Hub"',true),
  ('tagline','"Premium Sounds. Endless Possibilities."',true),
  ('logo_path','null',true),
  ('favicon_path','null',true),
  ('hero_banners','[]',true),
  ('contact','{"email":"","phone":"","address":""}',true),
  ('social','{"facebook":"","youtube":"","instagram":"","tiktok":""}',true),
  ('maintenance_mode','false',true),
  ('require_admin_mfa','true',true),
  ('terms','"Edit your Terms and Conditions in Admin → System Settings."',true),
  ('privacy','"Edit your Privacy Policy in Admin → System Settings."',true),
  ('refund_policy','"Digital products are generally non-refundable once downloaded. Edit this policy in Admin → System Settings."',true),
  ('license','"Purchased SoundFonts are licensed for personal and commercial music production. Redistribution or resale of the files is not permitted. Edit in Admin → System Settings."',true)
on conflict (key) do nothing;

insert into public.tutorials (slug, title, summary, body_md, sort_order, is_published) values
  ('extract-zip-files','How to extract ZIP files','Unpack a SoundFont bundle on Android, iOS, Windows or macOS.',
   E'1. Open your device file manager (Files on iOS/Android, File Explorer on Windows, Finder on macOS).\n2. Locate the downloaded `.zip` file.\n3. Android/iOS: tap the file to extract. Windows: right-click → *Extract All*. macOS: double-click.\n4. Open the extracted folder and look for `.sf2` files.',1,true),
  ('manage-downloaded-files','How to manage downloaded files','Find and organise your SF2 files.',
   E'Downloaded files are saved by your browser to its download folder (usually *Downloads*). Move them to a dedicated *SoundFonts* folder so your music apps can find them easily. Keep a backup copy – you can always re-download from **My Sound Library**.',2,true),
  ('connect-midi-keyboard','How to connect a MIDI keyboard','USB/Bluetooth MIDI basics.',
   E'1. Connect your keyboard by USB (use an OTG adapter on phones) or pair a Bluetooth MIDI device.\n2. Open the *Virtual Keyboard* page in Chrome/Edge – supported keyboards are detected automatically.\n3. In your music app, select the MIDI device in its MIDI settings.',3,true),
  ('troubleshoot-compatibility','Troubleshooting compatibility issues','What to check when a SoundFont does not load.',
   E'- Confirm the app supports `.sf2` (SF3/SFZ/SF2Pack are different formats).\n- Check the file size against your device memory.\n- Re-download if the file was interrupted; compare the SHA-256 shown in your library.\n- Check the product page for tested applications.',4,true),
  ('import-sf2-audio-evolution-mobile','How to import SF2 files into Audio Evolution Mobile','DRAFT – verify on device before publishing.',
   E'This guide is a draft. Confirm the exact menu path in your installed version of Audio Evolution Mobile, then replace this text and publish.',5,false)
on conflict (slug) do nothing;
