-- Black Tier Circle fresh start.
-- Derived from migrations 0001–0038. Not applied by the agent.
-- Run Part 1, read every result set carefully, then run Part 2 in the Supabase SQL Editor as postgres.
-- Part 2 is one transaction. If anything fails, the whole transaction rolls back,
-- including the fresh_start_backup schema.
--
-- Kept:
--   - Owner profile(s) and auth user(s), platform_settings, owner bot settings
--   - Any owner-owned tenant row (and its api_keys, webhook_endpoints, tenant_settings,
--     wallets, bot_connections, store_config, store_config_versions, broadcasts)
--   - Suppliers, supplier_products (product_id cleared, published -> pending_review),
--     supplier_balance_snapshots
--   - Owner store_config and store_config_versions (tenant_id is null)
--   - Owner discount_codes (used_count reset to 0)
--   - Owner freebies and owner broadcasts
--
-- Removed:
--   - All orders and order-attached tables (events, claims, reservations, attempts,
--     credit entries, replacements, discount_redemptions, support threads/messages,
--     wallet_topups, chain_payments, referrals)
--   - All customers, points_ledger, freebie_claims, rate_limit_hits, ledger_transactions
--   - All products (and reseller_listings, product_assets, product_bulk_tiers)
--   - All notifications and invitations (backed up first)
--   - Reseller discount_codes (deleted; never moved to the owner store)
--   - Reseller-scoped rows ONLY in api_keys, webhook_endpoints, tenant_settings,
--     wallets, bot_connections, topup_tokens, store_config, store_config_versions,
--     broadcasts, tenants, profiles, and auth.users
--
-- Storage buckets (manual UI steps — DO NOT delete storage.objects directly in SQL):
--   After Part 2 commits, empty product files in the Supabase Dashboard:
--   1. Open Supabase Dashboard -> Storage.
--   2. Click the "product-files" bucket -> click the bucket menu (three dots) ->
--      "Empty bucket" -> confirm.
--   3. Click the "product-previews" bucket -> click the bucket menu (three dots) ->
--      "Empty bucket" -> confirm.
--   (Leave the "avatars" bucket intact.)

-- ---------------------------------------------------------------------------
-- PART 1. Read-only preview. Stop here and read all 4 result sets before Part 2.
-- ---------------------------------------------------------------------------

-- 1A. Rows that will be REMOVED or UNLINKED
with reseller_profiles as (
  select id from public.profiles where role = 'reseller'
),
reseller_tenants as (
  select id from public.tenants where owner_user_id in (select id from reseller_profiles)
)
select 'orders' as relation, count(*) as rows from public.orders
union all select 'order_events', count(*) from public.order_events
union all select 'payment_claims', count(*) from public.payment_claims
union all select 'wallet_reservations', count(*) from public.wallet_reservations
union all select 'fulfillment_attempts', count(*) from public.fulfillment_attempts
union all select 'delivery_attempts', count(*) from public.delivery_attempts
union all select 'customer_credit_entries', count(*) from public.customer_credit_entries
union all select 'replacement_requests', count(*) from public.replacement_requests
union all select 'discount_redemptions', count(*) from public.discount_redemptions
union all select 'support_messages', count(*) from public.support_messages
union all select 'support_threads', count(*) from public.support_threads
union all select 'wallet_topups', count(*) from public.wallet_topups
union all select 'chain_payments', count(*) from public.chain_payments
union all select 'referrals', count(*) from public.referrals
union all select 'points_ledger', count(*) from public.points_ledger
union all select 'freebie_claims', count(*) from public.freebie_claims
union all select 'ledger_transactions', count(*) from public.ledger_transactions
union all select 'rate_limit_hits', count(*) from public.rate_limit_hits
union all select 'notifications', count(*) from public.notifications
union all select 'invitations', count(*) from public.invitations
union all select 'customers', count(*) from public.customers
union all select 'products', count(*) from public.products
union all select 'product_assets', count(*) from public.product_assets
union all select 'product_bulk_tiers', count(*) from public.product_bulk_tiers
union all select 'reseller_listings', count(*) from public.reseller_listings
union all select 'supplier_products_linked', count(*) from public.supplier_products where product_id is not null
union all select 'reseller_discount_codes', count(*) from public.discount_codes where tenant_id in (select id from reseller_tenants)
union all select 'reseller_broadcasts', count(*) from public.broadcasts where tenant_id in (select id from reseller_tenants)
union all select 'reseller_api_keys', count(*) from public.api_keys where tenant_id in (select id from reseller_tenants)
union all select 'reseller_webhook_endpoints', count(*) from public.webhook_endpoints where tenant_id in (select id from reseller_tenants)
union all select 'reseller_tenant_settings', count(*) from public.tenant_settings where tenant_id in (select id from reseller_tenants)
union all select 'reseller_wallets', count(*) from public.wallets where tenant_id in (select id from reseller_tenants)
union all select 'reseller_bot_connections', count(*) from public.bot_connections where tenant_id in (select id from reseller_tenants)
union all select 'reseller_store_config', count(*) from public.store_config where tenant_id in (select id from reseller_tenants)
union all select 'reseller_store_config_versions', count(*) from public.store_config_versions where tenant_id in (select id from reseller_tenants)
union all select 'reseller_tenants', count(*) from reseller_tenants
union all select 'reseller_profiles', count(*) from reseller_profiles
order by relation;

-- 1B. Owner rows that will be KEPT
with reseller_profiles as (
  select id from public.profiles where role = 'reseller'
),
reseller_tenants as (
  select id from public.tenants where owner_user_id in (select id from reseller_profiles)
)
select 'owner_profiles' as kept_relation, count(*) as rows from public.profiles where role = 'owner'
union all select 'platform_settings', count(*) from public.platform_settings
union all select 'suppliers', count(*) from public.suppliers
union all select 'supplier_products', count(*) from public.supplier_products
union all select 'supplier_balance_snapshots', count(*) from public.supplier_balance_snapshots
union all select 'owner_store_config', count(*) from public.store_config where tenant_id is null or tenant_id not in (select id from reseller_tenants)
union all select 'owner_store_config_versions', count(*) from public.store_config_versions where tenant_id is null or tenant_id not in (select id from reseller_tenants)
union all select 'owner_discount_codes', count(*) from public.discount_codes where tenant_id is null or tenant_id not in (select id from reseller_tenants)
union all select 'owner_broadcasts', count(*) from public.broadcasts where tenant_id is null or tenant_id not in (select id from reseller_tenants)
union all select 'owner_freebies', count(*) from public.freebies where tenant_id is null or tenant_id not in (select id from reseller_tenants)
union all select 'owner_tenants', count(*) from public.tenants where id not in (select id from reseller_tenants)
order by kept_relation;

-- 1C. Every customer and reseller wallet with balance > 0 (minor units: 1,000,000 = 1 USDT)
select id, coalesce(username, first_name, telegram_user_id) as owner, credit_balance as balance_minor, 'customer' as kind
from public.customers
where credit_balance > 0
union all
select w.id, t.display_name as owner, w.balance_total as balance_minor, 'reseller' as kind
from public.wallets w
join public.tenants t on t.id = w.tenant_id
where w.balance_total > 0
order by kind, balance_minor desc;

-- 1D. Reseller stores and bots that will be removed
select t.id as tenant_id, t.display_name as store, p.display_name as reseller, b.username as bot_username
from public.tenants t
join public.profiles p on p.id = t.owner_user_id
left join public.bot_connections b on b.tenant_id = t.id
where p.role = 'reseller'
order by t.display_name, b.username;

-- ---------------------------------------------------------------------------
-- PART 2. One transaction. Do not run this until Part 1 has been read.
-- ---------------------------------------------------------------------------

begin;

-- Snapshot reseller profile and tenant ids up front so owner rows are never touched.
create temp table _reseller_profiles on commit drop as
  select id from public.profiles where role = 'reseller';

create temp table _reseller_tenants on commit drop as
  select id from public.tenants where owner_user_id in (select id from _reseller_profiles);

create schema fresh_start_backup;

create table fresh_start_backup.delivery_attempts as select * from public.delivery_attempts;
create table fresh_start_backup.fulfillment_attempts as select * from public.fulfillment_attempts;
create table fresh_start_backup.payment_claims as select * from public.payment_claims;
create table fresh_start_backup.wallet_reservations as select * from public.wallet_reservations;
create table fresh_start_backup.order_events as select * from public.order_events;
create table fresh_start_backup.customer_credit_entries as select * from public.customer_credit_entries;
create table fresh_start_backup.replacement_requests as select * from public.replacement_requests;
create table fresh_start_backup.discount_redemptions as select * from public.discount_redemptions;
create table fresh_start_backup.support_messages as select * from public.support_messages;
create table fresh_start_backup.support_threads as select * from public.support_threads;
create table fresh_start_backup.wallet_topups as select * from public.wallet_topups;
create table fresh_start_backup.chain_payments as select * from public.chain_payments;
create table fresh_start_backup.referrals as select * from public.referrals;
create table fresh_start_backup.orders as select * from public.orders;
create table fresh_start_backup.points_ledger as select * from public.points_ledger;
create table fresh_start_backup.freebie_claims as select * from public.freebie_claims;
create table fresh_start_backup.ledger_transactions as select * from public.ledger_transactions;
create table fresh_start_backup.rate_limit_hits as select * from public.rate_limit_hits;
create table fresh_start_backup.reseller_listings as select * from public.reseller_listings;
create table fresh_start_backup.product_assets as select * from public.product_assets;
create table fresh_start_backup.product_bulk_tiers as select * from public.product_bulk_tiers;
create table fresh_start_backup.supplier_products as select * from public.supplier_products;
create table fresh_start_backup.products as select * from public.products;
create table fresh_start_backup.customers as select * from public.customers;
create table fresh_start_backup.api_keys as select * from public.api_keys;
create table fresh_start_backup.webhook_endpoints as select * from public.webhook_endpoints;
create table fresh_start_backup.tenant_settings as select * from public.tenant_settings;
create table fresh_start_backup.wallets as select * from public.wallets;
create table fresh_start_backup.bot_connections as select * from public.bot_connections;
create table fresh_start_backup.topup_tokens as select * from public.topup_tokens;
create table fresh_start_backup.discount_codes as select * from public.discount_codes;
create table fresh_start_backup.store_config as select * from public.store_config;
create table fresh_start_backup.store_config_versions as select * from public.store_config_versions;
create table fresh_start_backup.broadcasts as select * from public.broadcasts;
create table fresh_start_backup.audit_log as select * from public.audit_log;
create table fresh_start_backup.invitations as select * from public.invitations;
create table fresh_start_backup.freebies as select * from public.freebies;
create table fresh_start_backup.notifications as select * from public.notifications;
create table fresh_start_backup.tenants as select * from public.tenants;
create table fresh_start_backup.profiles as select * from public.profiles;
create table fresh_start_backup.auth_users as
  select * from auth.users
  where id in (select id from _reseller_profiles);
create table fresh_start_backup.auth_identities as
  select * from auth.identities
  where user_id in (select id from _reseller_profiles);

-- Orders and everything attached. Referrals point at orders with no cascade.
delete from public.delivery_attempts;
delete from public.fulfillment_attempts;
delete from public.payment_claims;
delete from public.wallet_reservations;
delete from public.order_events;
delete from public.customer_credit_entries;
delete from public.replacement_requests;
delete from public.discount_redemptions;
delete from public.support_messages;
delete from public.support_threads;
delete from public.wallet_topups;
delete from public.chain_payments;
delete from public.referrals;
delete from public.orders;

-- Customers, their credit, referrals already removed, and freebie claims.
update public.customers set referred_by_customer_id = null;
delete from public.points_ledger;
delete from public.freebie_claims;
delete from public.customers;

-- Rate limits are the fraud hit log.
delete from public.rate_limit_hits;

-- Notifications and invitations (backed up above).
delete from public.notifications;
delete from public.invitations;

-- Ledger entries hang off reseller wallets.
delete from public.ledger_transactions
where wallet_id in (
  select id from public.wallets where tenant_id in (select id from _reseller_tenants)
);

-- Products, including archived ones. Listings and assets reference them.
delete from public.reseller_listings;
delete from public.product_assets;
delete from public.product_bulk_tiers;
update public.supplier_products
set product_id = null,
    review_status = case when review_status = 'published' then 'pending_review' else review_status end
where product_id is not null;
delete from public.products;

-- Discount codes: delete reseller codes (never move them to owner); keep owner codes with used_count reset.
delete from public.discount_codes
where tenant_id in (select id from _reseller_tenants);

update public.discount_codes
set used_count = 0
where tenant_id is null
   or tenant_id not in (select id from _reseller_tenants);

-- Reseller-scoped deletes ONLY. Owner rows (tenant_id is null or owner's tenant) are untouched.
delete from public.api_keys
where tenant_id in (select id from _reseller_tenants);

delete from public.webhook_endpoints
where tenant_id in (select id from _reseller_tenants);

delete from public.tenant_settings
where tenant_id in (select id from _reseller_tenants);

delete from public.wallets
where tenant_id in (select id from _reseller_tenants);

delete from public.bot_connections
where tenant_id in (select id from _reseller_tenants);

delete from public.topup_tokens
where tenant_id in (select id from _reseller_tenants)
   or redeemed_by in (select id from _reseller_profiles);

delete from public.store_config
where tenant_id in (select id from _reseller_tenants);

delete from public.store_config_versions
where tenant_id in (select id from _reseller_tenants);

delete from public.broadcasts
where tenant_id in (select id from _reseller_tenants);

-- Clear reseller profile references on kept owner rows before deleting reseller auth users.
update public.store_config
set updated_by = null
where updated_by in (select id from _reseller_profiles);

update public.store_config_versions
set saved_by = null
where saved_by in (select id from _reseller_profiles);

update public.broadcasts
set created_by = null
where created_by in (select id from _reseller_profiles);

update public.audit_log
set tenant_id = null
where tenant_id in (select id from _reseller_tenants);

update public.audit_log
set actor_id = null
where actor_id in (select id from _reseller_profiles);

update public.topup_tokens
set redeemed_by = null
where redeemed_by in (select id from _reseller_profiles);

update public.topup_tokens
set created_by = (select id from public.profiles where role = 'owner' limit 1)
where created_by in (select id from _reseller_profiles);

-- Reseller freebies cascade from the tenant. Owner freebies stay.
delete from public.tenants
where id in (select id from _reseller_tenants);

-- profiles.id references auth.users on delete cascade.
delete from auth.users
where id in (select id from _reseller_profiles);

commit;
