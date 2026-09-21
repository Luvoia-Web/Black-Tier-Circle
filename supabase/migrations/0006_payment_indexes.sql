-- Additional indexes for payment queries
-- These speed up common payment monitoring queries

-- Find pending verifications quickly
create index if not exists idx_orders_payment_fulfillment
  on orders(payment_status, fulfillment_status);

-- Find payment claims by tx hash (replay attack check)
create index if not exists idx_payment_claims_tx_hash
  on payment_claims(tx_hash) where tx_hash is not null;

-- Find payment claims by binance order id
create index if not exists idx_payment_claims_binance_order
  on payment_claims(binance_order_id) where binance_order_id is not null;

-- Composite for order payment lookups
create index if not exists idx_payment_claims_order_verified
  on payment_claims(order_id, verified_at);
