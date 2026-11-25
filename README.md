# SoundFont Hub — Premium Sounds. Endless Possibilities.

React + Vite + TypeScript PWA marketplace for SF2 SoundFonts, backed by Supabase (Postgres, Auth, Realtime, Storage, Edge Functions) and Cloudflare R2 for large private files.

## What is implemented
- **Database** (`supabase/migrations/0001–0004`): all 31 requested tables, enums, FKs, indexes, RLS on every table, storage buckets/policies, seed reference data (categories, apps, payment-method shells, settings, starter tutorials). No fake products/orders/stats.
- **Server-side business logic** (SQL functions, `0002`): `add_to_cart`, `create_order` (prices/discounts computed server-side), `submit_payment` (unique `(provider, reference)` blocks duplicate references), `review_payment` (row-locked: an order cannot be approved twice; grants library incl. bundle contents), `refund_order`, `authorize_download` (single authority for download rights, logs + rate limit), `admin_stats`, audit triggers.
- **Edge Functions**: `download-url` (short-lived signed R2/Storage URL, only after `authorize_download` passes with the caller's JWT), `r2-upload` (admin-only multipart broker; verifies magic bytes, records SHA-256, rejects duplicates).
- **Storefront**: home, explore (filters/sort/pagination), product page, bundles, cart + server quote, manual GCash/PayPal checkout with QR/reference/proof upload, order tracking (Realtime), library, favorites, reviews (owners only), support tickets, learning center, policies, notifications (Realtime), virtual keyboard, persistent waveform audio player, mobile bottom nav + mini-player, dark mode.
- **Admin** (MFA-gated): dashboard + charts, SoundFonts (drag-and-drop chunked R2 upload with progress/cancel/retry/SHA-256/duplicate detection, covers, demos, compatibility), categories, collections, bundles, orders, payment verification, customers, download logs, promotions, reviews, announcements (+ broadcast), tutorials, tickets, reports (CSV), payment settings (QR upload), system settings, audit logs.
- **PWA**: installable manifest, generated icons, Workbox runtime caching for public catalog + public media only, offline banner, update prompt, auto-refetch on reconnect. Payment receipts, signed URLs, auth and private files are never cached.
- **Tests**: Vitest unit tests (`npm test`) and a Playwright smoke test (`npm run test:e2e`).

## Honest limitations
- **Virtual keyboard** uses a built-in Web Audio synth, *not* SF2 samples. Real SF2 playback needs a browser SoundFont engine (e.g. SpessaSynth) loading **demo-only, authorised** sample sets; implement behind the `Engine` interface in `src/features/keyboard/synth.ts`. Premium SF2 files are never sent to the browser pre-purchase.
- **Payments are manual by design.** Approval is an admin action after verifying the money actually arrived; screenshots never auto-approve.
- Compatibility is stored per product and defaults to *unverified*; no app is claimed to natively support SF2 until you mark it verified after testing. The Audio Evolution Mobile tutorial is seeded as an unpublished draft for the same reason.
- Edge Functions and RLS were written but **not run against a live Supabase project** in development (no project credentials were available); the frontend type-checks, unit tests pass and the production build succeeds. Run through the checklist below on a staging project before launch.
- Downloaded files can't be made impossible to redistribute; the license text says so plainly.
- Email verification relies on Supabase Auth settings; the Edge `r2-upload` in-memory rate limit is per-isolate (DB-level download limit is authoritative).

## Local development
```powershell
npm install
copy .env.example .env     # fill VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```
1. Create a Supabase project (free tier). In **SQL editor** run the four migration files in order.
2. Auth → enable email confirmations; add your site URL + `http://localhost:5173/**` to redirect URLs; enable TOTP MFA.
3. Create a Cloudflare R2 bucket (private), e.g. `soundfont-hub-private`, and an API token with Object Read & Write. **CORS** on the bucket: allow `PUT, GET` from your site origin, headers `*`, **expose header `ETag`** (needed for multipart).
4. Deploy functions:
```powershell
supabase link --project-ref YOUR_REF
supabase secrets set R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=soundfont-hub-private ALLOWED_ORIGIN=https://your-site
supabase functions deploy download-url
supabase functions deploy r2-upload
```
5. **Create the first administrator**: register normally and verify email, then in the SQL editor run `select public.promote_admin('you@example.com');`. Sign in → account menu → Admin → enrol an authenticator app (admin RLS requires an MFA-verified session). For local dev only you may set `system_settings.require_admin_mfa` to `false`.
6. In Admin → Payment Settings add your GCash/PayPal destination + QR and enable them (only accounts you are authorised to operate).

## Deployment (Cloudflare Pages)
Build command `npm run build`, output `dist`, env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL`. `public/_headers` sets CSP and security headers; `_redirects` provides SPA routing. Run `npm run gen:sitemap` before build to emit `sitemap.xml`.

## Free-tier guardrails
The dashboard shows storage use against the 10 GB R2 allowance and warns above 80%. R2 has zero egress fees; Supabase Storage is used only for small assets (covers ≤5 MB, previews ≤30 MB, proofs ≤5 MB). Watch Supabase's 1 GB storage / 5 GB egress and 500 MB DB limits.

## Pre-launch checklist
- [ ] Customer A cannot read customer B's orders, proofs, library or download (try via REST).
- [ ] Non-admin cannot call `review_payment`, `admin_stats`, or write `payment_methods`.
- [ ] Reusing a transaction reference fails; double-approve fails.
- [ ] Premium download without purchase returns 403; signed URL expires (~2 min).
- [ ] Uploading a renamed non-SF2 file is rejected.
- [ ] Offline: catalog browsable; checkout blocked.
