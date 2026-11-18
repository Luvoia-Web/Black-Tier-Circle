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

## Phase status

| Phase | Status | Commit | Notes |
| --- | --- | --- | --- |
| 0 Safety | DONE | 2663183986584f27c1502b4a67992c7e4d95def2 | Filter guard, auth verdict, Live counts, replacement reuse. The environment appended a Co-authored-by trailer. Strip it before any push. |
| 1 Migration 0034 | DONE | (this commit) | SQL written, not applied. Reorder point and balance trend fall back while 0034 is unapplied. |
| 2 Customers and support | | | Not started. |
| 3 Resellers | | | Not started. |
| 4 Wallets, Payments, Bots | | | Not started. |
| 5 Analytics and Intelligence | | | Not started. |
| 6 Marketing, Discounts, Broadcasts | | | Not started. |
| 7 Bot Studio | | | Not started. |
| 8 Settings and System health | | | Not started. |
| 9 Security | | | Not started. |
| 10 Reseller experience | | | Not started. |
| 11 Match the mockups | | | Not started. |
| 12 Final proof | | | Not started. |

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
