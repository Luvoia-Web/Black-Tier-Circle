/**
 * Supplier catalog: connections, raw imports, and links onto products.
 * Owner review publishes a supplier_products row into products.
 * The API key is encrypted. This seed does not store a key.
 */

create table if not exists suppliers (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  slug                  text not null unique,
  base_url              text not null,
  api_key_encrypted     text,
  auth_header_name      text not null default 'X-API-Key',
  status                text not null default 'active'
                          check (status in ('active', 'paused', 'error')),
  balance_usdt          numeric(18,6) default 0,
  balance_checked_at    timestamptz,
  membership_tier       text,
  last_sync_at          timestamptz,
  last_sync_error       text,
  product_count         int default 0,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists supplier_products (
  id                        uuid primary key default gen_random_uuid(),
  supplier_id               uuid not null references suppliers(id) on delete cascade,
  supplier_sku              text not null,
  name                      text not null,
  description               text,
  category                  text,
  image_url                 text,
  supplier_price            numeric(18,6) not null,
  supplier_public_price     numeric(18,6),
  delivery_type             text not null default 'instant'
                              check (delivery_type in ('instant', 'email_activation', 'manual')),
  requires_email_activation boolean not null default false,
  in_stock                  boolean not null default true,
  stock_count               int,
  sold_count                int default 0,
  review_status             text not null default 'pending_review'
                              check (review_status in ('pending_review', 'published', 'rejected', 'paused')),
  wholesale_price_minor     bigint,
  retail_price_minor        bigint,
  product_id                uuid references products(id) on delete set null,
  first_seen_at             timestamptz not null default now(),
  last_seen_at              timestamptz not null default now(),
  last_synced_at            timestamptz not null default now(),
  unique (supplier_id, supplier_sku)
);

alter table products
  add column if not exists supplier_id uuid references suppliers(id) on delete set null,
  add column if not exists supplier_sku text,
  add column if not exists supplier_price_minor bigint,
  add column if not exists requires_email_activation boolean not null default false;

alter table orders
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_supplier_products_supplier
  on supplier_products(supplier_id, review_status);

create index if not exists idx_supplier_products_sku
  on supplier_products(supplier_id, supplier_sku);

create index if not exists idx_products_supplier
  on products(supplier_id) where supplier_id is not null;

alter table suppliers enable row level security;
alter table supplier_products enable row level security;

insert into suppliers (name, slug, base_url, auth_header_name, status)
values ('ProdSeller', 'prodseller', 'https://prodseller.com/v1', 'X-API-Key', 'active')
on conflict (slug) do nothing;
