-- Product card text for the Telegram shop.
-- Run after 0025_bot_studio.sql. Do not apply from the app.
-- Sold units are counted from verified orders. products.sold_count is not added.
-- supplier_products.sold_count stays the supplier catalog figure and is not the store's sales.

alter table products
  add column if not exists duration_text text,
  add column if not exists warranty_text text,
  add column if not exists type_label text;

alter table products drop constraint if exists products_duration_text_len;
alter table products
  add constraint products_duration_text_len
  check (duration_text is null or char_length(duration_text) <= 60);

alter table products drop constraint if exists products_warranty_text_len;
alter table products
  add constraint products_warranty_text_len
  check (warranty_text is null or char_length(warranty_text) <= 60);

alter table products drop constraint if exists products_type_label_len;
alter table products
  add constraint products_type_label_len
  check (type_label is null or char_length(type_label) <= 60);

alter table supplier_products
  add column if not exists duration_text text,
  add column if not exists warranty_text text,
  add column if not exists type_label text;

alter table supplier_products drop constraint if exists supplier_products_duration_text_len;
alter table supplier_products
  add constraint supplier_products_duration_text_len
  check (duration_text is null or char_length(duration_text) <= 60);

alter table supplier_products drop constraint if exists supplier_products_warranty_text_len;
alter table supplier_products
  add constraint supplier_products_warranty_text_len
  check (warranty_text is null or char_length(warranty_text) <= 60);

alter table supplier_products drop constraint if exists supplier_products_type_label_len;
alter table supplier_products
  add constraint supplier_products_type_label_len
  check (type_label is null or char_length(type_label) <= 60);

create index if not exists idx_orders_product_verified
  on orders (product_id)
  where payment_status = 'verified';
