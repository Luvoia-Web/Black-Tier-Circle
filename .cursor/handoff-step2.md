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
| 1 Migration 0033 | DONE | de4f4b4ecf6d92b5922a8446c05414cc66c7c543 | `0033_commerce.sql` written, not applied. Goal ring uses the stored goal. |
| 2 Orders | DONE | 7b09d18b8fccd743ed4a44d536269dd07499be3a | Orders screen, drawer, owner replace, buyer Replace removed. |
| 3 Products · Catalogue | DONE | 5b0c00bb7dfad64712f3d88bfa49496b9dfa364f | Catalogue, drawer, editor, reseller listing editor. |
| 4 Inventory and Pricing rules | DONE | 54a9b9d308267ad7fd3eb75212a58e365c0c3ea4 | Stock table and store markup preview. |
| 5 Suppliers | DONE | 273bb1aba5fb1c4c1d646c55789ba5ed292fa2ca | Connected, import, orders, health. |
| 6 Security | DONE | 811a2136e722def5572f57e375b76c337ea7b2c2 | Search filters, pinned supplier fetch, safe next. |
| 6B Review fixes | DONE | pending-hash | New replacement item, no sent retry, separate bulk prices, per-supplier health, apply default pricing. |
| 7 Match the mockups | pending | | |
| 8 Prove it | pending | | |

## Design reference

All six named files are present in `Black-Tier-Circle/.cursor/design-reference/` and are not committed: `BTC-1-overview@2x.png`, `BTC-2-products@2x.png`, `BTC-3-orders@2x.png`, `BTC-4-resellers@2x.png`, `BTC-5-bot-studio@2x.png`, `btc-mockups-source.mjs`.

### Token corrections against `btc-mockups-source.mjs`

| Token | Before | After |
| --- | --- | --- |
| `--c-base` / page | 12 7 14 | 11 7 9 (`#0b0709`) |
| `--c-rose` | 255 77 141 | 255 95 143 (`#ff5f8f`) |
| `--c-rose-deep` | 122 24 62 | 239 91 140 (`#ef5b8c`) |
| `--c-amber` | 245 176 66 | 242 178 62 (`#f2b23e`) |
| `--c-sky` | 91 157 255 | 126 166 239 (`#7ea6ef`) |
| `--c-mint` | 61 220 151 | 79 220 156 (`#4fdc9c`) |
| `--c-danger` | 255 77 99 | 255 90 95 (`#ff5a5f`) |
| `--c-violet` | missing | 169 139 255 (`#a98bff`) |
| `--c-ink` | 244 240 246 | 246 239 243 (`#f6eff3`) |
| `--c-ink-soft` | 196 184 198 | 161 155 159 (ink at 64% over the base) |
| `--c-ink-faint` | 140 126 144 | 110 104 107 (ink at 42% over the base) |
| `--radius-lg` / Tailwind `lg` | 22px | 20px |
| `--radius-xl` / Tailwind `xl` | 28px | 24px |
| Card blur | 18px | 22px |
| Card fill and shadow | flat card / `0 18px 40px` | gradient `38,22,30` to `20,12,18`, inset sheen plus `0 20px 50px` |
| Sidebar fill | two-stop rose | three-stop `178,40,92` / `118,24,62` / `58,14,34`, blur 28px, saturate 150% |
| Sidebar width | 272px | 256px |
| Glass shadow | `0 24px 60px` | inset white 14% plus `0 30px 70px` |
| Stroke | white at 10% | white at 8% (`--line`) |
| Mesh | three glows | the six radial gradients from the source. Light theme keeps the softer three. |
| Primary button | flat rose | `#ff8db0` to `#f0507f`, height 38px, radius 12px |

`--radius-sm` 10px and `--radius-md` 14px already matched. Outfit and JetBrains Mono already matched.

### Sidebar

Icons and labels now follow `NAV_OWNER`. Analytics is `ChartColumnBig`, Intelligence is `BrainCircuit`, Remy AI is `Sparkles`, Bots is `Bot`, Discounts is `TicketPercent`, Broadcasts is `RadioTower` and the label is Broadcasts, Bot Studio is `Palette`. Products is the only item with sub-items: Catalogue, Inventory (`?section=inventory`), Pricing rules (`?section=pricing`). Suppliers, Customers, Wallets, Payments and Marketing no longer expand. Sibling links that share a path are split with `section` so two items are not active at once. The liquid pill stays on the parent row. A sub-item uses the rose dot.

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
| Replacement requests | rebuild | Owner starts it. One open request. Approved, then replaced, with a new supplier item or a pasted item. | `POST /api/platform/replacements` | Orders drawer. Buyer bot has no Replace button. |

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

## Phase 2 — Orders

`/orders` now matches the Orders reference: four tiles (orders today, revenue today, needs attention, median delivery), chips with counts, a date range, an owner store filter (owner store, each reseller, API), and search by order id, buyer, or product. The table is the opaque table surface: mono id with relative time, product tile, buyer and store, the paid / supplier / delivered dots with a status pill, and the total. `?order=` opens the shell drawer. `attention=fulfillment` is the failed and stuck queue. `attention=delivery` is the manual delivery queue, and a reseller marks it delivered through the existing reseller delivery route.

The drawer shows status pills, product and supplier SKU, the timeline (including the supplier error when one exists), the buyer card, payment claim evidence, and the owner override (verify or fail, reason of at least 10 characters) through `adminPaymentOverride`. Owner actions reuse retry, refund, cancel, manual complete, and note. Replace is owner-only, on a delivered order. It writes `replacement_requests` as approved, moves delivery from `sent` to `retry_pending` (that transition was added so the existing `retryDelivery` can run; `sent` previously had no way back), calls `retryDelivery`, marks the row replaced, writes `audit_log` with the owner as `actor_id`, and posts into the buyer’s open support thread when one exists. `replacement_requests` has no actor column; the owner id is the audit actor and is also stored in `owner_note`. One open request per order. A failed retry rejects the row so another attempt is possible. The buyer bot no longer renders Replace, and the old `replace:` screen tells the buyer to use Support.

Bulk select retries failed rows (capped at 25, one result per row), cancels, and exports the filtered CSV.

New user text in an `.or()` string, for Phase 6: `modules/platform/orders.ts` product search, `title.ilike` and `sku.ilike` joined into the same `.or()` as the buyer search. The term still goes through `safe()`.

Checks:

- type-check: `./node_modules/.bin/tsc --noEmit` exit 0
- lint: `./node_modules/.bin/next lint` exit 0. Same existing `MemoryNav.tsx` image warning, not in this commit.
- test: `./node_modules/.bin/vitest run` exit 0. 45 files, 348 tests passed.
- build: `./node_modules/.bin/next build` exit 0. Next.js 14.2.21. Same existing image warning.

Files: `app/(platform)/orders/view.tsx`, `app/api/platform/orders/route.ts`, `app/api/orders/[orderId]/detail/route.ts`, `app/api/platform/replacements/route.ts`, `modules/platform/orders.ts`, `modules/platform/replacements.ts`, `modules/orders/state-machine.ts`, `lib/order-detail.ts`, `modules/store-config/keyboard.ts`, `integrations/telegram/client.ts`, `tests/unit/order-board.test.ts`, `.cursor/handoff-step2.md`.

## Phase 3 — Products · Catalogue

`/catalog` is the Products screen from `BTC-2-products@2x.png`. The header counts items, suppliers and products live in the bots. New product sets `?create=1`. Import from supplier sets `?section=suppliers` (the supplier screens are Phase 5). Tabs are Catalogue, Inventory (needs-attention count) and Pricing rules. Inventory and Pricing rules are Phase 4.

Search covers name, SKU and supplier name. The stage segment is Live, Not imported, Paused, Out of stock, Archived. Live is the default and still shows published items that are out of stock, so the stock pill can read Out of stock while Live is selected. Grid and list are remembered in `btc-catalog-layout`. Category chips use published counts. Cards use the supplier image when one exists, otherwise the pastel initial tile, plus category, delivery, supplier, price and a stock pill. The list adds margin and the markup rule. Selection shows the sticky bar: Set category, Pricing rule, Pause, Publish to bot, Delete. Delete states how many sold products will be archived and how many unsold items will be deleted.

Price, status and the wholesale/retail markup (percent or fixed) save on the card or the row. `?item=` opens the drawer with history and Edit. Edit and `?create=1` open the full editor: title, description, category, buyer category, delivery, duration, warranty, type label, images, files (upload, download, delete), tiers, stock and status. SKU is entered only on create. Reseller listings use the same catalogue, their retail price, store markup and their tiers.

Catalog search no longer builds a PostgREST `.or()` string. Each column is an `.ilike` parameter, the ids are collected, and the page query uses `.in()`. The other `.or()` sites from Phase 0 stay for Phase 6.

0033 was not edited. The user confirmed it is applied. Nothing was pushed.

Checks:

- type-check: `./node_modules/.bin/tsc --noEmit` exit 0
- lint: `./node_modules/.bin/next lint` exit 0. Same existing `MemoryNav.tsx` image warning, not in this commit.
- test: `./node_modules/.bin/vitest run` exit 0. 45 files, 348 tests passed.
- build: `./node_modules/.bin/next build` exit 0. Next.js 14.2.21. Same existing image warning.

Files: `app/(platform)/catalog/view.tsx`, `app/(platform)/catalog/editor.tsx`, `modules/platform/catalog.ts`, `modules/catalog/index.ts`, `modules/catalog/types.ts`, `app/api/products/[productId]/route.ts`, `lib/validations/catalog.ts`, `lib/hooks/use-action.ts`, `lib/supabase/query.ts`, `app/globals.css`, `tailwind.config.ts`, `components/platform/nav.ts`, `components/platform/sidebar.tsx`, `components/platform/ui/button.tsx`, `components/platform/ui/chrome.tsx`, `tests/fixtures/fake-supabase.ts`, `tests/unit/revenue-goal.test.ts`, `tests/unit/supplier-catalog-page.test.ts`, `.cursor/handoff-step2.md`.

## Phase 4 — Inventory and Pricing rules

Inventory is `?section=inventory`. Three tiles: stock value at cost (wholesale times units, unlimited rows excluded), units on hand, and items at or below the reorder point. The reorder point is 10. There is no per-product column, and this step does not add a migration. The table shows the product tile, a level bar against 10, units sold in the last 30 days, days of stock left, a stepper for manual products, the supplier's live stock for supplier products, and units left for file and inventory-unit products. `attention=1` keeps only the rows that need attention.

Pricing rules is `?section=pricing` and `GET/PUT /api/platform/pricing`. The form saves the store wholesale and retail defaults (percent or fixed) on `platform_settings`. The table lists products whose markup differs from that default. The preview prices a cost change from X to Y with `priceWithRule`. It says the new price would not be saved when wholesale or retail would land at or below cost, or when retail would miss `min_margin_percent`. Saving the default does not reprice existing products.

Checks:

- type-check: `./node_modules/.bin/tsc --noEmit` exit 0
- lint: `./node_modules/.bin/next lint` exit 0. Same existing `MemoryNav.tsx` image warning, not in this commit.
- test: `./node_modules/.bin/vitest run` exit 0. 45 files, 350 tests passed. Two of those are the new cost-change preview tests.
- build: `./node_modules/.bin/next build` exit 0. Next.js 14.2.21. Same existing image warning. New route: `/api/platform/pricing`.

Files: `modules/platform/inventory.ts`, `modules/platform/pricing.ts`, `modules/supplier/markup-rules.ts`, `app/api/platform/catalog/route.ts`, `app/api/platform/pricing/route.ts`, `app/(platform)/catalog/sections.tsx`, `app/(platform)/catalog/view.tsx`, `lib/validations/catalog.ts`, `tests/unit/pricing-rules.test.ts`, `.cursor/handoff-step2.md`.

## Resume

Phases 0 through 4 are done. Do not restart them. Do not edit `supabase/migrations/0033_commerce.sql`. The user confirmed 0033 is applied.

## Phase 5 — Suppliers

`?section=suppliers` opens the supplier workspace. `?panel=` is connected, import, orders, or health. `?connect=1` opens the test-then-save form. `?supplier=` opens that supplier's settings and selects it for import.

Connected reads `GET /api/supplier/balance`. A balance under 5 USDT is marked low while supplier orders are still open. Sync now posts `supplierSync`. Settings rename, rotate the key, and pause through `supplierSettings`.

Import reads `GET /api/supplier/products` with server paging and exact totals. Filters map to the existing `pushed`, `status`, and `stock` parameters: published, not published, rejected, paused, in stock, out of stock. Sort is name, cost, stock, or last synced. Each row shows cost, public price, stock or unlimited, sold count, delivery, duration, warranty, type label, last synced, and Published (link to `?item=`) or Not published. Bulk publish sends the four markup values as one percent for wholesale and retail, plus a category.

Supplier orders list the latest supplier fulfilment attempts. Complete, fail, resubmit, and force reconcile call the existing routes. Health shows each supplier's last sync and last error. Error rate and average fulfilment time are computed from the latest 200 supplier attempts. Those attempts do not store a supplier id, so the rate is shared. Only the latest balance is stored, so there is no balance series. The screen says so.

Checks:

- type-check: `./node_modules/.bin/tsc --noEmit` exit 0
- lint: `./node_modules/.bin/next lint` exit 0. Same existing `MemoryNav.tsx` image warning, not in this commit.
- test: `./node_modules/.bin/vitest run` exit 0. 45 files, 350 tests passed.
- build: `./node_modules/.bin/next build` exit 0. Next.js 14.2.21. Same existing image warning.

Files: `app/(platform)/catalog/suppliers.tsx`, `app/(platform)/catalog/view.tsx`, `app/api/platform/catalog/route.ts`, `modules/platform/supplier-desk.ts`, `.cursor/handoff-step2.md`.

## Resume

Phases 0 through 5 are done. Do not restart them. Do not edit `supabase/migrations/0033_commerce.sql`.

## Phase 6 — security

User text no longer reaches a PostgREST `.or()` string. `lib/row-ids.ts` runs one `.ilike` per column and the page query uses `.in()`. That covers catalog (Phase 3), orders, people, the command-palette search, the owner product list, and the supplier import list. Constant `.or()` filters in today, nav, and the order queue are unchanged.

`safeSupplierFetch` resolves the host, refuses any private address, and connects to the address it checked. A caller-supplied fetch receives that address with the original hostname as the Host header. The production path uses `https.request` with that address as the host and the original hostname as the TLS server name. A redirect is resolved again before the next connection. Under Vitest, the default fetch stays the mocked global fetch so existing supplier tests keep seeing the hostname.

The auth callback still verifies `token_hash` with `supabase.auth.verifyOtp`. A `next` parameter is accepted only through `safeCallbackPath` / `isSafeNextPath`. An off-site or protocol-relative next falls back to the role home.

Checks:

- type-check: `./node_modules/.bin/tsc --noEmit` exit 0
- lint: `./node_modules/.bin/next lint` exit 0. Same existing `MemoryNav.tsx` image warning, not in this commit.
- test: `./node_modules/.bin/vitest run` exit 0. 45 files, 353 tests passed. New cases: operator characters do not call `.or()`, a public-then-private name is refused, a normal https supplier is fetched at the checked address, an off-site next is refused.
- build: `./node_modules/.bin/next build` exit 0. Next.js 14.2.21. Same existing image warning.

Files: `lib/row-ids.ts`, `lib/safe-fetch.ts`, `lib/navigation.ts`, `app/auth/callback/route.ts`, `modules/platform/orders.ts`, `modules/platform/people.ts`, `modules/catalog/manage.ts`, `modules/supplier/index.ts`, `app/api/platform/search/route.ts`, `tests/unit/security-controls.test.ts`, `tests/unit/supplier-catalog-page.test.ts`, `.cursor/handoff-step2.md`.

## Phase 6B — review fixes

Replace no longer calls `retryDelivery`. On a delivered order the owner chooses one of two actions.

- New item from supplier. Shown only when the product has a supplier id and a supplier SKU. The placement goes through `fulfillViaSupplier` with idempotency key `{orderId}:replacement:{number}`. The number is the count of non-rejected replacement rows plus one. A failed attempt is marked rejected, so a retry keeps the same number and the same key. The supplier therefore cannot sell a second item for that attempt. The supplier balance is read first. A short balance, or a balance that cannot be read, refuses before `createOrder`. The message says the buyer was not charged. The new content is sent with `deliverReplacementItem`, which appends a fulfillment attempt and a delivery attempt and leaves the original delivery rows in place. Delivery status stays `sent`. The extra supplier cost is stored on `orders.metadata.replacement_supplier_cost_minor` and on the `audit_log` row (`after_val.supplierCostMinor`). There is no charge to the buyer.
- Send manually. The owner pastes the item. It is stored on the order metadata as `replacementContent`, sent through the store bot, and recorded the same way. A product with no supplier gets only this choice.

One open replacement per order remains. The row is inserted as `approved` and, after the new item is sent, marked `replaced`. The audit actor is the owner. The buyer's open support thread still gets a note. Approving an old pending request no longer re-sends the original delivery.

`sent` has no outgoing transition in `modules/orders/state-machine.ts`. `retryDelivery` and `POST /api/fulfillment/:orderId/retry-delivery` both refuse a delivered order.

Import catalog bulk publish sends wholesale kind, wholesale value, retail kind, and retail value. The catalogue pricing-rule form already sent those four. A bulk publish with no explicit rule uses the store's wholesale rule and retail rule separately, not one percent copied onto both. Cost 1 with wholesale fixed +1 and retail fixed +2 publishes at 2 and 3.

Supplier health joins `fulfillment_attempts` to `orders.product_id` to `products.supplier_id`. Each supplier gets its own error rate and average fulfilment time. The screen still says there is no balance history yet.

Pricing rules has "Apply to products on the default rule". It shows the count and a before-and-after preview, asks for confirmation, then reprices through `priceWithRule`. A price at or below cost, under `min_margin_percent`, or with retail under wholesale is paused and listed. Products with their own markup, including a stored `markup_percent`, are not changed. The action writes `audit_log`.

The reorder point stays 10, as `REORDER_POINT` in `modules/platform/inventory.ts`. Pricing attention uses that constant.

A search of every `.or(` call found only constant filters, in `modules/platform/orders.ts`, `modules/platform/today.ts`, and `app/api/platform/nav/route.ts`. No user text is interpolated into an `.or()` string. The stale note that Phase 6 still had that work left is removed.

### Needs 0034

Not built in this step. No new migration was written.

- `products.reorder_point` integer, null allowed. Null means the shared constant 10. Today every product uses `REORDER_POINT`.
- `supplier_balance_snapshots` (`supplier_id` uuid not null references `suppliers(id)`, `balance_usdt` numeric not null, `checked_at` timestamptz not null default now()). Health can only show the latest balance on `suppliers.balance_usdt`.

Checks:

- type-check: `./node_modules/.bin/tsc --noEmit` exit 0
- lint: `./node_modules/.bin/next lint` exit 0. Same existing `MemoryNav.tsx` image warning, not in this commit.
- test: `./node_modules/.bin/vitest run` exit 0. 45 files, 361 tests passed.
- build: `./node_modules/.bin/next build` exit 0. Next.js 14.2.21. Same existing image warning.

Files: `modules/platform/replacements.ts`, `modules/supplier/place.ts`, `modules/fulfillment/index.ts`, `modules/orders/state-machine.ts`, `app/api/fulfillment/[orderId]/retry-delivery/route.ts`, `app/api/platform/replacements/route.ts`, `app/api/orders/[orderId]/detail/route.ts`, `app/(platform)/orders/view.tsx`, `lib/order-detail.ts`, `app/(platform)/catalog/suppliers.tsx`, `modules/supplier/index.ts`, `modules/platform/supplier-desk.ts`, `modules/platform/pricing.ts`, `app/api/platform/pricing/route.ts`, `app/(platform)/catalog/sections.tsx`, `tests/unit/order-board.test.ts`, `tests/unit/supplier-publish.test.ts`, `tests/unit/pricing-rules.test.ts`, `tests/unit/fulfillment.test.ts`, `.cursor/feature-ledger.md`, `.cursor/handoff-step2.md`.

## Resume

Phases 0 through 6B are done. Do not restart them. Do not edit `supabase/migrations/0033_commerce.sql`.

Phase 7 is next: screenshot Orders and Products at 1440 dark, compare with `BTC-3-orders@2x.png` and `BTC-2-products@2x.png`, and fix visible differences until only the data differs. Phase 8 extends `scripts/e2e-harness.mjs` and ticks the ledger. Nothing has been pushed.

Nothing has been pushed. Next.js is 14.2.21. React is 18.3.1.
