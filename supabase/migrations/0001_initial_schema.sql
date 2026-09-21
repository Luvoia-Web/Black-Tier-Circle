-- ============================================================
-- Black Tier Circle — 0001_initial_schema
-- Creates the Phase 0 domain schema, enums, indexes, and RLS toggles.
-- Service role bypasses RLS; application code must still filter by tenant.
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ============================================================
-- ENUMS
-- ============================================================
create type user_role as enum ('owner', 'reseller', 'staff');
create type account_status as enum ('pending', 'active', 'suspended');
create type product_status as enum ('draft', 'published', 'paused', 'archived');
create type delivery_type as enum ('file_reusable', 'inventory_unit', 'manual', 'supplier_api');
create type order_payment_status as enum (
  'not_required', 'awaiting', 'pending_verification',
  'verified', 'failed', 'expired', 'refund_pending', 'refunded', 'disputed'
);
create type order_funding_status as enum (
  'not_applicable', 'reserved', 'debited', 'released',
  'reversal_pending', 'reversed'
);
create type order_fulfillment_status as enum (
  'queued', 'manual_pending', 'supplier_pending',
  'outcome_unknown', 'ready', 'failed', 'canceled'
);
create type order_delivery_status as enum (
  'not_ready', 'queued', 'sending', 'sent',
  'retry_pending', 'unreachable', 'review_required'
);
create type ledger_entry_type as enum (
  'top_up_credit', 'manual_credit', 'manual_debit',
  'reservation', 'reservation_release', 'wholesale_debit',
  'wholesale_reversal', 'adjustment'
);
create type token_status as enum ('active', 'redeemed', 'expired', 'revoked');
create type payment_method as enum ('binance_pay', 'usdt_bep20');

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,
  role          user_role not null default 'reseller',
  status        account_status not null default 'pending',
  timezone      text not null default 'Asia/Kolkata',
  mfa_enabled   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- TENANTS (one per reseller; owner has no tenant row)
-- ============================================================
create table tenants (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references profiles(id),
  display_name    text not null,
  business_name   text,
  support_contact text,
  status          account_status not null default 'pending',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================
-- INVITATIONS
-- ============================================================
create table invitations (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  role        user_role not null default 'reseller',
  token       text not null unique,
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  invited_by  uuid not null references profiles(id),
  created_at  timestamptz not null default now()
);

-- ============================================================
-- BOT CONNECTIONS
-- ============================================================
create table bot_connections (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  telegram_bot_id text not null,
  username        text not null,
  -- token stored encrypted; never returned in API responses
  encrypted_token text not null,
  webhook_secret  text not null,
  status          text not null default 'disconnected',
  last_health_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(tenant_id, telegram_bot_id)
);

-- ============================================================
-- CUSTOMERS (per bot)
-- ============================================================
create table customers (
  id              uuid primary key default gen_random_uuid(),
  bot_id          uuid not null references bot_connections(id),
  telegram_user_id text not null,   -- stored as text (64-bit safe)
  telegram_chat_id text not null,
  first_name      text,
  username        text,
  is_blocked      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(bot_id, telegram_user_id)
);

-- ============================================================
-- PRODUCTS
-- ============================================================
create table products (
  id                uuid primary key default gen_random_uuid(),
  sku               text not null unique,
  title             text not null,
  description       text,
  category          text,
  delivery_type     delivery_type not null,
  status            product_status not null default 'draft',
  -- wholesale price in USDT minor units (6 decimals → integer)
  wholesale_price   bigint not null check (wholesale_price >= 0),
  -- retail price in USDT minor units (owner store default)
  retail_price      bigint not null check (retail_price >= 0),
  stock_unlimited   boolean not null default true,
  stock_count       int,
  reseller_eligible boolean not null default true,
  max_purchase_qty  int not null default 1,
  estimated_delivery_minutes int,
  version           int not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ============================================================
-- PRODUCT ASSETS (files)
-- ============================================================
create table product_assets (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references products(id),
  storage_path    text not null,   -- Supabase storage object path
  content_type    text not null,
  file_size_bytes bigint,
  is_preview      boolean not null default false,
  version         int not null default 1,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- RESELLER PRODUCT LISTINGS
-- ============================================================
create table reseller_listings (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  product_id      uuid not null references products(id),
  retail_price    bigint not null check (retail_price >= 0),
  is_visible      boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(tenant_id, product_id)
);

-- ============================================================
-- WALLETS (one per tenant, USDT only)
-- ============================================================
create table wallets (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) unique,
  -- all in USDT minor units (integer × 10^6)
  balance_total   bigint not null default 0 check (balance_total >= 0),
  balance_reserved bigint not null default 0 check (balance_reserved >= 0),
  -- available = total - reserved (enforced by application)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint reserved_lte_total check (balance_reserved <= balance_total)
);

-- ============================================================
-- LEDGER TRANSACTIONS (append-only, never update or delete)
-- ============================================================
create table ledger_transactions (
  id              uuid primary key default gen_random_uuid(),
  wallet_id       uuid not null references wallets(id),
  entry_type      ledger_entry_type not null,
  -- positive = credit, negative = debit (always in USDT minor units)
  amount          bigint not null,
  balance_after   bigint not null check (balance_after >= 0),
  reference_id    text,            -- order ID, top-up token, admin note, etc.
  reference_type  text,
  actor_id        uuid references profiles(id),
  note            text,
  created_at      timestamptz not null default now()
  -- NO updated_at — ledger rows are immutable
);

-- ============================================================
-- TOP-UP TOKENS (12-digit admin-generated, one-use)
-- ============================================================
create table topup_tokens (
  id              uuid primary key default gen_random_uuid(),
  token           char(12) not null unique,
  amount_usdt     bigint not null check (amount_usdt > 0),  -- minor units
  status          token_status not null default 'active',
  tenant_id       uuid references tenants(id),   -- null = not yet assigned to a reseller; null means any approved reseller can redeem if not restricted
  created_by      uuid not null references profiles(id),
  redeemed_by     uuid references profiles(id),
  redeemed_at     timestamptz,
  expires_at      timestamptz,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- ORDERS
-- ============================================================
create table orders (
  id                  uuid primary key default gen_random_uuid(),
  -- channel: 'owner_store' | 'reseller_bot' | 'api'
  channel             text not null,
  tenant_id           uuid references tenants(id),   -- null for owner store
  bot_id              uuid references bot_connections(id),
  customer_id         uuid references customers(id),
  product_id          uuid not null references products(id),
  product_version     int not null,
  -- prices snapshotted at order creation (immutable after)
  quoted_retail_price  bigint not null,
  quoted_wholesale_price bigint not null,
  currency            text not null default 'USDT',
  payment_method      payment_method,
  payment_status      order_payment_status not null default 'awaiting',
  funding_status      order_funding_status not null default 'not_applicable',
  fulfillment_status  order_fulfillment_status not null default 'queued',
  delivery_status     order_delivery_status not null default 'not_ready',
  -- correlation
  external_order_ref  text,        -- reseller's own reference for API orders
  idempotency_key     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ============================================================
-- ORDER EVENTS (state machine audit log — append only)
-- ============================================================
create table order_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id),
  track       text not null,   -- 'payment' | 'funding' | 'fulfillment' | 'delivery'
  from_status text,
  to_status   text not null,
  actor_id    uuid references profiles(id),
  trigger     text,            -- 'webhook' | 'worker' | 'manual' | 'api'
  note        text,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- PAYMENT CLAIMS (customer-submitted payment evidence)
-- ============================================================
create table payment_claims (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id),
  payment_method  payment_method not null,
  -- Binance Pay: order ID submitted by customer
  binance_order_id text,
  -- BEP20: TX hash submitted by customer
  tx_hash         text,
  submitted_at    timestamptz not null default now(),
  verified_at     timestamptz,
  rejected_at     timestamptz,
  reject_reason   text,
  -- raw verification response (redacted before logging)
  verification_evidence jsonb
);

-- ============================================================
-- WALLET RESERVATIONS
-- ============================================================
create table wallet_reservations (
  id          uuid primary key default gen_random_uuid(),
  wallet_id   uuid not null references wallets(id),
  order_id    uuid not null references orders(id) unique,
  amount      bigint not null check (amount > 0),
  status      text not null default 'active',   -- 'active' | 'consumed' | 'released'
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- FULFILLMENT ATTEMPTS
-- ============================================================
create table fulfillment_attempts (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id),
  attempt_number  int not null default 1,
  -- 'file' | 'manual' | 'supplier'
  method          text not null,
  status          text not null default 'pending',
  -- storage path of the artifact to deliver (for file delivery)
  artifact_path   text,
  fulfilled_by    uuid references profiles(id),
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  error           text
);

-- ============================================================
-- DELIVERY ATTEMPTS
-- ============================================================
create table delivery_attempts (
  id              uuid primary key default gen_random_uuid(),
  fulfillment_id  uuid not null references fulfillment_attempts(id),
  attempt_number  int not null default 1,
  channel         text not null,   -- 'telegram' | 'api'
  status          text not null default 'pending',
  attempted_at    timestamptz not null default now(),
  result          text,
  error           text
);

-- ============================================================
-- AUDIT LOG (all financial and admin actions)
-- ============================================================
create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references profiles(id),
  tenant_id   uuid references tenants(id),
  action      text not null,
  target_type text,
  target_id   text,
  -- before/after redacted — no secrets, no full payment payloads
  before_val  jsonb,
  after_val   jsonb,
  reason      text,
  ip_address  text,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_orders_tenant_id on orders(tenant_id);
create index idx_orders_payment_status on orders(payment_status);
create index idx_orders_created_at on orders(created_at desc);
create index idx_ledger_wallet_created on ledger_transactions(wallet_id, created_at desc);
create index idx_topup_tokens_token on topup_tokens(token);
create index idx_payment_claims_order on payment_claims(order_id);
create index idx_order_events_order on order_events(order_id, created_at desc);
create index idx_customers_bot on customers(bot_id, telegram_user_id);
create index idx_audit_log_actor on audit_log(actor_id, created_at desc);
create index idx_audit_log_tenant on audit_log(tenant_id, created_at desc);

-- ============================================================
-- ROW LEVEL SECURITY (enable on all tables)
-- ============================================================
alter table profiles enable row level security;
alter table tenants enable row level security;
alter table invitations enable row level security;
alter table bot_connections enable row level security;
alter table customers enable row level security;
alter table products enable row level security;
alter table product_assets enable row level security;
alter table reseller_listings enable row level security;
alter table wallets enable row level security;
alter table ledger_transactions enable row level security;
alter table topup_tokens enable row level security;
alter table orders enable row level security;
alter table order_events enable row level security;
alter table payment_claims enable row level security;
alter table wallet_reservations enable row level security;
alter table fulfillment_attempts enable row level security;
alter table delivery_attempts enable row level security;
alter table audit_log enable row level security;

-- RLS policies are added per phase as features are built.
-- Service role bypasses RLS — all service-role code must
-- perform explicit tenant checks in application logic.
