# Black Tier Circle — Platform Security Audit (Phase L)

> Replaced legacy pre-Step-1 audit. Scope: Next.js 14.2.21 App Router dashboard, `/api/platform/*`, `/api/reseller/*`, `/api/admin/*`, `/api/orders/*`, `/api/v1/*`, cron endpoints, Telegram webhooks, Supabase RLS & migrations (`0001`–`0038`), client bundle, and `safe-fetch`.

## Summary of Verification

- **Unit & security tests:** 58 test files, 432 tests passing (`tests/unit/phase-l-security.test.ts`, `tests/unit/security.test.ts`, `tests/unit/security-controls.test.ts`, `tests/unit/write-filters.test.ts`, `tests/unit/public-api.test.ts`, `tests/unit/phase-m.test.ts`, `tests/unit/phase-a-fix.test.ts`).
- **End-to-end read-only page audit (`npm run check:pages`):** 214/214 PASS (owner and reseller, 1440px and 390px) with hardened CSP and security headers active.
- **Client bundle secret scan:** 0 server env var names (`SUPABASE_SERVICE_ROLE_KEY`, `BOT_TOKEN_ENCRYPTION_KEY`, `ADMIN_SECRET`, `CRON_SECRET`, `GROQ_API_KEY`, `HINDSIGHT_API_KEY`, `ETHERSCAN_API_KEY`) and 0 secret-looking tokens found in `.next/static/`.
- **`NEXT_PUBLIC_` variables:** Only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPPORT_TELEGRAM`, and `NEXT_PUBLIC_RESELLER_BOT_URL` — none hold secrets.

---

## Findings, Fixes & Tests

### F-01 — Middleware used `getSession()` and failed open on missing profile fields
- **Severity:** High
- **Location:** `middleware.ts`
- **Issue:** `middleware.ts` called `supabase.auth.getSession()` (which trusts cookie payload without re-verifying with Supabase Auth) instead of `getUser()`. Additionally, `readProfileGate` fell back to `status: 'active'` and `middleware` defaulted a missing `role` to `'reseller'`, failing open when profile rows were missing or errored.
- **Fix:** Switched `middleware.ts` to `supabase.auth.getUser()`. Exported and hardened `readProfileGate` to fail closed (redirect to `/login`) whenever the profile query errors or `role` or `status` is missing. Removed the `'reseller'` default fallback.
- **Test:** `tests/unit/phase-l-security.test.ts` — `Phase L — middleware fail-closed profile gate`.

### F-02 — `0025_bot_studio.sql` defined `FOR ALL` RLS policies instead of select-only
- **Severity:** High
- **Location:** `supabase/migrations/0025_bot_studio.sql` (applied; left unedited) → fixed in `supabase/migrations/0038_security.sql`
- **Issue:** `store_config_owner_all` and `store_config_reseller_all` granted `FOR ALL` (allowing direct browser writes bypassing server validation, rate limits, and `audit_log`), violating the platform's select-only RLS invariant.
- **Fix:** Authored `supabase/migrations/0038_security.sql` dropping both `FOR ALL` policies, creating select-only `store_config_owner_read` and `store_config_reseller_read` policies matching `0034_platform_final.sql`, revoking write privileges from `public`/`anon`/`authenticated`, and granting `all` only to `service_role`.
- **Test:** Verified SQL structure in `supabase/migrations/0038_security.sql`; all app writes go through `createAdminSupabaseClient()` in server routes.

### F-03 — Non-constant-time `CRON_SECRET` comparison
- **Severity:** High
- **Location:** `lib/cron-auth.ts`, `lib/api-rate-limit.ts`
- **Issue:** `verifyCronAuth` compared `CRON_SECRET` with `===` instead of constant-time comparison, and `/api/platform/broadcasts/process` was missing from the cron rate-limit classifier in `lib/api-rate-limit.ts`.
- **Fix:** Added `constantTimeSecretMatch` using `node:crypto` `timingSafeEqual` in `lib/cron-auth.ts` for both `Authorization: Bearer <CRON_SECRET>` and `?secret=` checks. Added `platform/broadcasts/process` to the `cron` classifier in `lib/api-rate-limit.ts`. All five cron routes (`/api/fulfillment/process`, `/api/supplier/reconcile`, `/api/supplier/sync`, `/api/bots/health`, `/api/platform/broadcasts/process`) use `authorizeCronOrOwner` / `verifyCronAuth`.
- **Test:** `tests/unit/phase-l-security.test.ts` — `Phase L — Constant-time CRON_SECRET and Telegram secret verification`.

### F-04 — Telegram webhook updates without a user ID bypassed rate limiting and were processed
- **Severity:** High
- **Location:** `lib/api-rate-limit.ts`, `app/api/webhooks/telegram/owner/route.ts`, `app/api/webhooks/telegram/[botId]/route.ts`
- **Issue:** `limitTelegramCustomer` returned `null` when `telegramUserId(update)` was `null`, allowing anonymous updates without a sender `from.id` to bypass per-user rate limits and enter `processTelegramUpdate`.
- **Fix:** Added `limitTelegramUpdate` in `lib/api-rate-limit.ts` and wired it into both Telegram webhook routes. Updates with `from.id` are rate-limited on `tg-user:{botId}:{userId}`; known `channel_post` / `edited_channel_post` updates are rate-limited on `tg-chat:{botId}:{chatId}`; all other updates without a user ID are refused with HTTP 400. Per-bot `X-Telegram-Bot-Api-Secret-Token` verification remains constant-time via `timingSafeEqual` in `integrations/telegram/webhook.ts`.
- **Test:** `tests/unit/phase-l-security.test.ts` — `Phase L — Telegram update sender enforcement & tg-chat rate limiting`.

### F-05 — Missing zod validation, rate limits, and `audit_log` rows on mutating routes
- **Severity:** Medium
- **Location:** `app/api/platform/store/route.ts`, `app/api/reseller/settings/route.ts`, `app/api/platform/catalog/route.ts`, `app/api/platform/goal/route.ts`, `app/api/platform/pricing/route.ts`, `app/api/orders/[orderId]/cancel/route.ts`, `app/api/orders/[orderId]/note/route.ts`, `app/api/orders/[orderId]/refund/route.ts`
- **Issue:**
  - `app/api/platform/store/route.ts`: `PATCH`/`POST` lacked zod validation, rate limiting, and `audit_log`; `PUT` lacked `audit_log`.
  - `app/api/reseller/settings/route.ts`: `PATCH` lacked rate limiting and `audit_log`.
  - `app/api/platform/catalog/route.ts` (`PATCH`), `app/api/platform/goal/route.ts` (`PUT`), `app/api/platform/pricing/route.ts` (`POST`/`PUT`), `app/api/orders/[orderId]/cancel/route.ts`, `app/api/orders/[orderId]/note/route.ts`, `app/api/orders/[orderId]/refund/route.ts` lacked one or more of zod validation, `assertRateLimit`, or `audit_log`.
- **Fix:** Added zod schemas, `assertRateLimit`, session-derived tenant scoping, and `audit_log` inserts (without logging secrets) across all listed mutating routes.
- **Test:** `tests/unit/phase-a-fix.test.ts`, `tests/unit/phase-l-security.test.ts`, `tests/unit/tenant-settings.test.ts`, `tests/unit/order-board.test.ts`.

### F-06 — Float math on money in supplier replacement and overview balance totals
- **Severity:** Medium
- **Location:** `modules/platform/replacements.ts:255`, `modules/platform/overview.ts:204`
- **Issue:** `BigInt(Math.round(placed.amountUsdt * 1_000_000))` and `Math.round(Number(row.balance_usdt || 0) * 1_000_000)` used IEEE-754 floating-point multiplication on USDT amounts.
- **Fix:** Replaced both with `usdtToMinor(String(...))` from `lib/money.ts`. Confirmed via grep that zero float-multiplication money math remains and all wallet credits/debits go through idempotent `SECURITY DEFINER` SQL RPCs (`0004`, `0012`, `0024`, `0028`, `0029`).
- **Test:** `tests/unit/money.test.ts`, `tests/unit/wallet-idempotency.test.ts`, `tests/unit/order-board.test.ts`.

### F-07 — List helpers silently returning `[]` on database errors
- **Severity:** Medium
- **Location:** `modules/platform/settings-extra.ts`, `modules/platform/resellers.ts`, `app/api/platform/settings/route.ts`, `modules/platform/growth.ts`
- **Issue:** `listStoresWithOverrides`, `safeRecords` (in `resellers.ts`), `recentAudit`, and `listBroadcastJobs` returned `[]` on DB errors instead of throwing `AppError`, masking failures as empty states.
- **Fix:** Updated all four to throw `AppError(..., 500)` on `result.error` so API routes return 500 and the UI renders `ErrorState`.
- **Test:** `tests/unit/phase-l-security.test.ts` — `Phase L — Error handling, HTML sanitization, and no buyer Replace button`.

### F-08 — Hardened security headers & CSP
- **Severity:** Low
- **Location:** `next.config.mjs`
- **Issue:** `X-Frame-Options` was `SAMEORIGIN` (while CSP had `frame-ancestors 'none'`), and CSP omitted `base-uri`, `form-action`, and `object-src`.
- **Fix:** Set `X-Frame-Options: DENY` and added `base-uri 'self'`, `form-action 'self'`, and `object-src 'none'` to CSP. Verified all 214 owner/reseller routes render cleanly under the tightened CSP.
- **Test:** `npm run check:pages` (214/214 PASS).

### F-09 — Stray `[]` syntax typo in applied migration `0020_bot_improvements.sql`
- **Severity:** Informational (historical migration)
- **Location:** `supabase/migrations/0020_bot_improvements.sql:4`
- **Issue:** Line 4 contains a trailing `[]` (`ADD COLUMN IF NOT EXISTS platform_usdt_wallet_trc20 text,[]`). Because `0020` is already applied in production, it is NOT edited in place; recorded here so any fresh-database replay strips the trailing `[]` before running `0020`.
- **Fix:** Recorded in audit; `0020` left untouched per migration immutability rule.

---

## Verified Invariants (No Regressions Found)

| Control | Status | Verification |
| --- | --- | --- |
| **IDOR & tenant isolation** (`/api/platform/*`, `/api/reseller/*`, `/api/v1/*`) | PASS | Tenant always resolved from session (`getTenantByUserId`) or API key (`modules/public-api`). Fail-closed `403 TENANT_REQUIRED` when reseller has no tenant. Resellers blocked (`403`) from all owner-only routes (`system-health`, `intelligence/platform`, `resellers`, `catalog?section=suppliers`, `replacements` replace, owner `settings`). Tested in `phase-l-security.test.ts`, `phase-m.test.ts`, `public-api.test.ts`. |
| **No supplier or owner leaks to resellers** | PASS | Reseller JSON payloads (`orders`, `catalog`, `overview`, `analytics`, `order detail`) omit `supplierName`, `supplierSku`, `supplier_price_minor`, `artifact_path` (`supplier_order:*`), `hasSupplier`, and owner store figures. Tested on serialized JSON in `phase-l-security.test.ts` and `phase-m.test.ts`. |
| **PostgREST `.or()` filter injection** | PASS | Zero user text interpolated into any `.or()` string; all `.or()` calls are static literals. Search uses safe `.ilike` via `lib/row-ids.ts`. Tested with PostgREST operator characters (`ord-a,id.eq.ord-b`) in `phase-l-security.test.ts` and `security.test.ts`. |
| **Counts past 1000 rows** | PASS | Paginated lists (`orders`, `catalog`, `people`, `topups`) use `{ count: 'exact', head: true }`; added composite indexes in `0038_security.sql`. |
| **Broadcasts scoping, rate limit & HTML sanitization** | PASS | Reseller audience strictly scoped to reseller's own `bot_id`; rate-limited via `consumeRateLimit` + 20/sec batch pacing; HTML sanitized to Telegram subset via `sanitizeBotHtml`. Tested in `phase-j.test.ts` and `phase-l-security.test.ts`. |
| **Never block a paid order; no buyer Replace button** | PASS | `assertCustomerAllowed` only caps unpaid orders, freebies, referrals, and discounts — never paid orders (`tests/unit/phase-p0.test.ts`). `layoutHomeButtons` never renders a buyer Replace/Warranty button (`tests/unit/phase-l-security.test.ts`). |
| **`safe-fetch` SSRF protection** | PASS | `lib/safe-fetch.ts` validates DNS, blocks private/loopback/link-local/metadata IPs, connects directly to the pinned IP with TLS SNI, and re-checks every redirect. Confirmed via `tests/unit/security-controls.test.ts`. |
| **Database write filter guard** | PASS | `fromWithEarlyFilters` in `lib/supabase/query.ts` refuses any `update`/`delete`/`upsert` with no row filter (`tests/unit/write-filters.test.ts`). |
