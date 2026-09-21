/**
 * @file app/api/v1/wallet/route.ts
 *
 * GET: tenant wallet balances.
 *
 * @module ApiV1
 */

import { API_CONFIG } from '@/lib/api-config';
import { minorToUsdt } from '@/lib/money';
import { authenticateV1Request, handleV1Error, v1Db, v1Success } from '@/lib/v1-auth';
import { getWallet } from '@/modules/wallet';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const ctx = await authenticateV1Request(
      request,
      'orders:read',
      'wallet',
      API_CONFIG.rateLimits.readRequestsPerMinute,
    );
    const wallet = await getWallet(v1Db(), ctx.tenantId);
    return v1Success({
      balanceTotal: minorToUsdt(wallet.balanceTotal),
      balanceReserved: minorToUsdt(wallet.balanceReserved),
      balanceAvailable: minorToUsdt(wallet.balanceAvailable),
    });
  } catch (error: unknown) {
    return handleV1Error(error);
  }
}
