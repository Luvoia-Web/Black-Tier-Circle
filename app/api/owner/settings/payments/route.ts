/**
 * @file app/api/owner/settings/payments/route.ts
 *
 * PATCH, owner only. Encrypts Binance credentials before saving.
 * Response never includes secrets.
 *
 * @module Api
 */

import { prepareBep20Address } from '@/lib/eth-address';
import { asDbClient, requireOwner } from '@/lib/auth/session';
import { handleRouteError, jsonSuccess, readJsonBody } from '@/lib/http';
import { sanitizeInput } from '@/lib/sanitize';
import { UpdatePlatformPaymentsSchema } from '@/lib/validations/platform-settings';
import { updatePaymentSettings } from '@/modules/platform';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request): Promise<Response> {
  try {
    const session = await requireOwner();
    const parsed = UpdatePlatformPaymentsSchema.parse(await readJsonBody(request));
    const address =
      parsed.platformUsdtWalletBep20 === undefined ? null : prepareBep20Address(parsed.platformUsdtWalletBep20);
    const settings = await updatePaymentSettings(asDbClient(session.admin), {
      ...(address ? { platformUsdtWalletBep20: address.address } : {}),
      ...(parsed.binancePayMerchantId !== undefined
        ? {
            binancePayMerchantId:
              parsed.binancePayMerchantId === null ? null : sanitizeInput(parsed.binancePayMerchantId),
          }
        : {}),
      ...(parsed.binancePayApiKey !== undefined ? { binancePayApiKey: parsed.binancePayApiKey } : {}),
      ...(parsed.binancePayApiSecret !== undefined ? { binancePayApiSecret: parsed.binancePayApiSecret } : {}),
      ...(parsed.binancePayEnabled !== undefined ? { binancePayEnabled: parsed.binancePayEnabled } : {}),
      ...(parsed.bep20Enabled !== undefined ? { bep20Enabled: parsed.bep20Enabled } : {}),
    });
    return jsonSuccess({ settings, addressWarning: address?.warning ?? null });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
