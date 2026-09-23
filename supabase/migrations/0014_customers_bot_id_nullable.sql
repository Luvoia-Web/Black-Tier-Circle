-- Owner-store customers have no reseller bot_connections row.
-- Repeat 0005 in case that migration never ran on the live database.

alter table customers alter column bot_id drop not null;

create unique index if not exists customers_owner_telegram_user
  on customers (telegram_user_id)
  where bot_id is null;
