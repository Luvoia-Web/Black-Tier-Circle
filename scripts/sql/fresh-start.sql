-- Black Tier Circle fresh start.
-- Derived from migrations 0001–0034. Not applied by the agent.
-- Run Part 1, read it, then run Part 2 in the Supabase SQL editor as postgres.
-- Part 2 is one transaction. If anything fails, the whole transaction rolls back,
-- including the fresh_start_backup schema.
--
-- Kept: the owner profile and auth user, platform_settings, suppliers and their
-- keys, every supplier_products row (product link cleared), supplier balance
-- history, the owner bot columns on platform_settings, store_config and
-- store_config_versions where tenant_id is null, and discount_codes (uses reset).
-- Removed: orders and everything hanging off them, customers and buyer credit,
-- referrals and freebie claims, rate-limit hits, every product, and every
-- reseller tenant, bot, store, profile, and auth user.
-- Product file bytes in storage are deleted. Undo restores the rows, not the bytes.

-- ---------------------------------------------------------------------------
-- PART 1. Read-only preview. Stop here and read the result before Part 2.
-- ---------------------------------------------------------------------------

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
union all select 'customers', count(*) from public.customers
union all select 'products', count(*) from public.products
union all select 'product_assets', count(*) from public.product_assets
union all select 'product_bulk_tiers', count(*) from public.product_bulk_tiers
union all select 'reseller_listings', count(*) from public.reseller_listings
union all select 'supplier_products_linked', count(*) from public.supplier_products where product_id is not null
union all select 'tenants', count(*) from public.tenants
union all select 'bot_connections', count(*) from public.bot_connections
union all select 'wallets', count(*) from public.wallets
union all select 'reseller_profiles', count(*) from public.profiles where role = 'reseller'
order by relation;

-- Customer wallets are customers.credit_balance. Reseller wallets are wallets.
select id, coalesce(username, first_name, telegram_user_id) as owner, credit_balance as balance, 'customer' as kind
from public.customers
where credit_balance > 0
union all
select w.id, t.display_name as owner, w.balance_total as balance, 'reseller' as kind
from public.wallets w
join public.tenants t on t.id = w.tenant_id
where w.balance_total > 0
order by kind, balance desc;

select t.id as tenant_id, t.display_name as store, p.display_name as reseller, b.username as bot_username
from public.tenants t
join public.profiles p on p.id = t.owner_user_id
left join public.bot_connections b on b.tenant_id = t.id
where p.role = 'reseller'
order by t.display_name, b.username;

-- Identical code strings cannot all stay once their stores are gone.
-- Part 2 keeps the oldest row of each code.
select code, count(*) as copies
from public.discount_codes
group by code
having count(*) > 1
order by code;

-- ---------------------------------------------------------------------------
-- PART 2. One transaction. Do not run this until Part 1 has been read.
-- ---------------------------------------------------------------------------

begin;

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
create table fresh_start_backup.audit_log as select * from public.audit_log;
create table fresh_start_backup.invitations as select * from public.invitations;
create table fresh_start_backup.freebies as select * from public.freebies;
create table fresh_start_backup.notifications as select * from public.notifications;
create table fresh_start_backup.tenants as select * from public.tenants;
create table fresh_start_backup.profiles as select * from public.profiles;
create table fresh_start_backup.auth_users as
  select * from auth.users
  where id in (select id from public.profiles where role = 'reseller');
create table fresh_start_backup.auth_identities as
  select * from auth.identities
  where user_id in (select id from public.profiles where role = 'reseller');
create table fresh_start_backup.storage_objects as
  select * from storage.objects
  where bucket_id in ('product-files', 'product-previews');

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

-- Rate limits are the fraud hit log. There is no separate fraud table.
delete from public.rate_limit_hits;

-- Ledger entries hang off reseller wallets. Those wallets are removed below.
delete from public.ledger_transactions;

-- Products, including archived ones. Listings and assets reference them.
delete from public.reseller_listings;
delete from public.product_assets;
delete from public.product_bulk_tiers;
update public.supplier_products
set product_id = null,
    review_status = case when review_status = 'published' then 'pending_review' else review_status end
where product_id is not null;
delete from public.products;

-- Reseller stores, bots, listings already removed, and their auth users.
-- Discount codes are detached first so deleting a tenant cannot cascade them.
delete from public.discount_codes d
using public.discount_codes older
where d.tenant_id is not null
  and older.code = d.code
  and older.id <> d.id
  and (older.tenant_id is null or older.created_at < d.created_at or (older.created_at = d.created_at and older.id < d.id));
update public.discount_codes
set tenant_id = null,
    used_count = 0;

delete from public.api_keys;
delete from public.webhook_endpoints;
delete from public.tenant_settings;
delete from public.wallets;
delete from public.bot_connections;
delete from public.topup_tokens
where tenant_id is not null
   or redeemed_by in (select id from public.profiles where role = 'reseller');
delete from public.store_config where tenant_id is not null;
delete from public.store_config_versions where tenant_id is not null;
update public.store_config
set updated_by = null
where updated_by in (select id from public.profiles where role = 'reseller');
update public.store_config_versions
set saved_by = null
where saved_by in (select id from public.profiles where role = 'reseller');
update public.audit_log
set tenant_id = null
where tenant_id is not null;
update public.audit_log
set actor_id = null
where actor_id in (select id from public.profiles where role = 'reseller');
update public.topup_tokens
set redeemed_by = null
where redeemed_by in (select id from public.profiles where role = 'reseller');
update public.topup_tokens
set created_by = (select id from public.profiles where role = 'owner' limit 1)
where created_by in (select id from public.profiles where role = 'reseller');
update public.invitations
set invited_by = (select id from public.profiles where role = 'owner' limit 1)
where invited_by in (select id from public.profiles where role = 'reseller');

-- Reseller freebies cascade from the tenant. Owner freebies have a null tenant.
delete from public.tenants
where owner_user_id in (select id from public.profiles where role = 'reseller');

delete from storage.objects
where bucket_id in ('product-files', 'product-previews');

-- profiles.id references auth.users on delete cascade.
delete from auth.users
where id in (select id from public.profiles where role = 'reseller');

commit;
