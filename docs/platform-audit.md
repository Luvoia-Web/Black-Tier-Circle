# Platform audit

Reviewed after the old dashboard pages were removed and the eight areas (`/today`, `/catalog`, `/orders`, `/money`, `/people`, `/store`, `/growth`, `/settings`) became the only dashboard. Migration `0032_platform_complete.sql` is not applied. Findings below are what still breaks, or will break, in practice.

Severity is what a buyer, reseller, or owner hits. The smallest fix is the change that removes that break, not a rewrite.

## Old pages

44 of the 50 old pages now live in one of the eight areas. 6 were dropped on purpose. Every old path returns 308 to the path in the route map, from middleware and from `next.config.mjs`. The map is `lib/legacy-redirects.json`.

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
| `/owner/payments/[orderId]` | `/orders?order=[orderId]` | migrated |
| `/owner/wallets` | `/money` | migrated |
| `/owner/wallets/[walletId]` | `/money?wallet=[walletId]` | migrated |
| `/owner/tokens` | `/money?section=tokens` | migrated |
| `/reseller/deposits` | `/money` | migrated |
| `/reseller/wallet` | `/money` | migrated |
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
| `/owner/intelligence` | `/today` | dropped |
| `/reseller/intelligence` | `/today` | dropped |
| `/owner/assistant` | `/today` | dropped |
| `/reseller/assistant` | `/today` | dropped |
| `/owner/notifications` | `/today` | dropped; the bell stays |
| `/reseller/notifications` | `/today` | dropped; the bell stays |

## Critical

None found that lets one tenant spend another tenant's money or read another tenant's orders through the new list APIs. Reseller order lists are filtered in `modules/platform/orders.ts` line 83. Reseller buyer lists are filtered by `bot_id` in `modules/platform/people.ts` line 92. A blocked customer is refused in `modules/orders/index.ts` before a product is loaded.

## High

### Settings does not open the section the old URL asked for

`app/(platform)/settings/view.tsx` line 32 loads `/api/platform/settings` and never reads `section`. A reseller who opens `/settings?section=account`, `api-keys`, or `webhooks` sees the policy list. The account form, API key manager, and webhook manager were the old pages and were deleted with them. The write APIs are still there (`app/api/reseller/profile/password/route.ts`, `app/api/reseller/api-keys/route.ts`, `app/api/reseller/webhooks/route.ts`).

What breaks: a reseller cannot change a password, create or revoke an API key, or edit a webhook from the product. The bot still tells them the API key URL in `integrations/telegram/client.ts` (the Developer API screen).

Smallest fix: when `section` is `account`, `api-keys`, or `webhooks`, render a panel on this page that calls those existing routes through `useData` and `runAction`. Keep the policy editor as the default section.

### Catalog, orders, money, and store ignore the deep-link query

- `app/(platform)/catalog/view.tsx` line 69 reads `item` and forwards the rest of the query. It does not open a create form for `create=1` or a connect form for `connect=1`.
- `modules/platform/orders.ts` line 61 `parseOrderFilters` has no `attention` field, so `/orders?attention=fulfillment` and `attention=delivery` show the same list as `/orders`.
- `app/(platform)/money/view.tsx` lines 39–40 read `kind` and `wallet` only. `section=tokens`, `section=ledger`, `section=debts`, and `section=topups` do not scroll or filter.
- `app/(platform)/store/view.tsx` has no `useSearchParams`. `section=health` does not jump to the bot status block.

What breaks: every old bookmark lands on the right area and the wrong slice. Fulfillment staff do not see the failed queue. Token and debt work is buried in the same money page.

Smallest fix: read those query keys in the four views. `attention` should set the order state filter. `section` should scroll to or show that block. `create=1` and `connect=1` should open the existing catalog drawer in that mode.

### Supplier fetch checks the DNS answer, then connects by name again

`lib/safe-fetch.ts` line 229 rejects a private address, then line 234 calls `fetch` with the original hostname. A name that changes its answer between those two steps can be checked as public and connected as private, including a link-local address.

What breaks: a hostile or compromised supplier DNS can still aim the server at an internal address after the check has passed.

Smallest fix: connect to the address that was checked, and send the original hostname as the TLS server name and `Host` header. Re-check on every redirect, which the loop already does for the name.

### Fraud limits are off until migration 0032 is applied

`modules/platform/fraud.ts` lines 66 and 70 return `enforce: false` when `fraud_orders_per_hour` is missing. A blocked row (`is_blocked` or `blocked_at`) is still refused. Count limits are not.

What breaks: until 0032 is applied, a new or abusive buyer is not stopped by the hourly or daily caps. The Settings page says the columns are missing. After the migration is applied, the caps run without a code change.

Smallest fix: apply 0032. Do not invent the caps in the client.

## Medium

### Middleware trusts the session cookie without asking Auth

`middleware.ts` line 142 uses `getSession()`. Route handlers use `getUser()`. A revoked session still passes the edge check until the JWT expires, and the browser is then sent to a platform page whose layout calls `getUser()` and bounces it. The extra hop is the bug, not an authorization bypass of the database.

What breaks: a signed-out or revoked user can be shown the dashboard shell for one request, then get sent to login.

Smallest fix: call `getUser()` in middleware for `isPlatformRoute` paths. Keep `getSession()` off the authorization decision.

### Write routes are not limited while `rate_limit_hits` is missing

`lib/api-rate-limit.ts` line 40 allows a non-auth, non-money write when `needsMigration` is true. Auth and money stay fail-closed (line 42). That is so an unapplied 0032 does not freeze the dashboard.

What breaks: until 0032 is applied, catalog edits, bot saves, and growth writes share no durable counter. Two app instances do not share a limit. After the migration, `bump_rate_limit` is the counter.

Smallest fix: apply 0032. Leave the fail-open branch only for the missing-table error.

### A Telegram update with no user id skips the per-customer limit

`lib/api-rate-limit.ts` line 52 returns null when `userId` is null. The per-bot bucket still applies. Channel posts, anonymous admin messages, and updates the parser does not recognize are only limited per bot.

What breaks: a burst of updates that carry no `from.id` can pass the customer bucket and only hit the bot bucket of 100.

Smallest fix: if the update has no user id and is not a known channel post, refuse it. Count channel posts on `tg-chat:${botId}:${chatId}`.

### People order counts stop at 1000 rows

`modules/platform/people.ts` line 101 loads at most 1000 order ids for the buyers on the page and counts them in memory. A buyer with a long history, or a page of busy buyers, is shown a low number. The same query has no `orders(customer_id)` index in `supabase/migrations`. `idx_orders_tenant_created` does not serve `customer_id IN (...)`.

What breaks: the People directory under-counts orders, and the query gets slower as the table grows.

Smallest fix: one grouped query (`customer_id, count(*)`) and a new migration that adds `orders(customer_id)`. Do not edit 0032.

### Reseller catalog visibility is capped at 1000 listings

`modules/platform/catalog.ts` line 339 loads at most 1000 `reseller_listings` for the tenant and then decides which products are live. A store past that cap treats the rest as not listed.

What breaks: a large reseller catalog hides products that are actually published.

Smallest fix: join `reseller_listings` in the product query for the current page instead of preloading 1000 rows. Index `(tenant_id, product_id)` if that index is not already unique.

### List helpers turn a database error into an empty list

`modules/platform/orders.ts` lines 46–49 and `modules/platform/people.ts` lines 28–31 return `[]` when the query has an error. The page then shows its empty state.

What breaks: a missing column or a statement timeout looks like "no orders" or "no one matches". The user retries and gets the same empty page.

Smallest fix: throw `AppError` with the database message. The pages already render `ErrorState`.

### Search text is interpolated into a filter

`modules/platform/orders.ts` lines 115–117 and `modules/platform/people.ts` lines 73 and 95 put the search string inside `.or(...)`. `safe` / `safeTerm` strips `%`, `_`, comma, quote, and period first.

What breaks: a value that still contains a PostgREST operator character can change the filter. The strip list is not the operator list.

Smallest fix: look up matching customer ids with `.ilike` on one column at a time, then pass those ids to `.in()`. Do not build an `or` string.

## Low

### Theme bootstrap swallows every error

`app/layout.tsx` line 43 is `catch(e) {}` around the theme read. A storage failure leaves the default theme. Nothing else is hidden.

Smallest fix: leave the default and do not catch. The inline script cannot import the logger, so an empty catch here is the whole handler. Prefer leaving it and not copying the pattern into server code.

### The architecture diagram still described a job worker

`docs/architecture.md` named `jobs/dispatch`. Those stubs had no callers and were removed. The webhook handles the update in the request. The diagram now says "inline handler".

### The notification bell does not use the page data hook

`components/notifications/notification-bell.tsx` loads `/api/notifications` with `fetch` on an interval. It is the shell, not a page. A failed poll leaves the previous count.

Smallest fix: call `useData` with the filter in the query, and refetch on the same interval. Keep the mark-read calls on `runAction`.

### New-account fraud uses age, not lifetime order count

`modules/platform/fraud.ts` tightens caps only when `created_at` is inside `fraud_new_account_age_hours`. An older account with few orders keeps the normal caps. That is deliberate so existing buyers are not suddenly capped at 3 orders.

What breaks: a buyer who waited out the age window is treated as established even with one order.

Smallest fix: if the product should also cap by lifetime orders, add that as a second condition next to the age check, and set the cap above the counts the current buyers already have.

### One policy for every reseller

`platform_settings.reseller_policy` is a single object. The owner cannot lock markup for one store and leave it open for another. There is no custom domain, no per-store staff role, and no separate settings document per tenant.

What breaks: a network that needs different rules per store has to share one lock list.

Smallest fix: store an optional override on `tenants` and have `assertResellerFieldsAllowed` read the override first, then the platform row. Do that in a new migration.

## What is in place

- Supplier URLs used by the live adapters go through `safeSupplierFetch`. Connect and edit call `assertPublicHttpsUrl` before save. `http` is rejected. Private, loopback, link-local, and reserved addresses are rejected, including `169.254.169.254`. Redirects are checked before they are followed. The body is cut at one megabyte. Connect and total time are bounded.
- `consumeRateLimit` uses `bump_rate_limit` when that function exists, so two instances share a count. Tests keep the in-memory map. Auth and money fail closed. Reads and the four crons fail open. The fulfillment cron sweeps old `rate_limit_hits` rows inside try/catch.
- A fraud refusal and a blocked customer write `audit_log` and return the reason. The bot shows that reason.
- `reseller_policy` is enforced on the reseller write routes. A locked field throws before the update, so the stored value stays. An empty policy allows every field.
- Login sends both roles to `/today`.
