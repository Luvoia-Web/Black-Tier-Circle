-- TRC20 wallets, product announcement channel, and order quantity.

ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS platform_usdt_wallet_trc20 text,[]
  ADD COLUMN IF NOT EXISTS trc20_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS usdt_wallet_trc20 text,
  ADD COLUMN IF NOT EXISTS use_own_trc20_wallet boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trc20_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS announcement_channel_id text;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS quantity int NOT NULL DEFAULT 1;
