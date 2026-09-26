/**
 * @file integrations/telegram/announce.ts
 *
 * Posts a product card to reseller announcement channels when a product is published.
 *
 * @module Telegram
 */

import { decrypt } from '@/lib/encryption';
import { logger } from '@/lib/logger';
import { formatUsdt } from '@/lib/money';
import type { DbClient } from '@/lib/supabase/query';
import type { Product } from '@/modules/catalog/types';

/**
 * Best-effort broadcast. A missing channel or bot never fails publishing.
 */
export async function announcePublishedProduct(supabase: DbClient, product: Product): Promise<void> {
  try {
    const listed = await supabase.from('tenant_settings').select('tenant_id, announcement_channel_id');
    const rows = Array.isArray(listed.data) ? listed.data : [];
    for (const raw of rows) {
      const row = raw as { tenant_id?: string; announcement_channel_id?: string | null };
      if (!row.tenant_id || !row.announcement_channel_id) {
        continue;
      }
      const bot = await supabase
        .from('bot_connections')
        .select('encrypted_token')
        .eq('tenant_id', row.tenant_id)
        .maybeSingle();
      const encrypted = (bot.data as { encrypted_token?: string } | null)?.encrypted_token;
      if (!encrypted) {
        continue;
      }
      const token = decrypt(encrypted);
      const stockText = product.stockUnlimited ? 'Unlimited' : String(product.stockCount ?? 0);
      const title = product.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const text =
        `📦 <b>${title}</b>\n` +
        `➕ Added: ${product.stockUnlimited ? 'Unlimited' : product.stockCount ?? 0}\n` +
        `📦 Current stock: ${stockText}\n` +
        `💸 Price: <b>${formatUsdt(product.retailPriceMinor)}</b>`;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: row.announcement_channel_id,
          text,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '🛒 Buy Now', callback_data: `product:${product.id}` }]],
          },
        }),
      });
    }
  } catch (error: unknown) {
    logger.warn('product announcement skipped', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  }
}
