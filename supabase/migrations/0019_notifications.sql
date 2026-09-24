CREATE TABLE IF NOT EXISTS notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tenant_id     uuid REFERENCES tenants(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN (
                  'order_paid', 'order_delivered', 'order_failed',
                  'wallet_credited', 'wallet_debited', 'balance_low',
                  'product_added', 'product_updated',
                  'reseller_activated', 'reseller_suspended',
                  'supplier_synced', 'system'
                )),
  title         text NOT NULL,
  body          text NOT NULL,
  metadata      jsonb DEFAULT '{}'::jsonb,
  is_read       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications(user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant
  ON notifications(tenant_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select_own
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY notifications_update_own
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
