-- ============================================================
-- Black Tier Circle — synthetic development seed
-- No real credentials, tokens, or customer PII.
-- Products do not depend on auth.users so this can run after 0001.
-- ============================================================

insert into products (
  sku,
  title,
  description,
  category,
  delivery_type,
  status,
  wholesale_price,
  retail_price,
  stock_unlimited,
  reseller_eligible,
  max_purchase_qty
) values
  (
    'EBOOK-DEMO-001',
    'Demo Ebook',
    'Synthetic test product for local development',
    'ebooks',
    'file_reusable',
    'published',
    5000000,
    10000000,
    true,
    true,
    1
  ),
  (
    'NOTES-DEMO-001',
    'Demo Handwritten Notes',
    'Synthetic notes SKU for reseller listing tests',
    'notes',
    'file_reusable',
    'published',
    2500000,
    8000000,
    true,
    true,
    1
  )
on conflict (sku) do nothing;
