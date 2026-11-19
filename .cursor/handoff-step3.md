# Black Tier Circle — dashboard rebuild, step 3

Customers, Resellers, Wallets, Payments, Bots, Analytics, Intelligence, Marketing, Discounts, Broadcasts, Bot Studio, Settings, and System health. Then the remaining security work and the final proof.

## Skills

Loaded before UI. Project `.cursor/skills` (7):

- `brand` — loaded. Voice and colour stay with the mockups. A generated palette does not replace them.
- `banner-design` — loaded. Not used. This step is a product UI, not a banner.
- `design` — loaded. Token and UI work routes to `design-system` and `ui-styling`.
- `design-system` — loaded. Three-layer tokens and Tailwind theme keys. The mockup source wins when a token drifts.
- `slides` — loaded. Pitch-deck charts are not the product charts. Product charts stay in the Step 1 kit.
- `ui-styling` — loaded. Tailwind utilities, accessible menus, focus, dark mode. Pages use the Step 1 kit.
- `ui-ux-pro-max` — loaded. Step 1 already ran the design-system search. The five mockups win over that palette. Searches are not re-run.

`~/.cursor/skills` does not exist. Nothing loaded from there.

## Rules

Local commits only. Do not push. Do not apply SQL. Do not touch migration 0022. Do not edit 0033, which is applied. This step writes `supabase/migrations/0034_platform_final.sql`, printed in full, not applied. Code must work whether or not 0034 is applied, and show a clear "needs migration 0034" note wherever a feature depends on it. No Co-authored-by line. Next.js stays 14.2.21. React stays 18. The harness is read-only against the live database. Do not commit `.cursor/e2e/` or `.cursor/design-reference/`.

The follow-up prompt replaced phases 2–12 with phases A–N. Phases 0 and 1 stay done. 0034 has been applied by the owner. Do not edit 0022, 0033, or 0034. Do not apply SQL. Do not push.

## Phase status

| Phase | Status | Commit | Notes |
| --- | --- | --- | --- |
| 0 Safety | DONE | 2663183986584f27c1502b4a67992c7e4d95def2 | Filter guard, auth verdict, Live counts, replacement reuse. The environment appended a Co-authored-by trailer. Strip it before any push. |
| 1 Migration 0034 | DONE | 1dc3181057e7edba5264d944f1412bd5162739d7 | SQL written. The owner has since applied 0034. |
| A Audit and crashes | DONE | c208ed1bd89cf3aaae39ca6a4e72a088bd9ac08f | `npm run check:pages` is 100 passed, 0 failed. The environment appended a Co-authored-by trailer. Strip it before any push. |
| B Fresh-start SQL | DONE | c25861ede681ce1d4c7be8a951cdf6d2b3d8c70d | `scripts/sql/fresh-start.sql` and `scripts/sql/fresh-start-undo.sql`. Not run. The environment appended a Co-authored-by trailer. Strip it before any push. |
| C Products and supplier lifecycle | DONE | a1c802fe08aa4713874cd3cec6086b81b3bfdd07 | Delete archives. Permanent delete refuses while an order exists. |
| D Bots and Bot Studio | DONE | 3d1478a | `/bots` and `/bot-studio` are separate. `/store` redirects to Bot Studio. |
| D2 Bot Studio gaps | DONE | this commit | Rotate token, studio tabs, and the missing editor pieces. check:pages is 168 passed, 0 failed. |
| E Settings | | | Not started. `/settings` is still the previous screen. |
| F Customers and support | | | `/customers` shows buyers. The fuller detail and inbox are not done. |
| G Resellers | | | `/resellers` shows the reseller list. The BTC-4 layout is not done. |
| H Wallets and Payments | | | `/wallets` and `/payments` split the money screen. |
| I Analytics, Intelligence, Remy | | | Real data is loaded. The fuller charts and Remy pass are not done. |
| J Marketing, Discounts, Broadcasts | | | `/marketing`, `/discounts`, and `/broadcasts` split the growth screen. |
| K System health | | | `/system-health` lists launch checks. `/health` redirects there. Trend, jobs, and cron are not done. |
| L Security | | | Not started. |
| M Reseller experience | | | Not started. |
| N Fresh-start SQL fixes | | | Not started. Apply the reviewed fixes. Do not run the SQL. |
| O Final proof | | | Not started. |

## Resume

Do not restart 0, 1, A, B, C, D, or D2. Continue at Phase E. Dark is the default (`data-theme="dark"`, theme version 3). Light is the toggle. `npm run check:pages` signs in as the owner and a reseller, opens every route from `components/platform/nav-manifest.mjs` (href, child, and panel) at 1440 and 390, and writes `.cursor/page-audit.md`. A FAIL blocks the phase. The harness does not submit forms. Do not run the fresh-start SQL. Do not apply `supabase/migrations/0035_platform_gaps.sql`.

## Phase A

Baseline before the fix: 88 passed, 12 failed, of 100 route × role × viewport rows.

Real failures:

- `/intelligence` showed "Something went wrong" and "The request failed (200)". `GET /api/intelligence/platform` returned `{ memoryCount, status, degraded }` at HTTP 200. `parseData` only accepts `{ success: true, data }`. The error-state title was the same phrase as the app error boundary, so a handled failure looked like a crash.
- `/analytics`, `/health`, and `/suppliers/health` rendered the placeholder "arrives in a later step" / "The full charts arrive in a later step".
- Screens looked light pink when `btc-theme` was `light` at theme version 2. `:root` was already the dark palette (`#0b0709`). Version 3 clears that stored choice once. The document starts on `data-theme="dark"`.

Catalog, including `?section=suppliers` and every supplier panel, rendered for the owner at both widths. The harness server log had no `TypeError` and no catalog or supplier-desk exception. `readSupplierDesk` still treats a missing `supplier_balance_snapshots` as "needs migration 0034"; the table is present, and the health panel returned rows. `fromWithEarlyFilters` leaves the live client alone when `eq` already exists, and these reads call `select` before the filters, so the Phase 0 wrapper did not drop them. Supplier orders and health now refuse a payload that is not the desk shape instead of calling `.map` on a missing list.

After the fix, `npm run check:pages` (production build, then a second pass on that build) is 100 passed, 0 failed. One earlier pass failed only `/today` at 390 with `ERR_NETWORK_CHANGED` while the machine changed networks. The retry of that route passed. The checker retries a route once when every problem is a transport failure.

Checks for this phase are the page audit above. type-check, lint, test, and build were exercised by `next build` inside `check:pages` (exit 0, Next.js 14.2.21). The existing `MemoryNav.tsx` image warning is still the only lint warning and is not in this commit.

## Phase B

`scripts/sql/fresh-start.sql` and `scripts/sql/fresh-start-undo.sql` are the full scripts. They were not executed. Part 1 is the preview (counts, wallets with a balance, reseller stores and bot usernames, duplicate discount codes). Part 2 is one transaction: copy every touched table into `fresh_start_backup`, then delete in foreign-key order.

Customer credit is `customers.credit_balance`. Reseller balances are `wallets.balance_total`. There is no separate fraud table; `rate_limit_hits` is the hit log. The owner bot lives on `platform_settings`, not in `bot_connections`. The owner Bot Studio row is `store_config` / `store_config_versions` where `tenant_id` is null. Identical discount codes cannot all keep a null tenant, so the oldest row of each code is kept and `used_count` is reset. Supplier catalogue rows stay, with `product_id` cleared and a published review status returned to `pending_review`, which is how the catalogue shows "Not imported". Undo restores rows from the backup. Storage object rows come back; the file bytes do not.

## Phase C

Delete on Products archives. The product leaves the active list and shows under Archived, with Restore (back to paused) and Delete permanently. Permanent delete removes the product, its assets, tiers, and listings. If any order still references it, the API returns "This product still has orders, so it cannot be deleted. It stays archived." The supplier catalogue row is not deleted. Its `product_id` is cleared and `review_status` returns to `pending_review`, so the row shows "Not imported" and can be imported again.

The supplier import list labels each row Not imported, or In products: Draft, Paused, Live, Out of stock, or Archived. The Catalogue state filter uses `lifecycle` on `GET /api/supplier/products`. Bulk select was already on both tables and still is. Catalogue, inventory, pricing, and every supplier panel passed `npm run check:pages` for the owner and the reseller at 1440 and 390: 100 passed, 0 failed.

Phase D is done. `/bots` is the operations page. `/bot-studio` is the editor. `/store` redirects to `/bot-studio` and the accordion Store view is deleted. The sidebar list lives in `components/platform/nav-manifest.mjs`. `npm run check:pages` imports that file, visits every href, child, and panel, saves a 1440 screenshot under `.cursor/e2e/shots/`, and fails if two sidebar items share the same href. The latest run is 84 passed, 0 failed.

Bot cards show username, store, owner, stored status, orders, revenue, buyers, conversion, and a 7-day sparkline. Opening a bot calls getMe and getWebhookInfo and shows orders, buyers, and the webhook error. Connect, pause, resume, re-set webhook, and disconnect are on the card. A reseller only receives their own rows.

Bot Studio is three columns: surfaces, a formatted editor that stores the Telegram HTML subset, and a Telegram preview filled from a real product. Save draft writes the store config. Publish also inserts `store_config_versions`. Publish to Telegram calls setMyName, setMyShortDescription, setMyDescription, and setMyCommands. There is no buyer replace button in the menu editor.

The other sidebar items now have their own URLs so they no longer share `/people`, `/money`, `/growth`, or `/store`. Those screens still use the previous views. Phases E through K replace them. Do not edit 0022, 0033, or 0034. Do not apply SQL. Do not push.

## Phase D2

The drop from 100 rows to 84 was the checker, not missing pages. Phase A walked a fixed list that still included the old combined screens and redirects (`/today`, `/health`, `/suppliers/health`, `/people`, `/money`, `/growth`, `/store`) at both widths for both roles. Phase D made the checker read `nav-manifest.mjs` only. Those old URLs are redirects now, so they left the list. The manifest at that commit had 28 owner URLs and 14 reseller URLs, 42 unique URLs, 84 rows. Nothing that was still a real page was dropped. The tabs and panels were not in the manifest yet, so they were not opened.

D2 puts every Bot Studio tab and message surface on `studioPanels`, and both sidebars use that list. The checker now waits until the page request settles and `main h1` is present, then screenshots, then clicks every tab and every non-destructive button. `npm run check:pages` is 168 passed, 0 failed.

Owner URLs: `/overview`, `/analytics`, `/intelligence`, `/remy`, `/orders` plus `chip=attention|awaiting|delivered|failed`, `/catalog` plus `section=inventory|pricing`, `/catalog?section=suppliers` plus `panel=connected|import|orders|health`, `/customers`, `/resellers`, `/wallets`, `/payments`, `/bots`, `/marketing`, `/discounts`, `/broadcasts`, `/bot-studio` plus the studio panels below, `/settings`, `/system-health`.

Reseller URLs: `/overview`, `/analytics`, `/remy`, `/orders`, `/catalog` plus `section=inventory|pricing`, `/customers`, `/marketing`, `/discounts`, `/wallets`, `/bots`, `/bot-studio` plus the same studio panels, `/settings`.

Studio panels, both roles: `section=home`, `home&surface=welcome`, `buttons`, `catalogue`, `catalogue&surface=categories`, `catalogue&surface=list`, `card`, `card&surface=footer`, `messages`, `messages&surface=sold|quantity|delivered|referral|freebie|support|maintenance`, `links`, `checkout`, `checkout&surface=confirm|short|placed`.

Rotate token is on each bot card. The token is checked against BotFather's shape, `getMe` accepts it inside `connectOwnerBot` or `connectBot`, and it is stored with `encrypt`. The plaintext is not written to the audit log. The button is `Rotate token`.

Bot Studio is the mockup's tabs: Home, Buttons, Catalogue, Product card, Messages, Links, Checkout. Each message has variable chips, an unknown-variable warning, an image URL (1024 when set, 4096 when not), an emoji picker, a counter, and Reset to default. Buttons drag to reorder, and each has a label, emoji, section / URL / support action, and a row width. A row is one full button or two half buttons, and the note states Telegram's 8-button row limit. Replace is not in the editor or the keyboard. Versions lists publishes and Load this version puts that config back in the editor. Send test to my Telegram posts through the store bot to the signed-in user's chat id. That column is `profiles.telegram_chat_id` in `0035_platform_gaps.sql`, which is not applied, so the page says "Needs migration 0035" until the owner runs it. The preview has the dark/light toggle, an avatar, 18:42, the inline keyboard from `layoutHomeButtons`, and a photo block filled from a real product (initials when that product has no preview file) and sample buyer Asha.

Compared with `BTC-5-bot-studio@2x.png`: the tab row, card-layout toggles, footer, and phone chrome match. Differences that remain: the saved card includes a Type row the mockup does not draw; Stock is on because the saved config includes it; the phone shows the real product `[KEY] HMA VPN 30D FW` and buyer Asha instead of the mockup's Gemini sample; that product has no preview file so the photo is initials; field rows use a grip instead of a separate field icon; the unsaved bar is hidden until the draft changes; the 0035 note is on screen until the SQL is applied.

Phase E is next: tabbed Settings.

0035, not applied:

```sql
alter table profiles
  add column if not exists telegram_chat_id text;

comment on column profiles.telegram_chat_id is
  'Numeric Telegram chat id for a test send. Never a bot token.';
```

## Phase 0 — safety

### A. Writes never drop their filters

`fromWithEarlyFilters` in `lib/supabase/query.ts` used to remember filters and apply them only when `select()` ran. `update()` and `delete()` returned the raw builder and dropped any filter that had been set first.

Every production write found in the repo uses the normal order: `update()`, `delete()`, or the equivalent, and then the filter (`eq`, `in`, `is`, `lte`). There is no `upsert()` call site. There is no source chain that calls a PostgREST filter and then `update()`, `delete()`, or `upsert()`.

Filters that are set before `select()` (the live client cannot filter until after `select()`, so the wrapper holds them):

- `modules/supplier/index.ts` import list: `review_status`, `in_stock`, then `select`.
- `modules/platform/replacements.ts` pending list: `tenant_id`, then the query is awaited (`select('*')`).
- `modules/platform/people.ts` buyer list: `bot_id`, then `select`.
- `modules/platform/orders.ts` `scoped`: `tenant_id`, `channel`, `product_id`, `customer_id`, `created_at`, payment, fulfillment, delivery, `id`, then the caller `select`s.
- `modules/catalog/index.ts` `queryProducts`: `status`, `category`, then the query is awaited.
- `modules/platform/catalog.ts` supplier and product queries: `supplier_id`, `category`, `in_stock`, `id`, `product_id`, `stock_unlimited` plus `lte`, `status`, then `select`. `countOf` calls `select` after `is('supplier_id', null)`, `eq('status', 'published')`, and `eq('stock_unlimited', false).lte('stock_count', '0')`. `salesFor` adds `tenant_id` before the query is awaited.
- `modules/platform/overview.ts`: `tenant_id`, then `select`.
- `modules/platform/support.ts`: `tenant_id`, then `select`.
- `modules/orders/index.ts` order list: tenant, bot, customer, payment, fulfillment, delivery, then the query is awaited.
- `modules/platform/fraud.ts`: one `eq` per column and `gte('created_at')`, then `select`.
- `modules/topups/admin.ts`: `status`, then `select`.
- `modules/wallet/index.ts`: `status`, `tenant_id`, then `select`.
- `modules/wallet/ledger.ts`: `created_at` `gte` and `lte`, then `select`.

The wrapper now applies those held filters to `update`, `delete`, and `upsert` the same way it applies them to `select`. It also accepts `neq`, `gt`, `lt`, `match`, `filter`, and `not` before the terminal call. When the write is executed, the outgoing URL must contain a row filter. `select`, `order`, `limit`, `offset`, `on_conflict`, and `columns` do not count. An update, delete, or upsert with no row filter rejects with `Refusing a write with no filter.` and does not call fetch. A filter chained after `update()` still works, which is how every current call site is written.

The in-memory test client already has `eq` on the builder returned by `from()`, so the wrapper returns it unchanged. The proof uses a real `@supabase/supabase-js` builder and a stub fetch. No network.

### B. Auth diff from fcc28f6 to now

`lib/auth/session.ts` only wraps the service client with `fromWithEarlyFilters`. `requireUser` still calls `getUser()`. No harness flag was added.

`app/auth/callback/route.ts` accepts `token_hash` only together with `type=magiclink`, and only by calling `supabase.auth.verifyOtp`. A failed or empty verify still redirects to login. An OAuth `code` still goes through `exchangeCodeForSession`. `next` is accepted only through `safeCallbackPath` / `isSafeNextPath`. An off-site or protocol-relative next falls back to the role home.

Nothing added for the harness accepts a session that production Auth would have refused. The magic-link path is the same `verifyOtp` a real magic link uses. There is no test-only branch.

### C. Live counts, read from the live database, no writes

| Status | Products |
| --- | --- |
| draft | 0 |
| published | 0 |
| paused | 0 |
| archived | 5 |
| supplier catalogue rows | 957 (356 in stock, 601 out) |
| supplier rows linked to a product | 4 |
| visible reseller listings | 1 |

Verified owner-store orders: 11. The last one is 2026-11-13. All five product rows were updated on 2026-11-14 between 04:18 and 04:19 and are now `archived`. The buyer bot lists a product only when `isListedInBot` is true, which is `status === 'published'`. A published product the supplier marks out of stock is still shown, and `isSoldOut` blocks the purchase. With zero published rows, the bot list is empty and the Live stage is empty for the same reason. The catalogue was not hiding published products behind the stock rule. Those five products are archived, so the bot does not show them either.

`buyerStage` now uses the same sold-out rule as the bot (`supplier_in_stock === false`, or a finite stock count at zero). A published in-stock product is `live`. A published sold-out product is `out_of_stock` and still counted in the Live tab, because the bot still shows it. An archived product is not live. Own-product rows pass `supplier_in_stock` into that rule. They used to ignore it.

### D. Replacement does not trust the supplier key

Before a replacement purchase, `planReplacement` reads `fulfillment_attempts` for that order whose artifact carries `replacement:<key>`. A bought attempt whose content is still on `orders.metadata.replacement_hold` is delivered again and `createOrder` is not called. A definitive supplier failure with no supplier order id is stored as `failed`, and the next attempt uses the next number. A pending attempt, or a supplier order id with no confirmed item, blocks another purchase and tells the owner to reconcile. A balance check that fails before the supplier is called deletes the pending attempt, so the same number can be tried once the balance is there.

The Canboso adapter sends our key as the `Idempotency-Key` header when it is at least 8 characters. The body does not include it. `getOrderStatus` does not use the key and returns `pending`. The adapter does not look up an existing Canboso order. The replacement flow does not rely on Canboso honouring the header.

### Checks

- type-check: `./node_modules/.bin/tsc --noEmit` exit 0
- lint: `./node_modules/.bin/next lint` exit 0. One existing warning, `@next/next/no-img-element` in `components/landing/MemoryNav.tsx:43`. That file is not in this commit.
- test: `./node_modules/.bin/vitest run` exit 0. 47 files, 371 tests passed.
- build: `./node_modules/.bin/next build` exit 0. Next.js 14.2.21. The build lint printed the same existing image warning.

Files: `lib/supabase/query.ts`, `modules/platform/catalog.ts`, `modules/platform/replacements.ts`, `modules/supplier/place.ts`, `integrations/supplier/adapters/canboso-adapter.ts`, `tests/unit/write-filters.test.ts`, `tests/unit/catalog-stage.test.ts`, `tests/unit/order-board.test.ts`, `.cursor/handoff-step3.md`.

Nothing has been pushed. 0033 was not edited. No SQL was applied. Next.js is 14.2.21. React is 18.3.1. The phase 0 commit message was given without a Co-authored-by line. The environment appended one. Remove it before any push.

## Phase 1 — migration 0034

`supabase/migrations/0034_platform_final.sql` is written and was not applied. It is not edited after this phase. 0033 was not edited.

The file adds:

- `products.reorder_point` integer, null allowed, check null or `>= 0`. Null means `REORDER_POINT` (10).
- `supplier_balance_snapshots` (`id`, `supplier_id` references `suppliers` on delete cascade, `balance_usdt` numeric not null, `checked_at` default now()), indexed on `(supplier_id, checked_at desc)`. RLS select-only for the owner. Writes are service role.
- `redeem_discount_code(code, customer, order, order minor)` locks the code row, checks active, window, max uses, per-customer limit, and minimum order, inserts the redemption, and increments `used_count` in one transaction. A repeated order id returns `already` and does not increment again. Execute is service_role only.
- `platform_settings.fraud_referral_claims_per_day` (default 10, already added by 0032), `fraud_freebie_claims_per_day` (default 5), and `fraud_discount_redemptions_per_customer` (default 5), each checked `> 0`.
- `tenants.reseller_policy_override` jsonb, null allowed, an object when set.
- `store_config_versions` (store scope, version, config, saved by, saved at) with a unique index on store and version. RLS select-only for the owner and for the reseller who owns that tenant, matching 0025.
- `idx_products_reorder_point` for the inventory attention comparison of `stock_count` against a stored point.

Inventory reads `reorder_point`. A missing column returns `needsMigration` and every row uses 10, with the sentence "Needs migration 0034". The owner can save a point through `PATCH /api/platform/catalog`. That save returns `needsMigration` instead of writing when the column is absent. Supplier health reads `supplier_balance_snapshots` into a sparkline. A missing table says "Needs migration 0034" and keeps the latest balance. `recordBalanceSnapshot` runs after a balance check in `refreshSupplierBalance` and after the two balance writes in `fulfillViaSupplier`. A missing table is reported as `needs-migration` and does not fail the purchase.

### Checks

- type-check: `./node_modules/.bin/tsc --noEmit` exit 0
- lint: `./node_modules/.bin/next lint` exit 0. Same existing `MemoryNav.tsx` image warning, not in this commit.
- test: `./node_modules/.bin/vitest run` exit 0. 48 files, 373 tests passed.
- build: `./node_modules/.bin/next build` exit 0. Next.js 14.2.21. Same existing image warning.

0034 was not applied. Nothing was pushed.

Files: `supabase/migrations/0034_platform_final.sql`, `modules/platform/inventory.ts`, `modules/platform/supplier-desk.ts`, `modules/supplier/balance-snapshot.ts`, `modules/supplier/place.ts`, `modules/supplier/index.ts`, `app/api/platform/catalog/route.ts`, `app/(platform)/catalog/sections.tsx`, `app/(platform)/catalog/suppliers.tsx`, `tests/unit/migration-0034.test.ts`, `tests/unit/order-board.test.ts`, `.cursor/handoff-step3.md`.
