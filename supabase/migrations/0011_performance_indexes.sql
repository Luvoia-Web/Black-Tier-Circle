-- Final performance indexes for production load

-- Orders: most common dashboard queries
create index if not exists idx_orders_tenant_created
  on orders(tenant_id, created_at desc);

create index if not exists idx_orders_channel_status
  on orders(channel, payment_status, fulfillment_status);

-- Customers: bot lookup
create index if not exists idx_customers_telegram_user
  on customers(telegram_user_id);

-- Ledger: reseller history
create index if not exists idx_ledger_wallet_type
  on ledger_transactions(wallet_id, entry_type, created_at desc);

-- Audit log: owner review
create index if not exists idx_audit_action_created
  on audit_log(action, created_at desc);

-- Products: catalog browse
create index if not exists idx_products_status_category
  on products(status, category) where status = 'published';
