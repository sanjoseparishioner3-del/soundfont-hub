-- Reference data only (categories, applications, settings, payment method shells). No products, orders or fake stats.
insert into public.categories (slug, name, sort_order) values
  ('grand-piano','Grand Piano',1),('acoustic-piano','Acoustic Piano',2),('electric-piano','Electric Piano',3),
  ('worship-piano','Worship Piano',4),('ambient-pads','Ambient Pads',5),('warm-pads','Warm Pads',6),
  ('strings','Strings',7),('organ','Organ',8),('synthesizer','Synthesizer',9),('brass','Brass',10),
  ('bass','Bass',11),('guitar','Guitar',12),('drums','Drums',13),('lead-sounds','Lead Sounds',14),
  ('orchestral','Orchestral',15),('layered-sounds','Layered Sounds',16),
  ('worship-collections','Worship Collections',17),('complete-bundles','Complete SoundFont Bundles',18)
on conflict (slug) do nothing;

-- Applications only. Per-product compatibility ('verified' / 'unverified' / 'incompatible') is set by the admin after real testing.
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

-- Learning-center starters (editable). The Audio Evolution Mobile guide is a draft until the steps are verified on a device.
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
