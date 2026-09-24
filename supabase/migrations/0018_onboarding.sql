-- First-run onboarding. Existing accounts are marked complete so they are not
-- sent through setup after this column is added.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS store_name text,
  ADD COLUMN IF NOT EXISTS support_contact text;

UPDATE profiles
SET onboarding_completed = true
WHERE onboarding_completed = false;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

alter table webhook_endpoints alter column tenant_id drop not null;

alter table tenant_settings
  add column if not exists notify_order_placed boolean not null default true,
  add column if not exists notify_order_delivered boolean not null default true,
  add column if not exists notify_balance_low boolean not null default true,
  add column if not exists notify_balance_threshold numeric(18,6) not null default 10,
  add column if not exists notify_product_added boolean not null default true;

alter table platform_settings
  add column if not exists maintenance_mode boolean not null default false;
