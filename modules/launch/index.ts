/**
 * @file modules/launch/index.ts
 *
 * Owner launch-readiness checks against live env and database state.
 *
 * @module Launch
 */

import { isPaymentLive, isPlatformPaymentConfigured, paymentSandboxEnabled } from '@/lib/payment-config';
import { getPlatformSettings } from '@/modules/platform';
import { readPaymentDemoMode } from '@/modules/platform/settings-extra';
import type { DbClient } from '@/lib/supabase/query';
import { getBotConnection } from '@/modules/bots';
import { getProductWithAssets, listProducts } from '@/modules/catalog';
import { listTenants } from '@/modules/tenants';
import { getWallet } from '@/modules/wallet';

export type LaunchCheck = {
  readonly id: string;
  readonly label: string;
  readonly group: 'environment' | 'payment' | 'bot' | 'product' | 'reseller';
  readonly passing: boolean;
  readonly detail: string;
};

function envSet(name: string): boolean {
  const value = process.env[name];
  return Boolean(value && value.length > 0);
}

function envReal(name: string): boolean {
  const value = process.env[name];
  return Boolean(value && !value.startsWith('PLACEHOLDER'));
}

function minLen(name: string, min: number): boolean {
  const value = process.env[name];
  return Boolean(value && value.length >= min);
}

/**
 * True only for an https, non-localhost production domain.
 */
export function isProductionAppUrl(raw: string | undefined): boolean {
  if (!raw || raw.trim().length === 0) return false;
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '[::1]' ||
      host.endsWith('.local') ||
      host.endsWith('.localhost')
    ) {
      return false;
    }
    return host.includes('.');
  } catch {
    return false;
  }
}

/**
 * Evaluates launch checklist items from env + database.
 */
export async function evaluateLaunchChecklist(supabase: DbClient): Promise<LaunchCheck[]> {
  const [products, tenants] = await Promise.all([
    listProducts(supabase),
    listTenants(supabase),
  ]);
  const published = products.filter((product) => product.status === 'published');
  const activeTenants = tenants.filter((tenant) => tenant.status === 'active');

  let fileProductsReady = published.length > 0;
  let supplierSkuReady = true;
  await Promise.all(
    published.map(async (product) => {
      if (product.deliveryType === 'supplier_api') {
        if (!product.supplierSku) {
          supplierSkuReady = false;
        }
        return;
      }
      if (product.deliveryType === 'manual') {
        return;
      }
      try {
        const withAssets = await getProductWithAssets(supabase, product.id);
        if (!withAssets.assets.some((asset) => !asset.isPreview)) {
          fileProductsReady = false;
        }
      } catch {
        fileProductsReady = false;
      }
    }),
  );
  if (published.length === 0) {
    fileProductsReady = false;
    supplierSkuReady = false;
  }

  let resellerBotConnected = false;
  let webhookSecretsSet = true;
  let resellerWalletFunded = false;
  await Promise.all(
    activeTenants.map(async (tenant) => {
      const bot = await getBotConnection(supabase, tenant.id);
      if (bot?.status === 'connected') {
        resellerBotConnected = true;
      }
      if (bot && (!bot.webhookSecret || bot.webhookSecret.length === 0)) {
        webhookSecretsSet = false;
      }
      try {
        const wallet = await getWallet(supabase, tenant.id);
        if (wallet.balanceTotal > 0n) {
          resellerWalletFunded = true;
        }
      } catch {
        // wallet missing
      }
    }),
  );
  if (activeTenants.length === 0) {
    webhookSecretsSet = false;
  }

  const [settings, dbDemoMode] = await Promise.all([
    getPlatformSettings(supabase),
    readPaymentDemoMode(supabase),
  ]);
  const demoActive = paymentSandboxEnabled(dbDemoMode);
  const paymentLive = !demoActive && isPlatformPaymentConfigured(settings);
  const binanceLive = isPaymentLive(settings);
  const ownerConnected = settings.ownerBotStatus === 'connected';
  const paymentMethodEnabled = settings.binancePayEnabled || settings.bep20Enabled;
  const appUrlRaw = process.env.NEXT_PUBLIC_APP_URL;
  const appUrlValid = isProductionAppUrl(appUrlRaw);
  const items: LaunchCheck[] = [
    {
      id: 'env_supabase_url',
      label: 'NEXT_PUBLIC_SUPABASE_URL set',
      group: 'environment',
      passing: envSet('NEXT_PUBLIC_SUPABASE_URL'),
      detail: envSet('NEXT_PUBLIC_SUPABASE_URL') ? 'Configured' : 'Missing',
    },
    {
      id: 'env_anon',
      label: 'NEXT_PUBLIC_SUPABASE_ANON_KEY set',
      group: 'environment',
      passing: envSet('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      detail: envSet('NEXT_PUBLIC_SUPABASE_ANON_KEY') ? 'Configured' : 'Missing',
    },
    {
      id: 'env_service',
      label: 'SUPABASE_SERVICE_ROLE_KEY set',
      group: 'environment',
      passing: envSet('SUPABASE_SERVICE_ROLE_KEY'),
      detail: envSet('SUPABASE_SERVICE_ROLE_KEY') ? 'Configured' : 'Missing',
    },
    {
      id: 'env_encrypt',
      label: 'BOT_TOKEN_ENCRYPTION_KEY set (not PLACEHOLDER)',
      group: 'environment',
      passing: envReal('BOT_TOKEN_ENCRYPTION_KEY'),
      detail: envReal('BOT_TOKEN_ENCRYPTION_KEY') ? 'Configured' : 'Placeholder or missing',
    },
    {
      id: 'env_admin',
      label: 'ADMIN_SECRET set (min 32 chars)',
      group: 'environment',
      passing: minLen('ADMIN_SECRET', 32),
      detail: minLen('ADMIN_SECRET', 32) ? 'Configured' : 'Too short or missing',
    },
    {
      id: 'env_cron',
      label: 'CRON_SECRET set (min 32 chars)',
      group: 'environment',
      passing: minLen('CRON_SECRET', 32),
      detail: minLen('CRON_SECRET', 32) ? 'Configured' : 'Too short or missing',
    },
    {
      id: 'env_app_url',
      label: 'NEXT_PUBLIC_APP_URL set to production domain',
      group: 'environment',
      passing: appUrlValid,
      detail: !appUrlRaw
        ? 'Missing'
        : appUrlValid
          ? appUrlRaw
          : `${appUrlRaw} — must use https on a non-localhost domain`,
    },
    {
      id: 'pay_mode',
      label: demoActive
        ? 'Payment mode: Demo'
        : paymentLive
          ? 'Payment mode: Live'
          : 'Payment mode: Live (no method configured)',
      group: 'payment',
      passing: paymentLive,
      detail: demoActive
        ? 'Demo mode allows simulated payments without chain verification. Switch to Live in Settings → Payments before launch.'
        : paymentLive
          ? 'Real BEP20 USDT / Binance Pay verification active'
          : 'Enable USDT BEP20 with a valid address or Binance Pay in Settings → Payments.',
    },
    {
      id: 'pay_method',
      label: 'At least one payment method enabled',
      group: 'payment',
      passing: paymentMethodEnabled,
      detail: paymentMethodEnabled ? 'Enabled' : 'Enable USDT BEP20 or Binance Pay in settings',
    },
    {
      id: 'pay_configured',
      label: 'Payment method configured',
      group: 'payment',
      passing: paymentLive,
      detail: paymentLive
        ? binanceLive
          ? 'Binance Pay ready'
          : 'USDT wallet ready'
        : 'Add a USDT wallet or Binance Pay credentials in owner settings',
    },
    {
      id: 'bot_owner',
      label: 'Owner bot connected',
      group: 'bot',
      passing: ownerConnected,
      detail: ownerConnected
        ? `Connected as @${settings.ownerBotUsername ?? 'bot'}`
        : 'Connect the owner bot in settings',
    },
    {
      id: 'bot_reseller',
      label: 'At least one reseller bot connected',
      group: 'bot',
      passing: resellerBotConnected,
      detail: resellerBotConnected ? 'Connected' : 'No connected reseller bot',
    },
    {
      id: 'bot_webhooks',
      label: 'Webhook secrets all set',
      group: 'bot',
      passing: ownerConnected && webhookSecretsSet,
      detail: ownerConnected ? 'Owner + reseller secrets present' : 'Owner webhook secret missing',
    },
    {
      id: 'prod_published',
      label: 'At least one product published',
      group: 'product',
      passing: published.length > 0,
      detail: `${published.length} published`,
    },
    {
      id: 'prod_files',
      label: 'All products have delivery files uploaded',
      group: 'product',
      passing: fileProductsReady,
      detail: fileProductsReady ? 'File products have assets' : 'Missing assets on a file product',
    },
    {
      id: 'prod_sku',
      label: 'All supplier-delivered products have a supplier SKU set',
      group: 'product',
      passing: supplierSkuReady,
      detail: supplierSkuReady ? 'OK' : 'A supplier product is missing SKU',
    },
    {
      id: 'res_active',
      label: 'At least one reseller activated',
      group: 'reseller',
      passing: activeTenants.length > 0,
      detail: `${activeTenants.length} active`,
    },
    {
      id: 'res_wallet',
      label: 'Reseller wallet funded (via token)',
      group: 'reseller',
      passing: resellerWalletFunded,
      detail: resellerWalletFunded ? 'At least one funded wallet' : 'No funded reseller wallets',
    },
  ];
  return items;
}
