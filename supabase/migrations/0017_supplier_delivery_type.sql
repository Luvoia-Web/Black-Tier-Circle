-- Published supplier products must be fulfilled by ProdSeller, never by an uploaded file.
update products
set
  delivery_type = 'supplier_api',
  stock_unlimited = true,
  stock_count = null,
  updated_at = now()
where supplier_id is not null
  and supplier_sku is not null
  and (
    delivery_type is distinct from 'supplier_api'
    or stock_unlimited is distinct from true
    or stock_count is not null
  );
