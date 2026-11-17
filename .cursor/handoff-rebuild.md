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
| 1 Migration 0032 | DONE | 295bf98d877283180b1976f897f8628b2d6a60e0 | `supabase/migrations/0032_platform_complete.sql` written, not applied, not edited again |
| 2 Tokens and glass | DONE | 490800161f75c7fe85a8186d5e048c538237a2fe | `app/globals.css` rewritten. Old rules moved to `app/legacy-dashboard.css` so current pages still render until Phase 13. |
| 3 Shell, nav, palette, drawer | DONE | 3c452b3f348cb8ef7c5af51542337a02cb341e42 | New routes `/today` through `/settings`. Old `/owner` and `/reseller` pages stay. Owner customer search and the mobile sheet landed in the Phase 4 commit. |
| 4 Component kit and data hook | DONE | 7bc853a4d6c9f8fc92320c400ca564c34335203f | Shared controls, table, overlays, and `useData`. |
| 5 Today and Catalog | DONE | e2985cc6d856e07653dd7f6430bd2ab1fa68a287 | Triage list and the joined catalog. Signed-in screenshots were blocked by login. |
| 6 Orders | DONE | 7ae9776cb4eca2625f456dbd320bfc164452f627 | One list, one timeline, bulk retry, CSV. |
| 7 Money | DONE | a9623dece988d4c974fb5ce2c0d6d3a42bad4fc3 | Balances, the existing top-up review, ledger, supplier warning. |
| 8 People and support | DONE | 5a7197d7b3ec65b696a7c974ba791d8430ae1665 | Directory, block, support threads, reseller approval and invites. |
| 9 Store | DONE | 60698a572884baa82471db2882b805fb4cd9e4d0 | Editor, live card preview, open or maintenance, bot reconnect. |
| 10 Growth | DONE | 18c4502363be1214b88bb2afe01f8a79a443beb4 | Codes, announcements, and broadcasts. |
| 11 Hidden buyer screens | DONE | 94db5cad9632c77157f1f0c2bcb1c304c2c4a864 | History, redeem, discount, events, and replacement. |
| 12 Security | DONE | 816e82aa33e82bf56b20f625a3a190c2f6fe58ca | Supplier fetch guard, shared rate limit, fraud refusals, reseller policy. |
| 13 Cleanup and audit | DONE | filled after commit | Old dashboard routes redirect. Dead pages removed. Audit written. |

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

## Phase 2 — tokens and glass

`app/globals.css` is rewritten. It does not contain the old token names or the `btc-*` classes.

Core colours on `:root`: `--base #0B0609`, `--crimson #E0304F`, `--crimson-deep #7A0B22`, `--ember #FF8A5B`, `--mint #3DDC97`, `--ice #E8EAF2`. Surfaces, borders, and text are `color-mix` of those. `--fault #8F1528` is the error red and is not crimson. Success is `--ok` from mint. Warning is `--warn` from ember.

Four layers: `--page`, `--chrome` (glass), `--plane` at 95 percent of `--base`, `--raised`. `.glass-chrome` is the only glass recipe: translucent fill, 18px blur, a top edge lighter than the bottom, an inset top sheen. It falls back to `--chrome-solid` when `backdrop-filter` is unsupported or `prefers-reduced-transparency` is set.

Danger rule is the comment at the top of the file. Tinted crimson is brand. A solid crimson fill is destructive. Text on that fill is `--on-crimson #1A060A`, which stays dark in both themes so the label clears WCAG AA on `#E0304F`.

Type: Instrument Sans on `body` via `next/font` variable `--font-instrument`. JetBrains Mono via `--font-jetbrains`. `.font-num` sets the mono face and `tabular-nums`. Tailwind `font-mono` and `font-sans` point at the same variables in `tailwind.config.ts`. Colour utilities (`bg-page`, `text-ink`, `text-crimson`, and the rest) read the variables. Dark is `:root`. Light is `[data-theme="light"]` with the same names and a lighter glass recipe. `prefers-reduced-motion: reduce` zeros animation, transition, and smooth scroll.

The design-system search recommended a navy and green Swiss dashboard with Fira Sans. It was not used. The palette and type in the task win. Density and the reduced-motion rule were kept.

`app/legacy-dashboard.css` is the previous stylesheet, imported first from the root layout, so the current pages, the landing scope, and the auth screens keep their classes until Phase 13 deletes that file with the old pages. The landing page already redefines its colours on `.btc-landing`, so it does not read the new tokens.

Checks:

- type-check: `npx tsc --noEmit` exit 0
- lint: `npx next lint` exit 0. Same two pre-existing `no-img-element` warnings.
- test: `npx vitest run` exit 0. 39 files, 319 tests passed.
- build: first `npx next build` exit 1 because the legacy file used `@layer` without a Tailwind directive. The directives were put back. Second `npx next build` exit 0.

Files in this commit: `app/globals.css`, `app/legacy-dashboard.css`, `app/layout.tsx`, `tailwind.config.ts`, `.cursor/handoff-rebuild.md`.

## Phase 3 — shell

The eight areas are real routes: `/today`, `/catalog`, `/orders`, `/money`, `/people`, `/store`, `/growth`, `/settings`. They use `app/(platform)/layout.tsx` and `components/platform/shell.tsx`. The old `/owner` and `/reseller` pages still use the old shell.

- Fixed mesh behind the page. A route change moves the three crimson gradients once, over 1.6s. `prefers-reduced-motion` drops that transition.
- Glass rail and glass top bar. The content plane is solid `--plane`. The rail collapses to icons and becomes a sheet under `md`.
- Command palette on Cmd+K and Ctrl+K. It jumps to an area, searches products, orders, and reseller customers, and can sync suppliers or publish the Catalog selection. Arrow keys, Enter, and Escape work.
- Detail drawer opens from `?order=`, `?item=`, `?person=`, `?wallet=`, or `?thread=`. Escape clears the param, focus is trapped, and focus returns to the opener. The list route stays mounted.
- Pointer sheen is on the rail only, and it is off when reduced motion is set.
- Logged-out visits to these routes redirect to login. `isSafeNextPath` accepts them.

The area pages are headings only. Today, Catalog, Orders, Money, People, Store, Growth, and Settings get their real screens in Phases 5 to 10.

Checks:

- type-check: `npx tsc --noEmit` exit 0
- lint: `npx next lint` exit 0. Same two pre-existing `no-img-element` warnings.
- test: `npx vitest run` exit 0. 39 files, 319 tests passed.
- build: `npx next build` exit 0. The eight new routes are in the route table.

Files in this commit: `app/globals.css`, `app/(platform)/**`, `components/platform/**`, `lib/navigation.ts`, `middleware.ts`, `.cursor/handoff-rebuild.md`.

## Phase 4 — component kit and data hook

Shared controls live in `components/platform/ui`. Pages import them from that folder. Copy is sentence case. A destructive button is the only solid crimson fill. Primary is an ice fill with base text. Every control has a visible focus ring from the global `:focus-visible` rule, a disabled state, and a loading label of “Working…” where an action can be in flight.

- Button: primary, secondary, ghost, destructive.
- Fields: text, textarea, select, checkbox, radio, switch. Each text control takes a label, an optional hint, and an inline error.
- Card, stat tile, badge, status pill. Pills use mint, ember, and fault. They do not use crimson for status.
- Table: sticky header, mono right-aligned numerals, row selection, sortable headers, sticky bulk bar. Loading, error, and empty are built in. Glass is not behind the table.
- Filter bar wraps. Pagination shows page, total, and page size.
- Modal, overlay drawer, popover, and tooltip sit on `--raised` and close on Escape. Modal traps focus and returns it.
- Skeleton, ErrorState with retry, EmptyState with the next action.
- `useData` in `lib/hooks/use-data.ts` returns data, loading, error, and refetch. It aborts on unmount. A failed response sets the error and clears loading. `parseData` is covered by `tests/unit/parse-data.test.ts`.
- `notify` sends a toast through the existing Sonner toaster, which already uses the raised surface.

This commit also finishes two gaps in the Phase 3 shell. The rail is `fixed` on a phone and `sticky` from `md` up, so it is a real sheet. `/api/platform/search` searches products, orders, and customers for the owner and only the reseller’s own listings, orders, and buyers. The palette uses that route. The notification bell is in the top bar.

Checks:

- type-check: `npx tsc --noEmit` exit 0
- lint: `npx next lint` exit 0. Same two pre-existing `no-img-element` warnings in `MemoryNav.tsx` and `sidebar.tsx`. Neither file is in this commit.
- test: `npx vitest run` exit 0. 40 files, 322 tests passed.
- build: `npx next build` exit 0.

Files in this commit: `components/platform/ui/**`, `components/platform/areas.ts`, `components/platform/command-palette.tsx`, `components/platform/rail.tsx`, `components/platform/top-bar.tsx`, `app/globals.css`, `app/api/platform/search/route.ts`, `lib/hooks/parse-data.ts`, `lib/hooks/use-data.ts`, `tests/unit/parse-data.test.ts`, `.cursor/handoff-rebuild.md`.

## Phase 5 — Today and Catalog

Today loads `/api/platform/today` through `useData`. The list is failed orders, fulfillment that has sat past the manual reminder, supplier items that are out of stock, suppliers under 20 USDT, resellers waiting for approval, and unread support. Each row has the action that fixes it: retry delivery, approve the reseller, or open the record. When the support tables are missing, the page says migration 0032 is required and the other rows still load. When nothing is wrong, the page says so and shows today’s order count, verified revenue, and new buyers.

Catalog loads `/api/platform/catalog` through `useData`. The owner list is supplier items plus products that have no supplier row, paged with a real total. Filters for supplier, stage, stock, category, search, and sort are in the URL. A reseller sees only their listings. Each row shows and edits the wholesale and retail rule. A row that is not imported yet publishes with that rule. Bulk publish, pause, delete, and set category call the existing product and supplier routes. Opening a row sets `?item=` and the shell drawer shows the item and its recent orders. The list stays mounted.

What looks wrong: I could not screenshot the signed-in pages in either theme. `/today` redirects to `/login?next=/today` without a session, and there is no local account in this run. The first dev server also 404’d `/today` because the file watcher hit EMFILE; `next build` and `next start` both serve the route. From the markup, catalog rows are too tall: every pricing control is 44px, so a phone shows a few rows and the table scroller, not a dense list. The live and out-of-stock filters can return a short page because stock is classified after the database page is read, so the total can be higher than the rows on that page.

Checks:

- type-check: `npx tsc --noEmit` exit 0
- lint: `npx next lint` exit 0. Same two pre-existing `no-img-element` warnings.
- test: `npx vitest run` exit 0. 40 files, 322 tests passed.
- build: `npx next build` exit 0. `/today` and `/catalog` are in the route table.

Files in this commit: `app/(platform)/today/page.tsx`, `app/(platform)/catalog/page.tsx`, `app/(platform)/catalog/view.tsx`, `app/api/platform/today/route.ts`, `app/api/platform/catalog/route.ts`, `app/api/platform/catalog/detail/route.ts`, `modules/platform/today.ts`, `modules/platform/catalog.ts`, `lib/hooks/use-action.ts`, `components/platform/shell.tsx`, `components/platform/drawer.tsx`, `components/platform/drawer-body.tsx`, `.cursor/handoff-rebuild.md`.

## Phase 6 — Orders

`/orders` loads `/api/platform/orders` through `useData`. The query filters state, channel, store, product, customer, and a date range, and searches by order id or customer name. Paging uses a real count. Each row shows payment, fulfillment, and delivery. Opening a row sets `?order=` and the drawer shows those three steps, the supplier reference, the last attempt, the failure when there is one, and the delivered content. Retry, Mark fulfilled, Refund, and Cancel call the existing fulfillment, wallet-refund, and cancel routes. Refund is `refundWalletPaymentOnce`. It does not add a new money calculation. Bulk retry runs the existing retry route for up to 25 selected failed orders and lists each result. Export CSV downloads the filtered set, capped at 2000 rows.

Checks:

- type-check: `npx tsc --noEmit` exit 0
- lint: `npx next lint` exit 0. Same two pre-existing `no-img-element` warnings.
- test: `npx vitest run` exit 0. 40 files, 322 tests passed.
- build: `npx next build` exit 0. `/orders` and `/api/orders/[orderId]/refund` are in the route table.

Files in this commit: `app/(platform)/orders/page.tsx`, `app/(platform)/orders/view.tsx`, `app/api/platform/orders/route.ts`, `app/api/orders/[orderId]/refund/route.ts`, `modules/platform/orders.ts`, `lib/navigation.ts`, `.cursor/handoff-rebuild.md`.

## Phase 7 — Money

`/money` loads `/api/platform/money` through `useData`. The owner sees verified owner-store revenue, the sum of buyer credit, what resellers still owe on unfunded wholesale, and each reseller wallet. A reseller sees their own wallet, their own buyers' credit, and their own unfunded wholesale. Opening a wallet sets `?wallet=` and the drawer shows available and reserved. Supplier balances warn when one supplier's balance is below the pending supplier-order wholesale. The ledger is the latest 50 `ledger_transactions` rows, filtered by entry type, with a CSV of that set. Top-up review is the existing `TopupAdmin` panel, so approve, reject, and the audit log stay on the existing payment route.

The ledger is not a full reconciliation of every inflow. Customer credit is summed from at most 1000 buyers. The supplier warning compares each balance with the whole pending total, so more than one supplier can all show the warning.

Checks:

- type-check: `npx tsc --noEmit` exit 0
- lint: `npx next lint` exit 0. Same two pre-existing `no-img-element` warnings.
- test: `npx vitest run` exit 0. 40 files, 322 tests passed.
- build: `npx next build` exit 0. `/money` and `/api/platform/money` are in the route table.

Files in this commit: `app/(platform)/money/page.tsx`, `app/(platform)/money/view.tsx`, `app/api/platform/money/route.ts`, `modules/platform/money.ts`, `.cursor/handoff-rebuild.md`.

## Phase 8 — People and support

`/people` loads `/api/platform/people` through `useData`. Buyers and resellers are one directory with a type filter, search, and a real page count. Opening a row sets `?person=`. The drawer shows orders, balance, referrals, and support threads. Block and unblock call `blockCustomer` and `setCustomerBlocked`. Those writes set `blocked_at` and `blocked_reason` when migration 0032 is applied, and fall back to `is_blocked` when the columns are missing. The bot already refuses `is_blocked` customers before any action. Support starts when the buyer taps Support. The next message is stored, rate limited to six a minute, capped at 2000 characters, and the store owner is notified. The inbox lists unread threads first. A reply is stored, then sent through that store's bot. A failed send is written to `audit_log` and can be retried. A reseller only sees their own buyers and threads. Reseller approval uses the existing status route. Invites use the existing invitation route.

The inbox loads one preview query per thread, capped at 50. Buyer order counts on a page come from at most 1000 matching orders. The rate limit is still the in-memory limiter until Phase 12.

Checks:

- type-check: `npx tsc --noEmit` exit 0
- lint: `npx next lint` exit 0. Same two pre-existing `no-img-element` warnings.
- test: `npx vitest run` exit 0. 40 files, 322 tests passed.
- build: `npx next build` exit 0. `/people`, `/api/platform/people`, and `/api/platform/support` are in the route table.

Files in this commit: `app/(platform)/people/page.tsx`, `app/(platform)/people/view.tsx`, `app/api/platform/people/route.ts`, `app/api/platform/people/detail/route.ts`, `app/api/platform/support/route.ts`, `modules/platform/people.ts`, `modules/platform/support.ts`, `modules/bots/index.ts`, `integrations/telegram/client.ts`, `.cursor/handoff-rebuild.md`.

## Phase 9 — Store

`/store` loads `/api/platform/store` through `useData`. The editor saves through the existing store config writer, so the product card, welcome text, and buttons go through the existing schema and sanitizer. Sections are collapsed. The save bar stays on screen and says when there are unsaved changes. Welcome, the support intro, and the product card each reset to the stored default. The preview calls `productCardText` and `renderTemplate`, the same builders the bot uses, on a real published product. When the store has no published products, the preview says it is showing a sample. The owner open or maintenance switch writes `platform_settings.store_status`. If those columns are missing, the page says migration 0032 is required and the bot stays open. `maintenanceBlock` now reads that platform status when the update has no tenant. A reseller switch still writes the tenant setting. Connect uses the existing connect routes. Reconnect registers the stored webhook again and does not return the token. The bot context cache can keep the old open or closed state for up to 30 seconds.

Checks:

- type-check: `npx tsc --noEmit` exit 0
- lint: `npx next lint` exit 0. Same two pre-existing `no-img-element` warnings.
- test: `npx vitest run` exit 0. 40 files, 322 tests passed.
- build: `npx next build` exit 0. `/store` and `/api/platform/store` are in the route table.

Files in this commit: `app/(platform)/store/page.tsx`, `app/(platform)/store/view.tsx`, `app/api/platform/store/route.ts`, `modules/platform/store.ts`, `modules/platform/index.ts`, `modules/bots/index.ts`, `integrations/telegram/bot-context.ts`, `lib/hooks/use-action.ts`, `.cursor/handoff-rebuild.md`.

## Phase 10 — Growth

Referrals, points, and freebies stay on the existing `GrowthPanel` and its routes. Discount codes are created and turned on or off from `/growth`. At checkout, a buyer message that matches a code is applied after the bulk tier. The same order and code redeem once. An expired, exhausted, already-used, or below-minimum code is refused with a clear message. The price is clamped to the cost floor and is refused when the floor is unknown or the code cannot lower the price. Announcements are title, body, optional link, and an on-off switch stored in `store_config`. A broadcast shows the recipient count, asks for a second confirmation, skips blocked buyers, allows one send a minute, and reports how many were sent and how many failed. The send list is capped at 200 buyers.

The used-count update is a compare-and-set after the redemption row is inserted. Two checkouts at the same moment can still both pass the count check. The buyer button for discounts is still a later phase. The code is accepted as a checkout message.

Checks:

- type-check: `npx tsc --noEmit` exit 0
- lint: `npx next lint` exit 0. Same two pre-existing `no-img-element` warnings.
- test: `npx vitest run` exit 0. 41 files, 324 tests passed.
- build: `npx next build` exit 0. `/growth` and `/api/platform/growth` are in the route table.

Files in this commit: `app/(platform)/growth/page.tsx`, `app/(platform)/growth/view.tsx`, `app/api/platform/growth/route.ts`, `modules/platform/growth.ts`, `modules/pricing/discount.ts`, `modules/store-config/schema.ts`, `modules/store-config/types.ts`, `modules/store-config/defaults.ts`, `modules/store-config/index.ts`, `integrations/telegram/client.ts`, `lib/hooks/use-action.ts`, `tests/unit/discount.test.ts`, `.cursor/handoff-rebuild.md`.

## Phase 11 — buyer screens

History lists the buyer's own orders, newest first, five per page, with quantity, total, and the short id. The detail view shows delivered text when the delivery attempt stored it, and only for an order `ownedOrder` accepts. Redeem uses the existing token screen. Discount asks for a code and uses the Phase 10 redemption. Events shows the announcement from `store_config` after the sanitizer. Replace lets the buyer pick a delivered order and send a reason, limited to three requests an hour. The owner approves or rejects from Orders. Approval calls `retryDelivery` and then marks the request replaced. History, redeem, events, discount, and replace are no longer in `COMING_SOON_BUTTONS`. Their default buttons stay off until the store turns them on. Owner text for announcements is passed through `sanitizeBotHtml`.

Checks:

- type-check: `npx tsc --noEmit` exit 0
- lint: `npx next lint` exit 0. Same two pre-existing `no-img-element` warnings.
- test: `npx vitest run` exit 0. 41 files, 324 tests passed.
- build: `npx next build` exit 0.

Files in this commit: `integrations/telegram/client.ts`, `modules/store-config/types.ts`, `modules/store-config/defaults.ts`, `modules/store-config/keyboard.ts`, `modules/platform/replacements.ts`, `modules/platform/growth.ts`, `app/api/platform/replacements/route.ts`, `app/(platform)/orders/view.tsx`, `.cursor/handoff-rebuild.md`.

## Phase 12 — security

Supplier HTTP now goes through `lib/safe-fetch.ts`. The helper requires https, resolves the host, and rejects a private, loopback, link-local, or reserved address, including 169.254.169.254. A redirect is checked the same way before it is followed. Connect and total time are bounded, and the body is cut at one megabyte. Connect and edit call `assertPublicHttpsUrl` before the key is saved. A bad URL returns that message instead of a generic connect failure. Telegram and Binance are not supplier URLs and still use their own clients. While tests are running, a hostname that is not an IP is treated as 1.1.1.1 so the suite does not call DNS. Production resolves the real address.

`consumeRateLimit` calls `bump_rate_limit`. Two instances that share that function share one count. Tests and `VITEST` keep the in-memory map, and `checkRateLimit` still uses it. Auth, money, and other writes fail closed. Reads and the fulfillment, reconcile, sync, and bot-health crons fail open. A missing `rate_limit_hits` table fails closed on auth and money with "This action needs migration 0032." Other writes are allowed when the table is missing, so the dashboard still saves. The webhook allows the update in that same case so an unapplied 0032 does not take the bot offline. When the limiter is down for any other reason, the webhook is refused. Middleware applies this to every `/api` request. Route handlers that already had a limit now await the shared store. The Telegram webhook limits per bot and per customer. API v1 still limits per key, on the same store. The fulfillment cron deletes rows older than two days inside try/catch.

Fraud thresholds are read from `platform_settings`. If those columns are missing, checkout keeps the documented defaults unused and the Settings page says migration 0032 is required. When the columns are present, a buyer is limited to the hourly and daily order counts, failed payment claims per hour, support messages per hour, and referral claims per day. A buyer younger than `fraud_new_account_age_hours` uses `fraud_new_account_order_cap` as the ceiling. A blocked buyer cannot create an order or store a support message. Each refusal is written to `audit_log` with the reason, and the bot shows that reason.

`reseller_policy` defaults to allow. A key set to false is rejected on the reseller settings, catalog, listing, markup, tier, bot studio, store, API key, and webhook writes. The update does not run, so the stored value stays. The owner turns fields on and off from Settings. A missing column is shown as needs migration 0032 and does not lock existing resellers.

Checks:

- type-check: `./node_modules/.bin/tsc --noEmit` exit 0
- lint: `./node_modules/.bin/next lint` exit 0. Same two pre-existing `no-img-element` warnings in `MemoryNav.tsx` and `sidebar.tsx`. Neither file is in this commit.
- test: `./node_modules/.bin/vitest run` exit 0. 42 files, 334 tests passed.
- build: `./node_modules/.bin/next build` exit 0. `/settings` and `/api/platform/settings` are in the route table.

Files in this commit: `lib/safe-fetch.ts`, `lib/rate-limiter.ts`, `lib/request-rate-limit.ts`, `lib/api-rate-limit.ts`, `lib/v1-auth.ts`, `middleware.ts`, `modules/platform/fraud.ts`, `modules/platform/policy.ts`, `modules/platform/support.ts`, `modules/platform/growth.ts`, `modules/platform/replacements.ts`, `modules/orders/index.ts`, `modules/public-api/index.ts`, `modules/supplier/index.ts`, `integrations/prodseller/client.ts`, `integrations/supplier/generic-client.ts`, `integrations/supplier/connector.ts`, `integrations/supplier/adapters/generic-adapter.ts`, `integrations/supplier/adapters/canboso-adapter.ts`, `integrations/telegram/client.ts`, `app/api/supplier/connect/route.ts`, `app/api/supplier/settings/[supplierId]/route.ts`, `app/api/fulfillment/process/route.ts`, `app/api/platform/settings/route.ts`, `app/api/platform/store/route.ts`, `app/api/webhooks/telegram/owner/route.ts`, `app/api/webhooks/telegram/[botId]/route.ts`, `app/(platform)/settings/page.tsx`, `app/(platform)/settings/view.tsx`, reseller policy routes under `app/api/reseller/**`, the write routes whose `assertRateLimit` calls are now awaited, `tests/unit/security-controls.test.ts`, `.cursor/handoff-rebuild.md`.

## Phase 13 — cleanup and audit

The 50 old dashboard pages are gone. `lib/legacy-redirects.json` is the map. Middleware returns 308 before the auth check, and `next.config.mjs` repeats the same permanent redirects. Login and the notification links open `/today`, `/orders`, `/money`, and `/catalog`. The bell no longer links to the deleted inbox.

Components, CSS, and stubs that nothing imported after that deletion were removed. `app/legacy-dashboard.css` stays because the auth pages, the growth panel, and the top-up panel still use those classes. `docs/platform-audit.md` lists the remaining issues and the fate of each old page.

Checks:

- type-check: `./node_modules/.bin/tsc --noEmit` exit 0
- lint: `./node_modules/.bin/next lint` exit 0. Same two pre-existing `no-img-element` warnings. `MemoryNav.tsx` is not in this commit. `sidebar.tsx` was deleted because nothing imported it.
- test: `./node_modules/.bin/vitest run` exit 0. 43 files, 336 tests passed.
- build: `./node_modules/.bin/next build` exit 0. The old `/owner` and `/reseller` pages are absent. The eight areas remain.

Files in this commit: `lib/legacy-redirects.json`, `lib/legacy-redirects.ts`, `middleware.ts`, `next.config.mjs`, `lib/navigation.ts`, `modules/notifications/index.ts`, `components/notifications/notification-bell.tsx`, `integrations/telegram/client.ts`, `components/auth/pending-wait.tsx`, `app/(auth)/invite/[token]/page.tsx`, `app/(auth)/suspended/page.tsx`, `app/(platform)/growth/view.tsx`, `app/(platform)/store/view.tsx`, `tests/unit/legacy-redirects.test.ts`, `tests/unit/identity.test.ts`, `docs/platform-audit.md`, `docs/architecture.md`, `.cursor/handoff-rebuild.md`, and the deleted `app/(dashboard)` tree plus the unreferenced components listed in the commit.
