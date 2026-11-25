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
