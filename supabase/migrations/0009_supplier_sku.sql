/**
 * Adds supplier_sku to products table.
 * supplier_sku: the product identifier as known to the external supplier.
 * Null for own products (delivery_type != 'supplier_api').
 * Required for supplier_api products.
 */
alter table products
  add column if not exists supplier_sku text,
  add column if not exists supplier_metadata jsonb default '{}';

-- Index for supplier lookups
create index if not exists idx_products_supplier_sku
  on products(supplier_sku) where supplier_sku is not null;

comment on column products.supplier_sku is
  'SKU as known to the external supplier. Required when delivery_type=supplier_api.';

comment on column products.supplier_metadata is
  'Arbitrary supplier-specific metadata (e.g. category codes, delivery options). JSON.';
