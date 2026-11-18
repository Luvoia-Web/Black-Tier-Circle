# Black Tier Circle — feature ledger

Nothing in this list is optional. A later step may restyle a feature. It may not drop it.

Sources, both read from git on 18 Nov 2026:

- `77d75c6` — `feat(bot-studio): preview the real catalog and the product card`. Last dashboard before the rebuild touched pages.
- `fcc28f6^` (`ea5389a`) — the tree the rebuild deleted. Same 50 dashboard pages as `77d75c6`, plus the components below.
- `fcc28f6` (`feat(dashboard): retire the old pages`) — current `HEAD`. The pages are gone. Every API route they called is still under `app/api`.

`app/(dashboard)` at both commits is the same 50 `page.tsx` files: 29 owner, 21 reseller. Confirmed with `git ls-tree`.

## Component folders at fcc28f6^

| Folder | Files | What it owned |
| --- | --- | --- |
| `components/account` | 1 | Reseller profile, password, avatar, account deletion. |
| `components/ai` | 7 | Remy orb, welcome, typing, suggestions, floating launcher, chat panel. |
| `components/assistant` | 3 | Memory-backed Remy page, slide-out widget, chat that posts to `/api/assistant`. |
| `components/auth` | 2 | Login and pending-wait. Still present. |
| `components/bot-studio` | 3 | Card layout editor, live preview, versions. |
| `components/catalog` | 2 | Product list helpers used by the owner catalog. |
| `components/charts` | 3 | Dashboard charts. Restore the job in the new chart kit, not these files as-is. |
| `components/dashboard` | 4 | Owner home pulse, cron cards, shared dashboard bits. `topup-admin.tsx` survived in the current tree. |
| `components/growth` | 1 | Referrals, points, freebies panel. Still present. |
| `components/intelligence` | 7 | Owner control tower and the reseller MemoryOS board. Deleted. |
| `components/motion` | 8 | Shared motion. Deleted. |
| `components/notifications` | 2 | Bell and inbox. Bell survived. Inbox page was deleted. |
| `components/orders` | 4 | Owner and reseller order boards and the order modal. Deleted. |
| `components/payments` | 1 | Payment monitor. Deleted. Top-up review survived as `topup-admin`. |
| `components/pricing` | 1 | Tier and markup editor. Deleted. |
| `components/reseller` | 1 | Reseller table actions. Deleted. |
| `components/settings` | 6 | Owner and reseller settings sections, payment methods, API keys, webhooks. Deleted. |
| `components/supplier` | 3 | Connect, catalog, health. Deleted. |
| `components/wallet` | 2 | Wallet detail and ledger. Deleted. |
| `components/ui` | 25 | Old primitives. Some survived (`page-header` and others the growth panel still imports). |
| `components/landing`, `components/3d` | — | Marketing site. Out of this rebuild. |
| `components/dashboard-shell.tsx`, `dashboard-identity.tsx`, `coming-soon.tsx`, `onboarding-wizard.tsx` | — | Old shell, identity chip, stubs, onboarding. Shell is replaced by the new one. Onboarding stays. |

## Owner pages at 77d75c6 and fcc28f6^

Every route below called an API that still exists. See the check at the bottom.

| Route | What the page did | Actions | API |
| --- | --- | --- | --- |
| `/owner` | Home. Reseller, order, and revenue stats. Cron cards. Live order pulse. | Run fulfillment, reconcile suppliers, check bot health. | `POST /api/fulfillment/process`, `POST /api/supplier/reconcile`, `POST /api/bots/health`. Pulse reads `GET /api/owner/orders?tab=all&limit=50`. |
| `/owner/assistant` | Full-page Remy. | Send a message. Memory is kept by the assistant route. | `POST /api/assistant`. |
| `/owner/bot-studio` | Bot Studio, owner scope. | Edit card, buttons, catalogue text, messages, links, checkout. Preview a real published product. | `GET/PUT /api/owner/bot-studio`. Preview: `GET /api/products?status=published&limit=24`. |
| `/owner/bots` | Owner store bot and every reseller bot. | See status. | `GET /api/admin/bots`. |
| `/owner/fulfillment` | Queue of orders a person still has to finish. | Mark fulfilled. | `POST /api/fulfillment/:orderId/manual-complete`. |
| `/owner/growth` | Referrals, points, freebies. | Save referral rules. Reject a referral. Adjust points. Add, reorder, and turn freebies on or off. | `GET/PUT /api/owner/growth`, `.../referrals`, `.../points`, `.../freebies`, `.../freebies/:id`, `.../reject`. |
| `/owner/intelligence` | Operations control tower. | Read platform memory and outcomes. | `GET /api/intelligence/platform`. |
| `/owner/launch` | Launch checklist and live system checks. | Re-run checks. | `GET /api/owner/launch`. |
| `/owner/notifications` | Inbox. | Mark one read. Mark all read. Delete. | `GET /api/notifications`, `POST /api/notifications/read-all`, `POST /api/notifications/:id/read`, `DELETE /api/notifications/:id`. |
| `/owner/orders` | Orders with status tabs. | Open a row. Cancel. Retry delivery. Mark fulfilled. | `GET /api/owner/orders`. Modal: `GET /api/orders/:id/detail`, `POST .../cancel`, `POST /api/fulfillment/:id/retry-delivery`, `POST .../manual-complete`. |
| `/owner/orders/[orderId]` | Payment, fulfillment, supplier, delivery. | Cancel. Add a note. Retry. Mark fulfilled. | Same order and fulfillment routes. Page data is read on the server. |
| `/owner/payments` | Payment monitor and top-up review. | Filter tabs. Approve or reject a top-up. Open the order. | `GET /api/admin/payments`, `GET /api/payments/topups`, `POST /api/payments/topups/:id`. |
| `/owner/payments/[orderId]` | Claim evidence and override. | Override the payment decision. | `POST /api/admin/payments/:orderId/override`. |
| `/owner/products` | Product list. | Filter. Bulk publish, pause, archive, delete, set category. | `GET /api/products`, `PATCH /api/products/:id`, `POST /api/products/:id/status`, `POST /api/products/bulk`. |
| `/owner/products/new` | Create a draft. | Save draft. | `POST /api/products`. |
| `/owner/products/[productId]` | Files and status. | Upload, download, delete a file. Change status. | `GET/PATCH /api/products/:id`, status, `POST /api/products/upload`, asset and download routes. |
| `/owner/products/[productId]/edit` | Edit. SKU is read-only. | Save. Edit tiers. | `PATCH /api/products/:id`, `PUT /api/products/:id/tiers`. |
| `/owner/resellers` | Reseller table. | Activate. Suspend. | `GET /api/resellers`, `POST /api/resellers/:tenantId/status`. |
| `/owner/resellers/invite` | Invite link. | Create an invite. | `POST /api/invitations/create`. |
| `/owner/settings` | Store bot, payments, public info. | Save settings. Connect, disconnect, and test the bot. | `GET/PUT /api/owner/settings`, `GET /api/owner/launch`, `GET/PUT /api/owner/webhooks`, `GET/PUT /api/owner/platform`, `POST /api/owner/settings/bot/connect`, `.../disconnect`, `.../test`, `PUT /api/owner/settings/payments`. |
| `/owner/supplier` | Connected suppliers and balance. | Sync. | `GET /api/supplier/balance`, `POST /api/supplier/sync`. |
| `/owner/supplier/connect` | New supplier. | Test the key. Save it. | `POST /api/supplier/connect`. |
| `/owner/supplier/[supplierId]` | Paged supplier catalog. | Set markup. Publish one. Bulk publish. Sync. | `GET /api/supplier/products`, publish, bulk-publish, sync. |
| `/owner/supplier/[supplierId]/settings` | Supplier settings. | Rename. Rotate the key. Pause. | `PATCH /api/supplier/settings/:id`. |
| `/owner/supplier/orders` | Supplier order monitor. | Read health. Force reconcile. | `GET /api/supplier/health`, `POST /api/supplier/:orderId/force-reconcile`. |
| `/owner/supplier/orders/[orderId]` | One supplier order. | Manual complete, fail, resubmit. | `POST /api/supplier/:orderId/manual-complete`, `.../manual-fail`, `.../resubmit`. |
| `/owner/tokens` | Credit tokens. | Create. Revoke. | `GET/POST /api/admin/tokens`, `POST /api/admin/tokens/:id/revoke`. Reseller picker: `GET /api/resellers`. |
| `/owner/wallets` | Reseller wallets. | Credit. Debit. | `GET /api/admin/wallets`, `POST .../:id/credit`, `POST .../:id/debit`. |
| `/owner/wallets/[walletId]` | One wallet and its ledger. | Credit. Debit. | `GET /api/admin/wallets/:id` plus the credit and debit routes. |

## Reseller pages at 77d75c6 and fcc28f6^

| Route | What the page did | Actions | API |
| --- | --- | --- | --- |
| `/reseller` | Home. Period stats, recent orders, wallet. | Change the period. | `GET /api/reseller/overview`, `GET /api/reseller/orders`, `GET /api/reseller/settings`. |
| `/reseller/account` | Profile, password, avatar, deletion. | Save profile. Change password. Upload avatar. Request deletion. | `GET/PATCH /api/reseller/profile`, `POST .../avatar`, `POST .../password`, `POST .../deletion`. |
| `/reseller/assistant` | Full-page Remy, same widget as the owner. | Send a message. | `POST /api/assistant`. |
| `/reseller/bills` | Wholesale owed to the owner. | Read the list. | `GET /api/reseller/bills`. |
| `/reseller/bot` | Store bot. | Connect. Disconnect. Refresh status. | `GET /api/bots/status`, `POST /api/bots/connect`, `POST /api/bots/disconnect`. |
| `/reseller/bot-studio` | Bot Studio, reseller scope. | Same editor as the owner, own listings in the preview. | `GET/PUT /api/reseller/bot-studio`. Preview: `GET /api/reseller/listings`. |
| `/reseller/customers` | Buyers. | Search. Open a buyer. Wallet actions. Record an outcome. | `GET /api/reseller/customers`, `GET/PATCH /api/reseller/customers/:id`, `GET /api/intelligence/customer`, `POST /api/intelligence/outcome`. |
| `/reseller/deliveries` | Manual delivery queue. | Mark delivered. | `GET /api/reseller/deliveries`, `POST /api/reseller/deliveries/:orderId`. |
| `/reseller/deposits` | Redeem a token. Deposits. A ledger snippet. | Redeem. | `GET /api/reseller/deposits`, `GET /api/wallet/ledger`, `POST /api/wallet/redeem`, `GET /api/reseller/settings`. |
| `/reseller/growth` | Same growth panel, own store. | Same actions as owner growth. | `GET/PUT /api/reseller/growth` and the same subpaths. |
| `/reseller/intelligence` | MemoryOS for this store. | Read a customer. Record an outcome. Run recovery. | `GET /api/reseller/customers`, `GET /api/intelligence/store`, `GET /api/intelligence/customer`, `POST /api/intelligence/outcome`, `POST /api/intelligence/recovery`. |
| `/reseller/notifications` | Same inbox as the owner. | Same read and delete actions. | Same `/api/notifications` routes. |
| `/reseller/orders` | Search, status, period, paging, CSV. | Export. Open a row. | `GET /api/reseller/orders`. |
| `/reseller/orders/[orderId]` | Order detail without money internals. | Read only. | Server read. No client mutation. |
| `/reseller/payments` | Top-up review for this store. | Approve. Reject. | `GET /api/payments/topups`, `POST /api/payments/topups/:id`. |
| `/reseller/products` | Own catalog, markup, tiers. | Edit a listing. Set markup. Edit tiers. | `GET /api/reseller/catalog`, `GET/PATCH /api/reseller/listings/:id`, `POST /api/reseller/listings/markup`, `PUT .../tiers`, `GET /api/reseller/settings`. |
| `/reseller/settings` | Bot, store, payments, Binance, support, terms, keys. | Save. Connect and disconnect the bot. | `GET/PUT /api/reseller/settings`, bot status, connect, disconnect, `GET/POST /api/reseller/api-keys`. |
| `/reseller/settings/api-keys` | Public v1 keys. | Create. Revoke. | `GET/POST /api/reseller/api-keys`, `DELETE /api/reseller/api-keys/:id`. |
| `/reseller/settings/webhooks` | Webhook endpoints. | Create. Delete. | `GET/POST /api/reseller/webhooks`, `DELETE /api/reseller/webhooks/:id`. |
| `/reseller/wallet` | Redirects to deposits. | None. | None. |
| `/reseller/wallet/history` | Paged ledger and CSV. | Export. | `GET /api/wallet/statement`. |

## Features the rebuild added — these stay

They live on the eight current routes and their `/api/platform` handlers. The new navigation keeps them. The step column is when the screen is rebuilt to the reference, not when the behaviour was invented.

| Feature | Where it works today | New home | Step |
| --- | --- | --- | --- |
| Today triage: failed orders, stuck fulfillment, out of stock, low supplier balance, resellers waiting, unread support. Each row has its fix. | `/today`, `GET /api/platform/today` | Overview, “Needs your attention” | 1 |
| Joined catalog: one row per supplier item, stage, wholesale and retail markup. | `/catalog`, `GET /api/platform/catalog` | Products → Catalogue | 2 |
| Catalog detail drawer. | `/catalog?item=` | Products | 2 |
| One order list, payment / supplier / delivery timeline, bulk retry, CSV. | `/orders`, `GET /api/platform/orders` | Orders | 2 |
| Order drawer. | `/orders?order=` | Orders | 2 |
| Refund to wallet. | `POST /api/orders/:id/refund` | Orders | 2 |
| Replacement requests. Owner-initiated only. The buyer bot no longer has a Replace button. | `POST /api/platform/replacements` | Orders | 2 |
| Balances, reseller wallets, ledger, supplier warning. | `/money`, `GET /api/platform/money` | Wallets & ledger | 3 |
| Wallet drawer. | `/money?wallet=` | Reseller wallets | 3 |
| Top-up review (approve, reject, audit). | `TopupAdmin` on `/money` | Payments → Top-ups | 3 |
| Buyers and resellers in one directory. | `/people`, `GET /api/platform/people` | Customers → Buyers, and Resellers | 3 |
| Block and unblock a customer. | People drawer, `blocked_at` | Customers → Buyers | 3 |
| Support inbox, reply through the store bot, retry a failed send. | `/people?thread=`, `POST /api/platform/support` | Customers → Support inbox | 3 |
| Person drawer. | `/people?person=` | Customers, Resellers | 3 |
| Reseller approval and invites. | People, existing status and invitation routes | Resellers | 3 |
| Store editor, live card preview, open or maintenance, reconnect. | `/store`, `GET/PUT/PATCH /api/platform/store` | Bot Studio, and Settings for open or closed | 4 |
| Referrals, points, freebies. | `GrowthPanel` on `/growth` | Marketing | 4 |
| Discount codes. | `/growth`, `POST /api/platform/growth` | Discounts | 4 |
| Announcements. | `/growth` | Broadcasts & announcements | 4 |
| Buyer broadcast with a recipient count and a second confirmation. | `/growth` | Broadcasts & announcements | 4 |
| Fraud thresholds. | `/settings`, `modules/platform/fraud.ts` | Settings | 4 |
| Reseller policy. | `/settings`, `modules/platform/policy.ts` | Settings | 4 |
| Command palette. Search products, orders, customers. | Shell, `GET /api/platform/search` | Top bar | 1 |
| Detail drawer (order, item, person, wallet, thread). | Shell | Shell | 1 |
| Notification bell. | Top bar | Top bar | 1 |

Buyer bot screens that must keep working, even though they are not dashboard pages: order history, redeem, discount at checkout, and events. The Replace button is gone. Replacement is owner-initiated only, from the Orders drawer. Step 4 does not remove the screens that remain.

## Where each old feature lives now

The sidebar in step 1 links at the existing working page until the step in the last column rebuilds that screen. Remy and Overview are the screens step 1 itself builds. Analytics, Intelligence, and System health have no page after `fcc28f6`. Step 1 gives each a real route that reads the API that already exists, so the sidebar never 404s. The full screen is still the later step.

| Old feature | Sidebar home | Works today at | Rebuilt in |
| --- | --- | --- | --- |
| Owner home, live pulse, revenue | Overview | new `/overview` in step 1. `/today` redirects there. | 1 |
| Period stats | Analytics | `/analytics` reads the overview API | 4 |
| Intelligence control tower and MemoryOS | Intelligence | `/intelligence` reads `/api/intelligence/platform` or `/api/intelligence/store` | 4 |
| Remy page, launcher, panel | Remy AI | `/remy` and the launcher, `/api/assistant` | 1 |
| Orders, fulfillment, supplier orders, deliveries, replacements | Orders | `/orders` | 2 |
| Products, files, tiers, bulk actions | Products → Catalogue | `/catalog` | 2 |
| Stock | Products → Inventory | `/catalog?stock=` | 2 |
| Markup and tiers | Products → Pricing rules | `/catalog` | 2 |
| Connected suppliers, balance, sync, connect, settings | Suppliers → Connected | `/catalog` | 2 |
| Supplier catalog, publish | Suppliers → Import catalog | `/catalog` | 2 |
| Supplier order monitor and manual actions | Suppliers → Supplier orders | `/orders` | 2 |
| Supplier health and reconcile | Suppliers → Health | `/suppliers/health` reads `/api/supplier/health` | 2 |
| Reseller buyers, block | Customers → Buyers | `/people?type=buyer` | 3 |
| Support inbox | Customers → Support inbox | `/people` | 3 |
| Reseller table, invite, activate, suspend | Resellers | `/people?type=reseller` | 3 |
| Reseller wallets, credit, debit | Wallets & ledger → Reseller wallets | `/money` | 3 |
| Credit tokens | Wallets & ledger → Credit tokens | `/money?section=tokens` | 3 |
| Ledger, bills, deposits, statement | Wallets & ledger → Ledger | `/money` | 3 |
| Top-ups | Payments → Top-ups | `/money` | 3 |
| Payment monitor and claim override | Payments → Payment claims | `/money` | 3 |
| Payment methods | Payments → Payment methods | `/settings` | 3 |
| Bot list, connect, disconnect | Bots | `/store` | 3 |
| Referrals, points, freebies | Marketing | `/growth` | 4 |
| Discount codes | Discounts | `/growth` | 4 |
| Announcements and broadcasts | Broadcasts & announcements | `/growth` | 4 |
| Bot Studio | Bot Studio | `/store` | 4 |
| Settings, account, API keys, webhooks, fraud, reseller policy, open or maintenance | Settings | `/settings` | 4 |
| Launch checklist, bot health | System health | `/health` reads `/api/owner/launch` and `/api/bots/health` | 4 |
| Notification inbox page | Bell in the top bar. The old inbox route stays deleted. | Bell | 1 |

Reseller sidebar uses the same shell and the same pages, scoped to that tenant: Overview, Analytics, Remy AI, Orders, Products, Customers, Marketing, Discounts, Wallet, Bot & Studio, Settings. Owner-only items (Suppliers, Resellers, Wallets of other stores, System health) stay off that sidebar.

## API check

Every path in `lib/navigation.ts` `API_ROUTES` was checked against `app/api/**/route.ts` on `fcc28f6`. 101 route templates resolve to a real `route.ts`. Nothing the old pages called is missing.

Routes the rebuild added, also present: `/api/platform/catalog`, `catalog/detail`, `growth`, `money`, `orders`, `people`, `people/detail`, `replacements`, `search`, `settings`, `store`, `support`, `today`, and `/api/orders/:orderId/refund`.

No missing API is flagged.

## Step 2 restored

Checked against the live owner and reseller dashboards. The buyer bot Replace button is gone. Replacement is owner-initiated only.

| Feature | Where it lives now |
| --- | --- |
| Order list, chips, search, store, date range, CSV | `/orders` |
| Order drawer, timeline, payment claim, override | `/orders?order=` |
| Fulfillment queue | `/orders?attention=fulfillment` |
| Manual delivery queue | `/orders?attention=delivery` |
| Reseller orders, no extra money actions | `/orders` |
| Bulk retry, cancel, export | Orders bulk bar |
| Refund to wallet | Orders drawer |
| Replacement, new supplier item or pasted item | Orders drawer. One open request. A delivered order cannot use the normal retry route. |
| Catalogue, grid and list, stage, category, markup | `/catalog` |
| Create a draft | `/catalog?create=1` |
| Product drawer and editor | `/catalog?item=` and `edit=1` |
| Reseller listings | `/catalog` |
| Inventory | `/catalog?section=inventory`. Reorder point is the constant `REORDER_POINT` (10) until 0034. |
| Pricing rules and apply to the default | `/catalog?section=pricing` |
| Connected suppliers, sync, settings | `/catalog?section=suppliers&panel=connected` |
| Connect a supplier | `/catalog?section=suppliers&connect=1` |
| Import catalog, four markup values | `/catalog?section=suppliers&panel=import` |
| Supplier orders | `/catalog?section=suppliers&panel=orders` |
| Supplier health, per supplier | `/catalog?section=suppliers&panel=health`. No balance history until 0034. |
| Legacy order, catalog, and supplier links | `lib/legacy-redirects.json` |

Not built here, and why: a per-product reorder point and a supplier balance history need columns that are not in 0033. They are listed under Needs 0034 in `.cursor/handoff-step2.md`. The shared reorder point stays 10. Health shows the latest balance only.
