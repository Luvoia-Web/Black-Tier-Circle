/**
 * @file app/api/wallet/redeem/route.ts
 *
 * POST, reseller only. Redeems a 12-digit top-up token into the session wallet.
 *
 * @module Api
 */

import { asDbClient, requireReseller } from '@/lib/auth/session';
import { WalletError } from '@/lib/errors';
import { handleRouteError, jsonError, jsonSuccess, readJsonBody } from '@/lib/http';
import { RedeemTokenSchema } from '@/lib/validations/wallet';
import { redeemTopupToken } from '@/modules/wallet';

export const dynamic = 'force-dynamic';

const REDEEM_MESSAGES: Record<string, string> = {
  TOKEN_NOT_FOUND: 'Invalid token. Please check and try again.',
  TOKEN_REDEEMED: 'This token has already been used.',
  TOKEN_EXPIRED: 'This token has expired.',
  TOKEN_REVOKED: 'This token has been cancelled.',
  TOKEN_WRONG_TENANT: 'This token is not assigned to your account.',
  WALLET_NOT_FOUND: 'Wallet not found. Contact support.',
};

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireReseller();
    const parsed = RedeemTokenSchema.parse(await readJsonBody(request));
    const result = await redeemTopupToken(
      asDbClient(session.admin),
      parsed.token,
      session.tenant.id,
      session.user.id,
    );
    if (!result.success) {
      const code = result.errorCode ?? 'TOKEN_REDEEM_FAILED';
      return jsonError(new WalletError(code, REDEEM_MESSAGES[code] ?? 'Unable to redeem token.'));
    }
    return jsonSuccess({
      success: true,
      amountCredited: result.amountCredited ?? 0n,
      newBalance: result.newBalance ?? 0n,
    });
  } catch (error: unknown) {
    return handleRouteError(error);
  }
}
