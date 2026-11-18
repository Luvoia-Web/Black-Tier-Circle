# Black Tier Circle — dashboard rebuild, step 2

Orders, Products (Catalogue, Inventory, Pricing rules), and Suppliers.

## Skills

Loaded before UI. Project `.cursor/skills` (7):

- `brand` — loaded. Voice and colour stay with the mockups. A generated palette does not replace them.
- `banner-design` — loaded. Not used. This step is a product UI, not a banner.
- `design` — loaded. Token and UI work routes to `design-system` and `ui-styling`.
- `design-system` — loaded. Three-layer tokens and Tailwind theme keys. The mockup source wins when a token drifts.
- `slides` — loaded. Pitch-deck charts are not the product charts. Product charts stay in the Step 1 kit.
- `ui-styling` — loaded. Tailwind utilities, accessible menus, focus, dark mode. Pages use the Step 1 kit.
- `ui-ux-pro-max` — loaded. Step 1 already ran the design-system, glass, chart, and navigation searches. The five pasted screenshots win over those recommendations (near-black, rose, amber, sky, Outfit, JetBrains Mono). Searches are not re-run to invent a new palette.

`~/.cursor/skills` does not exist. Nothing loaded from there.

## Rules

Local commits only. Do not push. Do not apply SQL. Do not edit migration 0022. Migrations through 0032 stay as they are. This step writes `supabase/migrations/0033_commerce.sql`, printed in full, not applied. Code must work whether or not 0033 is applied, and show a clear "needs migration 0033" note wherever a feature depends on it. No Co-authored-by line. Next.js stays 14.2.21. React stays 18. Tests against `.env.local` are read-only. Do not commit `.cursor/e2e/` or `.cursor/design-reference/`.

## Phase status

| Phase | Status | Commit | Notes |
| --- | --- | --- | --- |
| 0 Evidence | DONE | cab55633a3c5834349f68d983dbae65ce7557865 | Handoff only. Checklist and security findings below. |
| 1 Migration 0033 | DONE | filled after this commit | `0033_commerce.sql` written, not applied. Goal ring uses the stored goal. |
| 2 Orders | pending | | |
| 3 Products · Catalogue | pending | | |
| 4 Inventory and Pricing rules | pending | | |
| 5 Suppliers | pending | | |
| 6 Security | pending | | |
| 7 Match the mockups | pending | | |
| 8 Prove it | pending | | |

## Design reference

Named files `BTC-1-overview@2x.png`, `BTC-2-products@2x.png`, `BTC-3-orders@2x.png`, `BTC-4-resellers@2x.png`, `BTC-5-bot-studio@2x.png`, and `btc-mockups-source.mjs`: **NOT FOUND** in `Black-Tier-Circle/.cursor/design-reference/` or the workspace `.cursor/design-reference/`.

Present, and treated as the screens that were studied in Step 1:

- `Black-Tier-Circle/.cursor/design-reference/Pasted 2026-11-18 at 6.22.49 PM.png`
- `Pasted 2026-11-18 at 6.22.54 PM.png`
- `Pasted 2026-11-18 at 6.23.00 PM.png`
- `Pasted 2026-11-18 at 6.23.06 PM.png`
- `Pasted 2026-11-18 at 6.23.11 PM.png`

These files are not committed. Token comparison against `btc-mockups-source.mjs` cannot run until that file exists. Step 1 tokens in `app/globals.css` and `tailwind.config.ts` stay the source until a drift can be measured against the missing source file.

## Phase 0 — evidence

### Ledger checklist for this step

Sources are the same as `.cursor/feature-ledger.md`: old pages at `77d75c6` and `fcc28f6^`, APIs still present. Nothing here is ticked restored. Phase 8 ticks each row.

#### Orders

| Feature | Old page | Action | API | Now |
| --- | --- | --- | --- | --- |
| Order list with status tabs | `/owner/orders` | Open a row. Cancel. Retry delivery. Mark fulfilled. | `GET /api/owner/orders`. Modal: `GET /api/orders/:id/detail`, `POST /api/orders/:id/cancel`, `POST /api/fulfillment/:id/retry-delivery`, `POST /api/fulfillment/:id/manual-complete` | `/orders` |
| Order detail: payment, fulfillment, supplier, delivery | `/owner/orders/[orderId]` | Cancel. Add a note. Retry. Mark fulfilled. | Same order and fulfillment routes, plus `POST /api/orders/:id/note` | `/orders?order=` |
| Fulfillment queue | `/owner/fulfillment` | Mark fulfilled. | `POST /api/fulfillment/:orderId/manual-complete` | Deep link `/orders?attention=fulfillment` |
| Payment claim evidence and override | `/owner/payments/[orderId]` | Override the payment decision. | `POST /api/admin/payments/:orderId/override` | Deep link `/orders?order=` |
| Manual delivery queue | `/reseller/deliveries` | Mark delivered. | `GET /api/reseller/deliveries`, `POST /api/reseller/deliveries/:orderId` | Deep link `/orders?attention=delivery` |
| Reseller order list | `/reseller/orders` | Search, status, period, paging, CSV export. Open a row. | `GET /api/reseller/orders` | `/orders` |
| Reseller order detail, no money internals | `/reseller/orders/[orderId]` | Read only. | Server read | `/orders?order=` |
| One order list, payment / supplier / delivery timeline, bulk retry, CSV | rebuild | Filter and export. | `GET /api/platform/orders` | `/orders` |
| Order drawer | rebuild | Open from the row. | `GET /api/orders/:id/detail` | `/orders?order=` |
| Refund to wallet | rebuild | Refund. | `POST /api/orders/:id/refund` | Orders drawer |
| Replacement requests | rebuild | Buyer asks. Owner approves or rejects. This step changes it: owner-initiated only, one open request, status approved, then the existing retry path. | `POST /api/platform/replacements` | Orders drawer. Buyer bot Replace button must go. |

#### Products · Catalogue

| Feature | Old page | Action | API | Now |
| --- | --- | --- | --- | --- |
| Product list | `/owner/products` | Filter. Bulk publish, pause, archive, delete, set category. | `GET /api/products`, `PATCH /api/products/:id`, `POST /api/products/:id/status`, `POST /api/products/bulk` | `/catalog` |
| Create a draft | `/owner/products/new` | Save draft. | `POST /api/products` | Deep link `/catalog?create=1` |
| Files and status | `/owner/products/[productId]` | Upload, download, delete a file. Change status. | `GET/PATCH /api/products/:id`, `POST /api/products/upload`, asset and download routes | `/catalog?item=` |
| Full editor. SKU read-only after creation | `/owner/products/[productId]/edit` | Save. Edit tiers. | `PATCH /api/products/:id`, `PUT /api/products/:id/tiers` | `/catalog?item=` |
| Reseller catalog, markup, tiers | `/reseller/products` | Edit a listing. Set markup. Edit tiers. | `GET /api/reseller/catalog`, `GET/PATCH /api/reseller/listings/:id`, `POST /api/reseller/listings/markup`, `PUT .../tiers`, `GET /api/reseller/settings` | `/catalog` |
| Joined catalog: one row per supplier item, stage, wholesale and retail markup | rebuild | Search and stage. | `GET /api/platform/catalog` | Products → Catalogue |
| Catalog detail drawer | rebuild | Open an item. | `GET /api/platform/catalog/detail` | `/catalog?item=` |

#### Products · Inventory and Pricing rules

| Feature | Old page | Action | API | Now |
| --- | --- | --- | --- | --- |
| Stock | ledger maps this to `/catalog?stock=` | Filter out of stock. | `GET /api/platform/catalog` | Products → Inventory |
| Markup and tiers | ledger maps this to `/catalog` | Edit wholesale and retail markup. | Pricing routes already used by the catalog and `PUT /api/products/:id/tiers` | Products → Pricing rules |

#### Suppliers

| Feature | Old page | Action | API | Now |
| --- | --- | --- | --- | --- |
| Connected suppliers and balance | `/owner/supplier` | Sync. | `GET /api/supplier/balance`, `POST /api/supplier/sync` | Deep link `/catalog` today. Phase 5 gives this its own screen. |
| Connect a supplier | `/owner/supplier/connect` | Test the key. Save it. | `POST /api/supplier/connect` | `/catalog?connect=1` |
| Paged supplier catalog | `/owner/supplier/[supplierId]` | Set markup. Publish one. Bulk publish. Sync. | `GET /api/supplier/products`, publish, bulk-publish, sync | `/catalog?supplier=` |
| Supplier settings | `/owner/supplier/[supplierId]/settings` | Rename. Rotate the key. Pause. | `PATCH /api/supplier/settings/:id` | `/catalog?supplier=` |
| Supplier order monitor | `/owner/supplier/orders` | Read health. Force reconcile. | `GET /api/supplier/health`, `POST /api/supplier/:orderId/force-reconcile` | `/orders` via the legacy redirect |
| One supplier order | `/owner/supplier/orders/[orderId]` | Manual complete, fail, resubmit. | `POST /api/supplier/:orderId/manual-complete`, `.../manual-fail`, `.../resubmit` | `/orders?order=` |
| Supplier health | ledger: `/suppliers/health` | Read health. | `GET /api/supplier/health` | `/suppliers/health` |

### User text inside a PostgREST `.or()` string

CONFIRMED. Each of these builds the `.or()` argument from request text. A strip of `%_,."'` (or only `%_,` in the two files outside `modules/platform`) still leaves a string the filter parser reads. Phase 6 replaces every one of these with a separate `.ilike` per column, then `.in()` on the collected ids.

Inside `modules/platform` and `app/api`:

- CONFIRMED `modules/platform/catalog.ts:182` — `supplierQuery`. `query.or(\`name.ilike."%${filters.search}%",supplier_sku.ilike."%${filters.search}%"\`)`. `filters.search` is `safeTerm` at line 87, which strips `%_,."'` and slices to 64.
- CONFIRMED `modules/platform/catalog.ts:202` — `productQuery`. `query.or(\`title.ilike."%${filters.search}%",sku.ilike."%${filters.search}%"\`)`. Same `safeTerm`.
- CONFIRMED `modules/platform/orders.ts:118` — customer search. `.or(\`username.ilike."%${filters.search}%",first_name.ilike."%${filters.search}%"\`)`. `filters.search` is `safe()` at line 69.
- CONFIRMED `modules/platform/orders.ts:124` — `query.or(parts.join(','))`. `parts` includes `external_order_ref.ilike."%${filters.search}%"` built from the same search string (line 120). The `customer_id.in.(...)` piece uses ids returned by the database, not the raw search text.
- CONFIRMED `modules/platform/people.ts:77` — `query.or(\`display_name.ilike."%${term}%"\`)`. `term` is `safeTerm` at line 70. People is a later step. The injection is in scope for Phase 6 because it is user text in `.or()`.
- CONFIRMED `modules/platform/people.ts:99` — `query.or(\`username.ilike."%${term}%",first_name.ilike."%${term}%"\`)`.
- CONFIRMED `app/api/platform/search/route.ts:68` — `productQuery.or(\`title.ilike."%${term}%",sku.ilike."%${term}%"\`)`. `term` is `termOf` at line 29, same strip.
- CONFIRMED `app/api/platform/search/route.ts:114` — customers, `username`, `first_name`, `telegram_user_id`.
- CONFIRMED `app/api/platform/search/route.ts:134` — resellers, `display_name`, `business_name`.

Same pattern, outside the two directories named in the brief. Listed so Phase 6 closes them too. Both only strip `%_,`, so a quote or a dot in the search still reaches the filter string:

- CONFIRMED `modules/supplier/index.ts:894` — `query.or(\`name.ilike.%${search}%,supplier_sku.ilike.%${search}%\`)`.
- CONFIRMED `modules/catalog/manage.ts:99` — `request.or(\`title.ilike.%${search}%,sku.ilike.%${search}%\`)`.

`.or()` calls that do **not** contain user text. Phase 6 leaves these alone:

- `modules/platform/today.ts:68` — `.or('fulfillment_status.eq.failed,payment_status.eq.failed')`. Constant.
- `app/api/platform/nav/route.ts:39` — the same constant.

### safe-fetch checks the address, then connects by hostname

CONFIRMED `lib/safe-fetch.ts`.

The address check resolves the host and rejects a blocked IP, then returns the original URL:

```144:161:lib/safe-fetch.ts
  const resolve = resolverFor(resolveHost);
  let addresses: readonly string[];
  if (isIP(hostname)) {
    addresses = [hostname];
  } else {
    try {
      addresses = await resolve(hostname);
    } catch {
      throw new UnsafeOutboundUrlError('Could not resolve the supplier host.');
    }
  }
  if (addresses.length === 0) {
    throw new UnsafeOutboundUrlError('Could not resolve the supplier host.');
  }
  if (addresses.some((address) => isBlockedIp(address))) {
    throw new UnsafeOutboundUrlError('That supplier address is not allowed. It points at a private or reserved network.');
  }
  return url;
```

The fetch then uses that URL string, which is the hostname, not the address that was checked:

```228:234:lib/safe-fetch.ts
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      await assertPublicHttpsUrl(current, options.resolveHost);
      const signals = [total.signal, connect.signal];
      if (init.signal) signals.push(init.signal);
      let response: Response;
      try {
        response = await fetchImpl(current, { ...init, redirect: 'manual', signal: mergeSignals(signals) });
```

A redirect is checked again at line 249 (`await assertPublicHttpsUrl(current, options.resolveHost)`), then the loop fetches by hostname again at line 234. Phase 6 connects to the address that was checked, with the original hostname as the TLS server name and the Host header, and re-checks on every redirect.

### parseOrderFilters has no attention field

CONFIRMED `modules/platform/orders.ts`. `Filters` (lines 33–44) is `page`, `pageSize`, `search`, `state`, `channel`, `store`, `product`, `customer`, `from`, `to`. `parseOrderFilters` (lines 64–78) never reads `attention`. `scoped` (lines 84–127) never filters on it. The deep links `attention=fulfillment` and `attention=delivery` therefore do nothing today.

### Deep links in `lib/legacy-redirects.json` that land in Orders, Catalog, or Suppliers

CONFIRMED. Every value below is in that file.

Orders:

- Line 7: `/owner/supplier/orders/:orderId` → `/orders?order=:orderId`
- Line 8: `/owner/supplier/orders` → `/orders`
- Line 12: `/owner/orders/:orderId` → `/orders?order=:orderId`
- Line 13: `/owner/orders` → `/orders`
- Line 14: `/owner/fulfillment` → `/orders?attention=fulfillment`
- Line 15: `/owner/payments/:orderId` → `/orders?order=:orderId`
- Line 31: `/reseller/orders/:orderId` → `/orders?order=:orderId`
- Line 32: `/reseller/orders` → `/orders`
- Line 33: `/reseller/deliveries` → `/orders?attention=delivery`

Catalog and supplier query params on `/catalog`:

- Line 2: `/owner/products/new` → `/catalog?create=1`
- Line 3: `/owner/products/:productId/edit` → `/catalog?item=:productId`
- Line 4: `/owner/products/:productId` → `/catalog?item=:productId`
- Line 5: `/owner/products` → `/catalog`
- Line 6: `/owner/supplier/connect` → `/catalog?connect=1`
- Line 9: `/owner/supplier/:supplierId/settings` → `/catalog?supplier=:supplierId`
- Line 10: `/owner/supplier/:supplierId` → `/catalog?supplier=:supplierId`
- Line 11: `/owner/supplier` → `/catalog`
- Line 42: `/reseller/products` → `/catalog`

`/owner/payments` (line 16) goes to `/money`, which is Step 3. It is not part of this step's order list. The per-order claim page does land on Orders.

### Auth callback

CONFIRMED `app/auth/callback/route.ts` accepts `token_hash` after Step 1.

- Line 34 reads `token_hash`. Line 35 reads `type`.
- Lines 37–38 require both `token_hash` and `type=magiclink` when there is no `code`.
- Lines 42–43 call `supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })`. The hash is not treated as a session by itself.
- Lines 45–47 refuse the request when `verifyOtp` returns an error or no session.

NOT FOUND: the callback does not read `next` and does not call `isSafeNextPath`. `isSafeNextPath` lives at `lib/navigation.ts:321` and is used by the login page and `modules/identity`, not by this route. Redirects are `${origin}` plus `ROUTES.login`, `ROUTES.onboarding`, or `dashboardHomeForRole` (lines 49–50 and 83–100). An off-site `next` cannot be followed today because the parameter is ignored. Phase 6 adds the check the brief asks for, and a test that an off-site `next` is refused.

### Goal ring

CONFIRMED `components/platform/sidebar.tsx`.

- Lines 70–72 read `window.localStorage.getItem('btc-revenue-goal')` and use it when it is a finite number above zero. Default is 1600 (line 66).
- Line 229 writes `window.localStorage.setItem('btc-revenue-goal', String(goal))` when the goal form is submitted.

Phase 1 stores the goal on `platform_settings.revenue_goal_minor` and `tenant_settings.revenue_goal_minor` and falls back to this key only while 0033 is unapplied.

## Phase 0 checks

Working tree. Unrelated dirty files were left out of the commit: `components/landing/MemoryNav.tsx`, other handoff notes, `docs/codebase-audit.md`, `.cursor/design-reference/`.

- type-check: `./node_modules/.bin/tsc --noEmit` exit 0
- lint: `./node_modules/.bin/next lint` exit 0. One existing warning, `@next/next/no-img-element` in `components/landing/MemoryNav.tsx:43`. That file is not in this commit.
- test: `./node_modules/.bin/vitest run` exit 0. 43 files, 336 tests passed.
- build: `./node_modules/.bin/next build` exit 0. Next.js 14.2.21. The build lint printed the same existing `MemoryNav.tsx` warning.

Files: `.cursor/handoff-step2.md`.

## Phase 1 — migration 0033 and the goal ring

`supabase/migrations/0033_commerce.sql` is written and was not applied. It is not edited after this phase.

Columns:

- `platform_settings.revenue_goal_minor` bigint, nullable, check null or `>= 0`. Owner store.
- `tenant_settings.revenue_goal_minor` bigint, nullable, check null or `>= 0`. One row per reseller store.

No new RLS policies. The migration adds columns and indexes only. Those tables already have RLS. Dashboard routes use the service role and scope the tenant in application code. The reason is in the SQL comment at the bottom of the file.

Indexes, each tied to a query this step runs. Existing indexes that already cover a query were left alone (`idx_orders_tenant_created`, `idx_orders_created_at`, `idx_orders_channel_status`, `idx_orders_manual_pending`, `idx_orders_product_verified`, `idx_supplier_products_supplier`, `idx_order_events_order`).

| Index | Query | Why it helps |
| --- | --- | --- |
| `idx_orders_customer_id` | `orders where customer_id = $1` and `customer_id in (...)` | No earlier index leads with `customer_id`. Buyer card and name search both filter orders by customer. |
| `idx_orders_verified_created` | verified orders with `created_at >= start of day` | Owner revenue today has no tenant filter. The old created_at index includes unpaid rows. |
| `idx_orders_tenant_verified_created` | `tenant_id = $store and payment_status = verified and created_at >= start` | Reseller revenue today. The old tenant+created index includes every payment status. |
| `idx_orders_fulfillment_open` | fulfillment in queued, processing, manual_pending, supplier_pending, outcome_unknown, failed, ordered by `created_at` | Fulfilling, Failed, and `attention=fulfillment`. Older partials cover only queued and manual_pending. |
| `idx_orders_delivery_active` | delivery in sent, review_required, retry_pending, unreachable, ordered by `created_at` | Delivered, the manual queue, and failed delivery. The old retry index has no `created_at`. |
| `idx_orders_channel_created` | `channel = 'api' order by created_at` | The API store filter. The old channel index does not include `created_at`. |
| `idx_orders_product_created` | `product_id in (...) order by created_at` | Search by product, including unpaid orders. The verified product index cannot serve that. |
| `idx_orders_product_sold_recent` | verified orders for one product since 30 days ago | Inventory velocity. The old verified product index has no `created_at`. |
| `idx_order_events_delivery_sent` | delivery events with `to_status = sent` since the start of the day | Median delivery time. The old event index leads with `order_id`. |
| `idx_replacement_requests_order` | replacement rows for one order, all statuses | The open-request unique index hides replaced and rejected rows. |
| `idx_products_status_category_all` | `products where status = $stage` | Category chips. The old category index is only published products. |
| `idx_products_tracked_stock` | tracked, non-archived products ordered by `stock_count` | Inventory needs-attention. No earlier index includes `stock_count`. |
| `idx_products_own_status` | `supplier_id is null and status = $stage order by title` | Own catalog. The supplier index excludes null supplier ids. |
| `idx_product_assets_product` | assets for one product ordered by `created_at` | The editor file list. `product_id` had no index. |
| `idx_supplier_products_supplier_name` | one supplier ordered by name, paged | Import catalog. The old supplier indexes do not order by name. |
| `idx_supplier_products_supplier_stock` | one supplier, `in_stock = $2`, ordered by `last_synced_at` | Stock filter and last-synced sort. |
| `idx_supplier_products_unpublished` | `supplier_id = $1 and product_id is null order by name` | Not published. The unique sku index does not identify those rows. |
| `idx_fulfillment_supplier_started` | `fulfillment_attempts where method = 'supplier' order by started_at` | Supplier order monitor. The old attempt index leads with `order_id`. |

The goal ring now calls `GET /api/platform/goal` and `PUT /api/platform/goal`. The owner reads and writes `platform_settings`. A reseller reads and writes only `tenant_settings` for the tenant on the session. A missing column (`42703`) returns `needsMigration: true`. The ring then uses `btc-revenue-goal` in localStorage and shows "needs migration 0033". When the column exists, localStorage is not read or written. A null stored goal still displays 1600 until someone saves a number. Zero is allowed.

Checks:

- type-check: `./node_modules/.bin/tsc --noEmit` exit 0
- lint: `./node_modules/.bin/next lint` exit 0. Same existing `no-img-element` warning in `components/landing/MemoryNav.tsx:43`. That file is not in this commit.
- test: `./node_modules/.bin/vitest run` exit 0. 44 files, 342 tests passed. Six of those are the new revenue-goal tests.
- build: `./node_modules/.bin/next build` exit 0. Next.js 14.2.21. The build lint printed the same existing image warning. New route: `/api/platform/goal`.

0033 was not applied. Nothing was pushed.

Files: `supabase/migrations/0033_commerce.sql`, `modules/platform/goal.ts`, `app/api/platform/goal/route.ts`, `components/platform/sidebar.tsx`, `tests/unit/revenue-goal.test.ts`, `.cursor/handoff-step2.md`.
