-- Restores the rows copied by scripts/sql/fresh-start.sql.
-- Run only after that script committed, and only if fresh_start_backup still exists.
-- Product file bytes were deleted from storage. This puts the storage.objects
-- rows back. The bytes themselves are gone, so downloads of those paths fail
-- until the files are uploaded again.
-- Not applied by the agent.

begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
)
select
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
from fresh_start_backup.auth_users
where id not in (select id from auth.users);

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
select
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
from fresh_start_backup.auth_identities
where id not in (select id from auth.identities);

insert into public.profiles
select * from fresh_start_backup.profiles b
where not exists (select 1 from public.profiles p where p.id = b.id);

insert into public.tenants
select * from fresh_start_backup.tenants b
where not exists (select 1 from public.tenants t where t.id = b.id);

insert into public.bot_connections
select * from fresh_start_backup.bot_connections b
where not exists (select 1 from public.bot_connections x where x.id = b.id);

insert into public.customers
select * from fresh_start_backup.customers b
where not exists (select 1 from public.customers c where c.id = b.id);

insert into public.products
select * from fresh_start_backup.products b
where not exists (select 1 from public.products p where p.id = b.id);

insert into public.product_assets
select * from fresh_start_backup.product_assets b
where not exists (select 1 from public.product_assets a where a.id = b.id);

insert into public.product_bulk_tiers
select * from fresh_start_backup.product_bulk_tiers b
where not exists (select 1 from public.product_bulk_tiers t where t.id = b.id);

insert into public.reseller_listings
select * from fresh_start_backup.reseller_listings b
where not exists (select 1 from public.reseller_listings l where l.id = b.id);

insert into public.wallets
select * from fresh_start_backup.wallets b
where not exists (select 1 from public.wallets w where w.id = b.id);

insert into public.tenant_settings
select * from fresh_start_backup.tenant_settings b
where not exists (select 1 from public.tenant_settings s where s.id = b.id);

insert into public.api_keys
select * from fresh_start_backup.api_keys b
where not exists (select 1 from public.api_keys k where k.id = b.id);

insert into public.webhook_endpoints
select * from fresh_start_backup.webhook_endpoints b
where not exists (select 1 from public.webhook_endpoints w where w.id = b.id);

insert into public.orders
select * from fresh_start_backup.orders b
where not exists (select 1 from public.orders o where o.id = b.id);

insert into public.order_events
select * from fresh_start_backup.order_events b
where not exists (select 1 from public.order_events e where e.id = b.id);

insert into public.payment_claims
select * from fresh_start_backup.payment_claims b
where not exists (select 1 from public.payment_claims c where c.id = b.id);

insert into public.wallet_reservations
select * from fresh_start_backup.wallet_reservations b
where not exists (select 1 from public.wallet_reservations r where r.id = b.id);

insert into public.fulfillment_attempts
select * from fresh_start_backup.fulfillment_attempts b
where not exists (select 1 from public.fulfillment_attempts f where f.id = b.id);

insert into public.delivery_attempts
select * from fresh_start_backup.delivery_attempts b
where not exists (select 1 from public.delivery_attempts d where d.id = b.id);

insert into public.customer_credit_entries
select * from fresh_start_backup.customer_credit_entries b
where not exists (select 1 from public.customer_credit_entries e where e.id = b.id);

insert into public.replacement_requests
select * from fresh_start_backup.replacement_requests b
where not exists (select 1 from public.replacement_requests r where r.id = b.id);

insert into public.ledger_transactions
select * from fresh_start_backup.ledger_transactions b
where not exists (select 1 from public.ledger_transactions l where l.id = b.id);

insert into public.wallet_topups
select * from fresh_start_backup.wallet_topups b
where not exists (select 1 from public.wallet_topups t where t.id = b.id);

insert into public.chain_payments
select * from fresh_start_backup.chain_payments b
where not exists (select 1 from public.chain_payments c where c.id = b.id);

insert into public.referrals
select * from fresh_start_backup.referrals b
where not exists (select 1 from public.referrals r where r.id = b.id);

insert into public.points_ledger
select * from fresh_start_backup.points_ledger b
where not exists (select 1 from public.points_ledger p where p.id = b.id);

insert into public.freebies
select * from fresh_start_backup.freebies b
where not exists (select 1 from public.freebies f where f.id = b.id);

insert into public.freebie_claims
select * from fresh_start_backup.freebie_claims b
where not exists (select 1 from public.freebie_claims c where c.id = b.id);

insert into public.support_threads
select * from fresh_start_backup.support_threads b
where not exists (select 1 from public.support_threads t where t.id = b.id);

insert into public.support_messages
select * from fresh_start_backup.support_messages b
where not exists (select 1 from public.support_messages m where m.id = b.id);

insert into public.discount_codes
select * from fresh_start_backup.discount_codes b
where not exists (select 1 from public.discount_codes c where c.id = b.id);

update public.discount_codes d
set tenant_id = b.tenant_id,
    used_count = b.used_count
from fresh_start_backup.discount_codes b
where d.id = b.id;

insert into public.discount_redemptions
select * from fresh_start_backup.discount_redemptions b
where not exists (select 1 from public.discount_redemptions r where r.id = b.id);

insert into public.topup_tokens
select * from fresh_start_backup.topup_tokens b
where not exists (select 1 from public.topup_tokens t where t.id = b.id);

update public.topup_tokens t
set tenant_id = b.tenant_id,
    redeemed_by = b.redeemed_by,
    created_by = b.created_by
from fresh_start_backup.topup_tokens b
where t.id = b.id;

insert into public.rate_limit_hits
select * from fresh_start_backup.rate_limit_hits b
where not exists (
  select 1 from public.rate_limit_hits h
  where h.bucket = b.bucket and h.window_start = b.window_start
);

update public.supplier_products sp
set product_id = b.product_id,
    review_status = b.review_status
from fresh_start_backup.supplier_products b
where sp.id = b.id;

insert into public.store_config
select * from fresh_start_backup.store_config b
where not exists (select 1 from public.store_config s where s.id = b.id);

update public.store_config s
set config = b.config,
    version = b.version,
    updated_by = b.updated_by,
    tenant_id = b.tenant_id
from fresh_start_backup.store_config b
where s.id = b.id;

insert into public.store_config_versions
select * from fresh_start_backup.store_config_versions b
where not exists (select 1 from public.store_config_versions v where v.id = b.id);

insert into public.notifications
select * from fresh_start_backup.notifications b
where not exists (select 1 from public.notifications n where n.id = b.id);

insert into public.audit_log
select * from fresh_start_backup.audit_log b
where not exists (select 1 from public.audit_log a where a.id = b.id);

update public.audit_log a
set actor_id = b.actor_id,
    tenant_id = b.tenant_id
from fresh_start_backup.audit_log b
where a.id = b.id;

update public.invitations i
set invited_by = b.invited_by
from fresh_start_backup.invitations b
where i.id = b.id;

insert into storage.objects
select * from fresh_start_backup.storage_objects b
where not exists (select 1 from storage.objects o where o.id = b.id);

commit;

-- The backup schema is left in place. Drop it only after you have checked the app:
-- drop schema fresh_start_backup cascade;
