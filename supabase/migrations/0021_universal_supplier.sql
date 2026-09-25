-- Saved adapter settings so later orders reuse the connection that worked.

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS adapter_name text NOT NULL DEFAULT 'generic',
  ADD COLUMN IF NOT EXISTS auth_header_format text DEFAULT 'bare',
  ADD COLUMN IF NOT EXISTS products_endpoint text,
  ADD COLUMN IF NOT EXISTS orders_endpoint text,
  ADD COLUMN IF NOT EXISTS balance_endpoint text,
  ADD COLUMN IF NOT EXISTS api_version text DEFAULT 'v1';

UPDATE suppliers
SET adapter_name = 'prodseller'
WHERE adapter_name = 'generic'
  AND (base_url ILIKE '%prodseller%' OR slug = 'prodseller');
