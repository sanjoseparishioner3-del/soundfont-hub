-- SoundFont Hub – core schema
-- Run order: 0001_schema -> 0002_functions -> 0003_rls_storage -> 0004_seed
create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'customer');
create type public.product_type as enum ('free', 'premium');
create type public.currency_code as enum ('PHP', 'USD');
create type public.order_status as enum
  ('awaiting_payment', 'pending_verification', 'approved', 'rejected', 'cancelled', 'refunded');
create type public.ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');
create type public.compat_status as enum ('verified', 'unverified', 'incompatible');

-- ---------- helpers ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- ---------- identity ----------
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

-- ---------- catalog ----------
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
  preset_count int,                    -- verified specs only: null = unknown / not shown
  sound_count int,
  velocity_layers int,
  channel_mode text check (channel_mode in ('stereo', 'mono', 'mixed')),
  presets jsonb not null default '[]'::jsonb,   -- [{bank, program, name}]
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
  storage_path text not null,          -- path inside public 'previews' bucket
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

-- ---------- commerce ----------
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
  -- References profiles (not auth.users) so PostgREST can embed profiles:user_id(email) in admin queries.
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
  qr_path text,                        -- public 'payment-qr' bucket
  destination text,                    -- e.g. GCash number / PayPal.me link / email
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
  -- Duplicate transaction reference protection (same provider, case/space-insensitive)
  constraint payments_ref_format check (reference_number ~ '^[A-Z0-9\-]{6,40}$')
);
create unique index payments_provider_ref_uq on public.payments(provider, reference_number);
create index payments_order_idx on public.payments(order_id);

create table public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,          -- private 'payment-proofs' bucket: {user_id}/{file}
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

-- ---------- engagement ----------
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
  video_url text,                      -- YouTube / Vimeo embed URL (validated in UI)
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
  attachment_path text,                -- private 'support-attachments' bucket
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
