/**
 * @file app/api/owner/settings/payments/route.ts
 *
 * PATCH, owner only. Encrypts Binance credentials before saving.
 * Response never includes secrets.
 *
 * @module Api
 */

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
    const settings = await updatePaymentSettings(asDbClient(session.admin), {
      ...(parsed.platformUsdtWalletBep20 !== undefined
        ? {
            platformUsdtWalletBep20:
              parsed.platformUsdtWalletBep20 === null ? null : sanitizeInput(parsed.platformUsdtWalletBep20),
          }
        : {}),
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
    return jsonSuccess({ settings });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
