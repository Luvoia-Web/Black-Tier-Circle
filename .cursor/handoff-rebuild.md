# Black Tier Circle — dashboard rebuild handoff

Skills loaded before any CSS is written:

- ui-ux-pro-max (`/Users/kushchaudhari/luvoia/.cursor/skills/ui-ux-pro-max/SKILL.md`)
- ui-styling (`/Users/kushchaudhari/luvoia/.cursor/skills/ui-styling/SKILL.md`)
- design-system (`/Users/kushchaudhari/luvoia/.cursor/skills/design-system/SKILL.md`)
- design (`/Users/kushchaudhari/luvoia/.cursor/skills/design/SKILL.md`)

Repo: `/Users/kushchaudhari/Black Tier Circle/Black-Tier-Circle` on `main`.
This file did not exist. Phase 0 started from a clean handoff. Do not redo a phase marked DONE.
Do not push. Do not apply SQL. Do not edit migration 0022. Do not edit 0032 after Phase 1. No Co-authored-by lines.

## Phase status

| Phase | Status | Commit | Notes |
| --- | --- | --- | --- |
| 0 Evidence and route map | DONE | 35940da85c035ad6b4ffe25a7241a6bbf03818d6 | `.cursor/handoff-rebuild.md` only |
| 1 Migration 0032 | DONE | filled after commit | `supabase/migrations/0032_platform_complete.sql` written, not applied, not edited again |
| 2 Tokens and glass | | | rewrite `app/globals.css` |
| 3 Shell, nav, palette, drawer | | | |
| 4 Component kit and data hook | | | |
| 5 Today and Catalog | | | |
| 6 Orders | | | |
| 7 Money | | | |
| 8 People and support | | | |
| 9 Store | | | |
| 10 Growth | | | |
| 11 Hidden buyer screens | | | |
| 12 Security | | | |
| 13 Cleanup and audit | | | |

## Locked new routes

One set of pages for both roles. The session role decides which rows and which actions appear. Resellers do not get a second copy of the pages.

| Area | Route | Owner | Reseller |
| --- | --- | --- | --- |
| Today | `/today` | full triage | own store only |
| Catalog | `/catalog` | every supplier item and published product | own listings |
| Orders | `/orders` | every order | own tenant orders |
| Money | `/money` | balances, top-ups, debts, supplier balance, payouts, ledger | own wallet, top-ups, bills |
| People | `/people` | buyers and resellers, support inbox | own buyers and own threads |
| Store | `/store` | owner bot, text, buttons, card, open/closed, health | own bot, same editor |
| Growth | `/growth` | referrals, points, freebies, codes, events, broadcast | same, tenant scoped |
| Settings | `/settings` | account, payment methods, reseller policy | account, payment methods, API keys, webhooks |

Drawers update the URL and leave the list mounted:

- Catalog row: `/catalog?item=<supplierProductId or productId>`
- Order: `/orders?order=<orderId>`
- Person: `/people?person=<customerId or tenantId>`
- Wallet: `/money?wallet=<walletId>`
- Support thread: `/people?thread=<threadId>`

Pages that are not one of the eight are deliberately dropped in Phase 13 and redirect to `/today`: Intelligence, Assistant, and the notifications inbox page. The notification bell stays in the shell.

## Phase 0 — evidence

Counted 50 `page.tsx` files under `app/(dashboard)`. Line counts are the file itself, not its imported components.

### Owner pages (29)

| Route | Lines | What it does | APIs the page actually calls |
| --- | --- | --- | --- |
| `/owner` | 178 | Home. Reseller, order, and revenue stats, plus cron trigger cards. | `API_ROUTES.fulfillmentProcess`, `API_ROUTES.supplierReconcile`, `API_ROUTES.botsHealth` via cron cards. `LivePulse` fetches `/api/owner/orders?tab=all&limit=50`. |
| `/owner/assistant` | 13 | Full-page assistant. | `/api/assistant` via `components/assistant/assistant-chat.tsx`. |
| `/owner/bot-studio` | 7 | Renders `BotStudio` scope owner. | `API_ROUTES.ownerBotStudio`. Preview fetches `${API_ROUTES.products}?status=published&limit=24`. |
| `/owner/bots` | 134 | Store bot plus every connected reseller bot. | `API_ROUTES.adminBots`. |
| `/owner/fulfillment` | 105 | Fulfillment queue and manual complete. | `API_ROUTES.fulfillmentManualComplete` via `mark-fulfilled-button`. Server reads orders and fulfillment modules. |
| `/owner/growth` | 8 | Renders `GrowthPanel` on the owner growth API. | `API_ROUTES.ownerGrowth` plus `${base}/referrals`, `${base}/freebies`, `${base}/freebies/:id`, `${base}/points`, `${base}/reject`. |
| `/owner/intelligence` | 44 | Operations control tower. | `API_ROUTES.intelligencePlatform`. |
| `/owner/launch` | 124 | Launch checklist and live system checks. | `API_ROUTES.ownerLaunch`. |
| `/owner/notifications` | 5 | Renders the notifications inbox. | `/api/notifications`, `/api/notifications/read-all`, `/api/notifications/:id`, `/api/notifications/:id/read`. |
| `/owner/orders` | 50 | Order list with tabs. | `${API_ROUTES.ownerOrders}` via `owner-orders-board`. Modal uses `API_ROUTES.orderDetail`, `API_ROUTES.fulfillmentManualComplete`, `API_ROUTES.fulfillmentRetryDelivery`, `API_ROUTES.orderCancel`. |
| `/owner/orders/[orderId]` | 170 | Order detail: payment, fulfillment, supplier, delivery. | Server: `getOrder`, `getOrderEvents`, `getProduct`, `getCustomerById`, `getPaymentStatus`, `getOrderFulfillmentStatus`. Client: `orderCancel`, `orderNote`, `fulfillmentRetryDelivery`, `fulfillmentManualComplete`. |
| `/owner/payments` | 26 | Payment monitor plus top-up review. | `${API_ROUTES.adminPayments}?tab=`, `${API_ROUTES.paymentTopups}`, `API_ROUTES.paymentTopup`. Modal uses order detail, cancel, retry, manual complete. |
| `/owner/payments/[orderId]` | 121 | Payment claim evidence and override. | Server payment modules. Client: `API_ROUTES.adminPaymentOverride`. |
| `/owner/products` | 551 | Product list, filters, bulk publish, pause, archive, delete, set category. | `${API_ROUTES.products}`, `API_ROUTES.product`, `API_ROUTES.productStatus`, `API_ROUTES.productBulk`. |
| `/owner/products/new` | 93 | Create a draft product. | `API_ROUTES.products`. |
| `/owner/products/[productId]` | 391 | Product detail, files, status. | `API_ROUTES.product`, `productStatus`, `productUpload`, `productAsset`, `productDownload`. |
| `/owner/products/[productId]/edit` | 183 | Edit product. SKU is read-only. | `API_ROUTES.product`, `API_ROUTES.productTiers`. |
| `/owner/resellers` | 278 | Reseller table. Activate and suspend. | `${API_ROUTES.resellers}?limit=100`, `API_ROUTES.resellerStatus`. |
| `/owner/resellers/invite` | 103 | Create an invite link. | `API_ROUTES.invitationsCreate`. |
| `/owner/settings` | 394 | Store bot, payments, public info. | `API_ROUTES.ownerSettings`, `API_ROUTES.ownerLaunch`, `/api/owner/webhooks`, `/api/owner/platform`. |
| `/owner/supplier` | 167 | Connected suppliers, balance, sync. | `API_ROUTES.supplierBalance`, `API_ROUTES.supplierSync`. |
| `/owner/supplier/connect` | 123 | Test a supplier key, then save it. | `API_ROUTES.supplierConnect`. |
| `/owner/supplier/[supplierId]` | 505 | Paged supplier catalog, markup, publish. | `${API_ROUTES.supplierCatalog}`, `supplierPublish`, `supplierBulkPublish`, `supplierSync`. |
| `/owner/supplier/[supplierId]/settings` | 70 | Rename, rotate key, pause. | `API_ROUTES.supplierSettings`. |
| `/owner/supplier/orders` | 153 | Supplier order monitor and health. | `API_ROUTES.supplierHealth`, `API_ROUTES.supplierForceReconcile`. |
| `/owner/supplier/orders/[orderId]` | 131 | Supplier order detail and manual actions. | Server: `getOrder`, `getProduct`, `getOrderEvents`, fulfillment status. Client: `supplierManualComplete`, `supplierManualFail`, `supplierResubmit`. |
| `/owner/tokens` | 314 | Create, list, revoke credit tokens. | `API_ROUTES.adminTokens`, `API_ROUTES.adminTokenRevoke`, `${API_ROUTES.resellers}?limit=100`. |
| `/owner/wallets` | 277 | Reseller wallets. Manual credit and debit. | `API_ROUTES.adminWallets`, `adminWalletCredit`, `adminWalletDebit`. |
| `/owner/wallets/[walletId]` | 216 | One wallet, ledger, adjustments. | `API_ROUTES.adminWallet`, `adminWalletCredit`, `adminWalletDebit`. |

### Reseller pages (21)

| Route | Lines | What it does | APIs the page actually calls |
| --- | --- | --- | --- |
| `/reseller` | 234 | Home. Period stats, recent orders, wallet. | `${API_ROUTES.resellerOverview}?period=`, `/api/reseller/orders?period=month&pageSize=50`, `API_ROUTES.resellerSettings`. |
| `/reseller/account` | 353 | Profile, password, avatar, deletion. | `resellerProfile`, `resellerProfileAvatar`, `resellerProfilePassword`, `resellerProfileDeletion`. Studio also calls `resellerSettings`, `resellerOverview`, `botsStatus`. |
| `/reseller/assistant` | 13 | Full-page assistant. | `/api/assistant`. |
| `/reseller/bills` | 98 | Wholesale owed to the owner. | `API_ROUTES.resellerBills`. |
| `/reseller/bot` | 307 | Connect, disconnect, status of the store bot. | `botsStatus`, `botsConnect`, `botsDisconnect`. |
| `/reseller/bot-studio` | 7 | Renders `BotStudio` scope reseller. | `API_ROUTES.resellerBotStudio`. Preview fetches `API_ROUTES.resellerListings`. |
| `/reseller/customers` | 198 | Buyer directory and wallet actions. | `${API_ROUTES.resellerCustomers}`, `API_ROUTES.resellerCustomer`, `intelligenceCustomer`, `intelligenceOutcome`. |
| `/reseller/deliveries` | 192 | Manual delivery queue. | `${API_ROUTES.resellerDeliveries}`, `API_ROUTES.resellerDeliver`. |
| `/reseller/deposits` | 360 | Redeem a token, deposit table, ledger snippet. | `${API_ROUTES.resellerDeposits}`, `${API_ROUTES.walletLedger}?limit=12`, `resellerSettings`, `walletRedeem`. |
| `/reseller/growth` | 8 | Same growth panel, reseller base. | `API_ROUTES.resellerGrowth` plus the same subpaths as owner growth. |
| `/reseller/intelligence` | 17 | MemoryOS board for this tenant. | `resellerCustomers`, `intelligenceStore`, `intelligenceCustomer`, `intelligenceOutcome`, `intelligenceRecovery`. |
| `/reseller/notifications` | 5 | Same inbox component as the owner. | Same `/api/notifications` routes. |
| `/reseller/orders` | 252 | Search, status, period, paging, CSV. | `${API_ROUTES.resellerOrders}`. Modal uses `orderDetail` and the owner action routes when the modal is mounted. |
| `/reseller/orders/[orderId]` | 125 | Limited order detail. No money internals. | Server: `getOrder`, `getOrderEvents`, `getProduct`, `getCustomerById`. No client fetch. |
| `/reseller/payments` | 7 | Top-up review for this tenant. | `${API_ROUTES.paymentTopups}`, `API_ROUTES.paymentTopup` via `TopupAdmin`. |
| `/reseller/products` | 445 | Own catalog, markup, tiers. | `resellerCatalog`, `resellerSettings`, `resellerListing`, `resellerMarkup`, `resellerListingTiers`. |
| `/reseller/settings` | 536 | Bot, store, payments, Binance, support, terms, API keys. | `resellerSettings`, `botsStatus`, `botsConnect`, `botsDisconnect`, `resellerApiKeys`, `resellerApiKey`. |
| `/reseller/settings/api-keys` | 281 | Public v1 API keys. | `resellerApiKeys`, `resellerApiKey`. |
| `/reseller/settings/webhooks` | 233 | Webhook endpoints. | `resellerWebhooks`, `resellerWebhook`. |
| `/reseller/wallet` | 14 | Redirects to `/reseller/deposits`. | none |
| `/reseller/wallet/history` | 179 | Paged ledger and CSV. | `${API_ROUTES.walletStatement}`. |

### Pages whose data no existing route can serve

These stay blocked until a new read route exists. Everything else in the map reuses an API already listed above.

- Today, the unanswered-support row. No support tables and no support API. Migration 0032 adds the tables. A later phase adds the route.
- Today, one triage payload. The pieces exist (`ownerOrders`, `supplierBalance`, `resellers`, `products`) but nothing returns the six problem rows together. The page may compose those routes. Support still cannot.
- Catalog, one row per supplier item joined to its published product with a stage and real totals. `supplierCatalog` is per supplier. `products` is the published side only. Neither returns the joined stage list. Needs one new read route. Writes stay on `supplierPublish`, `supplierBulkPublish`, `productStatus`, `productBulk`, `supplierPrice`.
- People, an owner directory of buyers. `listCustomers` exists in `modules/bots` and is scoped to one bot. There is no owner dashboard route for it. Reseller buyers already have `resellerCustomers`.
- People, support inbox. No route. Needs 0032.
- Growth, discount codes and redemptions. No table and no route. Needs 0032.
- Growth, buyer broadcast with a recipient count and a delivery summary. `integrations/telegram/announce.ts` posts to a channel. It does not message buyers.
- Orders, replacement requests. No table and no route. Needs 0032.
- Settings, `platform_settings.reseller_policy` and store open/maintenance columns. The table exists in `0013_platform_settings.sql`. Those columns do not. Needs 0032. `maintenanceBlock` in `integrations/telegram/client.ts` already reads `storeStatus` from store context, which today comes from tenant config, not the platform row.

### Where dashboard paths are defined

`lib/navigation.ts` `ROUTES.owner` and `ROUTES.reseller` are the central map. They are not the only hardcoded paths.

Also hardcoded:

- `modules/notifications/index.ts` `hrefForNotification`: line 172 order detail, line 175 wallets, line 178 products, line 180 home. The task named 175 and 178. 172 and 180 hardcode paths too.
- `components/notifications/notification-bell.tsx` duplicates that function at lines 28, 31, 34, and 36, and line 100 hardcodes `/owner/notifications` and `/reseller/notifications`. Those two inbox paths are not in `ROUTES` at all.

No other `.ts` or `.tsx` file contains a `/owner` or `/reseller` string literal. Other links go through `ROUTES`. Middleware redirects with `NextResponse.redirect` but does not embed those dashboard paths as literals beyond role homes derived from `ROUTES`.

### btc-* classes in `app/globals.css`

Defined, and only these ten:

- `btc-btn-primary`
- `btc-btn-secondary`
- `btc-card`
- `btc-crown-float`
- `btc-crown-pulse`
- `btc-input`
- `btc-particle`
- `btc-pill`
- `btc-pill-active`
- `btc-select`

Used by the dashboard, auth invite, `app/error.tsx`, `app/not-found.tsx`, and shared components. Not used by `modules/bots`, `app/api/**`, or the landing page.

The landing page uses different names that are not defined in `globals.css`: `btc-landing`, `btc-landing-active` in `app/(landing)/landing.css` and `components/landing/LandingShell.tsx`, `btc-prod` in `components/landing/MemoryTop.tsx` and `lib/hindsight.ts`, `btc-theme` as a localStorage key in `app/layout.tsx`, `components/ui/ThemeToggle.tsx`, and `components/landing/useThemeDark.ts`.

### CSS custom properties in `app/globals.css`

59 names. Dark values live on `:root`. Light overrides live on `[data-theme="light"]`.

`--void`, `--surface-0`, `--surface-1`, `--surface-2`, `--surface-3`, `--border-ghost`, `--border-glow`, `--grad-primary`, `--grad-memory`, `--grad-commerce`, `--electric`, `--plasma`, `--memory`, `--commerce`, `--gold`, `--success`, `--danger`, `--bg-page`, `--bg-card`, `--bg-raised`, `--bg-hover`, `--bg-overlay`, `--bg-elevated`, `--accent`, `--accent-soft`, `--accent-glow`, `--green`, `--green-soft`, `--amber`, `--amber-soft`, `--red`, `--red-soft`, `--blue`, `--blue-soft`, `--text-0`, `--text-1`, `--text-2`, `--text-3`, `--border`, `--border-soft`, `--border-focus`, `--sidebar-w`, `--sidebar-bg`, `--r-sm`, `--r-md`, `--r-lg`, `--r-xl`, `--shadow-card`, `--shadow-glow`, `--background`, `--foreground`, `--muted-foreground`, `--auth-panel-from`, `--auth-panel-via`, `--auth-panel-to`, `--brand-glow`, `--crown-fill`, `--crown-stroke`, `--crown-glow`.

Bot code (`modules/bots`, `integrations/telegram`, `app/api/**`) does not read these variables.

The landing page does. `app/(landing)/landing.css` reads `--void`, `--surface-0`, `--surface-1`, `--surface-2`, `--border-ghost`, `--border-glow`, `--border-soft`, `--electric`, `--gold`, `--grad-memory`, `--grad-primary`, `--memory`, `--plasma`, `--success`, `--text-0`, `--text-1`, `--text-2`, `--text-3`. It also reads `--font-geist-mono`, `--font-geist-sans`, `--grad-text`, `--shadow`, and `--shadow-lg`, which are not defined in `globals.css`.

`app/api-docs/page.tsx` is a page, not an API route. It reads `--accent`, `--accent-glow`, `--accent-soft`, `--bg-card`, `--bg-page`, `--border`, `--text-1`, `--text-2`, `--text-3`.

`app/layout.tsx` toaster styles read `--surface-2`, `--bg-card`, `--border-soft`, `--memory`, `--text-0`, `--text-1`.

Phase 2 rewrites `globals.css` and does not keep these names. Landing and the toaster must be given their own values in that same commit or they lose their colours. The bot and the API routes do not need a change for the token rename.

### Tailwind

Tailwind CSS 3.4.17 is installed. `postcss.config.js` runs `tailwindcss` and `autoprefixer`. `app/globals.css` starts with `@tailwind base; @tailwind components; @tailwind utilities;` and is imported by `app/layout.tsx`.

`tailwind.config.ts` sets `content` to `./app`, `./components`, and `./pages`, `theme.extend` is empty, and the only plugin is `tailwindcss-animate`.

CSS variables are not registered as Tailwind colours. Components read them with arbitrary values such as `text-[var(--text-2)]`, `bg-[var(--bg-card)]`, and `border-[var(--border)]`. Theme switching is the `data-theme` attribute on `<html>`, set from `localStorage` key `btc-theme` by the inline script in `app/layout.tsx`.

## Old route to new route

Permanent redirects land in Phase 13. Until then both trees exist.

| Old route | New route | Fate |
| --- | --- | --- |
| `/owner` | `/today` | migrated |
| `/reseller` | `/today` | migrated |
| `/owner/products` | `/catalog` | migrated |
| `/owner/products/new` | `/catalog?create=1` | migrated |
| `/owner/products/[productId]` | `/catalog?item=[productId]` | migrated |
| `/owner/products/[productId]/edit` | `/catalog?item=[productId]` | migrated |
| `/owner/supplier` | `/catalog` | migrated |
| `/owner/supplier/connect` | `/catalog?connect=1` | migrated |
| `/owner/supplier/[supplierId]` | `/catalog?supplier=[supplierId]` | migrated |
| `/owner/supplier/[supplierId]/settings` | `/catalog?supplier=[supplierId]` | migrated |
| `/reseller/products` | `/catalog` | migrated |
| `/owner/orders` | `/orders` | migrated |
| `/owner/orders/[orderId]` | `/orders?order=[orderId]` | migrated |
| `/owner/fulfillment` | `/orders?attention=fulfillment` | migrated |
| `/owner/supplier/orders` | `/orders` | migrated |
| `/owner/supplier/orders/[orderId]` | `/orders?order=[orderId]` | migrated |
| `/reseller/orders` | `/orders` | migrated |
| `/reseller/orders/[orderId]` | `/orders?order=[orderId]` | migrated |
| `/reseller/deliveries` | `/orders?attention=delivery` | migrated |
| `/owner/payments` | `/money` | migrated |
| `/owner/payments/[orderId]` | `/orders?order=[orderId]` | migrated, payment is a track on the order |
| `/owner/wallets` | `/money` | migrated |
| `/owner/wallets/[walletId]` | `/money?wallet=[walletId]` | migrated |
| `/owner/tokens` | `/money?section=tokens` | migrated |
| `/reseller/deposits` | `/money` | migrated |
| `/reseller/wallet` | `/money` | migrated, already redirects to deposits |
| `/reseller/wallet/history` | `/money?section=ledger` | migrated |
| `/reseller/bills` | `/money?section=debts` | migrated |
| `/reseller/payments` | `/money?section=topups` | migrated |
| `/owner/resellers` | `/people?type=reseller` | migrated |
| `/owner/resellers/invite` | `/people?invite=1` | migrated |
| `/reseller/customers` | `/people?type=buyer` | migrated |
| `/owner/bots` | `/store` | migrated |
| `/owner/bot-studio` | `/store` | migrated |
| `/owner/launch` | `/store?section=health` | migrated |
| `/reseller/bot` | `/store` | migrated |
| `/reseller/bot-studio` | `/store` | migrated |
| `/owner/growth` | `/growth` | migrated |
| `/reseller/growth` | `/growth` | migrated |
| `/owner/settings` | `/settings` | migrated |
| `/reseller/settings` | `/settings` | migrated |
| `/reseller/account` | `/settings?section=account` | migrated |
| `/reseller/settings/api-keys` | `/settings?section=api-keys` | migrated |
| `/reseller/settings/webhooks` | `/settings?section=webhooks` | migrated |
| `/owner/intelligence` | `/today` | dropped, not one of the eight |
| `/reseller/intelligence` | `/today` | dropped |
| `/owner/assistant` | `/today` | dropped |
| `/reseller/assistant` | `/today` | dropped |
| `/owner/notifications` | `/today` | dropped as a page, bell stays in the shell |
| `/reseller/notifications` | `/today` | dropped as a page, bell stays in the shell |

50 old pages: 44 migrate, 6 are deliberately dropped. None are left unaccounted for.

## Phase 0 checks

Recorded against the working tree just before the commit. Unrelated dirty files were present and were not part of this commit: `components/landing/MemoryNav.tsx`, `components/ui/sidebar.tsx`, plus untracked handoff notes, `docs/codebase-audit.md`, and a stray `mainkushchaudhari@Kushals-MacBook-Air` file.

- type-check: `npx tsc --noEmit` exit 0
- lint: `npx next lint` exit 0. Two existing warnings, both `@next/next/no-img-element`, in `components/landing/MemoryNav.tsx:43` and `components/ui/sidebar.tsx:234`. Neither file is in this commit.
- test: `npx vitest run` exit 0. 39 files, 319 tests passed.
- build: `npx next build` exit 0.

Files in this commit: `.cursor/handoff-rebuild.md` only.

## Phase 1 — migration 0032

Wrote `supabase/migrations/0032_platform_complete.sql`. It has not been applied. It will not be edited in a later phase.

It adds:

- `platform_settings.store_status` (`open` or `maintenance`, default `open`), `maintenance_msg`, `reseller_policy` jsonb default `{}`, and seven fraud threshold columns with defaults: 20 orders per hour, 50 per day, 5 failed claims per hour, 30 support messages per hour, 10 referral claims per day, 3 orders for a new account, 24 hours counted as new.
- `support_threads` and `support_messages`. Message body is 1 to 2000 characters. Sender is `customer` or `owner`.
- `discount_codes` and `discount_redemptions`. Code is stored upper-case. Unique index is on `coalesce(tenant_id, the zero uuid)` plus `code`, so the owner store (null tenant) cannot have two of the same code. A plain `(tenant_id, code)` unique index would not do that, because SQL treats nulls as distinct. Redemptions are unique on code and order.
- `replacement_requests` with a partial unique index so an order has only one `pending` or `approved` request.
- `rate_limit_hits (bucket, window_start, count)` and `bump_rate_limit(text, timestamptz)`, which increments under the row lock from `insert ... on conflict do update`. Index on `window_start` is there for the cron sweep.
- `customers.blocked_at` and `customers.blocked_reason`. `is_blocked` is left in place.

Select-only RLS for owner (`tenant_id is null` and owner role) and reseller (their tenant) on the five new readable tables, following `0029_wallet_topups.sql`. `rate_limit_hits` has RLS and no policy. Authenticated gets `select` on the readable tables only. The bump function is executable by `service_role` only.

Checks, working tree, same unrelated dirty files as Phase 0 left out of the commit:

- type-check: `npx tsc --noEmit` exit 0
- lint: `npx next lint` exit 0. Same two pre-existing `@next/next/no-img-element` warnings in `MemoryNav.tsx` and `sidebar.tsx`.
- test: `npx vitest run` exit 0. 39 files, 319 tests passed.
- build: `npx next build` exit 0.

Files in this commit: `supabase/migrations/0032_platform_complete.sql` and `.cursor/handoff-rebuild.md`.
