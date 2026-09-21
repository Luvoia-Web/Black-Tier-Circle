-- Speed up fulfillment queue processing
create index if not exists idx_orders_fulfillment_queued
  on orders(fulfillment_status)
  where fulfillment_status = 'queued';

-- Speed up manual pending lookup
create index if not exists idx_orders_manual_pending
  on orders(fulfillment_status, created_at)
  where fulfillment_status = 'manual_pending';

-- Speed up delivery retry lookup
create index if not exists idx_orders_delivery_retry
  on orders(delivery_status)
  where delivery_status in ('retry_pending', 'unreachable');

-- Fulfillment attempts by order
create index if not exists idx_fulfillment_order
  on fulfillment_attempts(order_id, started_at desc);

-- Delivery attempts by fulfillment
create index if not exists idx_delivery_fulfillment
  on delivery_attempts(fulfillment_id, attempted_at desc);
