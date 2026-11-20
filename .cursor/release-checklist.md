# Black Tier Circle — Production Release Checklist

Target domain: `https://blacktiercircle.vercel.app`
Locked stack: Next.js `14.2.21`, React `18.3.1`, Supabase Postgres, grammY, Groq, Hindsight, Vercel.

---

## 1. Vercel Environment Variables (Names Only — Never Commit Values)

Confirm every required variable is set in Vercel → Project Settings → Environment Variables (Production):

### Required
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BOT_TOKEN_ENCRYPTION_KEY` — **must match the exact production 32-byte hex key** used to encrypt existing bot tokens and supplier API keys (not a `PLACEHOLDER` value).
- `ADMIN_SECRET` — minimum 32 characters.
- `CRON_SECRET` — minimum 32 characters; must match the `Authorization: Bearer <CRON_SECRET>` header configured on cron-job.org.
- `NEXT_PUBLIC_APP_URL` — set to `https://blacktiercircle.vercel.app` (`https://`, non-localhost).
- `GROQ_API_KEY` — server-side only (never `NEXT_PUBLIC_`); powers Remy AI.
- `HINDSIGHT_ENABLED` — set to `true` to enable MemoryOS.
- `HINDSIGHT_API_KEY` — server-side only (never `NEXT_PUBLIC_`).
- `HINDSIGHT_API_URL` — Hindsight API origin (e.g., `https://api.hindsight.vectorize.io`; code falls back to `HINDSIGHT_BASE_URL` if unset).
- `HINDSIGHT_BANK_PREFIX` — production bank namespace prefix (e.g., `btc-prod`).

### Optional (read by the application when set)
- `APP_URL` — optional server fallback if `NEXT_PUBLIC_APP_URL` is unset.
- `BSC_RPC_URLS` — optional comma-separated BSC JSON-RPC URLs (defaults to public BSC RPC endpoints when unset).
- `BEP20_MIN_CONFIRMATIONS` — optional fallback; primary source is `platform_settings.bep20_confirmations`.
- `ETHERSCAN_API_KEY` — optional secondary BEP20 receipt verifier (Etherscan API v2, chain id 56).
- `ACTIVE_SUPPLIER`, `SUPPLIER_1_API_KEY`, `SUPPLIER_1_BASE_URL` — optional legacy connector env fallback (active suppliers are managed encrypted in the `suppliers` table).

### Must NOT Be Set in Production
- `PAYMENT_SANDBOX` — **unset** (must NOT be `true`).
- `PAYMENT_DEMO_ALLOW_PROD` — **unset** (must NOT be `true`).
- `RATE_LIMIT_MEMORY` — **unset** (production must use Postgres `bump_rate_limit` RPC).

### App Settings Check
- In **Settings → Payments**: confirm a valid BEP20 USDT receiving address is saved, BEP20 is enabled, and Payment mode is **Live** (`platform_settings.payment_demo_mode = false`).

---

## 2. Database Migrations & Launch-Day Fresh Start

### Migrations (Already Applied)
- All migrations `0001`–`0021` and `0023`–`0038` are applied and verified in production (`0022` is permanently skipped).
- Verified live: `0034` (`reorder_point`, `supplier_balance_snapshots`, `redeem_discount_code`, `store_config_versions`), `0035` (`profiles.telegram_chat_id`, legal/payments/alerts columns), `0036` (bot switches & `owner_bot_paused`), `0037` (`broadcasts` table), `0038` (`store_config` select-only RLS, `payment_demo_mode = false`, performance indexes).

### Launch-Day Fresh Start (Owner Runs Manually in Supabase SQL Editor as `postgres`)
1. Run `scripts/sql/fresh-start.sql` **Part 1** (read-only preview) and inspect all four result sets:
   - **1A**: rows to be removed/unlinked.
   - **1B**: owner rows that stay untouched (`owner_profiles`, `platform_settings`, `suppliers`, `supplier_products`, `supplier_balance_snapshots`, owner `store_config`, owner `discount_codes`, owner `broadcasts`, owner `freebies`).
   - **1C**: every customer and reseller wallet with `balance > 0`.
   - **1D**: reseller stores and bots to be removed.
2. Only after reviewing Part 1, run `scripts/sql/fresh-start.sql` **Part 2** (single transaction: backs up every touched table into `fresh_start_backup`, clears/reassigns all FKs, and deletes test/reseller rows). If anything fails, the entire transaction rolls back.
3. Empty product storage buckets in **Supabase Dashboard → Storage** (never delete `storage.objects` via SQL):
   - Open **Storage** → `product-files` → click the bucket menu (`...`) → **Empty bucket** → confirm.
   - Open **Storage** → `product-previews` → click the bucket menu (`...`) → **Empty bucket** → confirm.
   - Leave the `avatars` bucket intact.
4. *(Only if data rollback is needed)*: run `scripts/sql/fresh-start-undo.sql` in the SQL Editor. Once the live launch is verified, optionally remove the backup schema with `drop schema fresh_start_backup cascade;`.

---

## 3. cron-job.org Schedule (All 5 Jobs)

Every job uses `POST` with header `Authorization: Bearer <CRON_SECRET>` (verified via constant-time `timingSafeEqual`). Every route enforces a bounded batch limit and a 20 s time budget so it responds well under cron-job.org's 30 s hard timeout.

| # | Job | URL | Method | Auth Header | Schedule | Bounds / Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Order fulfillment & expiry | `https://blacktiercircle.vercel.app/api/fulfillment/process` | `POST` | `Authorization: Bearer <CRON_SECRET>` | `*/2 * * * *` (every 2 min) | Max 10 queued + 10 ready orders, 20 s budget; sweeps referrals, expired top-ups & rate limits if time remains. |
| 2 | Supplier order reconciliation | `https://blacktiercircle.vercel.app/api/supplier/reconcile` | `POST` | `Authorization: Bearer <CRON_SECRET>` | `*/5 * * * *` (every 5 min) | Max 15 unknown + 15 pending orders, 20 s budget; piggybacks at most 1 due supplier sync only when ≥ 8 s remain. |
| 3 | Supplier catalog sync | `https://blacktiercircle.vercel.app/api/supplier/sync` | `POST` | `Authorization: Bearer <CRON_SECRET>` | `*/10 * * * *` (every 10 min) | **1 oldest-synced supplier per call**, unchanged rows bulk-touched in 200-row chunks, 20 s budget (4 suppliers rotate every 40 min). Update existing cron-job.org schedule to every 10 min. |
| 4 | Bot webhook health | `https://blacktiercircle.vercel.app/api/bots/health` | `POST` | `Authorization: Bearer <CRON_SECRET>` | `*/15 * * * *` (every 15 min) | Max 15 oldest-checked connected bots per call, 18 s budget. |
| 5 | Scheduled broadcasts | `https://blacktiercircle.vercel.app/api/platform/broadcasts/process` | `POST` | `Authorization: Bearer <CRON_SECRET>` | `*/5 * * * *` (every 5 min) | Max 1 due broadcast (up to 150 recipients), 18 s budget. **Add this job ONLY AFTER pushing and deploying the new build.** |

---

## 4. Git Pre-Push & Deploy Steps

Run from `/Users/kushchaudhari/Black Tier Circle/Black-Tier-Circle` on branch `main`:

1. Create a local safety backup tag:
   ```bash
   git tag pre-push-backup
   ```
2. Strip `Co-authored-by` trailers from all unpushed commits:
   ```bash
   FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --msg-filter "sed '/^Co-authored-by:/d'" origin/main..main
   ```
3. Verify zero `Co-authored-by` trailers remain in unpushed commits (must print `0`):
   ```bash
   git log origin/main..main --format=%B | grep -ci "co-authored"
   ```
4. Push cleanly to `origin main` (never force push):
   ```bash
   git push origin main
   ```

Wait for Vercel to finish building and promoting the production deployment.

---

## 5. Post-Deploy Smoke Test

1. **Owner login**: Sign in at `https://blacktiercircle.vercel.app/login` and verify `/overview` loads in dark theme (`data-theme="dark"`).
2. **Sidebar routes**: Click through every owner sidebar page (`/overview`, `/analytics`, `/intelligence`, `/remy`, `/orders`, `/catalog`, `/catalog?section=suppliers`, `/customers`, `/resellers`, `/wallets`, `/payments`, `/bots`, `/marketing`, `/discounts`, `/broadcasts`, `/bot-studio`, `/settings`, `/system-health`) and confirm zero errors or blank states.
3. **Telegram bot `/start`**: Send `/start` to the owner Telegram bot and confirm it replies promptly with the configured welcome screen and menu (no buyer Replace button).
4. **Test purchase**: Publish one test product (or use an existing live product) and complete one purchase using buyer wallet balance; confirm automatic fulfillment, Telegram delivery, and order status `Delivered` on `/orders`.
5. **System health**: Open `/system-health` and confirm:
   - Launch readiness shows **Payment mode: Live** and production domain `https://blacktiercircle.vercel.app`.
   - Real supplier balances and sync timestamps appear.
   - Scheduled cron jobs show fresh heartbeats.
6. **cron-job.org verification**:
   - Trigger a manual test run of `POST https://blacktiercircle.vercel.app/api/supplier/sync` in cron-job.org and verify it returns **HTTP 200** in well under 25 s with JSON naming the synced supplier and `durationMs`.
   - Add job #5 (`POST https://blacktiercircle.vercel.app/api/platform/broadcasts/process`, every 5 min) in cron-job.org and confirm its manual test run returns **HTTP 200**.

---

## 6. Rollback Plan

If anything breaks after the Vercel deployment goes live:

1. Open **Vercel Dashboard** → **Black Tier Circle** → **Deployments**.
2. Locate the previous working production deployment (before this push).
3. Click the deployment menu (`...`) → **Promote to Production** → confirm.
4. Wait ~15 seconds for traffic to switch back, then verify `/login` and bot `/start`.
5. *(Database note)*: Migrations `0034`–`0038` are strictly additive/compatible with the previous deployment (select-only RLS on `store_config` matches service-role writes), so no DB downgrade is needed for an app rollback.
