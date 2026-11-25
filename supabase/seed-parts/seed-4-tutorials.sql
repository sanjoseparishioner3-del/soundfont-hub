insert into public.tutorials (slug, title, summary, body_md, sort_order, is_published) values
  ('extract-zip-files','How to extract ZIP files','Unpack a SoundFont bundle on Android, iOS, Windows or macOS.',
   E'1. Open your device file manager (Files on iOS/Android, File Explorer on Windows, Finder on macOS).\n2. Locate the downloaded `.zip` file.\n3. Android/iOS: tap the file to extract. Windows: right-click, Extract All. macOS: double-click.\n4. Open the extracted folder and look for `.sf2` files.',1,true),
  ('manage-downloaded-files','How to manage downloaded files','Find and organise your SF2 files.',
   E'Downloaded files are saved by your browser to its download folder (usually *Downloads*). Move them to a dedicated *SoundFonts* folder so your music apps can find them easily. Keep a backup copy - you can always re-download from **My Sound Library**.',2,true),
  ('connect-midi-keyboard','How to connect a MIDI keyboard','USB/Bluetooth MIDI basics.',
   E'1. Connect your keyboard by USB (use an OTG adapter on phones) or pair a Bluetooth MIDI device.\n2. Open the *Virtual Keyboard* page in Chrome/Edge - supported keyboards are detected automatically.\n3. In your music app, select the MIDI device in its MIDI settings.',3,true),
  ('troubleshoot-compatibility','Troubleshooting compatibility issues','What to check when a SoundFont does not load.',
   E'- Confirm the app supports `.sf2` (SF3/SFZ/SF2Pack are different formats).\n- Check the file size against your device memory.\n- Re-download if the file was interrupted; compare the SHA-256 shown in your library.\n- Check the product page for tested applications.',4,true)
on conflict (slug) do nothing;
