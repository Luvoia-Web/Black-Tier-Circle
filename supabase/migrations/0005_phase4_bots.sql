-- Phase 4: one bot per tenant, globally unique Telegram bot id,
-- and owner-store customers (no reseller bot_connections row).

alter table bot_connections
  drop constraint if exists bot_connections_tenant_id_telegram_bot_id_key;

create unique index if not exists bot_connections_one_per_tenant
  on bot_connections (tenant_id);

create unique index if not exists bot_connections_telegram_bot_id_unique
  on bot_connections (telegram_bot_id);

alter table customers alter column bot_id drop not null;

create unique index if not exists customers_owner_telegram_user
  on customers (telegram_user_id)
  where bot_id is null;
